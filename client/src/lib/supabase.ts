import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase Auth is optional. When VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are configured the
 * app signs users in through Supabase and sends the Supabase access token to the backend, which
 * verifies it server-side. Otherwise the app uses the built-in email + password flow.
 *
 * Only the publishable anon key ever reaches the browser — the service-role key stays on the server.
 */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

export const supabaseEnabled = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export function supabaseConfigMissing(): string | null {
  if (supabaseEnabled) return null
  return 'Supabase Auth is not configured in this environment. Use email and password instead.'
}
