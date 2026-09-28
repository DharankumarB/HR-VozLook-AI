import fs from 'node:fs'
import path from 'node:path'
import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import { ZodError } from 'zod'
import multer from 'multer'
import { env } from './env.js'
import './types.js'
import { getStore, initStore } from './db/index.js'
import { SqliteStore } from './db/sqlite.js'
import { ApiError } from './lib/errors.js'
import { attachUser } from './auth/middleware.js'
import authRoutes from './routes/auth.js'
import profileRoutes from './routes/profile.js'
import resumeRoutes from './routes/resume.js'
import jobRoutes from './routes/job.js'
import interviewRoutes from './routes/interview.js'
import reportRoutes from './routes/report.js'
import coachRoutes from './routes/coach.js'
import adminRoutes from './routes/admin.js'
import fileRoutes from './routes/files.js'
import metaRoutes from './routes/meta.js'

export async function createApp() {
  // Initialise the storage driver before any request can touch it.
  const store = await initStore()

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', true)
  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ extended: true, limit: '2mb' }))

  const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin requests (the Vite dev proxy and the production build) have no Origin header.
        if (!origin) return callback(null, true)
        if (!allowedOrigins.length) return callback(null, true)
        if (allowedOrigins.includes(origin)) return callback(null, true)
        try {
          const host = new URL(origin).hostname
          if (allowedOrigins.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return callback(null, true)
        } catch {
          /* fall through to rejection */
        }
        return callback(null, false)
      },
      credentials: true,
    }),
  )

  app.use(attachUser)

  app.use('/api/auth', authRoutes)
  app.use('/api/profile', profileRoutes)
  app.use('/api/resume', resumeRoutes)
  app.use('/api/job', jobRoutes)
  app.use('/api/interview', interviewRoutes)
  app.use('/api/files', fileRoutes)
  app.use('/api', reportRoutes) // /api/interviews/:id/report, /api/dashboard, /api/progress, /api/reports/:id
  app.use('/api/coach', coachRoutes)
  app.use('/api/admin', adminRoutes)
  app.use('/api', metaRoutes) // /api/health, /api/meta

  app.use('/api', (_req, _res, next) => next(ApiError.notFound('That API endpoint does not exist.')))

  // Serve the built SPA when it exists (production / single-service deployment).
  if (fs.existsSync(env.clientDist)) {
    app.use(express.static(env.clientDist, { index: false, maxAge: '1h' }))
    app.get('*', (_req, res) => {
      res.sendFile(path.join(env.clientDist, 'index.html'))
    })
  } else {
    app.get('/', (_req, res) => {
      res.json({
        product: 'VozLook InterviewAI',
        message: 'API is running. Start the Vite dev server for the UI (npm run dev).',
        data_mode: store.kind,
        docs: '/api/meta',
      })
    })
  }

  // Central error handler — never leaks stack traces or provider payloads to the client.
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ApiError) {
      return res.status(error.status).json({ error: { message: error.message, code: error.code, details: error.details ?? null } })
    }
    if (error instanceof ZodError) {
      const first = error.issues[0]
      return res.status(400).json({
        error: {
          message: first ? `${first.path.join('.') || 'Input'}: ${first.message}` : 'Invalid request payload.',
          code: 'validation_error',
          details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        },
      })
    }
    // Malformed or oversized JSON bodies must never surface as a 500.
    if (error instanceof SyntaxError && (error as { type?: string }).type === 'entity.parse.failed') {
      return res.status(400).json({ error: { message: 'We could not read that request. Please retry from the app.', code: 'invalid_json' } })
    }
    if (error instanceof Error && (error as { type?: string }).type === 'entity.too.large') {
      return res.status(413).json({ error: { message: 'That request was too large to process.', code: 'payload_too_large' } })
    }
    if (error instanceof multer.MulterError) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? `That file is larger than the ${env.maxUploadMb} MB limit.`
          : 'The upload could not be processed. Try a smaller file.'
      return res.status(400).json({ error: { message, code: error.code } })
    }
    const message = error instanceof Error ? error.message : String(error)
    if (/Unknown column|Unknown table|SQLITE|sql/i.test(message)) {
      console.error('[vozlook][db] error:', message)
      return res.status(500).json({ error: { message: 'A data error occurred while saving. Please try again.', code: 'db_error' } })
    }
    // Log the failure without dumping the request payload (résumé text, tokens, answers).
    const stack = error instanceof Error && error.stack ? error.stack.split('\n').slice(0, 4).join('\n') : ''
    console.error('[vozlook] unhandled error:', message, stack ? `\n${stack}` : '')
    res.status(500).json({ error: { message: 'Something went wrong on our side. Please try again.', code: 'internal_error' } })
  })

  return app
}

async function main() {
  const app = await createApp()
  const server = app.listen(env.port, env.host, () => {
    console.log(`[vozlook] VozLook InterviewAI API listening on http://${env.host}:${env.port}`)
  })

  const shutdown = async (signal: string) => {
    console.log(`[vozlook] ${signal} received — shutting down.`)
    server.close(() => {
      const store = getStore()
      if (store instanceof SqliteStore) store.close()
      process.exit(0)
    })
    setTimeout(() => process.exit(0), 3000)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

const isDirectRun = process.argv[1] && /index\.(ts|js)$/.test(process.argv[1])
if (isDirectRun) {
  main().catch((error) => {
    console.error('[vozlook] failed to start:', error)
    process.exit(1)
  })
}
