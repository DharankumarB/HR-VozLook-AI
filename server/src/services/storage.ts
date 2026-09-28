import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '../env.js'
import { ApiError } from '../lib/errors.js'

/**
 * File storage abstraction.
 *
 * Supabase Storage is used when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are configured;
 * otherwise files are written to the local uploads directory and served through an
 * authenticated endpoint that verifies the requesting user owns the file.
 */

export interface StoredFile {
  key: string
  url: string
  size: number
  backend: 'supabase' | 'local'
}

const BUCKETS = ['resumes', 'media'] as const
export type Bucket = (typeof BUCKETS)[number]

let client: SupabaseClient | null = null
function supabase(): SupabaseClient | null {
  if (!env.supabase.url || !env.supabase.serviceRoleKey) return null
  if (!client) {
    client = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  }
  return client
}

const ensuredBuckets = new Set<string>()

async function ensureBucket(sb: SupabaseClient, bucket: Bucket) {
  if (ensuredBuckets.has(bucket)) return
  const { data } = await sb.storage.getBucket(bucket).catch(() => ({ data: null }) as any)
  if (!data) {
    const { error } = await sb.storage.createBucket(bucket, { public: false, fileSizeLimit: `${env.maxUploadMb}MB` })
    if (error && !/already exists/i.test(error.message)) {
      console.warn(`[vozlook][storage] could not create bucket ${bucket}: ${error.message}`)
    }
  }
  ensuredBuckets.add(bucket)
}

function safeName(fileName: string): string {
  const base = path.basename(fileName || 'upload').replace(/[^\w.\-]+/g, '_').slice(0, 80)
  return base || 'upload'
}

export function localPathFor(key: string): string {
  const resolved = path.resolve(env.uploadsDir, key)
  if (!resolved.startsWith(path.resolve(env.uploadsDir))) throw ApiError.badRequest('Invalid file path')
  return resolved
}

export async function putObject(input: {
  userId: string
  bucket: Bucket
  fileName: string
  buffer: Buffer
  contentType: string
}): Promise<StoredFile> {
  const key = `${input.userId}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName(input.fileName)}`
  const sb = supabase()

  if (sb) {
    try {
      await ensureBucket(sb, input.bucket)
      const { error } = await sb.storage.from(input.bucket).upload(key, input.buffer, {
        contentType: input.contentType,
        upsert: false,
      })
      if (error) throw new Error(error.message)
      return {
        key,
        url: `supabase://${input.bucket}/${key}`,
        size: input.buffer.byteLength,
        backend: 'supabase',
      }
    } catch (error) {
      console.warn('[vozlook][storage] Supabase upload failed, falling back to local storage:', (error as Error).message)
    }
  }

  const target = localPathFor(key)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, input.buffer)
  return {
    key,
    url: `/api/files/${encodeURIComponent(key)}`,
    size: input.buffer.byteLength,
    backend: 'local',
  }
}

export async function getObjectBuffer(url: string): Promise<Buffer | null> {
  if (url.startsWith('supabase://')) {
    const [, rest] = url.split('supabase://')
    const slash = rest.indexOf('/')
    const bucket = rest.slice(0, slash)
    const key = rest.slice(slash + 1)
    const sb = supabase()
    if (!sb) return null
    const { data, error } = await sb.storage.from(bucket).download(key)
    if (error || !data) return null
    return Buffer.from(await data.arrayBuffer())
  }
  const prefix = '/api/files/'
  if (url.startsWith(prefix)) {
    const key = decodeURIComponent(url.slice(prefix.length))
    const target = localPathFor(key)
    return fs.existsSync(target) ? fs.readFileSync(target) : null
  }
  return null
}

export async function deleteObject(url: string): Promise<void> {
  try {
    if (url.startsWith('supabase://')) {
      const [, rest] = url.split('supabase://')
      const slash = rest.indexOf('/')
      const sb = supabase()
      if (!sb) return
      await sb.storage.from(rest.slice(0, slash)).remove([rest.slice(slash + 1)])
      return
    }
    if (url.startsWith('/api/files/')) {
      const target = localPathFor(decodeURIComponent(url.slice('/api/files/'.length)))
      if (fs.existsSync(target)) fs.unlinkSync(target)
    }
  } catch (error) {
    console.warn('[vozlook][storage] failed to delete object:', (error as Error).message)
  }
}

export function storageBackend(): 'supabase' | 'local' {
  return supabase() ? 'supabase' : 'local'
}
