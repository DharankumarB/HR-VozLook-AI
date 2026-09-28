import { Router } from 'express'
import { aiEnabled, aiEngineLabel, env } from '../env.js'
import { getStore } from '../db/index.js'
import { asyncHandler } from '../lib/errors.js'
import { storageBackend } from '../services/storage.js'
import { QUESTION_COUNT_OPTIONS } from '../services/interview.js'
import { SCORING_METHODOLOGY } from '../db/schema.js'

const router = Router()

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const store = getStore()
    const dbOk = await store.ping()
    res.status(dbOk ? 200 : 503).json({
      ok: dbOk,
      status: dbOk ? 'healthy' : 'degraded',
      data_mode: store.kind,
      storage: storageBackend(),
      ai: { enabled: aiEnabled, engine: aiEngineLabel },
      time: new Date().toISOString(),
    })
  }),
)

/** Public configuration the SPA needs to render accurate UI (no secrets are exposed). */
router.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    const store = getStore()
    res.json({
      product: 'VozLook InterviewAI',
      vendor: 'VozLook Studios',
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
      // The anon key is a publishable key by design; the service-role key is never sent.
      supabase_auth: env.supabase.authConfigured
        ? { url: env.supabase.url, anon_key: env.supabase.anonKey }
        : null,
      auth: {
        password_reset_exposed: env.exposeResetLink,
        providers: env.supabase.authConfigured ? ['password', 'supabase'] : ['password'],
      },
    })
  }),
)

export default router
