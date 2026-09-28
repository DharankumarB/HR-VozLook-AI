import { Router } from 'express'
import { asyncHandler } from '../lib/errors.js'
import { getStore } from '../db/index.js'
import { env, aiEnabled, aiEngineLabel, storageMode } from '../env.js'
import { QUESTION_COUNT_OPTIONS } from '../services/interview.js'
import { SCORING_METHODOLOGY } from '../db/schema.js'
import { LANGUAGES, DEFAULT_LANGUAGE, languageInstruction } from '../ai/languages.js'
import { listPersonas, DEFAULT_PERSONA, personaCoachStyle } from '../ai/personas.js'
import { googleAuthStatus } from '../auth/google.js'
import { adminConfig } from '../auth/roles.js'
import { storageBackend } from '../services/storage.js'

const router = Router()

/** Liveness probe — reports the real state of the database and AI provider, nothing hardcoded. */
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const store = getStore()
    const dbOk = await store.ping()
    res.json({
      ok: dbOk,
      status: dbOk ? 'healthy' : 'degraded',
      product: 'VozHireQ',
      vendor: 'VozLook Studios',
      data_mode: store.kind,
      storage: storageMode(),
      ai: { enabled: aiEnabled, engine: aiEngineLabel, gemini_configured: Boolean(env.ai.geminiApiKey) },
      checks: {
        database: dbOk ? 'ok' : 'unavailable',
        ai_provider: aiEnabled ? 'ok' : 'built_in_engine',
        google_sign_in: googleAuthStatus().configured ? 'ok' : 'not_configured',
      },
      time: new Date().toISOString(),
    })
  }),
)

const BRAND = {
  product: 'VozHireQ',
  product_description: 'AI-Powered Interview Intelligence',
  vendor: 'VozLook Studios',
  tagline: 'Practice. Perform. Grow.',
  support_email: 'vozlookstudios@gmail.com',
} as const

/**
 * Public configuration the SPA needs in order to render accurate UI. No secret ever leaves the
 * server: only the publishable Supabase URL/anon key (safe by design) and boolean feature flags.
 */
router.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    const store = getStore()
    const google = googleAuthStatus()
    res.json({
      ...BRAND,
      data_mode: store.kind,
      storage: storageBackend(),
      ai: {
        enabled: aiEnabled,
        engine: aiEngineLabel,
        gemini_configured: Boolean(env.ai.geminiApiKey),
        model: env.ai.geminiModel,
      },
      limits: { max_upload_mb: env.maxUploadMb },
      question_counts: QUESTION_COUNT_OPTIONS,
      scoring_methodology: SCORING_METHODOLOGY,
      languages: LANGUAGES.map((language) => ({
        code: language.code,
        label: language.label,
        native_label: language.nativeLabel,
        enabled: language.enabled,
        default: language.code === DEFAULT_LANGUAGE,
      })),
      default_language: DEFAULT_LANGUAGE,
      personas: listPersonas(),
      default_persona: DEFAULT_PERSONA,
      // The anon key is a publishable key by design; the service-role key is never sent.
      supabase_auth: env.supabase.authConfigured ? { url: env.supabase.url, anon_key: env.supabase.anonKey } : null,
      google_auth: { enabled: google.configured, client_id: google.client_id },
      auth: {
        password_reset_exposed: env.exposeResetLink,
        providers: ['password', ...(env.supabase.authConfigured ? ['supabase'] : []), ...(google.configured ? ['google'] : [])],
      },
      admin: { surface: adminConfig.adminSurface, enabled: true, enforced_server_side: adminConfig.enforcedServerSide },
      features: {
        avatar_interviewer: true,
        voice_input: true,
        video_mode: true,
        pdf_reports: true,
        admin_console: true,
        history: true,
        progress: true,
        coach: true,
      },
      disclaimers: {
        scoring: 'VozHireQ scores are practice metrics that support interview preparation. They are not hiring decisions, and they never assess protected personal characteristics.',
        avatar: 'The AI interviewer is an animated assistant. Mouth movement follows live speech timing rather than true lip-sync.',
      },
      // Surfaced for the UI so the language switcher can explain what is live today.
      language_note: languageInstruction(DEFAULT_LANGUAGE),
      persona_note: personaCoachStyle(DEFAULT_PERSONA),
    })
  }),
)

export default router
