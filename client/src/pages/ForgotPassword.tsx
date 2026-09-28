import { MailQuestion, Send } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from '../components/layout/AuthLayout'
import { Button, ErrorState, Field, Input } from '../components/ui/primitives'
import { ApiError } from '../lib/api'
import { useAuth } from '../state/AuthContext'

export default function ForgotPassword() {
  const { forgotPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ message: string; resetPath?: string; notice?: string } | null>(null)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter the email address you signed up with.')
      return
    }
    setLoading(true)
    try {
      const response = await forgotPassword(email.trim().toLowerCase())
      setResult(response)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'We could not start the reset. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we will generate a secure reset link."
      footer={
        <Link to="/login" className="font-semibold text-accent-soft hover:underline">
          Back to sign in
        </Link>
      }
    >
      {result ? (
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5 text-sm leading-relaxed text-ink-300">
            <p className="flex items-center gap-2 font-medium text-ink-100">
              <MailQuestion className="h-4 w-4 text-accent" aria-hidden /> {result.message}
            </p>
            {result.notice ? <p className="mt-2 text-xs text-ink-500">{result.notice}</p> : null}
            {result.resetPath ? (
              <Link to={result.resetPath} className="btn-primary mt-4 w-full">
                Open reset link
              </Link>
            ) : null}
          </div>
          <Button variant="secondary" fullWidth onClick={() => setResult(null)}>
            Use a different email
          </Button>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={onSubmit} noValidate>
          {error ? <ErrorState title="Reset failed" message={error} /> : null}
          <Field label="Email" htmlFor="forgot-email" required>
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>
          <Button type="submit" fullWidth size="lg" loading={loading} icon={<Send className="h-4 w-4" aria-hidden />}>
            Send reset link
          </Button>
          <p className="text-2xs leading-relaxed text-ink-500">
            For your security we respond the same way whether or not an account exists for that address.
          </p>
        </form>
      )}
    </AuthLayout>
  )
}
