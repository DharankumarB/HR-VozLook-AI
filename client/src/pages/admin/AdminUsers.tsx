import { Search, UserCog } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminError, AdminPageHeader, AdminTable, ScoreCell } from '../../components/admin/AdminBits'
import { Badge, Button, Card, EmptyState, Input, LoadingState, Modal, Select } from '../../components/ui/primitives'
import { api, ApiError } from '../../lib/api'
import { formatDate, relativeTime } from '../../lib/format'
import { useToast } from '../../state/ToastContext'
import type { AdminUserRow } from '../../lib/types'

export default function AdminUsers() {
  const toast = useToast()
  const [rows, setRows] = useState<AdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('all')
  const [status, setStatus] = useState('all')
  const [range, setRange] = useState('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AdminUserRow | null>(null)

  const from = useMemo(() => {
    if (range === 'all') return undefined
    const days = Number(range)
    const date = new Date(Date.now() - days * 86400000)
    return date.toISOString()
  }, [range])

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api.admin
      .users({ search: search.trim() || undefined, role, status, from })
      .then((response) => setRows(response.users))
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false))
  }, [search, role, status, from])

  useEffect(() => {
    const timer = window.setTimeout(load, search ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [load, search])

  const toggleStatus = async (row: AdminUserRow) => {
    setBusyId(row.id)
    try {
      const next = row.status === 'active' ? 'disabled' : 'active'
      await api.admin.setUserStatus(row.id, next)
      setRows((current) => current.map((entry) => (entry.id === row.id ? { ...entry, status: next } : entry)))
      toast.success(next === 'disabled' ? 'Account disabled' : 'Account re-enabled', `${row.email} was updated and the action was logged.`)
    } catch (caught) {
      toast.error('Could not update the account', caught instanceof ApiError ? caught.message : 'Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  const removeUser = async () => {
    if (!confirmDelete) return
    setBusyId(confirmDelete.id)
    try {
      await api.admin.deleteUser(confirmDelete.id)
      setRows((current) => current.filter((entry) => entry.id !== confirmDelete.id))
      toast.success('Account deleted', `${confirmDelete.email} and all of its interview data were removed.`)
      setConfirmDelete(null)
    } catch (caught) {
      toast.error('Could not delete the account', caught instanceof ApiError ? caught.message : 'Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <AdminPageHeader
        title="Users"
        subtitle="Every registered account with its real activity. Passwords, hashes and session tokens are never exposed here."
      />

      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <label className="block">
            <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-[0.16em] text-ink-400">Search</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" aria-hidden />
              <Input className="pl-10" placeholder="Name or email" value={search} onChange={(event) => setSearch(event.target.value)} />
            </span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-[0.16em] text-ink-400">Role</span>
            <Select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="all">All roles</option>
              <option value="user">User</option>
              <option value="admin">Administrator</option>
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-[0.16em] text-ink-400">Status</span>
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-[0.16em] text-ink-400">Registered</span>
            <Select value={range} onChange={(event) => setRange(event.target.value)}>
              <option value="all">Any time</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </Select>
          </label>
        </div>
      </Card>

      {error ? <AdminError message={error} onRetry={load} /> : null}
      {loading && !rows.length ? <LoadingState label="Loading accounts…" rows={4} /> : null}

      {!loading && !rows.length && !error ? (
        <EmptyState title="No accounts match these filters" description="Try a different search term or clear the filters." />
      ) : null}

      {rows.length ? (
        <AdminTable head={['User', 'Type', 'Registered', 'Last active', 'Interviews', 'Avg score', 'Status', 'Actions']} caption="Registered accounts">
          {rows.map((row) => (
            <tr key={row.id} className="align-top hover:bg-white/[0.02]">
              <td className="px-4 py-3">
                <Link to={`/admin/users/${row.id}`} className="font-medium text-ink-100 hover:text-accent-soft">
                  {row.full_name || 'Unnamed candidate'}
                </Link>
                <span className="block text-2xs text-ink-500">{row.email}</span>
              </td>
              <td className="px-4 py-3">
                <Badge tone={row.role === 'admin' ? 'accent' : 'neutral'}>{row.role}</Badge>
                <span className="mt-1 block text-2xs text-ink-500">{row.account_type}</span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-ink-300">{formatDate(row.registered_at)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-ink-300">{row.last_active ? relativeTime(row.last_active) : 'Never signed in'}</td>
              <td className="px-4 py-3 tabular-nums text-ink-300">
                {row.interviews}
                <span className="block text-2xs text-ink-500">{row.completed_interviews} completed</span>
              </td>
              <td className="px-4 py-3">
                <ScoreCell value={row.average_score} />
              </td>
              <td className="px-4 py-3">
                <Badge tone={row.status === 'active' ? 'success' : 'danger'}>{row.status}</Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/admin/users/${row.id}`} className="btn-ghost px-2 py-1 text-2xs">
                    View
                  </Link>
                  {row.role === 'admin' ? (
                    <span className="text-2xs text-ink-500">Protected</span>
                  ) : (
                    <>
                      <Button size="sm" variant="secondary" loading={busyId === row.id} onClick={() => void toggleStatus(row)}>
                        {row.status === 'active' ? 'Disable' : 'Enable'}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setConfirmDelete(row)}>
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </AdminTable>
      ) : null}

      <p className="mt-3 text-2xs text-ink-500">
        <UserCog className="mr-1 inline h-3 w-3" aria-hidden />
        Administrator accounts cannot be disabled or deleted from the console, so you can never lock yourself out.
      </p>

      <Modal open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} title="Delete this account?">
        <p className="text-sm text-ink-300">
          This permanently deletes <span className="font-semibold text-ink-100">{confirmDelete?.email}</span> together with their résumés,
          interviews, answers, evaluations and reports. This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
            Cancel
          </Button>
          <Button variant="danger" loading={busyId === confirmDelete?.id} onClick={() => void removeUser()}>
            Delete account
          </Button>
        </div>
      </Modal>
    </div>
  )
}
