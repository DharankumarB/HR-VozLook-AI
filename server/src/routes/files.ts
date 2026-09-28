import fs from 'node:fs'
import { Router } from 'express'
import { ApiError, asyncHandler } from '../lib/errors.js'
import { attachUser } from '../auth/middleware.js'
import { localPathFor } from '../services/storage.js'

const router = Router()

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  webm: 'video/webm',
  mp4: 'video/mp4',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
}

/**
 * Serves locally stored uploads (résumés, avatars, recordings) to their owner only.
 *
 * Browsers cannot attach an Authorization header to <img>/<audio> tags, so this route also
 * accepts the session token as a `token` query parameter. Either way the user is resolved
 * server-side and the requested object must live under that user's folder — a frontend-supplied
 * user id is never trusted.
 */
router.get(
  '/*',
  (req, _res, next) => {
    if (!req.header('authorization') && typeof req.query.token === 'string' && req.query.token) {
      req.headers.authorization = `Bearer ${req.query.token}`
    }
    next()
  },
  attachUser,
  asyncHandler(async (req, res) => {
    const key = decodeURIComponent((req.params as Record<string, string>)[0] ?? '')
    if (!key) throw ApiError.badRequest('No file requested.')
    if (!req.user) throw ApiError.unauthorized('Sign in to view this file.')

    const userId = String(req.user.id)
    if (!key.startsWith(`${userId}/`)) throw ApiError.forbidden()

    const target = localPathFor(key)
    if (!fs.existsSync(target)) throw ApiError.notFound('That file is no longer available.')

    const ext = key.split('.').pop()?.toLowerCase() ?? ''
    res.setHeader('Content-Type', CONTENT_TYPES[ext] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', 'private, max-age=300')
    fs.createReadStream(target).pipe(res)
  }),
)

export default router
