import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { ApiError, asyncHandler } from '../lib/errors.js'
import { requireAuth } from '../auth/middleware.js'
import { env } from '../env.js'
import { assertSupportedUpload, extractText } from '../services/extract.js'
import { deleteResume, getActiveResume, uploadAndAnalyzeResume } from '../services/resume.js'
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
    const resume = await getActiveResume(String(req.user!.id))
    if (!resume) {
      return res.json({ resume: null })
    }
    res.json({
      resume: {
        id: resume.id,
        file_name: resume.file_name,
        file_url: resume.file_url,
        mime_type: resume.mime_type,
        size_bytes: resume.size_bytes,
        created_at: resume.created_at,
        updated_at: resume.updated_at,
        parsed_data: resume.parsed_data,
      },
    })
  }),
)

router.post(
  '/analyze',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file
    if (!file) throw ApiError.badRequest('Choose a résumé file to upload.')
    if (!file.size) throw ApiError.badRequest('That file is empty.')
    assertSupportedUpload(file.originalname, file.mimetype)

    const store = getStore()
    const profile = await store.findOne<Row>('profiles', { where: { user_id: req.user!.id } })
    const created = await uploadAndAnalyzeResume({
      userId: String(req.user!.id),
      fileName: file.originalname || 'resume.pdf',
      mimeType: file.mimetype,
      buffer: file.buffer,
      targetRole: profile?.target_role ? String(profile.target_role) : null,
    })

    res.status(201).json({
      resume: {
        id: created.id,
        file_name: created.file_name,
        file_url: created.file_url,
        mime_type: created.mime_type,
        size_bytes: created.size_bytes,
        created_at: created.created_at,
        parsed_data: created.parsed_data,
      },
      message: 'Résumé analysed successfully.',
    })
  }),
)

router.post(
  '/text',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z.object({ text: z.string().min(200, 'Paste at least a few lines of your résumé.').max(200_000) }).parse(req.body ?? {})
    const store = getStore()
    const profile = await store.findOne<Row>('profiles', { where: { user_id: req.user!.id } })
    const created = await uploadAndAnalyzeResume({
      userId: String(req.user!.id),
      fileName: 'pasted-resume.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(body.text, 'utf8'),
      targetRole: profile?.target_role ? String(profile.target_role) : null,
    })
    res.status(201).json({ resume: { id: created.id, parsed_data: created.parsed_data, file_name: created.file_name }, message: 'Résumé analysed successfully.' })
  }),
)

router.post(
  '/extract',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file
    if (!file) throw ApiError.badRequest('Choose a file to inspect.')
    assertSupportedUpload(file.originalname, file.mimetype)
    const extracted = await extractText(file.buffer, file.originalname)
    res.json({ characters: extracted.text.length, preview: extracted.text.slice(0, 600), method: extracted.method, pages: extracted.pages })
  }),
)

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    await deleteResume(String(req.user!.id), req.params.id)
    res.json({ ok: true, message: 'Résumé removed.' })
  }),
)

export default router
