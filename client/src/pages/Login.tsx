import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/layout/AuthLayout'
import { Button, ErrorState, Field, Input } from '../components/ui/primitives'
import { ApiError } from '../lib/api'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'

export default function Login() {
  const { login, loading, supabaseEnabled } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    const errors: { email?: string; password?: string } = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address'
    if (!password) errors.password = 'Enter your password'
    setFieldErrors(errors)
    if (Object.keys(errors).length) return

    try {
      await login({ email: email.trim().toLowerCase(), password })
      toast.success('Welcome back', 'Your session is ready.')
      navigate(redirectTo, { replace: true })
    } catch (caught) {
      const message =
        caught instanceof ApiError
          ? caught.status === 401
            ? 'That email and password combination is not correct.'
            : caught.message
          : 'We could not sign you in. Please try again.'
      setError(message)
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle={
        supabaseEnabled
          ? 'Your account is managed by Supabase Auth. Sign in to continue practising.'
          : 'Sign in to continue your interview practice.'
      }
      footer={
        <>
          New here?{' '}
          <Link to="/signup" className="font-semibold text-accent-soft hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={onSubmit} noValidate>
        {error ? <ErrorState title="Sign in failed" message={error} /> : null}

        <Field label="Email" htmlFor="email" required error={fieldErrors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            required
          />
        </Field>

        <Field label="Password" htmlFor="password" required error={fieldErrors.password}>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors.password)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-ink-400 hover:text-ink-100"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        </Field>

        <div className="flex items-center justify-between text-xs">
          <Link to="/forgot-password" className="text-ink-400 hover:text-ink-100">
            Forgot your password?
          </Link>
          <span className="text-ink-600">{supabaseEnabled ? 'Supabase Auth' : 'Secure session'}</span>
        </div>

        <Button type="submit" fullWidth size="lg" loading={loading} icon={<LogIn className="h-4 w-4" aria-hidden />}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}
