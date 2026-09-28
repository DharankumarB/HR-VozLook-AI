import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { env } from '../env.js'

export interface SessionClaims {
  sub: string
  email: string
  provider: 'local' | 'supabase' | 'google'
}

export function signSession(claims: SessionClaims): string {
  return jwt.sign(claims, env.jwtSecret, { expiresIn: `${env.sessionDays}d`, issuer: 'vozhireq' })
}

export function verifySession(token: string): SessionClaims | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret, { issuer: 'vozhireq' })
    if (!decoded || typeof decoded !== 'object') return null
    const { sub, email, provider } = decoded as jwt.JwtPayload & Partial<SessionClaims>
    if (!sub || !email) return null
    return { sub, email, provider: (provider as 'local' | 'supabase' | 'google') ?? 'local' }
  } catch {
    return null
  }
}

export function createResetToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('hex')
  return { token, tokenHash: sha256(token) }
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}
