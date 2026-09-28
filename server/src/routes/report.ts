import { Router } from 'express'
import { getStore } from '../db/index.js'
import type { Row } from '../db/store.js'
import { ApiError, asyncHandler } from '../lib/errors.js'
import { requireAuth } from '../auth/middleware.js'
import { buildReportPdf, generateReportForInterview, getReportForInterview } from '../services/report.js'
import { dashboardData, progressData, weakTopics } from '../services/analytics.js'

const router = Router()

router.get(
  '/interviews/:id/report',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { report, interview, candidateName } = await getReportForInterview(String(req.user!.id), req.params.id)
    res.json({ report, interview, candidateName })
  }),
)

router.post(
  '/interviews/:id/report/regenerate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const report = await generateReportForInterview(String(req.user!.id), req.params.id, { force: true })
    const { interview, candidateName } = await getReportForInterview(String(req.user!.id), req.params.id)
    res.json({ report, interview, candidateName })
  }),
)

router.get(
  '/interviews/:id/report/pdf',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { buffer, fileName } = await buildReportPdf(String(req.user!.id), req.params.id)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.setHeader('Content-Length', String(buffer.byteLength))
    res.end(buffer)
  }),
)

/** Look up a report by its own id (used by /history deep links). */
router.get(
  '/reports/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const store = getStore()
    const report = await store.findById<Row>('interview_reports', req.params.id)
    if (!report || report.user_id !== req.user!.id) throw ApiError.notFound('We could not find that report.')
    const interview = await store.findById<Row>('interviews', String(report.interview_id))
    const profile = await store.findOne<Row>('profiles', { where: { user_id: req.user!.id } })
    res.json({ report, interview, candidateName: profile?.full_name ?? 'Candidate' })
  }),
)

router.get(
  '/dashboard',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await dashboardData(String(req.user!.id)))
  }),
)

router.get(
  '/progress',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await progressData(String(req.user!.id)))
  }),
)

router.get(
  '/weak-topics',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ topics: await weakTopics(String(req.user!.id), 20) })
  }),
)

export default router
