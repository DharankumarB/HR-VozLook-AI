import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { ApiError, asyncHandler } from '../lib/errors.js'
import { env } from '../env.js'
import { putObject } from '../services/storage.js'
import { requireAuth } from '../auth/middleware.js'
import {
  QUESTION_COUNT_OPTIONS,
  createInterview,
  deleteInterview,
  endInterviewEarly,
  getInterviewState,
  listInterviews,
  nextQuestion,
  skipQuestion,
  submitAnswer,
} from '../services/interview.js'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1 },
})

const createSchema = z.object({
  jobRole: z.string().trim().max(160).optional(),
  interviewType: z.enum(['technical', 'hr', 'behavioral', 'mixed']).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard', 'adaptive']).optional(),
  mode: z.enum(['text', 'voice', 'video']).optional(),
  questionCount: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]).optional(),
  settings: z.record(z.unknown()).optional(),
})

const answerSchema = z.object({
  questionId: z.string().uuid().optional(),
  answerText: z.string().trim().min(1, 'Write or record an answer before submitting.').max(20_000),
  durationSeconds: z.number().min(0).max(3600).optional(),
  mediaMetrics: z.record(z.unknown()).nullable().optional(),
  audioUrl: z.string().max(600).nullable().optional(),
  videoUrl: z.string().max(600).nullable().optional(),
})

/** Create a new interview session (generates the first question). */
router.post(
  '/create',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body ?? {})
    const interview = await createInterview(String(req.user!.id), body)
    const state = await getInterviewState(String(req.user!.id), String(interview.id))
    res.status(201).json(state)
  }),
)

/** Filters are additive; the frontend passes them as query params. */
router.get(
  '/list',
  requireAuth,
  asyncHandler(async (req, res) => {
    const interviews = await listInterviews(String(req.user!.id), {
      jobRole: typeof req.query.jobRole === 'string' ? req.query.jobRole : undefined,
      interviewType: typeof req.query.interviewType === 'string' ? req.query.interviewType : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      from: typeof req.query.from === 'string' ? req.query.from : undefined,
      to: typeof req.query.to === 'string' ? req.query.to : undefined,
    })
    res.json({ interviews, options: { question_counts: QUESTION_COUNT_OPTIONS } })
  }),
)

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const state = await getInterviewState(String(req.user!.id), req.params.id)
    res.json(state)
  }),
)

router.post(
  '/:id/question',
  requireAuth,
  asyncHandler(async (req, res) => {
    const question = await nextQuestion(String(req.user!.id), req.params.id)
    const state = await getInterviewState(String(req.user!.id), req.params.id)
    res.json({ question, state })
  }),
)

router.post(
  '/:id/answer',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = answerSchema.parse(req.body ?? {})
    const result = await submitAnswer(String(req.user!.id), req.params.id, body)
    const state = await getInterviewState(String(req.user!.id), req.params.id)
    res.json({ ...result, state })
  }),
)

router.post(
  '/:id/skip',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z.object({ questionId: z.string().uuid().optional() }).parse(req.body ?? {})
    const result = await skipQuestion(String(req.user!.id), req.params.id, body)
    const state = await getInterviewState(String(req.user!.id), req.params.id)
    res.json({ ...result, state })
  }),
)

/** Upload a recorded audio/video answer (voice + video modes). */
router.post(
  '/:id/media',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file
    if (!file) throw ApiError.badRequest('No recording was received.')
    const kind = String(req.body?.kind ?? (file.mimetype.startsWith('video') ? 'video' : 'audio'))
    if (!file.mimetype.startsWith(kind === 'video' ? 'video/' : 'audio/')) {
      throw ApiError.badRequest(`That file does not look like a valid ${kind} recording.`)
    }
    if (file.size > env.maxUploadMb * 1024 * 1024) throw ApiError.tooLarge('That recording is too large.')
    const stored = await putObject({
      userId: String(req.user!.id),
      bucket: 'media',
      fileName: file.originalname || `${kind}-answer.webm`,
      buffer: file.buffer,
      contentType: file.mimetype,
    })
    res.status(201).json({ url: stored.url, key: stored.key, kind, size: stored.size })
  }),
)

router.post(
  '/:id/end',
  requireAuth,
  asyncHandler(async (req, res) => {
    const report = await endInterviewEarly(String(req.user!.id), req.params.id)
    const state = await getInterviewState(String(req.user!.id), req.params.id)
    res.json({ report, state })
  }),
)

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    await deleteInterview(String(req.user!.id), req.params.id)
    res.json({ ok: true, message: 'Interview deleted.' })
  }),
)

export default router
