import { ApiError } from './errors.js'

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number; label?: string; shouldRetry?: (e: unknown) => boolean } = {},
): Promise<T> {
  const retries = opts.retries ?? 2
  const base = opts.baseDelayMs ?? 400
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt)
    } catch (error) {
      lastError = error
      const retryable = opts.shouldRetry ? opts.shouldRetry(error) : true
      if (!retryable || attempt === retries) break
      await sleep(base * Math.pow(2, attempt) + Math.random() * 150)
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`${opts.label ?? 'operation'} failed: ${String(lastError)}`)
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** Bound a promise with a timeout so the UI never hangs on a slow provider. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label = 'request'): Promise<T> {
  let timer: NodeJS.Timeout
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(ApiError.upstream(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
      }),
    ])
  } finally {
    clearTimeout(timer!)
  }
}
