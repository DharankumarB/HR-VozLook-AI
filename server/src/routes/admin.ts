import { Router } from 'express'
import { z } from 'zod'
import { ApiError, asyncHandler } from '../lib/errors.js'
import { requireAuth, requireAdmin } from '../auth/middleware.js'
import { adminConfig, adminEmails, roleOf } from '../auth/roles.js'
import {
  adminAnalytics,
  adminInterviewDetail,
  adminInterviews,
  adminLogs,
  adminOverview,
  adminReportInsights,
  adminSettings,
  adminUserDetail,
  adminUsers,
  deleteUserEverywhere,
  recordAdminAction,
  setUserStatus,
  updateAdminSetting,
  DEFAULT_SETTINGS,
} from '../services/admin.js'
import { getStore } from '../db/index.js'
import type { Row } from '../db/store.js'
import { listPersonas } from '../ai/personas.js'
import { LANGUAGES } from '../ai/languages.js'
import { googleAuthStatus } from '../auth/google.js'
import { aiEnabled, aiEngineLabel, env, storageMode } from '../env.js'

const router = Router()

/** Every admin route is gated server-side; the role is re-read from the database on each request. */
router.use(requireAuth, requireAdmin)

function adminEmail(req: { user?: Row | null }): string {
  return String(req.user?.email ?? 'unknown@admin')
}

/* ------------------------------------------------------------------ overview */

router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const data = await adminOverview()
    await recordAdminAction({
      admin_user_id: String(req.user!.id),
      admin_email: adminEmail(req),
      action: 'dashboard_viewed',
      target_type: 'dashboard',
      target_id: 'overview',
    })
    res.json(data)
  }),
)

router.get('/analytics', asyncHandler(async (req, res) => {
  const range = typeof req.query.range === 'string' ? Number(req.query.range) : 30
  res.json(await adminAnalytics(Number.isFinite(range) ? range : 30))
}))

/* --------------------------------------------------------------------- users */

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        search: z.string().max(120).optional(),
        role: z.string().max(20).optional(),
        status: z.string().max(20).optional(),
        from: z.string().max(30).optional(),
        to: z.string().max(30).optional(),
      })
      .parse(req.query ?? {})
    res.json({ users: await adminUsers(query), options: { roles: ['all', 'user', 'admin'], statuses: ['all', 'active', 'disabled'] } })
  }),
)

router.get(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const detail = await adminUserDetail(String(req.params.id))
    if (!detail) throw ApiError.notFound('That user account no longer exists.')
    await recordAdminAction({
      admin_user_id: String(req.user!.id),
      admin_email: adminEmail(req),
      action: 'user_viewed',
      target_type: 'user',
      target_id: String(req.params.id),
    })
    res.json(detail)
  }),
)

router.post(
  '/users/:id/status',
  asyncHandler(async (req, res) => {
    const body = z.object({ status: z.enum(['active', 'disabled']) }).parse(req.body ?? {})
    const targetId = String(req.params.id)
    if (targetId === String(req.user!.id)) throw ApiError.badRequest('You cannot change the status of your own account.')
    const store = getStore()
    const targetProfile = await store.findOne<Row>('profiles', { where: { user_id: targetId } })
    if (targetProfile && roleOf(targetProfile) === 'admin') throw ApiError.forbidden('Administrator accounts cannot be disabled from the dashboard.')
    const result = await setUserStatus(targetId, body.status)
    if (!result) throw ApiError.notFound('That user account no longer exists.')
    await recordAdminAction({
      admin_user_id: String(req.user!.id),
      admin_email: adminEmail(req),
      action: body.status === 'disabled' ? 'account_disabled' : 'account_enabled',
      target_type: 'user',
      target_id: targetId,
    })
    res.json({ ok: true, status: body.status })
  }),
)

router.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const targetId = String(req.params.id)
    if (targetId === String(req.user!.id)) throw ApiError.badRequest('You cannot delete your own administrator account here.')
    const store = getStore()
    const target = await store.findById<Row>('users', targetId)
    if (!target) throw ApiError.notFound('That user account no longer exists.')
    const targetProfile = await store.findOne<Row>('profiles', { where: { user_id: targetId } })
    if (targetProfile && roleOf(targetProfile) === 'admin') throw ApiError.forbidden('Administrator accounts cannot be deleted from the dashboard.')

    await deleteUserEverywhere(targetId)
    await recordAdminAction({
      admin_user_id: String(req.user!.id),
      admin_email: adminEmail(req),
      action: 'account_deleted',
      target_type: 'user',
      target_id: targetId,
      metadata: { email: target.email },
    })
    res.json({ ok: true, message: 'The account and all of its interview data have been deleted.' })
  }),
)

