import { env } from '../env.js'
import { getStore } from '../db/index.js'
import type { Row } from '../db/store.js'
import { ApiError } from '../lib/errors.js'

/**
 * Role handling.
 *
 * Roles live in the database (`profiles.role`) and are only ever written by the server. The client
 * can read its own role but can never set it: `PUT /api/profile` whitelists fields and `role` is not
 * one of them. Admin privileges are therefore always resolved server-side from a verified session.
 *
 * `ADMIN_EMAILS` (comma separated, defaults to the VozLook Studios admin address) is the only way an
 * account can be promoted, and the promotion happens on authentication — never on a client request.
 */

export type Role = 'user' | 'admin'

export const DEFAULT_ADMIN_EMAIL = 'vozlookstudios@gmail.com'

export function adminEmails(): string[] {
  const configured = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  const all = configured.length ? configured : [DEFAULT_ADMIN_EMAIL]
  if (!all.includes(DEFAULT_ADMIN_EMAIL) && !configured.length) all.push(DEFAULT_ADMIN_EMAIL)
  return [...new Set(all)]
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false
  return adminEmails().includes(email.trim().toLowerCase())
}

export function roleOf(profile: Row | null | undefined): Role {
  return profile?.role === 'admin' ? 'admin' : 'user'
}

export function accountStatus(profile: Row | null | undefined): 'active' | 'disabled' {
  return profile?.status === 'disabled' ? 'disabled' : 'active'
}

/** Fields that are safe to hand to the browser. */
export function publicUser(user: Row, profile: Row | null) {
  return {
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    provider: user.auth_provider ?? 'local',
    role: roleOf(profile),
    status: accountStatus(profile),
  }
}

/**
 * Ensures a profile row exists and, for configured admin addresses, is promoted on authentication.
 * Returns the profile exactly as stored.
 */
export async function ensureProfileForUser(user: Row, fullName?: string | null): Promise<Row> {
  const store = getStore()
  const existing = await store.findOne<Row>('profiles', { where: { user_id: user.id } })
  const shouldBeAdmin = isAdminEmail(String(user.email))
  const name = fullName?.trim() || String(user.email).split('@')[0]

  if (!existing) {
    const created = await store.insert('profiles', {
      user_id: user.id,
      full_name: name,
      email: user.email,
      role: shouldBeAdmin ? 'admin' : 'user',
      status: 'active',
      preferred_language: 'en',
      onboarding_completed: 0,
    })
    return created
  }

  const patch: Row = {}
  if (shouldBeAdmin && existing.role !== 'admin') patch.role = 'admin'
  if (!existing.email && user.email) patch.email = user.email
  if (!existing.preferred_language) patch.preferred_language = 'en'
  if (!existing.status) patch.status = 'active'
  if (Object.keys(patch).length) {
    await store.updateById('profiles', String(existing.id), patch)
    return { ...existing, ...patch }
  }
  return existing
}

/**
 * Server-side admin check used by every /api/admin route. The role is read from the database on each
 * request (no cached client claim, no JWT role field to tamper with).
 */
export async function requireAdminRole(userId: string): Promise<Row> {
  const store = getStore()
  const profile = await store.findOne<Row>('profiles', { where: { user_id: userId } })
  if (!profile) throw ApiError.forbidden('Administrator access is required.')
  if (roleOf(profile) !== 'admin') throw ApiError.forbidden('Administrator access is required.')
  if (accountStatus(profile) === 'disabled') throw ApiError.forbidden('This administrator account is disabled.')
  return profile
}

export function adminCount(): number {
  return adminEmails().length
}

export const adminConfig = {
  provisionedEmails: () => adminEmails(),
  enforcedServerSide: true as const,
  adminSurface: '/admin',
}
