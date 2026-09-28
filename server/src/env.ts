import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const here = path.dirname(fileURLToPath(import.meta.url))
export const SERVER_ROOT = path.resolve(here, '..')
export const REPO_ROOT = path.resolve(SERVER_ROOT, '..')

// Load environment: process.env wins, then server/.env, then repo-root .env
for (const file of [path.join(SERVER_ROOT, '.env'), path.join(REPO_ROOT, '.env')]) {
  if (fs.existsSync(file)) dotenv.config({ path: file })
}

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(SERVER_ROOT, 'data')
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads')

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}
ensureDir(DATA_DIR)
ensureDir(UPLOADS_DIR)

/** Persisted dev secret so sessions survive server restarts (never used when JWT_SECRET is set). */
function devSecret(): string {
  const file = path.join(DATA_DIR, '.dev-jwt-secret')
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString('hex'), { mode: 0o600 })
  return fs.readFileSync(file, 'utf8').trim()
}

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

export type DataMode = 'sqlite' | 'supabase'

const requestedMode = (process.env.DATA_MODE || 'auto').trim().toLowerCase()
const supabaseReady = Boolean(supabaseUrl && supabaseServiceKey)
const dataMode: DataMode =
  requestedMode === 'sqlite' ? 'sqlite' : requestedMode === 'supabase' ? 'supabase' : supabaseReady ? 'supabase' : 'sqlite'

if (dataMode === 'supabase' && !supabaseReady) {
  throw new Error(
    'DATA_MODE=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Set both, or use DATA_MODE=sqlite.',
  )
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',

  jwtSecret: (process.env.JWT_SECRET || '').trim() || devSecret(),
  jwtSecretIsExplicit: Boolean((process.env.JWT_SECRET || '').trim()),
  sessionDays: Number(process.env.SESSION_DAYS || 30),

  dataDir: DATA_DIR,
  uploadsDir: UPLOADS_DIR,
  dbFile: path.join(DATA_DIR, 'vozlook.db'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10),

  dataMode,
  supabase: {
    url: supabaseUrl,
    serviceRoleKey: supabaseServiceKey,
    anonKey: (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim(),
    /** Supabase token verification is possible as soon as a URL + anon key exist. */
    authConfigured: Boolean(supabaseUrl && (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)),
  },

  ai: {
    geminiApiKey: (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim(),
    geminiModel: (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim(),
    /** Allow forcing the deterministic local engine even when a key exists. */
    forceLocalEngine: String(process.env.AI_ENGINE || '').toLowerCase() === 'local',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 45000),
    maxRetries: Number(process.env.AI_MAX_RETRIES || 2),
  },

  /** Dev convenience: return the password-reset link in the API response (no mail provider configured). */
  exposeResetLink: String(process.env.EXPOSE_RESET_LINK || (process.env.NODE_ENV === 'production' ? 'false' : 'true')) === 'true',
  clientDist: path.resolve(REPO_ROOT, 'client', 'dist'),
}

export const aiEnabled = Boolean(env.ai.geminiApiKey) && !env.ai.forceLocalEngine
export const aiEngineLabel = aiEnabled ? `Gemini (${env.ai.geminiModel})` : 'VozLook local analysis engine'

if (!env.jwtSecretIsExplicit) {
  console.warn('[vozlook] JWT_SECRET not set — using a persisted development secret. Set JWT_SECRET in production.')
}
if (!aiEnabled) {
  console.warn('[vozlook] GEMINI_API_KEY not set — running the deterministic local analysis engine.')
}
console.log(
  `[vozlook] data mode: ${env.dataMode} | ai engine: ${aiEngineLabel} | uploads: ${env.uploadsDir}`,
)
