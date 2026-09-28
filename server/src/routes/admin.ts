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

/* ------------------------------------------------------------------ presenters
 * The service layer returns compact aggregate rows; these presenters shape them into the API
 * contract the console consumes. No presenter ever adds a value that was not read from the database.
 * ----------------------------------------------------------------------------- */

function presentUser(row: any) {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    status: row.status,
    avatar_url: row.avatar_url ?? null,
    provider: row.provider ?? null,
    account_type: row.role === 'admin' ? 'Administrator' : row.has_resume ? 'Candidate · résumé on file' : 'Candidate',
    registered_at: row.created_at,
    last_active: row.last_active_at ?? null,
    interviews: row.interviews,
    completed_interviews: row.completed,
    average_score: row.average_score,
    resumes: row.resumes ?? (row.has_resume ? 1 : 0),
    reports: row.reports ?? 0,
    has_job: Boolean(row.has_job),
  }
}

function presentInterview(row: any) {
  return {
    id: row.id,
    user_id: row.user_id,
    candidate: row.candidate,
    email: row.email,
    job_role: row.job_role,
    interview_type: row.interview_type,
    interview_mode: row.interview_mode,
    difficulty: row.difficulty,
    created_at: row.created_at,
    started_at: row.started_at ?? null,
    completed_at: row.completed_at ?? null,
    duration_minutes: row.duration_minutes ?? null,
    questions: row.question_count,
    answered: row.answered ?? 0,
    score: row.overall_score ?? null,
    status: row.status,
    has_report: row.has_report,
  }
}

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
  const data = await adminAnalytics(Number.isFinite(range) ? range : 30)
  res.json({
    range_days: data.range_days,
    user_growth: data.user_growth.map((row) => ({ date: row.label, users: row.users, cumulative: row.cumulative })),
    monthly_growth: data.monthly_growth.map((row) => ({ month: row.label, users: row.users })),
    interview_activity: data.interview_activity.map((row) => ({ date: row.label, started: row.started, completed: row.completed })),
    performance: data.performance.map((row) => ({ date: row.label, average_score: row.average_score, interviews: row.interviews })),
    popular_roles: data.popular_roles.map((row) => ({ role: row.role, count: row.interviews, average_score: row.average_score })),
    mode_usage: data.mode_usage.map((row) => ({ mode: row.mode, count: row.interviews })),
    type_usage: data.type_usage.map((row) => ({ type: row.type, count: row.interviews })),
    completion: data.completion,
  })
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
    const users = await adminUsers(query)
    res.json({
      users: users.map(presentUser),
      options: { roles: ['all', 'user', 'admin'], statuses: ['all', 'active', 'disabled'] },
    })
  }),
)

