import { motion } from 'framer-motion'
import { ArrowRight, CalendarDays, Download, Filter, Mic, RotateCcw, Search, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingState, Modal, ProgressBar, Select } from '../components/ui/primitives'
import { ApiError, api, downloadBlob } from '../lib/api'
import { INTERVIEW_TYPES, STATUS_LABELS } from '../lib/constants'
import { formatDate, formatDateTime, scoreTone, toneClasses } from '../lib/format'
import type { InterviewRecord } from '../lib/types'
import { useToast } from '../state/ToastContext'

type Filters = {
  jobRole: string
  interviewType: string
  status: string
  from: string
  to: string
}

const EMPTY_FILTERS: Filters = { jobRole: '', interviewType: '', status: '', from: '', to: '' }

export default function History() {
  const toast = useToast()
  const navigate = useNavigate()
  const [interviews, setInterviews] = useState<InterviewRecord[]>([])
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<InterviewRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const load = useCallback(async (active: Filters) => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.listInterviews({
        jobRole: active.jobRole || undefined,
        interviewType: active.interviewType || undefined,
        status: active.status || undefined,
        from: active.from || undefined,
        to: active.to || undefined,
      })
      setInterviews(response.interviews)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'We could not load your interview history.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.interviewType, filters.status, filters.from, filters.to])

  // Role text filter is debounced so typing does not spam the API.
  useEffect(() => {
    const timeout = window.setTimeout(() => void load(filters), 350)
    return () => window.clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.jobRole])

  const activeFilterCount = useMemo(() => Object.values(filters).filter(Boolean).length, [filters])

  const remove = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.deleteInterview(pendingDelete.id)
      setInterviews((current) => current.filter((item) => item.id !== pendingDelete.id))
      toast.success('Interview deleted', 'Answers, evaluations and the report were removed.')
      setPendingDelete(null)
    } catch (caught) {
      toast.error('Could not delete', caught instanceof ApiError ? caught.message : 'Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const downloadPdf = async (interview: InterviewRecord) => {
    setDownloadingId(interview.id)
    try {
      const blob = await api.downloadReportPdf(interview.id)
      downloadBlob(blob, `VozLook-${interview.job_role.replace(/[^\w]+/g, '-')}-report.pdf`)
      toast.success('PDF downloaded')
    } catch (caught) {
      toast.error('Download failed', caught instanceof ApiError ? caught.message : 'Please try again.')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <AppShell
      title="Interview history"
      subtitle={`${interviews.length} interview${interviews.length === 1 ? '' : 's'} found`}
      actions={
        <Button variant="ghost" size="sm" onClick={() => setFiltersOpen((value) => !value)} icon={<Filter className="h-4 w-4" aria-hidden />}>
          Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
        </Button>
      }
    >
      <div className="space-y-6">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Search by role" htmlFor="filter-role">
              <div className="relative">
                <Input
                  id="filter-role"
                  value={filters.jobRole}
                  onChange={(event) => setFilters((current) => ({ ...current, jobRole: event.target.value }))}
                  placeholder="Machine Learning Engineer"
                />
                <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" aria-hidden />
              </div>
            </Field>
            <Field label="Interview type" htmlFor="filter-type">
              <Select
                id="filter-type"
                value={filters.interviewType}
                onChange={(event) => setFilters((current) => ({ ...current, interviewType: event.target.value }))}
                options={[{ value: '', label: 'All types' }, ...INTERVIEW_TYPES.map((type) => ({ value: type.value, label: type.label }))]}
              />
            </Field>
            <Field label="Status" htmlFor="filter-status">
              <Select
                id="filter-status"
                value={filters.status}
                onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
                options={[
                  { value: '', label: 'All statuses' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'in_progress', label: 'In progress' },
                  { value: 'processing', label: 'Processing' },
                  { value: 'created', label: 'Created' },
                  { value: 'abandoned', label: 'Abandoned' },
                ]}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From" htmlFor="filter-from">
                <Input
                  id="filter-from"
                  type="date"
                  value={filters.from}
                  onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
                />
              </Field>
              <Field label="To" htmlFor="filter-to">
                <Input id="filter-to" type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
              </Field>
            </div>
          </div>

          {activeFilterCount || filtersOpen ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {Object.entries(filters)
                  .filter(([, value]) => value)
                  .map(([key, value]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilters((current) => ({ ...current, [key]: '' }))}
                      className="chip transition-colors hover:border-accent/40 hover:text-white"
                    >
                      {key}: {value}
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear all
              </Button>
              <Link to="/interview/setup" className="btn-primary !py-2 text-xs">
                <Mic className="h-3.5 w-3.5" aria-hidden /> New interview
              </Link>
            </div>
          ) : null}
        </Card>

        {error ? <ErrorState title="Could not load history" message={error} onRetry={() => void load(filters)} /> : null}

        {loading ? (
          <Card>
            <LoadingState label="Loading your interviews…" rows={4} />
          </Card>
        ) : interviews.length ? (
          <ul className="space-y-4">
            {interviews.map((interview, index) => {
              const tone = toneClasses[scoreTone(interview.overall_score ?? undefined)]
              return (
                <motion.li
                  key={interview.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.04, 0.3) }}
                >
                  <Card className="!p-4 sm:!p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={interview.status === 'completed' ? 'success' : interview.status === 'in_progress' ? 'warning' : 'neutral'}>
                            {STATUS_LABELS[interview.status] ?? interview.status}
                          </Badge>
                          <Badge>{interview.interview_type}</Badge>
                          <Badge tone="neutral">{interview.interview_mode}</Badge>
                          <Badge tone="neutral">{interview.difficulty}</Badge>
                        </div>
                        <h3 className="mt-2 text-sm font-semibold text-ink-50 sm:text-base">{interview.job_role}</h3>
                        <p className="mt-1 flex flex-wrap items-center gap-3 text-2xs text-ink-500">
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                            {formatDateTime(interview.completed_at ?? interview.created_at)}
                          </span>
                          <span>{interview.question_count} questions</span>
                          {interview.completed_at ? <span>Completed {formatDate(interview.completed_at)}</span> : null}
                        </p>
                        {interview.overall_score != null ? (
                          <div className="mt-3 max-w-xs">
                            <ProgressBar value={Number(interview.overall_score)} label="Overall score" showValue />
                          </div>
                        ) : (
                          <p className="mt-2 text-2xs text-ink-500">Not scored yet — finish the interview to generate a report.</p>
                        )}
                      </div>

                      <div className={`rounded-2xl border px-4 py-3 text-center ${tone.border} ${tone.bg}`}>
                        <p className="text-2xs uppercase tracking-wider text-ink-500">Overall</p>
                        <p className={`text-xl font-semibold tabular-nums ${tone.text}`}>
                          {interview.overall_score != null ? `${Math.round(Number(interview.overall_score))}%` : '—'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {interview.has_report ? (
                        <>
                          <Link to={`/interview/${interview.id}/report`} className="btn-primary !py-2 text-xs">
                            View report
                          </Link>
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={downloadingId === interview.id}
                            onClick={() => void downloadPdf(interview)}
                            icon={<Download className="h-3.5 w-3.5" aria-hidden />}
                          >
                            PDF
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => navigate(`/interview/${interview.id}`)}
                          icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}
                        >
                          Continue interview
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setPendingDelete(interview)} icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}>
                        Delete
                      </Button>
                      {interview.has_report ? (
                        <Link to="/progress" className="btn-ghost !py-2 text-2xs">
                          Compare with progress <ArrowRight className="h-3 w-3" aria-hidden />
                        </Link>
                      ) : null}
                    </div>
                  </Card>
                </motion.li>
              )
            })}
          </ul>
        ) : (
          <EmptyState
            icon={<Mic className="h-5 w-5" aria-hidden />}
            title={activeFilterCount ? 'No interviews match these filters.' : 'No interviews yet.'}
            description={
              activeFilterCount
                ? 'Try widening the date range, clearing the role search, or removing the type filter.'
                : 'Your completed and in-progress interviews will be listed here with their reports.'
            }
            action={
              activeFilterCount ? (
                <Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>
                  Clear filters
                </Button>
              ) : (
                <Link to="/interview/setup" className="btn-primary">
                  Start your first interview
                </Link>
              )
            }
          />
        )}
      </div>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete this interview?"
        description="This permanently removes the interview, its answers, evaluations and report. This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Keep it
            </Button>
            <Button variant="danger" loading={deleting} onClick={() => void remove()}>
              Delete interview
            </Button>
          </>
        }
      />
    </AppShell>
  )
}
