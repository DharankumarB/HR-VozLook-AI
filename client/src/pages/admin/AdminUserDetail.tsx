import { ArrowLeft, Download } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AdminError, AdminPageHeader, AdminTable, ScoreCell } from '../../components/admin/AdminBits'
import { Badge, Button, Card, EmptyState, LoadingState, SectionHeader, Stat } from '../../components/ui/primitives'
import { api, ApiError, downloadBlob } from '../../lib/api'
import { formatDate, formatDateTime, relativeTime } from '../../lib/format'
import { useToast } from '../../state/ToastContext'

type Detail = Awaited<ReturnType<typeof api.admin.user>>

export default function AdminUserDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    api.admin
      .user(id)
      .then(setDetail)
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const changeStatus = async (status: 'active' | 'disabled') => {
    setBusy(true)
    try {
      await api.admin.setUserStatus(id, status)
      toast.success('Account updated', `The account is now ${status}. The action was written to the audit log.`)
      load()
    } catch (caught) {
      toast.error('Could not update the account', caught instanceof ApiError ? caught.message : 'Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const download = async (interviewId: string) => {
    try {
      const blob = await api.downloadReportPdf(interviewId)
      downloadBlob(blob, `VozHireQ-report-${interviewId.slice(0, 8)}.pdf`)
    } catch {
      toast.error('Download failed', 'The report PDF could not be generated right now.')
    }
  }

  if (loading && !detail) return <LoadingState label="Loading account…" rows={4} />
  if (error) return <AdminError message={error} onRetry={load} />
  if (!detail) return <EmptyState title="Account not found" description="This account may have been deleted." />

  const { user, progress } = detail

  return (
    <div>
      <button type="button" onClick={() => navigate('/admin/users')} className="mb-4 inline-flex items-center gap-2 text-xs text-ink-400 hover:text-ink-100">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to users
      </button>

      <AdminPageHeader
        title={user.full_name || user.email}
        subtitle={`${user.email} · registered ${formatDate(user.registered_at)}`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={user.role === 'admin' ? 'accent' : 'neutral'}>{user.role}</Badge>
            <Badge tone={user.status === 'active' ? 'success' : 'danger'}>{user.status}</Badge>
            {user.role !== 'admin' ? (
              <Button
                variant={user.status === 'active' ? 'danger' : 'secondary'}
                loading={busy}
                onClick={() => void changeStatus(user.status === 'active' ? 'disabled' : 'active')}
              >
                {user.status === 'active' ? 'Disable account' : 'Re-enable account'}
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Interviews" value={progress.interviews} hint={`${progress.completed} completed`} />
        <Stat label="Average score" value={progress.average_score == null ? '—' : `${Math.round(progress.average_score)}%`} />
        <Stat label="Best score" value={progress.best_score == null ? '—' : `${Math.round(progress.best_score)}%`} />
        <Stat label="Résumés" value={detail.resumes.length} hint={`${detail.reports.length} reports on file`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeader title="Interview history" subtitle="Every session with its real score and status" />
          {detail.interviews.length ? (
            <AdminTable head={['Role', 'Type', 'Mode', 'Date', 'Score', 'Status', '']} caption="Interview history">
              {detail.interviews.map((row) => (
                <tr key={row.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link to={`/admin/interviews/${row.id}`} className="font-medium text-ink-100 hover:text-accent-soft">
                      {row.job_role}
                    </Link>
                  </td>
                  <td className="px-4 py-3 capitalize text-ink-300">{row.interview_type}</td>
                  <td className="px-4 py-3 capitalize text-ink-300">{row.interview_mode}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-300">{formatDate(row.created_at)}</td>
                  <td className="px-4 py-3">
                    <ScoreCell value={row.score} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={row.status === 'completed' ? 'success' : 'warning'}>{row.status.replace('_', ' ')}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.has_report ? (
                      <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" aria-hidden />} onClick={() => void download(row.id)}>
                        PDF
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </AdminTable>
          ) : (
            <EmptyState title="No interviews yet" description="This candidate has not started an interview." />
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionHeader title="Reports" subtitle="Stored evaluation reports" />
            {detail.reports.length ? (
              <ul className="space-y-2">
                {detail.reports.map((report) => (
                  <li key={report.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] px-3 py-2.5">
                    <Link to={`/admin/interviews/${report.interview_id}`} className="text-xs font-medium text-ink-100 hover:text-accent-soft">
                      Report · {formatDate(report.created_at)}
                    </Link>
                    <span className="flex items-center gap-2">
                      <ScoreCell value={report.overall_score} />
                      <Button size="sm" variant="ghost" onClick={() => void download(report.interview_id)}>
                        Download
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-500">No completed reports for this account yet.</p>
            )}
          </Card>

          <Card>
            <SectionHeader title="Documents" subtitle="Résumés and target job descriptions" />
            <ul className="space-y-2 text-xs">
              {detail.resumes.map((resume) => (
                <li key={resume.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] px-3 py-2.5">
                  <span className="truncate text-ink-200">{resume.file_name}</span>
                  <span className="shrink-0 text-ink-500">{resume.skills} skills · {formatDate(resume.created_at)}</span>
                </li>
              ))}
              {detail.jobs.map((job) => (
                <li key={job.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] px-3 py-2.5">
                  <span className="truncate text-ink-200">{job.title}{job.company ? ` · ${job.company}` : ''}</span>
                  <span className="shrink-0 text-ink-500">{formatDate(job.created_at)}</span>
                </li>
              ))}
              {!detail.resumes.length && !detail.jobs.length ? <li className="text-ink-500">No documents uploaded.</li> : null}
            </ul>
          </Card>

          <Card>
            <SectionHeader title="Recent admin activity on this account" subtitle="From the audit log" />
            {detail.activity.length ? (
              <ul className="space-y-2 text-2xs text-ink-400">
                {detail.activity.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3">
                    <span className="capitalize text-ink-200">{entry.action.replace(/_/g, ' ')}</span>
                    <span>{formatDateTime(entry.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-500">Nothing has been viewed or changed for this account yet.</p>
            )}
            <p className="mt-3 text-2xs text-ink-600">Last active: {user.last_active ? relativeTime(user.last_active) : 'never signed in'}</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
