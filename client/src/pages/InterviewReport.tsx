import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Download,
  FileText,
  Lightbulb,
  ListChecks,
  Printer,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import {
  BulletList,
  ImprovementPlan,
  MethodologyPanel,
  QuestionReviewList,
  ReportHeader,
  ReportSection,
  ScoreGrid,
} from '../components/report/ReportView'
import { Badge, Button, Card, ErrorState, LoadingState, Modal, ProgressBar } from '../components/ui/primitives'
import { ApiError, api, downloadBlob } from '../lib/api'
import { SCORE_DISCLAIMER } from '../lib/constants'
import { formatDateTime, scoreTone, toneClasses } from '../lib/format'
import type { InterviewRecord, ReportRecord } from '../lib/types'
import { useToast } from '../state/ToastContext'

export default function InterviewReport() {
  const { id, reportId } = useParams<{ id?: string; reportId?: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const [report, setReport] = useState<ReportRecord | null>(null)
  const [interview, setInterview] = useState<InterviewRecord | null>(null)
  const [candidateName, setCandidateName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [progress, setProgress] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = reportId ? await api.getReportById(reportId) : id ? await api.getReport(id) : null
      if (!response) throw new ApiError('This report link is incomplete.', 404)
      setReport(response.report)
      setInterview(response.interview)
      setCandidateName(response.candidateName ?? '')
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.status === 404
            ? 'This report is not ready yet. Finish the interview and it will appear here.'
            : caught.message
          : 'We could not load your report.',
      )
    } finally {
      setLoading(false)
    }
  }, [id, reportId])

  useEffect(() => {
    void load()
  }, [load])

  /* While the interview is still running there is no report — poll the interview state instead. */
  const [waiting, setWaiting] = useState(false)
  useEffect(() => {
    if (loading || !error || (!id && !reportId)) return
    const interviewId = id
    if (!interviewId) return
    let attempts = 0
    setWaiting(true)
    const interval = window.setInterval(async () => {
      attempts += 1
      try {
        const state = await api.getInterview(interviewId)
        if (state.hasReport) {
          window.clearInterval(interval)
          setWaiting(false)
          void load()
          return
        }
        if (state.interview.status === 'in_progress' || state.interview.status === 'processing') {
          window.clearInterval(interval)
          setWaiting(false)
          navigate(`/interview/${interviewId}`, { replace: true })
        }
      } catch {
        /* keep polling */
      }
      if (attempts >= 8) {
        window.clearInterval(interval)
        setWaiting(false)
      }
    }, 2500)
    return () => window.clearInterval(interval)
  }, [loading, error, id, reportId, load, navigate])

  const downloadPdf = async () => {
    if (!interview) return
    setDownloading(true)
    setProgress(12)
    try {
      const blob = await api.downloadReportPdf(interview.id)
      setProgress(88)
      const fileName = `${candidateName || 'VozLook'}-${(interview.job_role ?? 'interview').replace(/[^\w]+/g, '-')}-report.pdf`
      downloadBlob(blob, fileName)
      setProgress(100)
      toast.success('Report downloaded', 'Your PDF includes every score, review and the improvement plan.')
    } catch (caught) {
      toast.error('Download failed', caught instanceof ApiError ? caught.message : 'Please try again in a moment.')
    } finally {
      setDownloading(false)
      window.setTimeout(() => setProgress(0), 1200)
    }
  }

  const regenerate = async () => {
    if (!interview) return
    setConfirmRegenerate(false)
    setRegenerating(true)
    try {
      const response = await api.regenerateReport(interview.id)
      setReport(response.report)
      setInterview(response.interview)
      toast.success('Report regenerated', 'The latest answers and evaluations are included.')
    } catch (caught) {
      toast.error('Could not regenerate', caught instanceof ApiError ? caught.message : 'Please try again.')
    } finally {
      setRegenerating(false)
    }
  }

  if (loading) {
    return (
      <AppShell title="Practice report" subtitle="Loading your results…">
        <Card>
          <LoadingState label="Building your report view…" rows={5} />
        </Card>
      </AppShell>
    )
  }

  if (error || !report || !interview) {
    return (
      <AppShell title="Practice report">
        <ErrorState
          title={waiting ? 'Your report is being prepared' : 'Report unavailable'}
          message={error ?? 'We could not find this report.'}
          onRetry={() => void load()}
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/history" className="btn-secondary">
            Back to history
          </Link>
          {id ? (
            <Link to={`/interview/${id}`} className="btn-ghost">
              Open the interview session
            </Link>
          ) : null}
        </div>
      </AppShell>
    )
  }

  const overallTone = toneClasses[scoreTone(Number(report.overall_score))]

  return (
    <AppShell title="Practice report" subtitle={`${interview.job_role} · ${formatDateTime(interview.completed_at ?? report.created_at)}`}>
      <div className="space-y-6">
        <Card>
          <ReportHeader report={report} interview={interview} />

          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => void downloadPdf()} loading={downloading} icon={<Download className="h-4 w-4" aria-hidden />}>
              Download PDF
            </Button>
            <Button variant="secondary" onClick={() => setConfirmRegenerate(true)} loading={regenerating} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
              Regenerate report
            </Button>
            <Button variant="ghost" onClick={() => window.print()} icon={<Printer className="h-4 w-4" aria-hidden />}>
              Print
            </Button>
            <Link to="/interview/setup" className="btn-ghost">
              Practice again
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          {downloading || progress > 0 ? (
            <div className="mt-4">
              <ProgressBar value={progress} label="Preparing PDF" showValue />
            </div>
          ) : null}
        </Card>

        {/* 1 — Overview */}
        <ReportSection title="Overall performance" icon={<BarChart3 className="h-4 w-4 text-accent" aria-hidden />}>
          <div className="grid gap-5 lg:grid-cols-[auto_1fr]">
            <div className={`rounded-3xl border p-5 text-center ${overallTone.border} ${overallTone.bg}`}>
              <p className="text-2xs uppercase tracking-wider text-ink-400">Overall</p>
              <p className={`mt-1 text-4xl font-semibold tabular-nums ${overallTone.text}`}>{Math.round(Number(report.overall_score))}%</p>
              <p className="mt-1 text-2xs text-ink-500">
                {report.report_json?.answered_count ?? 0} of {report.report_json?.question_count ?? interview.question_count} answered
              </p>
            </div>
            <div className="space-y-3">
              <p className="text-sm leading-relaxed text-ink-200">{report.summary}</p>
              <ScoreGrid report={report} />
            </div>
          </div>
        </ReportSection>

        {/* 2 — Scoring transparency */}
        <MethodologyPanel report={report} />

        {/* 3 — Strengths */}
        <ReportSection title="What you did well" icon={<Sparkles className="h-4 w-4 text-success" aria-hidden />} tone="positive">
          <BulletList items={report.strengths} tone="positive" />
        </ReportSection>

        {/* 4 — Weaknesses */}
        <ReportSection title="What held your answers back" icon={<AlertTriangle className="h-4 w-4 text-warning" aria-hidden />} tone="attention">
          <BulletList items={report.weaknesses} tone="warning" />
        </ReportSection>

        {/* 5 — Recommended topics */}
        <ReportSection
          title="Recommended topics to revise"
          icon={<Target className="h-4 w-4 text-accent" aria-hidden />}
          description="Ordered by how often your answers missed them, weighted by the job's required skills."
        >
          {report.recommended_topics?.length ? (
            <div className="flex flex-wrap gap-2">
              {report.recommended_topics.map((topic) => (
                <span key={topic} className="chip border-accent/25 bg-accent/[0.07] text-accent-soft">
                  {topic}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-500">No specific gaps were detected — keep practising to raise the bar.</p>
          )}
        </ReportSection>

        {/* 6 — Question by question */}
        <ReportSection
          title="Question-by-question review"
          icon={<ListChecks className="h-4 w-4 text-neon" aria-hidden />}
          description="Expand any question to see your answer, the scores and how a stronger answer would have been structured."
        >
          <QuestionReviewList report={report} />
        </ReportSection>

        {/* 7 — Improvement plan */}
        <ReportSection
          title="Your personalised improvement plan"
          icon={<TrendingUp className="h-4 w-4 text-accent" aria-hidden />}
          description="A three-week plan built from the gaps in this interview."
        >
          <ImprovementPlan report={report} />
        </ReportSection>

        {/* 8 — Recommendations */}
        <ReportSection title="Recommendations" icon={<Lightbulb className="h-4 w-4 text-warning" aria-hidden />}>
          <BulletList items={report.recommendations} />
        </ReportSection>

        {/* 9 — Context */}
        <ReportSection title="Interview context" icon={<FileText className="h-4 w-4 text-accent" aria-hidden />}>
          <dl className="grid gap-3 sm:grid-cols-2">
            {[
              ['Role', interview.job_role],
              ['Interview type', interview.interview_type],
              ['Difficulty', interview.difficulty],
              ['Mode', interview.interview_mode],
              ['Questions asked', String(interview.question_count)],
              ['Analysis engine', report.engine],
              ['Target company', report.report_json?.job?.company ?? interview.job_role],
              ['Domain', report.report_json?.job?.domain ?? 'general'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5">
                <dt className="text-2xs uppercase tracking-wider text-ink-500">{label}</dt>
                <dd className="text-right text-sm text-ink-100">{value}</dd>
              </div>
            ))}
          </dl>
          {report.report_json?.resume?.name ? (
            <p className="mt-4 text-2xs text-ink-500">
              Résumé used: {report.report_json.resume.name}
              {report.report_json.resume.skills?.length ? ` · ${report.report_json.resume.skills.slice(0, 12).join(', ')}` : ''}
            </p>
          ) : null}
          <p className="mt-2 text-2xs text-ink-500">Report generated {formatDateTime(report.created_at)}</p>
        </ReportSection>

        {/* 10 — Next steps */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-ink-50">
                <Bot className="h-4 w-4 text-accent" aria-hidden /> Turn this into a plan
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-ink-400">
                Ask the AI coach about any weak topic, then retake this interview to see the trend move.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/coach" className="btn-primary">
                Open AI coach
              </Link>
              <Link to="/progress" className="btn-secondary">
                View progress
              </Link>
            </div>
          </div>
        </Card>

        {/* 11 — Disclaimer */}
        <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-5">
          <Badge tone="neutral">Practice metrics only</Badge>
          <p className="mt-3 text-xs leading-relaxed text-ink-400">{SCORE_DISCLAIMER}</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            VozHireQ does not predict hiring outcomes and does not assess personality, honesty, intelligence or mental state. Use these
            scores to direct your practice, not as a verdict on your ability.
          </p>
        </div>
      </div>

      <Modal
        open={confirmRegenerate}
        onClose={() => setConfirmRegenerate(false)}
        title="Regenerate this report?"
        description="The report is rebuilt from your stored answers and evaluations — nothing is invented, and your answers are not changed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRegenerate(false)}>
              Cancel
            </Button>
            <Button onClick={() => void regenerate()} loading={regenerating}>
              Regenerate
            </Button>
          </>
        }
      />
    </AppShell>
  )
}
