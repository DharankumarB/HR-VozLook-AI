import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { ApiError, asyncHandler } from '../lib/errors.js'
import { requireAuth } from '../auth/middleware.js'
import { env } from '../env.js'
import { createJobDescription, deleteJob, getLatestJob } from '../services/job.js'
import { extractText } from '../services/extract.js'
import { getStore } from '../db/index.js'
import type { Row } from '../db/store.js'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1 },
})

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const job = await getLatestJob(String(req.user!.id))
    res.json({
      job: job
        ? {
            id: job.id,
            title: job.title,
            company: job.company,
            description: job.description,
            parsed_requirements: job.parsed_requirements,
            created_at: job.created_at,
          }
        : null,
    })
  }),
)

router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().trim().max(140).optional(),
        company: z.string().trim().max(140).optional(),
        description: z.string().trim().min(60, 'Paste the job description text (at least a few lines).').max(60_000),
      })
      .parse(req.body ?? {})

    const store = getStore()
    const profile = await store.findOne<Row>('profiles', { where: { user_id: req.user!.id } })
    const job = await createJobDescription({
      userId: String(req.user!.id),
      title: body.title,
      company: body.company,
      description: body.description,
      targetRole: profile?.target_role ? String(profile.target_role) : null,
    })
    res.status(201).json({
      job: {
        id: job.id,
        title: job.title,
        company: job.company,
        description: job.description,
        parsed_requirements: job.parsed_requirements,
        created_at: job.created_at,
      },
      message: 'Job description analysed successfully.',
    })
  }),
)

router.post(
  '/analyze-file',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file
    if (!file) throw ApiError.badRequest('Choose a job description file to upload.')
    const extracted = await extractText(file.buffer, file.originalname)
    if (extracted.text.length < 60) {
      throw ApiError.badRequest('We could not read enough text from that file. Paste the description instead.')
    }
    const body = z.object({ title: z.string().trim().max(140).optional(), company: z.string().trim().max(140).optional() }).parse(req.body ?? {})
    const store = getStore()
    const profile = await store.findOne<Row>('profiles', { where: { user_id: req.user!.id } })
    const job = await createJobDescription({
      userId: String(req.user!.id),
      title: body.title,
      company: body.company,
      description: extracted.text,
      targetRole: profile?.target_role ? String(profile.target_role) : null,
    })
    res.status(201).json({
      job: { id: job.id, title: job.title, company: job.company, description: job.description, parsed_requirements: job.parsed_requirements },
      message: 'Job description analysed successfully.',
    })
  }),
)

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    await deleteJob(String(req.user!.id), req.params.id)
    res.json({ ok: true, message: 'Job description removed.' })
  }),
)

export default router
