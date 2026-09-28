import crypto from 'node:crypto'
import { env } from '../env.js'
import { ApiError } from '../lib/errors.js'

/**
 * Google Sign-In (Google Identity Services) verification.
 *
 * The browser obtains an ID token (JWT) from Google and posts it here; the server verifies it against
 * Google's public keys before trusting anything inside it. Nothing about the identity is ever taken
 * from client-supplied fields (email/name/sub are read only from the verified token).
 *
 * When Supabase Auth is configured the browser can equally sign in through Supabase OAuth and then
 * call `/api/auth/me` with the Supabase access token — the middleware already validates that path.
 */

export interface GoogleIdentity {
  sub: string
  email: string
  emailVerified: boolean
  name?: string
  picture?: string
  audience: string
}

export function googleClientId(): string | null {
  return process.env.GOOGLE_CLIENT_ID?.trim() || null
}

export function googleConfigured(): boolean {
  return Boolean(googleClientId())
}

interface GoogleKey {
  kid: string
  n: string
  e: string
}

let cachedKeys: { keys: GoogleKey[]; fetchedAt: number } | null = null

async function fetchGoogleKeys(): Promise<GoogleKey[]> {
  if (cachedKeys && Date.now() - cachedKeys.fetchedAt < 60 * 60 * 1000) return cachedKeys.keys
  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new ApiError(503, 'Google sign-in is temporarily unavailable. Please try again.', 'google_keys_unavailable')
  const payload = (await response.json()) as { keys?: GoogleKey[] }
  const keys = (payload.keys ?? []).filter((key) => key.kid && key.n && key.e)
  cachedKeys = { keys, fetchedAt: Date.now() }
  return keys
}

function decodeSegment<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as T
}

/** Verifies signature, issuer, audience and expiry of a Google ID token. */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const clientId = googleClientId()
  if (!clientId) throw new ApiError(503, 'Google sign-in is not configured on this server.', 'google_not_configured')

  const parts = idToken.split('.')
  if (parts.length !== 3) throw new ApiError(400, 'That Google credential is malformed.', 'invalid_google_token')
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string]
  const header = decodeSegment<{ alg?: string; kid?: string }>(headerPart)
  const payload = decodeSegment<{
    iss?: string
    aud?: string
    exp?: number
    iat?: number
    email?: string
    email_verified?: boolean | string
    sub?: string
    name?: string
    picture?: string
  }>(payloadPart)

  if (header.alg !== 'RS256' || !header.kid) throw new ApiError(400, 'Unsupported Google credential.', 'invalid_google_token')

  const keys = await fetchGoogleKeys()
  const key = keys.find((candidate) => candidate.kid === header.kid)
  if (!key) throw new ApiError(400, 'Google rotated its signing keys. Please try again.', 'invalid_google_token')

  const publicKey = crypto.createPublicKey({ key: { kty: 'RSA', n: key.n, e: key.e }, format: 'jwk' })
  const valid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerPart}.${payloadPart}`),
    publicKey,
    Buffer.from(signaturePart.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
  )
  if (!valid) throw new ApiError(401, 'Google could not verify that credential.', 'invalid_google_token')

  const issuer = payload.iss ?? ''
  if (issuer !== 'accounts.google.com' && issuer !== 'https://accounts.google.com') {
    throw new ApiError(401, 'That credential was not issued by Google.', 'invalid_google_token')
  }
  if (payload.aud !== clientId) throw new ApiError(401, 'That Google credential was issued for a different application.', 'invalid_google_audience')
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new ApiError(401, 'That Google credential has expired. Please sign in again.', 'expired_google_token')
  if (!payload.sub || !payload.email) throw new ApiError(400, 'That Google account did not share an email address.', 'invalid_google_token')

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    name: payload.name,
    picture: payload.picture,
    audience: payload.aud,
  }
}

/** Status object surfaced (safely) through /api/meta and the admin system screen. */
export function googleAuthStatus() {
  return {
    configured: googleConfigured(),
    client_id: googleClientId(),
    // The client secret is never exposed through the API — it is only used by the OAuth code flow.
    secret_configured: Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim()),
    supabase_oauth: env.supabase.authConfigured,
  }
}
