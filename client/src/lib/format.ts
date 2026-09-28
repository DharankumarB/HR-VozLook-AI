export function formatDate(value?: string | null, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', ...opts })
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function relativeTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const diff = Date.now() - date.getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} d ago`
  return formatDate(value)
}

export function formatDuration(seconds?: number | null): string {
  if (seconds == null || Number.isNaN(seconds)) return '—'
  const total = Math.max(0, Math.round(seconds))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  if (mins === 0) return `${secs}s`
  return `${mins}m ${secs.toString().padStart(2, '0')}s`
}

export function formatScore(value?: number | null): string {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return `${Math.round(Number(value))}%`
}

export function formatBytes(bytes?: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Score → semantic tone used for colouring bars, badges and text. */
export function scoreTone(value?: number | null): 'strong' | 'fair' | 'weak' | 'none' {
  if (value == null || Number.isNaN(Number(value))) return 'none'
  const score = Number(value)
  if (score >= 75) return 'strong'
  if (score >= 55) return 'fair'
  return 'weak'
}

/** Maps a score tone onto the Badge component's tone vocabulary. */
export function badgeTone(tone: ReturnType<typeof scoreTone>): 'neutral' | 'success' | 'warning' | 'danger' {
  if (tone === 'strong') return 'success'
  if (tone === 'fair') return 'warning'
  if (tone === 'weak') return 'danger'
  return 'neutral'
}

export const toneClasses: Record<ReturnType<typeof scoreTone>, { text: string; bg: string; bar: string; border: string }> = {
  strong: { text: 'text-success', bg: 'bg-success/10', bar: 'bg-success', border: 'border-success/30' },
  fair: { text: 'text-warning', bg: 'bg-warning/10', bar: 'bg-warning', border: 'border-warning/30' },
  weak: { text: 'text-danger', bg: 'bg-danger/10', bar: 'bg-danger', border: 'border-danger/30' },
  none: { text: 'text-ink-400', bg: 'bg-white/5', bar: 'bg-ink-500', border: 'border-white/10' },
}

export function greeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 21) return 'Good evening'
  return 'Working late'
}

export function initials(name?: string | null): string {
  if (!name) return 'V'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'V'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase()
}

export function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ')
}

export function truncate(value: string, max = 140): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value
}
