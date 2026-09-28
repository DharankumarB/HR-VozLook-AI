import { Eye, EyeOff, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/layout/AuthLayout'
import { Button, ErrorState, Field, Input } from '../components/ui/primitives'
import { ApiError } from '../lib/api'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'

export default function Signup() {
  const { signup, loading, supabaseEnabled } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [confirmationSent, setConfirmationSent] = useState(false)

  const strength = useMemo(() => {
    let score = 0
    if (password.length >= 8) score++
    if (/[A-Z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++
    return score
  }, [password])

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    const errors: Record<string, string> = {}
    if (!fullName.trim()) errors.fullName = 'Enter your name — it appears on your reports'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address'
    if (password.length < 8) errors.password = 'Use at least 8 characters'
    else if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) errors.password = 'Include at least one letter and one number'
    if (password !== confirm) errors.confirm = 'Passwords do not match'
    setFieldErrors(errors)
    if (Object.keys(errors).length) return

    try {
      await signup({ email: email.trim().toLowerCase(), password, fullName: fullName.trim() })
      toast.success('Account created', 'Let’s set up your interview profile.')
      navigate('/onboarding', { replace: true })
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'email_confirmation_required') {
        setConfirmationSent(true)
        return
      }
      setError(caught instanceof ApiError ? caught.message : 'We could not create your account. Please try again.')
    }
  }

  if (confirmationSent) {
    return (
      <AuthLayout title="Check your inbox" subtitle="We sent you a confirmation link to finish creating your account.">
        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5 text-sm leading-relaxed text-ink-300">
          <p>
            Open the confirmation email for <span className="font-semibold text-ink-100">{email}</span>, then come back and sign in. The link may
            take a minute to arrive — check spam if you do not see it.
          </p>
          <Link to="/login" className="btn-primary mt-5 w-full">
            Go to sign in
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Free to start. Your résumé and interview data stay private to you."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-accent-soft hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={onSubmit} noValidate>
        {error ? <ErrorState title="Sign up failed" message={error} /> : null}

        <Field label="Full name" htmlFor="fullName" required error={fieldErrors.fullName}>
          <Input
            id="fullName"
            name="name"
            autoComplete="name"
            placeholder="Arjun Mehta"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            aria-invalid={Boolean(fieldErrors.fullName)}
            required
          />
        </Field>

        <Field label="Email" htmlFor="signup-email" required error={fieldErrors.email}>
          <Input
            id="signup-email"
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

        <Field
          label="Password"
          htmlFor="signup-password"
          required
          error={fieldErrors.password}
          hint={password ? `${['Weak', 'Fair', 'Good', 'Strong'][Math.max(0, strength - 1)] ?? 'Strong'}` : '8+ characters, letter and number'}
        >
          <div className="relative">
            <Input
              id="signup-password"
              name="new-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Create a password"
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
          <div className="mt-2 flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((index) => (
              <span key={index} className={`h-1 flex-1 rounded-full ${index < strength ? 'bg-accent' : 'bg-white/10'}`} />
            ))}
          </div>
        </Field>

        <Field label="Confirm password" htmlFor="confirm" required error={fieldErrors.confirm}>
          <Input
            id="confirm"
            name="confirm-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Repeat your password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            aria-invalid={Boolean(fieldErrors.confirm)}
            required
          />
        </Field>

        <p className="text-2xs leading-relaxed text-ink-500">
          By creating an account you agree that VozLook InterviewAI provides practice feedback only — it does not make hiring decisions.
          {supabaseEnabled ? ' Authentication is handled by Supabase Auth.' : ''}
        </p>

        <Button type="submit" fullWidth size="lg" loading={loading} icon={<UserPlus className="h-4 w-4" aria-hidden />}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
