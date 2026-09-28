import { useEffect, useState } from 'react'
import { api } from './api'
import type { MetaResponse } from './types'

/**
 * Public deployment configuration (branding, enabled languages, Google client id, feature flags).
 * Fetched once per page load and cached in module scope — it is immutable for a deployment, so there
 * is no reason to call it per component.
 */
let cached: MetaResponse | null = null
let inflight: Promise<MetaResponse> | null = null

export async function loadMeta(): Promise<MetaResponse> {
  if (cached) return cached
  if (!inflight) {
    inflight = api
      .meta()
      .then((response) => {
        cached = response
        return response
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export function useMeta(): { meta: MetaResponse | null; loading: boolean; error: string | null } {
  const [meta, setMeta] = useState<MetaResponse | null>(cached)
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (cached) return
    setLoading(true)
    loadMeta()
      .then((response) => {
        if (!cancelled) setMeta(response)
      })
      .catch(() => {
        // The app must stay usable if /api/meta is briefly unavailable; defaults are English-only.
        if (!cancelled) setError('Some deployment details could not be loaded. English is used by default.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { meta, loading, error }
}
