import type { NextFunction, Request, Response } from 'express'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '../env.js'
import { getStore } from '../db/index.js'
import type { Row } from '../db/store.js'
import { ApiError } from '../lib/errors.js'
import { verifySession } from './tokens.js'

let supabaseAuthClient: SupabaseClient | null = null
function authClient(): SupabaseClient | null {
  if (!env.supabase.authConfigured) return null
  if (!supabaseAuthClient) {
    supabaseAuthClient = createClient(env.supabase.url, env.supabase.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  }
  return supabaseAuthClient
}

function bearer(req: Request): string | null {
  const header = req.header('authorization') || req.header('Authorization')
  if (!header) return null
  const [scheme, token] = header.split(' ')
  if (!token || scheme.toLowerCase() !== 'bearer') return null
  return token.trim() || null
}

/**
 * Accepts either a VozLook session token (local auth) or a Supabase Auth access token.
 * In both cases the user record is loaded from the server-side store — we never trust a
 * user id supplied by the client.
 */
async function resolveUser(token: string): Promise<{ user: Row; provider: 'local' | 'supabase' } | null> {
  const store = getStore()
  const local = verifySession(token)
  if (local) {
    const user = await store.findById('users', local.sub)
    if (user) return { user, provider: 'local' as const }
  }

  const client = authClient()
  if (client) {
    const { data, error } = await client.auth.getUser(token)
    if (!error && data?.user?.email) {
      const email = data.user.email.toLowerCase()
      const existing = await store.findOne('users', { where: { email } })
      const user: Row =
        existing ??
        ((await store.insert('users', {
          id: data.user.id,
          email,
          password_hash: '',
          auth_provider: 'supabase',
        })) as Row)
      return { user, provider: 'supabase' as const }
    }
  }
  return null
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = bearer(req)
  if (!token) return next()
  try {
    const resolved = await resolveUser(token)
    if (resolved) {
      req.user = resolved.user
      req.authProvider = resolved.provider
    }
  } catch (error) {
    // A malformed/expired token simply means "not signed in" — never crash the request.
    console.warn('[vozlook] token resolution failed:', (error as Error).message)
  }
  next()
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(ApiError.unauthorized('Your session has expired. Please sign in again.'))
  next()
}

/** Guarantees the authenticated user owns the row (defence in depth on top of RLS). */
export function assertOwnership(row: Record<string, any> | null, userId: string, label = 'resource') {
  if (!row) throw ApiError.notFound(`We could not find that ${label}.`)
  if (row.user_id && row.user_id !== userId) throw ApiError.forbidden()
  return row
}
