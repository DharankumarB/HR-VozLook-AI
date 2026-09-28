import { KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '../components/layout/AuthLayout'
import { Button, ErrorState, Field, Input } from '../components/ui/primitives'
import { ApiError, setToken } from '../lib/api'
import { supabase, supabaseEnabled } from '../lib/supabase'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const { resetPassword } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [supabaseReady, setSupabaseReady] = useState(false)

  // Supabase sends the reset token in the URL fragment; supabase-js consumes it automatically.
  useEffect(() => {
    if (!supabase || !supabaseEnabled) return
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSupabaseReady(true)
    })
  }, [])

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Use at least 8 characters, including a letter and a number.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      if (supabaseReady && supabase) {
        const { error: supabaseError } = await supabase.auth.updateUser({ password })
        if (supabaseError) throw new ApiError(supabaseError.message, 400, 'supabase_auth')
        const { data } = await supabase.auth.getSession()
        if (data.session?.access_token) setToken(data.session.access_token)
      } else {
        if (!token) throw new ApiError('This reset link is missing its token. Request a new link.', 400, 'missing_token')
        const response = await resetPassword({ token, password })
        if (response.session?.token) setToken(response.session.token)
      }
      setDone(true)
      toast.success('Password updated', 'You can sign in with your new password.')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'We could not update your password. Please request a new link.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Pick something you have not used elsewhere."
      footer={
        <Link to="/login" className="font-semibold text-accent-soft hover:underline">
          Back to sign in
        </Link>
      }
    >
      {done ? (
        <div className="space-y-4 rounded-3xl border border-success/25 bg-success/[0.07] p-5 text-sm text-ink-200">
          <p className="font-medium text-ink-50">Your password has been updated.</p>
          <Button fullWidth onClick={() => navigate('/dashboard', { replace: true })}>
            Continue to dashboard
          </Button>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={onSubmit} noValidate>
          {error ? <ErrorState title="Could not reset password" message={error} /> : null}
          {!token && !supabaseReady ? (
            <p className="rounded-2xl border border-warning/30 bg-warning/[0.07] p-3 text-xs text-warning">
              This page needs a valid reset link. Request one from the forgot-password page.
            </p>
          ) : null}
          <Field label="New password" htmlFor="new-password" required hint="8+ characters, letter and number">
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm-password" required>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
          </Field>
          <Button type="submit" fullWidth size="lg" loading={loading} icon={<KeyRound className="h-4 w-4" aria-hidden />}>
            Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
