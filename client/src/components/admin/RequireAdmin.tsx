import { ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { LoadingState } from '../ui/primitives'
import { useAuth } from '../../state/AuthContext'

/**
 * Client-side convenience gate for /admin/*.
 *
 * This improves the experience (an ordinary user sees "Access denied." and is returned to their
 * dashboard) but it is NOT the security boundary: every /api/admin/* endpoint re-checks the role from
 * the database on each request. Forging `isAdmin` in the browser gets a user nothing but a 403.
 */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, initialising } = useAuth()
  const location = useLocation()
  const [state, setState] = useState<'checking' | 'allowed' | 'denied'>('checking')

  useEffect(() => {
    let cancelled = false
    if (initialising) return

    if (!user) {
      setState('denied')
      return
    }
    // Live server confirmation (also happens to verify the session is still valid).
    api.admin
      .me()
      .then(() => {
        if (!cancelled) setState('allowed')
      })
      .catch((error) => {
        if (!cancelled) setState(error instanceof ApiError && error.status === 403 ? 'denied' : isAdmin ? 'allowed' : 'denied')
      })

    return () => {
      cancelled = true
    }
  }, [initialising, user, isAdmin])

  if (initialising || state === 'checking') {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24">
        <LoadingState label="Verifying administrator access…" rows={2} />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (state === 'denied') {
    return <AccessDenied to="/dashboard" />
  }

  return <>{children}</>
}

/** Shows a plain, non-technical explanation and then returns the visitor to their own dashboard. */
export function AccessDenied({ to = '/dashboard' }: { to?: string }) {
  const [seconds, setSeconds] = useState(4)

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000)
    const redirect = window.setTimeout(() => {
      window.location.assign(to)
    }, 4000)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(redirect)
    }
  }, [to])

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="glass-card max-w-md p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-danger/35 bg-danger/10">
          <ShieldAlert className="h-5 w-5 text-danger" aria-hidden />
        </span>
        <h1 className="mt-5 text-xl font-semibold text-ink-50">Access denied.</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-400">
          The administrator console is restricted to VozHireQ administrator accounts. Your account does not have that role, so
          nothing here has been loaded.
        </p>
        <p className="mt-4 text-2xs text-ink-500">
          Returning you to your dashboard in {seconds} second{seconds === 1 ? '' : 's'}…
        </p>
      </div>
    </div>
  )
}
