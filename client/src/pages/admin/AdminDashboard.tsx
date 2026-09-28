import { Activity, Award, Briefcase, CalendarDays, Database, FileBarChart, Mic, TrendingUp, Users, Video } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminError, AdminPageHeader, AdminTable, ScoreCell } from '../../components/admin/AdminBits'
import { Badge, Card, LoadingState, SectionHeader, Stat } from '../../components/ui/primitives'
import { api } from '../../lib/api'
import { formatDateTime, relativeTime } from '../../lib/format'
import type { AdminOverview } from '../../lib/types'

export default function AdminDashboard() {
  const [data, setData] = useState<AdminOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api.admin
      .overview()
      .then(setData)
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const totals = data?.totals

  return (
    <div>
      <AdminPageHeader
        title="Dashboard"
        subtitle="Live platform metrics, computed from the database on every request. Nothing here is hardcoded."
        action={
          <p className="text-2xs text-ink-500">Updated {data ? relativeTime(data.system.generated_at) : '—'}</p>
        }
      />

      {error ? <AdminError message={error} onRetry={load} /> : null}
      {loading && !data ? <LoadingState label="Loading platform metrics…" rows={3} /> : null}

      {totals ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Total users" value={totals.users} hint={`${totals.admins} administrator${totals.admins === 1 ? '' : 's'}`} icon={<Users className="h-4 w-4" aria-hidden />} />
            <Stat label="Active users (30 days)" value={totals.active_users_30d} hint="Accounts with a session or activity in 30 days" icon={<Activity className="h-4 w-4" aria-hidden />} />
            <Stat label="Total interviews" value={totals.interviews_started} hint={`${totals.interviews_in_progress} in progress`} icon={<Briefcase className="h-4 w-4" aria-hidden />} />
            <Stat label="Interviews today" value={totals.interviews_today} hint="Started since midnight" icon={<CalendarDays className="h-4 w-4" aria-hidden />} />
            <Stat
              label="Average score"
              value={totals.average_score == null ? '—' : `${Math.round(totals.average_score)}%`}
              hint="Across every completed interview"
              icon={<Award className="h-4 w-4" aria-hidden />}
            />
            <Stat label="Résumés processed" value={totals.resumes} hint={`${totals.job_descriptions} job descriptions`} icon={<Database className="h-4 w-4" aria-hidden />} />
            <Stat label="Job roles" value={totals.job_roles} hint="Distinct roles targeted by candidates" icon={<TrendingUp className="h-4 w-4" aria-hidden />} />
            <Stat
              label="Completion rate"
              value={data?.completion_rate == null ? '—' : `${Math.round(data.completion_rate)}%`}
              hint={`${totals.interviews_completed} completed · ${totals.reports} reports`}
              icon={<FileBarChart className="h-4 w-4" aria-hidden />}
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Card>
              <SectionHeader title="Interview modes" subtitle="Text, voice and video usage from stored sessions" icon={<Mic className="h-4 w-4 text-accent-soft" aria-hidden />} />
              <ul className="space-y-3">
                {(data?.modes ?? []).map((row) => (
                  <li key={row.interview_mode}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="capitalize text-ink-200">{row.interview_mode}</span>
                      <span className="tabular-nums text-ink-400">
                        {row.interviews} started · {row.completed} completed
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${totals.interviews_started ? Math.round((row.interviews / totals.interviews_started) * 100) : 0}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <SectionHeader title="Interview types" subtitle="HR, technical, behavioural and mixed" icon={<Video className="h-4 w-4 text-neon-soft" aria-hidden />} />
              <ul className="space-y-3">
                {(data?.types ?? []).map((row) => (
                  <li key={row.interview_type}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="capitalize text-ink-200">{row.interview_type}</span>
                      <span className="tabular-nums text-ink-400">{row.interviews}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className="h-full rounded-full bg-neon"
                        style={{ width: `${totals.interviews_started ? Math.round((row.interviews / totals.interviews_started) * 100) : 0}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <SectionHeader title="System" subtitle="Runtime status reported by the API" />
              <dl className="space-y-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-400">Data store</dt>
                  <dd className="font-semibold text-ink-100">{data?.system.data_mode}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-400">File storage</dt>
                  <dd className="font-semibold text-ink-100">{data?.system.storage}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-400">AI engine</dt>
                  <dd className="text-right font-semibold text-ink-100">{data?.system.ai_engine}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-400">Provider calls</dt>
                  <dd>
                    <Badge tone={data?.system.ai_enabled ? 'success' : 'warning'}>{data?.system.ai_enabled ? 'enabled' : 'built-in engine'}</Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-400">API uptime</dt>
                  <dd className="font-semibold tabular-nums text-ink-100">
                    {data ? `${Math.floor(data.system.uptime_seconds / 60)} min` : '—'}
                  </dd>
                </div>
              </dl>
            </Card>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <div>
              <SectionHeader
                title="Newest accounts"
                subtitle="Latest registrations"
                action={
                  <Link to="/admin/users" className="text-xs font-semibold text-accent-soft hover:underline">
                    View all users
                  </Link>
                }
              />
              <AdminTable head={['Account', 'Type', 'Registered', 'Interviews', 'Status']} caption="Newest accounts">
                {(data?.recent_users ?? []).map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <Link to={`/admin/users/${row.id}`} className="font-medium text-ink-100 hover:text-accent-soft">
                        {row.full_name || row.email}
                      </Link>
                      <span className="block text-2xs text-ink-500">{row.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={row.role === 'admin' ? 'accent' : 'neutral'}>{row.role}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-300">{formatDateTime(row.registered_at)}</td>
                    <td className="px-4 py-3 tabular-nums text-ink-300">{row.interviews}</td>
                    <td className="px-4 py-3">
                      <Badge tone={row.status === 'active' ? 'success' : 'danger'}>{row.status}</Badge>
                    </td>
                  </tr>
                ))}
              </AdminTable>
            </div>

            <div>
              <SectionHeader
                title="Latest interviews"
                subtitle="Most recent sessions across the platform"
                action={
                  <Link to="/admin/interviews" className="text-xs font-semibold text-accent-soft hover:underline">
                    View all interviews
                  </Link>
                }
              />
              <AdminTable head={['Candidate', 'Role', 'Mode', 'Score', 'Status']} caption="Latest interviews">
                {(data?.recent_interviews ?? []).map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <Link to={`/admin/interviews/${row.id}`} className="font-medium text-ink-100 hover:text-accent-soft">
                        {row.candidate || row.email}
                      </Link>
                      <span className="block text-2xs text-ink-500">{relativeTime(row.created_at)}</span>
                    </td>
                    <td className="px-4 py-3 text-ink-300">{row.job_role}</td>
                    <td className="px-4 py-3 capitalize text-ink-300">{row.interview_mode}</td>
                    <td className="px-4 py-3">
                      <ScoreCell value={row.score} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={row.status === 'completed' ? 'success' : row.status === 'in_progress' ? 'warning' : 'neutral'}>{row.status.replace('_', ' ')}</Badge>
                    </td>
                  </tr>
                ))}
              </AdminTable>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
