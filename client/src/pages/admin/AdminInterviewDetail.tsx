import { ArrowLeft, ChevronDown, Download } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AdminError, AdminPageHeader } from '../../components/admin/AdminBits'
import { Badge, Button, Card, EmptyState, LoadingState, ProgressBar, SectionHeader, Stat } from '../../components/ui/primitives'
import { api, downloadBlob } from '../../lib/api'
import { formatDate, formatDateTime, formatDuration, titleCase } from '../../lib/format'
import { useToast } from '../../state/ToastContext'

type Detail = Awaited<ReturnType<typeof api.admin.interview>>

export default function AdminInterviewDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openQuestion, setOpenQuestion] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    api.admin
      .interview(id)
      .then((response) => {
        setDetail(response)
        setOpenQuestion(response.questions[0]?.id ?? null)
      })
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const download = async () => {
    try {
      const blob = await api.downloadReportPdf(id)
      downloadBlob(blob, `VozHireQ-report-${id.slice(0, 8)}.pdf`)
    } catch {
      toast.error('Download failed', 'The report PDF could not be generated right now.')
    }
  }

  if (loading && !detail) return <LoadingState label="Loading interview…" rows={4} />
  if (error) return <AdminError message={error} onRetry={load} />
  if (!detail) return <EmptyState title="Interview not found" description="This session may have been deleted." />

  const { interview, candidate, questions, answers, report } = detail

  return (
    <div>
      <button type="button" onClick={() => navigate('/admin/interviews')} className="mb-4 inline-flex items-center gap-2 text-xs text-ink-400 hover:text-ink-100">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to interviews
      </button>

      <AdminPageHeader
        title={`${interview.job_role} interview`}
        subtitle={`${candidate?.full_name || candidate?.email || 'Unknown candidate'} · ${formatDateTime(interview.created_at)} · ${titleCase(interview.interview_type)} · ${titleCase(interview.interview_mode)} mode`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={interview.status === 'completed' ? 'success' : 'warning'}>{interview.status.replace('_', ' ')}</Badge>
            {report ? (
              <Button variant="secondary" icon={<Download className="h-4 w-4" aria-hidden />} onClick={() => void download()}>
                Download PDF
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Overall score" value={report ? `${Math.round(report.overall_score)}%` : '—'} hint={report ? 'From stored report' : 'No report yet'} />
        <Stat label="Questions" value={`${interview.answered}/${questions.length || interview.questions}`} hint="Answered / generated" />
        <Stat label="Duration" value={interview.duration_minutes == null ? '—' : `${interview.duration_minutes} min`} />
        <Stat label="Difficulty" value={titleCase(interview.difficulty)} hint={candidate ? `Candidate since ${formatDate(candidate.id ? interview.created_at : null)}` : undefined} />
      </div>

      {candidate ? (
        <p className="mt-3 text-2xs text-ink-500">
          Candidate account:{' '}
          <Link to={`/admin/users/${candidate.id}`} className="font-medium text-accent-soft hover:underline">
            {candidate.email}
          </Link>{' '}
          ({candidate.role} · {candidate.status})
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <SectionHeader title="Question-by-question" subtitle="Question, the candidate's answer, and the AI evaluation that scored it" />
          <ul className="space-y-3">
            {questions.map((question) => {
              const answer = answers.find((entry) => entry.question_id === question.id)
              const open = openQuestion === question.id
              const evaluation = answer?.evaluation
              return (
                <li key={question.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
                    onClick={() => setOpenQuestion(open ? null : question.id)}
                    aria-expanded={open}
                  >
                    <span className="min-w-0">
                      <span className="block text-2xs uppercase tracking-[0.16em] text-ink-500">
                        Question {question.question_number} · {titleCase(question.question_type)} · {question.difficulty}
                        {question.is_follow_up ? ' · follow-up' : ''}
                      </span>
                      <span className="mt-1 block text-sm text-ink-100">{question.question}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {evaluation ? <span className="text-xs font-semibold tabular-nums text-accent-soft">{Math.round((evaluation.technical_score + evaluation.relevance_score) / 2)}%</span> : null}
                      <ChevronDown className={`h-4 w-4 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
                    </span>
                  </button>

                  {open ? (
                    <div className="space-y-4 border-t border-white/[0.06] px-4 py-4 text-sm">
                      <div>
                        <p className="section-title mb-1">Candidate answer</p>
                        <p className="whitespace-pre-wrap text-ink-200">{answer?.answer_text?.trim() || 'No answer was recorded for this question.'}</p>
                        {answer ? (
                          <p className="mt-1 text-2xs text-ink-500">
                            {formatDateTime(answer.created_at)} · {formatDuration(answer.duration_seconds)} · engine: {evaluation?.engine ?? '—'}
                          </p>
                        ) : null}
                      </div>

                      {evaluation ? (
                        <>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {[
                              ['Technical', evaluation.technical_score],
                              ['Relevance', evaluation.relevance_score],
                              ['Completeness', evaluation.completeness_score],
                              ['Clarity', evaluation.clarity_score],
                              ['Structure', evaluation.structure_score],
                              ['Communication', evaluation.communication_score],
                              ['Problem solving', evaluation.problem_solving_score],
                            ].map(([label, value]) => (
                              <ProgressBar key={String(label)} label={String(label)} value={Number(value)} showValue />
                            ))}
                          </div>
                          {evaluation.feedback ? (
                            <div>
                              <p className="section-title mb-1">AI feedback</p>
                              <p className="text-ink-200">{evaluation.feedback}</p>
                            </div>
                          ) : null}
                          {evaluation.strengths?.length ? (
                            <div>
                              <p className="section-title mb-1">Strengths</p>
                              <ul className="list-disc space-y-1 pl-5 text-ink-300">
                                {evaluation.strengths.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {evaluation.improvements?.length ? (
                            <div>
                              <p className="section-title mb-1">Improvements</p>
                              <ul className="list-disc space-y-1 pl-5 text-ink-300">
                                {evaluation.improvements.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {evaluation.coverage?.length ? (
                            <div>
                              <p className="section-title mb-1">Expected topics</p>
                              <div className="flex flex-wrap gap-1.5">
                                {evaluation.coverage.map((entry) => (
                                  <Badge key={entry.topic} tone={entry.covered ? 'success' : 'warning'}>
                                    {entry.topic}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p className="text-xs text-ink-500">This question was not answered, so no evaluation exists.</p>
                      )}

                      {question.generation ? (
                        <details className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2">
                          <summary className="cursor-pointer text-2xs uppercase tracking-[0.16em] text-ink-500">Generation audit</summary>
                          <pre className="mt-2 max-h-64 overflow-auto text-2xs leading-relaxed text-ink-400">
                            {JSON.stringify(question.generation, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
            {!questions.length ? <EmptyState title="No questions were generated" description="This session stopped before the first question." /> : null}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionHeader title="Final report" subtitle="Generated from stored evaluations" />
            {report ? (
              <div className="space-y-4 text-sm">
                <div className="grid gap-2">
                  {[
                    ['Overall', report.overall_score],
                    ['Technical', report.technical_score],
                    ['Communication', report.communication_score],
                    ['Problem solving', report.problem_solving_score],
                    ['Relevance', report.relevance_score],
                    ['Role alignment', report.role_alignment_score],
                  ].map(([label, value]) => (
                    <ProgressBar key={String(label)} label={String(label)} value={Number(value)} showValue />
                  ))}
                </div>
                <div>
                  <p className="section-title mb-1">Summary</p>
                  <p className="text-ink-200">{report.summary}</p>
                </div>
                {report.strengths?.length ? (
                  <div>
                    <p className="section-title mb-1">Strengths</p>
                    <ul className="list-disc space-y-1 pl-5 text-ink-300">
                      {report.strengths.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {report.weaknesses?.length ? (
                  <div>
                    <p className="section-title mb-1">Weaknesses</p>
                    <ul className="list-disc space-y-1 pl-5 text-ink-300">
                      {report.weaknesses.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {report.recommended_topics?.length ? (
                  <div>
                    <p className="section-title mb-1">Recommended topics</p>
                    <div className="flex flex-wrap gap-1.5">
                      {report.recommended_topics.map((topic) => (
                        <Badge key={topic} tone="accent">
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-ink-500">This interview has no report yet. Reports are generated when a session completes.</p>
            )}
          </Card>

          <Card>
            <SectionHeader title="Session settings" subtitle="Stored with the interview" />
            <dl className="space-y-2 text-xs">
              {Object.entries(interview.settings ?? {}).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <dt className="text-ink-400">{titleCase(key)}</dt>
                  <dd className="max-w-[60%] truncate text-right font-medium text-ink-200">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  )
}
