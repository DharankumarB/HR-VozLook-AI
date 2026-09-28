import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../lib/errors.js'
import { requireAuth } from '../auth/middleware.js'
import { coachReply, coachSuggestions } from '../services/coach.js'

const router = Router()

const schema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(24)
    .optional(),
  question: z.string().max(2000).optional(),
})

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = schema.parse(req.body ?? {})
    const result = await coachReply(String(req.user!.id), body)
    res.json(result)
  }),
)

router.get(
  '/suggestions',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await coachSuggestions(String(req.user!.id)))
  }),
)

export default router