router.get(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const store = getStore()
    const userId = String(req.params.id)
    const detail = await adminUserDetail(userId)
    if (!detail) throw ApiError.notFound('That user account no longer exists.')

    const [resumes, jobs, reports, logs, answeredInterviews] = await Promise.all([
      store.findMany<Row>('resumes', { where: { user_id: userId }, order: { column: 'created_at', ascending: false } }),
      store.findMany<Row>('job_descriptions', { where: { user_id: userId }, order: { column: 'created_at', ascending: false } }),
      store.findMany<Row>('interview_reports', { where: { user_id: userId }, order: { column: 'created_at', ascending: false } }),
      store.findMany<Row>('admin_logs', { where: { target_id: userId }, order: { column: 'created_at', ascending: false }, limit: 20 }),
      store.findMany<Row>('interviews', { where: { user_id: userId } }),
    ])
    const scores = answeredInterviews.map((row) => Number(row.overall_score ?? NaN)).filter((value) => Number.isFinite(value))
    const listRow = (await adminUsers({ search: String(detail.user.email) })).find((row) => row.id === userId)

    const payload = {
      user: presentUser({ ...(listRow ?? {}), ...detail.user, id: userId, resumes: resumes.length, reports: reports.length }),
      profile: detail.profile,
      interviews: detail.interviews.map((row: any) => ({
        ...row,
        user_id: userId,
        candidate: (listRow?.full_name ?? detail.user.email) as string,
        email: String(detail.user.email),
        interview_mode: row.interview_mode,
        questions: Number(row.question_count),
        answered: 0,
        score: row.overall_score,
        has_report: reports.some((report) => String(report.interview_id) === row.id),
      })),
      resumes: resumes.map((resume) => ({
        id: String(resume.id),
        file_name: String(resume.file_name),
        created_at: String(resume.created_at),
        skills: Array.isArray((resume.parsed_data as any)?.skills) ? ((resume.parsed_data as any).skills as unknown[]).length : 0,
      })),
      jobs: jobs.map((job) => ({
        id: String(job.id),
        title: String(job.title ?? 'Untitled role'),
        company: job.company ? String(job.company) : null,
        created_at: String(job.created_at),
      })),
      reports: reports.map((report) => ({
        id: String(report.id),
        interview_id: String(report.interview_id),
        overall_score: Number(report.overall_score),
        created_at: String(report.created_at),
      })),
      activity: logs.map((log) => ({
        id: String(log.id),
        action: String(log.action),
        created_at: String(log.created_at),
        target_type: log.target_type ? String(log.target_type) : null,
      })),
      progress: {
        interviews: answeredInterviews.length,
        completed: answeredInterviews.filter((row) => row.status === 'completed').length,
        average_score: scores.length ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10 : null,
        best_score: scores.length ? Math.max(...scores) : null,
      },
    }
    await recordAdminAction({
      admin_user_id: String(req.user!.id),
      admin_email: adminEmail(req),
      action: 'user_viewed',
      target_type: 'user',
      target_id: userId,
    })
    res.json(payload)
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
    const interviews = (await adminInterviews(query)).map(presentInterview)
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
    const interviewId = String(req.params.id)
    const detail = await adminInterviewDetail(interviewId)
    if (!detail) throw ApiError.notFound('That interview no longer exists.')

    const answered = detail.questions.filter((question: any) => question.answer != null).length
    const summary = (await adminInterviews({ search: String(detail.candidate.email ?? '') })).find((row) => row.id === interviewId)

    const payload = {
      interview: {
        ...presentInterview({
          ...(summary ?? {
            id: interviewId,
            user_id: detail.candidate.user_id,
            candidate: detail.candidate.name ?? detail.candidate.email,
            email: detail.candidate.email ?? '',
            job_role: detail.interview.job_role,
            interview_type: detail.interview.interview_type,
            interview_mode: detail.interview.interview_mode,
            difficulty: detail.interview.difficulty,
            question_count: detail.questions.length,
            overall_score: detail.interview.overall_score,
            has_report: Boolean(detail.report),
            duration_minutes: null,
            created_at: detail.interview.created_at,
            completed_at: detail.interview.completed_at,
          }),
          user_id: detail.candidate.user_id,
          answered,
        }),
        settings: detail.interview.settings ?? {},
        started_at: detail.interview.started_at,
      },
      candidate: detail.candidate.email
        ? {
            id: detail.candidate.user_id,
            email: String(detail.candidate.email),
            full_name: detail.candidate.name ?? null,
            role: detail.candidate.role ?? 'user',
            status: detail.candidate.status ?? 'active',
          }
        : null,
      questions: detail.questions.map((question: any) => ({
        id: question.id,
        question_number: question.question_number,
        question: question.question,
        question_type: question.question_type,
        difficulty: question.difficulty,
        expected_topics: question.expected_topics ?? [],
        resume_anchor: question.resume_anchor ?? null,
        is_follow_up: question.is_follow_up,
        generation: question.generation ?? null,
      })),
      answers: detail.questions
        .filter((question: any) => question.answer != null)
        .map((question: any) => ({
          id: `${question.id}-answer`,
          question_id: question.id,
          answer_text: question.answer,
          duration_seconds: question.answer_duration_seconds ?? null,
          created_at: question.answer_created_at ?? detail.interview.created_at,
          evaluation: question.evaluation
            ? {
                relevance_score: question.evaluation.relevance,
                technical_score: question.evaluation.technical,
                completeness_score: question.evaluation.completeness,
                clarity_score: question.evaluation.clarity,
                structure_score: question.evaluation.structure,
                communication_score: question.evaluation.communication ?? question.evaluation.clarity,
                problem_solving_score: question.evaluation.problem_solving,
                feedback: question.evaluation.feedback ?? null,
                strengths: question.evaluation.strengths ?? [],
                improvements: question.evaluation.improvements ?? [],
                coverage: question.evaluation.coverage ?? [],
                engine: question.evaluation.engine ?? null,
              }
            : null,
        })),
      report: detail.report,
    }
    await recordAdminAction({
      admin_user_id: String(req.user!.id),
      admin_email: adminEmail(req),
      action: 'interview_viewed',
      target_type: 'interview',
      target_id: interviewId,
    })
    res.json(payload)
  }),
)

/* ------------------------------------------------------------------- reports */

router.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const insights = await adminReportInsights()
    const completed = await getStore().count('interviews', { status: 'completed' })
    // Normalised for the console while keeping the richer raw fields available.
    const payload = {
      totals: { ...insights.totals, completed_interviews: completed },
      improvement_areas: insights.improvement_areas.map((entry: any) => ({ ...entry, count: entry.mentions })),
      technical_weaknesses: insights.technical_weaknesses.map((entry: any) => ({ ...entry, count: entry.misses })),
      top_roles: insights.top_roles,
      score_distribution: insights.score_distribution.map((entry: any) => ({ ...entry, count: entry.reports })),
      dimension_averages: insights.dimension_averages.map((entry: any) => ({ ...entry, dimension: entry.metric })),
    }
    await recordAdminAction({
      admin_user_id: String(req.user!.id),
      admin_email: adminEmail(req),
      action: 'reports_viewed',
      target_type: 'report',
      target_id: 'aggregate',
    })
    res.json(payload)
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
