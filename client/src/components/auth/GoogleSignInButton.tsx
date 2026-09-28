import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../lib/api'
import { useAuth } from '../../state/AuthContext'

/**
 * "Continue with Google".
 *
 * Google Identity Services returns a signed ID token to the browser; the token is exchanged on the
 * VozHireQ server, which verifies it against Google's public keys and issues our own session. No
 * OAuth client secret, service-role key or admin secret ever reaches this component — only the
 * publishable Google client id.
 */

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void
          prompt: () => void
          disableAutoSelect: () => void
        }
      }
    }
  }
}

const SCRIPT_ID = 'vozhireq-google-identity'

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('script_failed')), { once: true })
    })
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('script_failed'))
    document.head.appendChild(script)
  })
}

export function GoogleSignInButton({
  clientId,
  onSuccess,
  onError,
  disabled,
}: {
  /** Publishable Google client id, supplied by the server through /api/meta. */
  clientId: string | null
  onSuccess: (result: { redirectTo: string; isNewAccount: boolean }) => void
  onError: (message: string) => void
  disabled?: boolean
}) {
  const { loginWithGoogle, loading } = useAuth()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle')
  const successRef = useRef(onSuccess)
  const errorRef = useRef(onError)
  successRef.current = onSuccess
  errorRef.current = onError

  const handleCredential = useCallback(
    async (response: { credential?: string }) => {
      if (!response?.credential) {
        errorRef.current('Google did not return a sign-in token. Please try again.')
        return
      }
      try {
        const result = await loginWithGoogle(response.credential)
        successRef.current(result)
      } catch (caught) {
        const message =
          caught instanceof ApiError
            ? caught.message
            : 'We could not complete Google sign-in. Please try again or use your email and password.'
        errorRef.current(message)
      }
    },
    [loginWithGoogle],
  )

  useEffect(() => {
    if (!clientId) {
      setStatus('unavailable')
      return
    }
    let cancelled = false
    setStatus('loading')

    void (async () => {
      try {
        await loadGoogleScript()
        if (cancelled || !window.google?.accounts?.id || !containerRef.current) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredential,
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: false,
        })
        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'left',
          width: 320,
        })
        setStatus('ready')
      } catch {
        if (!cancelled) setStatus('unavailable')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [clientId, handleCredential])

  if (status === 'unavailable') {
    return (
      <div className="space-y-2">
        <button
          type="button"
          disabled
          className="btn-secondary w-full cursor-not-allowed opacity-60"
          aria-describedby="google-unavailable-note"
        >
          <GoogleGlyph />
          Continue with Google
        </button>
        <p id="google-unavailable-note" className="text-2xs leading-relaxed text-ink-500">
          Google Sign-In is not configured on this deployment. Add <code className="text-ink-300">GOOGLE_CLIENT_ID</code> and{' '}
          <code className="text-ink-300">GOOGLE_CLIENT_SECRET</code> to the server environment to enable it. Email and password
          sign-in works right now.
        </p>
      </div>
    )
  }

  return (
    <div className="relative">
      <div ref={containerRef} className="flex w-full justify-center overflow-hidden rounded-2xl" aria-label="Continue with Google" />
      {status !== 'ready' || loading ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] text-sm text-ink-300">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {loading ? 'Signing you in…' : 'Loading Google Sign-In…'}
        </div>
      ) : null}
    </div>
  )
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.64v3h3.86c2.26-2.09 3.56-5.17 3.56-8.88Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09Z" />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.7 0 3.99 2.47 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  )
}
