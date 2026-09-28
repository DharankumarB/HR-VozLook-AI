import { Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminError, AdminPageHeader, AdminTable, ScoreCell } from '../../components/admin/AdminBits'
import { Badge, Card, EmptyState, Input, LoadingState, Select } from '../../components/ui/primitives'
import { api } from '../../lib/api'
import { formatDate } from '../../lib/format'
import type { AdminInterviewRow } from '../../lib/types'

export default function AdminInterviews() {
  const [rows, setRows] = useState<AdminInterviewRow[]>([])
  const [totals, setTotals] = useState<{ all: number; completed: number; in_progress: number; with_report: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')
  const [mode, setMode] = useState('all')
  const [status, setStatus] = useState('all')

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api.admin
      .interviews({ search: search.trim() || undefined, type, mode, status })
      .then((response) => {
        setRows(response.interviews)
        setTotals(response.totals)
      })
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false))
  }, [search, type, mode, status])

  useEffect(() => {
    const timer = window.setTimeout(load, search ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [load, search])

  return (
    <div>
      <AdminPageHeader
        title="Interviews"
        subtitle="Every interview session with its candidate, type, mode, duration, score and status. Open one to inspect the questions, answers, AI evaluation and final report."
      />

      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <label className="block">
            <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-[0.16em] text-ink-400">Search</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" aria-hidden />
              <Input className="pl-10" placeholder="Candidate, email or role" value={search} onChange={(event) => setSearch(event.target.value)} />
            </span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-[0.16em] text-ink-400">Type</span>
            <Select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="all">All types</option>
              <option value="technical">Technical</option>
              <option value="behavioral">Behavioral</option>
              <option value="hr">HR</option>
              <option value="mixed">Mixed</option>
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-[0.16em] text-ink-400">Mode</span>
            <Select value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="all">All modes</option>
              <option value="text">Text</option>
              <option value="voice">Voice</option>
              <option value="video">Video</option>
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-[0.16em] text-ink-400">Status</span>
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In progress</option>
              <option value="processing">Processing</option>
              <option value="created">Created</option>
            </Select>
          </label>
        </div>
        {totals ? (
          <p className="mt-3 text-2xs text-ink-500">
            Showing {rows.length} of {totals.all} sessions · {totals.completed} completed · {totals.in_progress} in progress · {totals.with_report} with a report
          </p>
        ) : null}
      </Card>

      {error ? <AdminError message={error} onRetry={load} /> : null}
      {loading && !rows.length ? <LoadingState label="Loading interviews…" rows={4} /> : null}

      {!loading && !rows.length && !error ? (
        <EmptyState title="No interviews match these filters" description="Adjust the filters or wait for candidates to start a session." />
      ) : null}

      {rows.length ? (
        <AdminTable head={['Candidate', 'Job role', 'Type', 'Mode', 'Date', 'Duration', 'Questions', 'Score', 'Status', '']} caption="Interview sessions">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-white/[0.02]">
              <td className="px-4 py-3">
                <Link to={`/admin/users/${row.user_id}`} className="font-medium text-ink-100 hover:text-accent-soft">
                  {row.candidate || 'Unnamed candidate'}
                </Link>
                <span className="block text-2xs text-ink-500">{row.email}</span>
              </td>
              <td className="px-4 py-3 text-ink-300">{row.job_role}</td>
              <td className="px-4 py-3 capitalize text-ink-300">{row.interview_type}</td>
              <td className="px-4 py-3 capitalize text-ink-300">{row.interview_mode}</td>
              <td className="whitespace-nowrap px-4 py-3 text-ink-300">{formatDate(row.created_at)}</td>
              <td className="px-4 py-3 tabular-nums text-ink-300">{row.duration_minutes == null ? '—' : `${row.duration_minutes} min`}</td>
              <td className="px-4 py-3 tabular-nums text-ink-300">
                {row.answered}/{row.questions}
              </td>
              <td className="px-4 py-3">
                <ScoreCell value={row.score} />
              </td>
              <td className="px-4 py-3">
                <Badge tone={row.status === 'completed' ? 'success' : row.status === 'in_progress' ? 'warning' : 'neutral'}>{row.status.replace('_', ' ')}</Badge>
                {row.has_report ? <span className="mt-1 block text-2xs text-ink-500">report ready</span> : null}
              </td>
              <td className="px-4 py-3 text-right">
                <Link to={`/admin/interviews/${row.id}`} className="btn-secondary px-3 py-2 text-xs">
                  Inspect
                </Link>
              </td>
            </tr>
          ))}
        </AdminTable>
      ) : null}

      <p className="mt-3 text-2xs text-ink-500">
        Duration is the real time between the first question and the last answer. Questions, answers and evaluations in the detail
        view are read straight from stored evaluation rows.
      </p>
    </div>
  )
}
