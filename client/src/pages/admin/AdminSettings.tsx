import { Save, Settings2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AdminError, AdminPageHeader } from '../../components/admin/AdminBits'
import { Badge, Button, Card, Input, LoadingState, SectionHeader, Select } from '../../components/ui/primitives'
import { api, ApiError } from '../../lib/api'
import { formatDateTime, titleCase } from '../../lib/format'
import { useToast } from '../../state/ToastContext'
import type { AdminSettingsResponse } from '../../lib/types'

/**
 * Platform settings. Only whitelisted keys can be changed, and the server records every change in the
 * admin audit log. Secrets (API keys, service-role keys, OAuth secrets) are never editable or readable
 * here — they live only in the server environment.
 */
export default function AdminSettings() {
  const toast = useToast()
  const [data, setData] = useState<AdminSettingsResponse | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api.admin
      .settings()
      .then((response) => {
        setData(response)
        setDrafts(
          Object.fromEntries(
            response.settings.map((setting) => [setting.key, typeof setting.value === 'object' ? JSON.stringify(setting.value) : String(setting.value)]),
          ),
        )
      })
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async (key: string) => {
    if (!data) return
    const setting = data.settings.find((entry) => entry.key === key)
    if (!setting) return
    let value: string | number | boolean = drafts[key] ?? ''
    if (typeof setting.value === 'number') {
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) {
        toast.error('That value is not a number', `${setting.label} expects a numeric value.`)
        return
      }
      value = parsed
    } else if (typeof setting.value === 'boolean') {
      value = value === 'true'
    }
    setSavingKey(key)
    try {
      const response = await api.admin.updateSetting(key, value)
      setData((current) => (current ? { ...current, settings: response.settings } : current))
      toast.success('Setting saved', `${setting.label} was updated and the change was logged.`)
    } catch (caught) {
      toast.error('Could not save the setting', caught instanceof ApiError ? caught.message : 'Please try again.')
    } finally {
      setSavingKey(null)
    }
  }

  if (loading && !data) return <LoadingState label="Loading platform settings…" rows={4} />
  if (error && !data) return <AdminError message={error} onRetry={load} />

  return (
    <div>
      <AdminPageHeader
        title="Settings"
        subtitle="Interview defaults and platform configuration. Values marked as read-only come from the server environment and cannot be changed from the console."
        action={
          <Button variant="secondary" onClick={load} loading={loading}>
            Reload
          </Button>
        }
      />

      {error ? <AdminError message={error} onRetry={load} /> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionHeader title="Interview defaults" subtitle="Applied to new sessions" icon={<Settings2 className="h-4 w-4 text-accent-soft" aria-hidden />} />
          <div className="space-y-4">
            {(data?.settings ?? []).map((setting) => {
              const isBoolean = typeof setting.value === 'boolean'
              const isNumber = typeof setting.value === 'number'
              const isObject = typeof setting.value === 'object' && setting.value !== null
              return (
                <div key={setting.key} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-100">{setting.label}</p>
                      <p className="mt-0.5 text-2xs text-ink-500">{setting.description}</p>
                    </div>
                    <Badge tone={setting.is_default ? 'neutral' : 'accent'}>{setting.is_default ? 'default' : 'custom'}</Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {isBoolean ? (
                      <Select value={drafts[setting.key] ?? 'true'} onChange={(event) => setDrafts((current) => ({ ...current, [setting.key]: event.target.value }))}>
                        <option value="true">Enabled</option>
                        <option value="false">Disabled</option>
                      </Select>
                    ) : isObject ? (
                      <Input value={drafts[setting.key] ?? ''} readOnly aria-label={setting.label} className="font-mono text-xs" />
                    ) : (
                      <Input
                        type={isNumber ? 'number' : 'text'}
                        value={drafts[setting.key] ?? ''}
                        onChange={(event) => setDrafts((current) => ({ ...current, [setting.key]: event.target.value }))}
                        aria-label={setting.label}
                      />
                    )}
                    <Button
                      variant="secondary"
                      icon={<Save className="h-4 w-4" aria-hidden />}
                      loading={savingKey === setting.key}
                      onClick={() => void save(setting.key)}
                    >
                      Save
                    </Button>
                  </div>
                  {setting.updated_at ? <p className="mt-2 text-2xs text-ink-600">Last changed {formatDateTime(setting.updated_at)}</p> : null}
                </div>
              )
            })}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionHeader title="Read-only configuration" subtitle="Set through server environment variables" />
            <dl className="space-y-3 text-xs">
              {[
                ['Data mode', data?.platform.data_mode],
                ['Store driver', data?.platform.store],
                ['File storage', data?.platform.storage],
                ['AI model', data?.platform.ai.model],
                ['AI key', data?.platform.ai.api_key_configured ? 'configured' : 'not configured'],
                ['Supabase Auth', data?.platform.auth.supabase_auth ? 'configured' : 'not configured'],
                ['Google Sign-In', data?.platform.auth.google.configured ? 'configured' : 'not configured'],
                ['Google client id', data?.platform.auth.google.client_id ? `${data.platform.auth.google.client_id.slice(0, 16)}…` : 'not set'],
                ['Upload limit', `${data?.platform.limits.max_upload_mb} MB`],
                ['Administrators', data?.platform.admin.provisioning],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-center justify-between gap-3">
                  <dt className="text-ink-400">{label}</dt>
                  <dd className="max-w-[60%] truncate text-right font-medium text-ink-200">{String(value ?? '—')}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 text-2xs leading-relaxed text-ink-500">
              Secret values are stored only in the server environment (<code className="text-ink-300">GEMINI_API_KEY</code>,{' '}
              <code className="text-ink-300">SUPABASE_SERVICE_ROLE_KEY</code>, <code className="text-ink-300">GOOGLE_CLIENT_ID</code>,{' '}
              <code className="text-ink-300">GOOGLE_CLIENT_SECRET</code>). VozHireQ never sends them to a browser.
            </p>
          </Card>

          <Card>
            <SectionHeader title="Interviewer personas" subtitle="Available to every interview, selectable per session" />
            <ul className="space-y-2 text-xs">
              {(data?.platform.personas ?? []).map((persona) => (
                <li key={persona.id} className="flex items-center justify-between gap-3">
                  <span className="text-ink-300">{persona.label}</span>
                  <Badge tone={persona.enabled ? 'success' : 'neutral'}>{persona.enabled ? 'enabled' : 'off'}</Badge>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <SectionHeader title="Scoring methodology" subtitle="Applied identically by the report and the PDF" />
            <ul className="space-y-2 text-xs">
              {(data?.platform.languages ?? []).map((language) => (
                <li key={language.code} className="flex items-center justify-between gap-3">
                  <span className="text-ink-300">
                    {language.label} <span className="text-ink-600">({titleCase(language.code)})</span>
                  </span>
                  <Badge tone={language.enabled ? 'success' : 'neutral'}>{language.enabled ? 'enabled' : 'coming soon'}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