/* ---------------------------------------------------------------- interviews */

router.get(
  '/interviews',
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        search: z.string().max(120).optional(),
        type: z.string().max(20).optional(),
        mode: z.string().max(20).optional(),
        status: z.string().max(20).optional(),
        from: z.string().max(30).optional(),
        to: z.string().max(30).optional(),
      })
      .parse(req.query ?? {})
    const interviews = await adminInterviews(query)
    res.json({
      interviews,
      totals: {
        all: interviews.length,
        completed: interviews.filter((row) => row.status === 'completed').length,
        in_progress: interviews.filter((row) => row.status === 'in_progress').length,
        with_report: interviews.filter((row) => row.has_report).length,
      },
    })
  }),
)

router.get(
  '/interviews/:id',
  asyncHandler(async (req, res) => {
    const detail = await adminInterviewDetail(String(req.params.id))
    if (!detail) throw ApiError.notFound('That interview no longer exists.')
    await recordAdminAction({
      admin_user_id: String(req.user!.id),
      admin_email: adminEmail(req),
      action: 'interview_viewed',
      target_type: 'interview',
      target_id: String(req.params.id),
    })
    res.json(detail)
  }),
)

/* ------------------------------------------------------------------- reports */

router.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const insights = await adminReportInsights()
    await recordAdminAction({
      admin_user_id: String(req.user!.id),
      admin_email: adminEmail(req),
      action: 'reports_viewed',
      target_type: 'report',
      target_id: 'aggregate',
    })
    res.json(insights)
  }),
)

/* ------------------------------------------------------------------ settings */

router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const store = getStore()
    const settings = await adminSettings()
    const counts = {
      users: await store.count('users'),
      interviews: await store.count('interviews'),
      reports: await store.count('interview_reports'),
      resumes: await store.count('resumes'),
    }
    res.json({
      settings,
      editable_keys: DEFAULT_SETTINGS.map((setting) => setting.key),
      platform: {
        product: 'VozHireQ',
        product_description: 'AI-Powered Interview Intelligence',
        vendor: 'VozLook Studios',
        tagline: 'Practice. Perform. Grow.',
        environment: process.env.NODE_ENV ?? 'development',
        data_mode: env.dataMode,
        store: store.kind,
        storage: storageMode(),
        ai: {
          enabled: aiEnabled,
          engine: aiEngineLabel,
          model: env.ai.geminiModel,
          // The key itself is never returned — only whether it is present.
          api_key_configured: aiEnabled,
          timeout_ms: env.ai.timeoutMs,
          max_retries: env.ai.maxRetries,
        },
        auth: {
          providers: ['password', ...(env.supabase.authConfigured ? ['supabase'] : []), ...(googleAuthStatus().configured ? ['google'] : [])],
          supabase_auth: env.supabase.authConfigured,
          google: googleAuthStatus(),
          password_reset_exposed: env.exposeResetLink,
          session_days: env.sessionDays,
        },
        admin: {
          surface: adminConfig.adminSurface,
          provisioning: adminEmails().length,
          enforced_server_side: adminConfig.enforcedServerSide,
        },
        limits: { max_upload_mb: env.maxUploadMb },
        languages: LANGUAGES.map((language) => ({ code: language.code, label: language.label, enabled: language.enabled })),
        personas: listPersonas().map((persona) => ({ id: persona.id, label: persona.label, enabled: persona.enabled })),
        counts,
      },
    })
  }),
)

router.put(
  '/settings/:key',
  asyncHandler(async (req, res) => {
    const key = String(req.params.key)
    if (!DEFAULT_SETTINGS.some((setting) => setting.key === key)) throw ApiError.badRequest('That setting is not editable from the dashboard.')
    const body = z.object({ value: z.union([z.string().max(200), z.number(), z.boolean()]) }).parse(req.body ?? {})
    const settings = await updateAdminSetting(key, body.value, String(req.user!.id), adminEmail(req))
    res.json({ ok: true, settings })
  }),
)

/* --------------------------------------------------------------------- audit */

router.get('/logs', asyncHandler(async (req, res) => {
  const limit = typeof req.query.limit === 'string' ? Math.min(Number(req.query.limit) || 100, 500) : 100
  res.json({ logs: await adminLogs(limit) })
}))

/* ---------------------------------------------------------------------- self */

router.get('/me', asyncHandler(async (req, res) => {
  const store = getStore()
  const profile = await store.findOne<Row>('profiles', { where: { user_id: req.user!.id } })
  res.json({
    user: { id: req.user!.id, email: req.user!.email, role: roleOf(profile) },
    admin: { surface: adminConfig.adminSurface, provisioning: adminEmails().length },
  })
}))

export default router
