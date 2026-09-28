import type { NextFunction, Request, Response } from 'express'
import { ApiError } from './errors.js'

/**
 * Small in-process rate limiter.
 *
 * VozHireQ runs on a single Node process by default, so a fixed-window counter in memory is enough to
 * protect the expensive and abuse-prone endpoints (sign-in, sign-up, password reset, AI generation,
 * uploads). When the app is scaled horizontally this should be swapped for Redis — the interface here
 * is deliberately the same shape as the popular `express-rate-limit` middleware.
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/** Drops expired buckets so the map cannot grow without bound. */
function sweep(now: number) {
  if (buckets.size < 500) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

function clientKey(req: Request): string {
  // Behind a proxy the first hop address is the closest thing to the real caller.
  const forwarded = req.headers['x-forwarded-for']
  const address = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]
  return (address?.trim() || req.ip || req.socket.remoteAddress || 'unknown').slice(0, 64)
}

export interface RateLimitOptions {
  /** Window length in milliseconds. */
  windowMs: number
  /** Maximum requests allowed per window per identity. */
  max: number
  /** Bucket identity: by IP (default) or by authenticated user. */
  keyBy?: 'ip' | 'user'
  message?: string
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, keyBy = 'ip' } = options

  return function rateLimitMiddleware(req: Request, _res: Response, next: NextFunction) {
    const identity = keyBy === 'user' && req.user ? `u:${req.user.id}` : `ip:${clientKey(req)}`
    const key = `${req.method}:${req.path}:${identity}`
    const now = Date.now()
    sweep(now)

    const bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }

    bucket.count += 1
    if (bucket.count > max) {
      const seconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      return next(
        new ApiError(
          429,
          options.message ?? `Too many requests. Please wait ${seconds} second${seconds === 1 ? '' : 's'} and try again.`,
          'rate_limited',
        ),
      )
    }
    return next()
  }
}

/** Test helper: clears every bucket (used by the API test suite). */
export function resetRateLimits() {
  buckets.clear()
}
