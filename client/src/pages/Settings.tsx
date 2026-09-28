import { AlertTriangle, Bell, Database, KeyRound, LogOut, Save, Server, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Badge, Button, Card, ErrorState, Field, Input, LoadingState, Modal, SectionHeader } from '../components/ui/primitives'
import { ApiError, api } from '../lib/api'
import type { MetaResponse } from '../lib/types'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'

export default function Settings() {
  const { user, profile, logout, deleteAccount } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [meta, setMeta] = useState<MetaResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [changing, setChanging] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await api.meta()
        if (!cancelled) setMeta(response)
      } catch {
        /* meta is informational */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const provider = user?.provider === 'supabase' ? 'supabase' : 'password'

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setPasswordError(null)
    if (passwords.next.length < 8 || !/[A-Za-z]/.test(passwords.next) || !/[0-9]/.test(passwords.next)) {
      setPasswordError('New password needs at least 8 characters, including a letter and a number.')
      return
    }
    if (passwords.next !== passwords.confirm) {
      setPasswordError('The new passwords do not match.')
      return
    }
    setChanging(true)
    try {
      await api.changePassword({ currentPassword: passwords.current, newPassword: passwords.next })
      setPasswords({ current: '', next: '', confirm: '' })
      toast.success('Password changed', 'Use your new password next time you sign in.')
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'We could not change your password.'
      setPasswordError(message)
      toast.error('Could not change password', message)
    } finally {
      setChanging(false)
    }
  }

  const removeAccount = async () => {
    setDeleteError(null)
    if (deleteConfirm !== 'DELETE') {
      setDeleteError('Type DELETE exactly to confirm.')
      return
    }
    if (provider === 'password' && !deletePassword) {
      setDeleteError('Enter your password to confirm.')
      return
    }
    setDeleting(true)
    try {
      const response = await deleteAccount({ password: deletePassword || undefined, confirm: 'DELETE' })
      toast.success('Account deleted', response.message ?? 'Your data has been removed.')
      navigate('/', { replace: true })
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'We could not delete your account.'
      setDeleteError(message)
      toast.error('Deletion failed', message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AppShell title="Settings" subtitle="Account security, data and platform information">
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <SectionHeader title="Change password" icon={<KeyRound className="h-4 w-4 text-accent" aria-hidden />} />
            {provider === 'supabase' ? (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 text-sm text-ink-300">
                Your account is managed by Supabase Auth. Use the password reset flow to change your credentials.
                <a href="/forgot-password" className="btn-secondary mt-3 w-full !py-2 text-xs">
                  Send a password reset link
                </a>
              </div>
            ) : (
              <form className="space-y-5" onSubmit={changePassword}>
                {passwordError ? <ErrorState title="Password not changed" message={passwordError} /> : null}
                <Field label="Current password" htmlFor="current-password" required>
                  <Input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    value={passwords.current}
                    onChange={(event) => setPasswords((current) => ({ ...current, current: event.target.value }))}
                    required
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="New password" htmlFor="next-password" required hint="8+ characters with a letter and a number">
                    <Input
                      id="next-password"
                      type="password"
                      autoComplete="new-password"
                      value={passwords.next}
                      onChange={(event) => setPasswords((current) => ({ ...current, next: event.target.value }))}
                      required
                    />
                  </Field>
                  <Field label="Confirm new password" htmlFor="confirm-password" required>
                    <Input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={passwords.confirm}
                      onChange={(event) => setPasswords((current) => ({ ...current, confirm: event.target.value }))}
                      required
                    />
                  </Field>
                </div>
                <Button type="submit" loading={changing} icon={<Save className="h-4 w-4" aria-hidden />}>
                  Update password
                </Button>
              </form>
            )}
          </Card>

          <Card>
            <SectionHeader title="Danger zone" icon={<AlertTriangle className="h-4 w-4 text-danger" aria-hidden />} />
            <p className="text-sm leading-relaxed text-ink-300">
              Deleting your account permanently removes your résumés, job descriptions, interviews, answers, evaluations and reports. This cannot be
              undone.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="danger" onClick={() => setDeleteOpen(true)} icon={<Trash2 className="h-4 w-4" aria-hidden />}>
                Delete my account
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  await logout()
                  toast.info('Signed out', 'See you soon.')
                  navigate('/', { replace: true })
                }}
                icon={<LogOut className="h-4 w-4" aria-hidden />}
              >
                Sign out
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <SectionHeader title="Platform" icon={<Server className="h-4 w-4 text-neon" aria-hidden />} />
            {loading ? (
              <LoadingState rows={3} label="Reading platform status…" />
            ) : meta ? (
              <dl className="space-y-3 text-xs">
                {[
                  ['Product', `${meta.product} by ${meta.vendor}`],
                  ['Data store', meta.data_mode === 'supabase' ? 'Supabase Postgres' : 'Local SQLite (development)'],
                  ['File storage', meta.storage === 'supabase' ? 'Supabase Storage' : 'Local server storage'],
                  ['AI engine', `${meta.ai.engine}${meta.ai.gemini_configured ? '' : ' (Gemini key not configured)'}`],
                  ['Model', meta.ai.model],
                  ['Upload limit', `${meta.limits.max_upload_mb} MB`],
                  ['Session provider', meta.auth.providers.join(', ')],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3">
                    <dt className="text-ink-500">{label}</dt>
                    <dd className="max-w-[60%] text-right text-ink-200">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-ink-500">Platform information is unavailable right now.</p>
            )}
            <p className="mt-4 text-2xs leading-relaxed text-ink-500">
              API keys never reach the browser. Evaluations, question generation and coaching run on the server, and only your own rows are readable
              with your session token.
            </p>
          </Card>

          <Card>
            <SectionHeader title="Appearance & accessibility" icon={<Sparkles className="h-4 w-4 text-accent" aria-hidden />} />
            <p className="text-xs leading-relaxed text-ink-400">
              VozLook InterviewAI runs in a dark theme tuned for long practice sessions: high-contrast text, visible focus rings, labelled controls and
              reduced-motion friendly animations.
            </p>
            <ul className="mt-3 space-y-2 text-2xs text-ink-500">
              <li>Keyboard: every control is reachable with Tab, modals trap focus and Escape closes them.</li>
              <li>Screen readers: live regions announce toasts and score updates.</li>
              <li>Motion: transitions are short and never block input.</li>
            </ul>
          </Card>

          <Card>
            <SectionHeader title="Notifications" icon={<Bell className="h-4 w-4 text-warning" aria-hidden />} />
            <p className="text-xs leading-relaxed text-ink-400">
              VozLook is a practice tool and does not send emails beyond account confirmation and password resets. In-app toasts confirm every action —
              uploads, evaluations, report generation and deletions.
            </p>
          </Card>

          <Card>
            <SectionHeader title="Data ownership" icon={<Database className="h-4 w-4 text-success" aria-hidden />} />
            <p className="text-xs leading-relaxed text-ink-400">
              You can delete any résumé, job description or interview at any time; deleting an interview removes its answers, evaluations and report.
              Deleting the account removes everything associated with it.
            </p>
            <Badge tone="success" className="mt-3">
              <ShieldCheck className="h-3 w-3" aria-hidden /> Owner-only access on every route
            </Badge>
          </Card>
        </div>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your account permanently?"
        description="Every résumé, interview, answer, evaluation and report attached to this account will be deleted. This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Keep my account
            </Button>
            <Button variant="danger" loading={deleting} onClick={() => void removeAccount()}>
              Delete everything
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {deleteError ? <ErrorState title="Could not delete" message={deleteError} /> : null}
          {provider === 'password' ? (
            <Field label="Your password" htmlFor="delete-password" required>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
            </Field>
          ) : null}
          <Field label='Type "DELETE" to confirm' htmlFor="delete-confirm" required>
            <Input id="delete-confirm" value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} placeholder="DELETE" />
          </Field>
          <p className="text-2xs text-ink-500">
            Signed in as {user?.email}
            {profile?.full_name ? ` · ${profile.full_name}` : ''}
          </p>
        </div>
      </Modal>
    </AppShell>
  )
}
