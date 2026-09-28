import { Router } from 'express'
import { z } from 'zod'
import { getStore } from '../db/index.js'
import type { Row } from '../db/store.js'
import { ApiError, asyncHandler } from '../lib/errors.js'
import { hashPassword, passwordProblems, verifyPassword } from '../auth/passwords.js'
import { createResetToken, sha256, signSession } from '../auth/tokens.js'
import { requireAuth } from '../auth/middleware.js'
import { env } from '../env.js'

const router = Router()

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address')
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(200)

const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().max(120).optional(),
})

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
})

async function ensureProfile(user: Row, fullName?: string | null): Promise<Row> {
  const store = getStore()
  const existing = await store.findOne<Row>('profiles', { where: { user_id: user.id } })
  if (existing) return existing
  return store.insert('profiles', {
    user_id: user.id,
    full_name: fullName?.trim() || String(user.email).split('@')[0],
    email: user.email,
    onboarding_completed: 0,
  })
}

function sessionPayload(user: Row, profile: Row) {
  return {
    token: signSession({ sub: String(user.id), email: String(user.email), provider: 'local' }),
    user: { id: user.id, email: user.email, created_at: user.created_at },
    profile,
  }
}

router.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const body = signupSchema.parse(req.body ?? {})
    const problems = passwordProblems(body.password)
    if (problems.length) throw ApiError.badRequest(`Password needs ${problems.join(', ')}.`)

    const store = getStore()
    const existing = await store.findOne<Row>('users', { where: { email: body.email } })
    if (existing) throw ApiError.conflict('An account with that email already exists. Try signing in instead.')

    const user = await store.insert('users', {
      email: body.email,
      password_hash: await hashPassword(body.password),
      auth_provider: 'password',
    })
    const profile = await ensureProfile(user, body.fullName)
    res.status(201).json(sessionPayload(user, profile))
  }),
)

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body ?? {})
    const store = getStore()
    const user = await store.findOne<Row>('users', { where: { email: body.email } })
    const ok = user ? await verifyPassword(body.password, String(user.password_hash ?? '')) : false
    if (!user || !ok) throw new ApiError(401, 'That email and password combination is not correct.', 'invalid_credentials')

    const profile = await ensureProfile(user)
    res.json(sessionPayload(user, profile))
  }),
)

router.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    // Sessions are stateless JWTs; the client discards the token. Kept for a stable API surface.
    res.json({ ok: true })
  }),
)

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await ensureProfile(req.user!)
    res.json({
      user: { id: req.user!.id, email: req.user!.email, created_at: req.user!.created_at },
      profile,
      provider: req.authProvider ?? 'local',
    })
  }),
)

router.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const body = z.object({ email: emailSchema }).parse(req.body ?? {})
    const store = getStore()
    const user = await store.findOne<Row>('users', { where: { email: body.email } })

    // Always answer the same way so the endpoint cannot be used to enumerate accounts.
    const response: Record<string, unknown> = {
      ok: true,
      message: 'If an account exists for that email, a password reset link has been generated.',
    }

    if (user) {
      const { token, tokenHash } = createResetToken()
      await store.remove('password_resets', { user_id: user.id })
      await store.insert('password_resets', {
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      if (env.exposeResetLink) {
        response.resetToken = token
        response.resetPath = `/reset-password?token=${token}`
        response.notice = 'Email delivery is not configured in this environment, so the reset link is returned here instead.'
      }
      console.log(`[vozlook][auth] password reset requested for ${body.email}`)
    }

    res.json(response)
  }),
)

router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const body = z.object({ token: z.string().min(10), password: passwordSchema }).parse(req.body ?? {})
    const problems = passwordProblems(body.password)
    if (problems.length) throw ApiError.badRequest(`Password needs ${problems.join(', ')}.`)

    const store = getStore()
    const tokenHash = sha256(body.token)
    const reset = await store.findOne<Row>('password_resets', { where: { token_hash: tokenHash } })
    if (!reset) throw ApiError.badRequest('That reset link is not valid. Request a new one.')
    if (reset.used_at) throw ApiError.badRequest('That reset link has already been used. Request a new one.')
    if (new Date(String(reset.expires_at)).getTime() < Date.now()) throw ApiError.badRequest('That reset link has expired. Request a new one.')

    await store.updateById('users', String(reset.user_id), { password_hash: await hashPassword(body.password) })
    await store.updateById('password_resets', String(reset.id), { used_at: new Date().toISOString() })

    const user = await store.findById<Row>('users', String(reset.user_id))
    const profile = user ? await ensureProfile(user) : null
    res.json({ ok: true, message: 'Password updated. You can sign in with your new password.', session: user && profile ? sessionPayload(user, profile) : null })
  }),
)

router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ currentPassword: z.string().min(1), newPassword: passwordSchema })
      .parse(req.body ?? {})
    const problems = passwordProblems(body.newPassword)
    if (problems.length) throw ApiError.badRequest(`Password needs ${problems.join(', ')}.`)

    const store = getStore()
    const user = await store.findById<Row>('users', String(req.user!.id))
    if (!user) throw ApiError.unauthorized()

    if (user.auth_provider === 'supabase') {
      throw ApiError.badRequest('This account signs in with Supabase Auth — change the password from your Supabase account settings.')
    }
    const ok = await verifyPassword(body.currentPassword, String(user.password_hash ?? ''))
    if (!ok) throw ApiError.badRequest('Your current password is not correct.')

    await store.updateById('users', String(user.id), { password_hash: await hashPassword(body.newPassword) })
    res.json({ ok: true, message: 'Password changed.' })
  }),
)

router.delete(
  '/account',
  requireAuth,
  asyncHandler(async (req, res) => {
    const store = getStore()
    const userId = String(req.user!.id)
    const body = z.object({ password: z.string().optional(), confirm: z.literal('DELETE') }).parse(req.body ?? {})
    const user = await store.findById<Row>('users', userId)
    if (!user) throw ApiError.unauthorized()

    if (user.auth_provider !== 'supabase' && user.password_hash) {
      const ok = body.password ? await verifyPassword(body.password, String(user.password_hash)) : false
      if (!ok) throw ApiError.badRequest('Enter your password to confirm account deletion.')
    }

    const interviews = await store.findMany<Row>('interviews', { where: { user_id: userId } })
    for (const interview of interviews) {
      const answers = await store.findMany<Row>('interview_answers', { where: { interview_id: interview.id } })
      for (const answer of answers) await store.remove('answer_evaluations', { answer_id: answer.id })
      await store.remove('interview_answers', { interview_id: interview.id })
      await store.remove('interview_questions', { interview_id: interview.id })
      await store.remove('interview_reports', { interview_id: interview.id })
      await store.remove('interview_progress', { interview_id: interview.id })
    }
    await store.remove('interviews', { user_id: userId })
    await store.remove('resumes', { user_id: userId })
    await store.remove('job_descriptions', { user_id: userId })
    await store.remove('password_resets', { user_id: userId })
    await store.remove('profiles', { user_id: userId })
    await store.remove('users', { id: userId })

    const includeSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    if (includeSupabase) {
      try {
        const { createClient } = await import('@supabase/supabase-js')
        const admin = createClient(String(process.env.SUPABASE_URL), String(process.env.SUPABASE_SERVICE_ROLE_KEY), {
          auth: { persistSession: false, autoRefreshToken: false },
        })
        await admin.auth.admin.deleteUser(userId)
      } catch (error) {
        console.warn('[vozlook][auth] could not delete Supabase auth user:', (error as Error).message)
      }
    }

    res.json({ ok: true, message: 'Your account and all interview data have been deleted.' })
  }),
)

export default router
