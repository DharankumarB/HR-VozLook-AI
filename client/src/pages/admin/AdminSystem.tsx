import { CheckCircle2, Database, HardDrive, KeyRound, RefreshCw, Server, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AdminError, AdminPageHeader, AdminTable } from '../../components/admin/AdminBits'
import { Badge, Button, Card, LoadingState, SectionHeader, Stat } from '../../components/ui/primitives'
import { api } from '../../lib/api'
import { formatDateTime, relativeTime, titleCase } from '../../lib/format'
import { useMeta } from '../../lib/meta'
import type { AdminLogEntry, AdminSettingsResponse } from '../../lib/types'

/**
 * System health. Every value is reported by the running API (`/api/admin/settings`, `/api/health`,
 * `/api/admin/logs`) — nothing on this page is fabricated. Sensitive values are masked server-side.
 */
export default function AdminSystem() {
  const { meta } = useMeta()
  const [settings, setSettings] = useState<AdminSettingsResponse | null>(null)
  const [logs, setLogs] = useState<AdminLogEntry[]>([])
  const [health, setHealth] = useState<{ ok: boolean; status: string; checks?: Record<string, string>; time?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([api.admin.settings(), api.admin.logs(25), api.health()])
      .then(([settingsResponse, logsResponse, healthResponse]) => {
        setSettings(settingsResponse)
        setLogs(logsResponse.logs)
        setHealth(healthResponse as { ok: boolean; status: string; checks?: Record<string, string>; time?: string })
        setRefreshedAt(new Date().toISOString())
      })
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading && !settings) return <LoadingState label="Reading system status…" rows={4} />
  if (error && !settings) return <AdminError message={error} onRetry={load} />

  const platform = settings?.platform

  return (
    <div>
      <AdminPageHeader
        title="System"
        subtitle="Runtime configuration and health. Keys and secrets are reported as configured/not configured only — their values are never sent to the browser."
        action={
          <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={load} loading={loading}>
            Refresh
          </Button>
        }
      />

      {error ? <AdminError message={error} onRetry={load} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="API health"
          value={health?.ok ? 'Healthy' : 'Degraded'}
          hint={health?.time ? `Checked ${relativeTime(health.time)}` : undefined}
          tone={health?.ok ? 'strong' : 'weak'}
        />
        <Stat label="Data store" value={platform?.store ?? '—'} hint={`Mode: ${platform?.data_mode ?? '—'}`} icon={<Database className="h-4 w-4" aria-hidden />} />
        <Stat label="File storage" value={platform?.storage ?? '—'} icon={<HardDrive className="h-4 w-4" aria-hidden />} />
        <Stat label="Environment" value={titleCase(platform?.environment ?? '—')} icon={<Server className="h-4 w-4" aria-hidden />} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card>
          <SectionHeader title="AI configuration" subtitle="Provider status without exposing the key" icon={<KeyRound className="h-4 w-4 text-accent-soft" aria-hidden />} />
          <dl className="space-y-3 text-xs">
            <Row label="Engine" value={platform?.ai.engine ?? '—'} />
            <Row label="Model" value={platform?.ai.model ?? '—'} />
            <Row
              label="API key"
              value={
                <Badge tone={platform?.ai.api_key_configured ? 'success' : 'warning'}>
                  {platform?.ai.api_key_configured ? 'configured' : 'not configured'}
                </Badge>
              }
            />
            <Row label="Provider calls" value={platform?.ai.enabled ? 'enabled' : 'built-in engine only'} />
            <Row label="Timeout" value={`${platform?.ai.timeout_ms ?? '—'} ms`} />
            <Row label="Retries" value={String(platform?.ai.max_retries ?? '—')} />
          </dl>
        </Card>

        <Card>
          <SectionHeader title="Auth configuration" subtitle="Provider status only — never a secret" icon={<ShieldCheck className="h-4 w-4 text-success" aria-hidden />} />
          <dl className="space-y-3 text-xs">
            <Row label="Providers" value={(platform?.auth.providers ?? []).join(', ') || '—'} />
            <Row label="Supabase Auth" value={platform?.auth.supabase_auth ? 'configured' : 'not configured'} />
            <Row
              label="Google Sign-In"
              value={<Badge tone={platform?.auth.google.configured ? 'success' : 'warning'}>{platform?.auth.google.configured ? 'configured' : 'not configured'}</Badge>}
            />
            <Row label="Google client id" value={platform?.auth.google.client_id ? `${platform.auth.google.client_id.slice(0, 18)}…` : 'not set'} />
            <Row label="Session length" value={`${platform?.auth.session_days ?? '—'} days`} />
            <Row label="Admin enforcement" value={platform?.admin.enforced_server_side ? 'server-side (database role)' : 'unknown'} />
          </dl>
        </Card>

        <Card>
          <SectionHeader title="Storage and limits" subtitle="Real row counts and the active upload policy" />
          <dl className="space-y-3 text-xs">
            <Row label="Users" value={String(platform?.counts.users ?? '—')} />
            <Row label="Interviews" value={String(platform?.counts.interviews ?? '—')} />
            <Row label="Reports" value={String(platform?.counts.reports ?? '—')} />
            <Row label="Résumés" value={String(platform?.counts.resumes ?? '—')} />
            <Row label="Upload limit" value={`${platform?.limits.max_upload_mb ?? '—'} MB`} />
            <Row label="Admin accounts" value={String(platform?.admin.provisioning ?? '—')} />
          </dl>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionHeader title="Health checks" subtitle={health?.time ? `Last probe ${formatDateTime(health.time)}` : 'Live probe from /api/health'} />
          <ul className="space-y-2 text-xs">
            {Object.entries(health?.checks ?? {}).map(([key, value]) => (
              <li key={key} className="flex items-center justify-between gap-3">
                <span className="text-ink-300">{titleCase(key)}</span>
                <span className="flex items-center gap-2 font-medium text-ink-100">
                  {value === 'ok' || value === 'built_in_engine' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />
                  ) : (
                    <TriangleAlert className="h-3.5 w-3.5 text-warning" aria-hidden />
                  )}
                  {value.replace(/_/g, ' ')}
                </span>
              </li>
            ))}
            {!Object.keys(health?.checks ?? {}).length ? <li className="text-ink-500">No checks were reported.</li> : null}
          </ul>
          <p className="mt-3 text-2xs text-ink-600">
            Product: {meta?.product ?? platform?.product} · {platform?.product_description ?? ''} · {platform?.vendor}
          </p>
        </Card>

        <Card>
          <SectionHeader title="Supported languages" subtitle="Only enabled languages can be selected by candidates" />
          <ul className="space-y-2 text-xs">
            {(platform?.languages ?? []).map((language) => (
              <li key={language.code} className="flex items-center justify-between gap-3">
                <span className="text-ink-300">
                  {language.label} <span className="text-ink-600">({language.code})</span>
                </span>
                <Badge tone={language.enabled ? 'success' : 'neutral'}>{language.enabled ? 'enabled' : 'coming soon'}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6">
        <SectionHeader
          title="Audit log"
          subtitle="Administrator logins, records viewed, account actions and settings changes"
          action={<span className="text-2xs text-ink-500">{refreshedAt ? `Updated ${relativeTime(refreshedAt)}` : ''}</span>}
        />
        {logs.length ? (
          <AdminTable head={['When', 'Administrator', 'Action', 'Target', 'Details']} caption="Administrator audit log">
            {logs.map((entry) => (
              <tr key={entry.id} className="hover:bg-white/[0.02]">
                <td className="whitespace-nowrap px-4 py-3 text-ink-300">{formatDateTime(entry.created_at)}</td>
                <td className="px-4 py-3 text-ink-200">{entry.admin_email ?? '—'}</td>
                <td className="px-4 py-3 capitalize text-ink-200">{entry.action.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3 text-ink-400">
                  {entry.target_type ?? '—'}
                  {entry.target_id ? <span className="block text-2xs text-ink-600">{entry.target_id}</span> : null}
                </td>
                <td className="px-4 py-3 text-2xs text-ink-500">{entry.metadata ? JSON.stringify(entry.metadata).slice(0, 90) : '—'}</td>
              </tr>
            ))}
          </AdminTable>
        ) : (
          <p className="text-xs text-ink-500">No administrator actions have been recorded yet.</p>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-400">{label}</dt>
      <dd className="max-w-[60%] truncate text-right font-medium text-ink-200">{value}</dd>
    </div>
  )
}
