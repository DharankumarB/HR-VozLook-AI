import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { getStore } from '../db/index.js'
import type { Row } from '../db/store.js'
import { ApiError, asyncHandler } from '../lib/errors.js'
import { requireAuth } from '../auth/middleware.js'
import { env } from '../env.js'
import { assertSupportedUpload } from '../services/extract.js'
import { putObject } from '../services/storage.js'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1 },
})

const profileSchema = z.object({
  full_name: z.string().trim().min(1, 'Enter your name').max(120).optional(),
  target_role: z.string().trim().max(120).optional(),
  company: z.string().trim().max(120).optional(),
  experience_level: z.enum(['Student', 'Fresher', '1-2 years', '3-5 years', '5+ years']).optional(),
  preferred_mode: z.enum(['text', 'voice', 'video']).optional(),
  avatar_url: z.string().trim().max(500).nullable().optional(),
  onboarding_completed: z.boolean().optional(),
})

async function loadProfile(userId: string): Promise<Row> {
  const store = getStore()
  const existing = await store.findOne<Row>('profiles', { where: { user_id: userId } })
  if (existing) return existing
  return store.insert('profiles', { user_id: userId, onboarding_completed: 0 })
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await loadProfile(String(req.user!.id))
    const store = getStore()
    const resume = await store.findOne<Row>('resumes', {
      where: { user_id: req.user!.id },
      order: { column: 'created_at', ascending: false },
    })
    const job = await store.findOne<Row>('job_descriptions', {
      where: { user_id: req.user!.id },
      order: { column: 'created_at', ascending: false },
    })
    res.json({
      profile,
      user: { id: req.user!.id, email: req.user!.email, created_at: req.user!.created_at, provider: req.authProvider },
      has_resume: Boolean(resume),
      has_job: Boolean(job),
      resume_file: resume ? { id: resume.id, file_name: resume.file_name, created_at: resume.created_at } : null,
      job: job ? { id: job.id, title: job.title, company: job.company, created_at: job.created_at } : null,
    })
  }),
)

router.put(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = profileSchema.parse(req.body ?? {})
    const store = getStore()
    const current = await loadProfile(String(req.user!.id))
    const patch: Row = {}
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) patch[key] = value
    }
    if (body.full_name) patch.email = req.user!.email
    if (Object.keys(patch).length) await store.updateById('profiles', String(current.id), patch)
    const profile = await store.findById<Row>('profiles', String(current.id))
    res.json({ profile })
  }),
)

router.post(
  '/avatar',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file
    if (!file) throw ApiError.badRequest('Choose an image to upload.')
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype)) {
      throw ApiError.badRequest('Profile photos must be PNG, JPG, WEBP or GIF.')
    }
    if (file.size > 3 * 1024 * 1024) throw ApiError.tooLarge('Profile photos must be smaller than 3 MB.')
    assertSupportedUpload(file.originalname, file.mimetype, ['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

    const stored = await putObject({
      userId: String(req.user!.id),
      bucket: 'media',
      fileName: file.originalname || 'avatar.png',
      buffer: file.buffer,
      contentType: file.mimetype,
    })
    const store = getStore()
    const current = await loadProfile(String(req.user!.id))
    await store.updateById('profiles', String(current.id), { avatar_url: stored.url })
    res.json({ avatar_url: stored.url })
  }),
)

export default router
