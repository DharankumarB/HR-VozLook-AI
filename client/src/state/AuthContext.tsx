import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, api, getToken, setToken } from '../lib/api'
import { supabase, supabaseEnabled } from '../lib/supabase'
import type { Profile, SessionUser } from '../lib/types'

interface AuthContextValue {
  user: SessionUser | null
  profile: Profile | null
  loading: boolean
  initialising: boolean
  provider: string | null
  signup: (input: { email: string; password: string; fullName?: string }) => Promise<void>
  login: (input: { email: string; password: string }) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  updateProfile: (patch: Parameters<typeof api.updateProfile>[0]) => Promise<Profile>
  forgotPassword: typeof api.forgotPassword
  resetPassword: typeof api.resetPassword
  changePassword: typeof api.changePassword
  deleteAccount: typeof api.deleteAccount
  supabaseEnabled: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialising, setInitialising] = useState(true)
  const [provider, setProvider] = useState<string | null>(null)

  const clearSession = useCallback(() => {
    setToken(null)
    setUser(null)
    setProfile(null)
    setProvider(null)
  }, [])

  /** Restores the session on first paint (local token or a persisted Supabase session). */
  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      try {
        if (supabase && supabaseEnabled) {
          const { data } = await supabase.auth.getSession()
          const session = data.session
          if (session?.access_token) {
            setToken(session.access_token)
          }
        }

        if (!getToken()) return
        const response = await api.me()
        if (cancelled) return
        setUser(response.user)
        setProfile(response.profile)
        setProvider(response.provider ?? 'local')
      } catch (error) {
        if (cancelled) return
        // An expired or revoked token simply means "signed out".
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) clearSession()
      } finally {
        if (!cancelled) setInitialising(false)
      }
    }

    void bootstrap()

    const subscription = supabase
      ? supabase.auth.onAuthStateChange((_event, session) => {
          if (session?.access_token) setToken(session.access_token)
          else if (supabaseEnabled) clearSession()
        }).data.subscription
      : { unsubscribe: () => undefined }

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [clearSession])

  /* The API client broadcasts when the server rejects a stored token. */
  useEffect(() => {
    const handler = () => clearSession()
    window.addEventListener('vozlook:unauthorized', handler)
    return () => window.removeEventListener('vozlook:unauthorized', handler)
  }, [clearSession])

  const signup = useCallback(
    async (input: { email: string; password: string; fullName?: string }) => {
      setLoading(true)
      try {
        if (supabase && supabaseEnabled) {
          const { data, error } = await supabase.auth.signUp({
            email: input.email,
            password: input.password,
            options: { data: { full_name: input.fullName } },
          })
          if (error) throw new ApiError(error.message, 400, 'supabase_auth')
          if (!data.session?.access_token) {
            throw new ApiError('Check your inbox to confirm your email address, then sign in.', 200, 'email_confirmation_required')
          }
          setToken(data.session.access_token)
        } else {
          const response = await api.signup(input)
          setToken(response.token)
        }
        const me = await api.me()
        setUser(me.user)
        setProfile(me.profile)
        setProvider(me.provider)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const login = useCallback(async (input: { email: string; password: string }) => {
    setLoading(true)
    try {
      if (supabase && supabaseEnabled) {
        const { data, error } = await supabase.auth.signInWithPassword(input)
        if (error) throw new ApiError(error.message, 400, 'supabase_auth')
        setToken(data.session?.access_token ?? null)
      } else {
        const response = await api.login(input)
        setToken(response.token)
      }
      const me = await api.me()
      setUser(me.user)
      setProfile(me.profile)
      setProvider(me.provider)
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      if (supabase && supabaseEnabled) await supabase.auth.signOut()
      await api.logout()
    } catch {
      /* signing out locally must always succeed */
    } finally {
      clearSession()
    }
  }, [clearSession])

  const refresh = useCallback(async () => {
    if (!getToken()) return
    const me = await api.me()
    setUser(me.user)
    setProfile(me.profile)
    setProvider(me.provider)
  }, [])

  const updateProfile = useCallback(async (patch: Parameters<typeof api.updateProfile>[0]) => {
    const response = await api.updateProfile(patch)
    setProfile(response.profile)
    return response.profile
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      initialising,
      provider,
      signup,
      login,
      logout,
      refresh,
      updateProfile,
      forgotPassword: api.forgotPassword,
      resetPassword: api.resetPassword,
      changePassword: api.changePassword,
      deleteAccount: api.deleteAccount,
      supabaseEnabled,
    }),
    [user, profile, loading, initialising, provider, signup, login, logout, refresh, updateProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside an AuthProvider')
  return context
}

export function useRequireAuth() {
  const { user, initialising } = useAuth()
  return { user, initialising, isAuthenticated: Boolean(user) }
}
