import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '../ui/primitives'
import { formatScore, scoreTone, toneClasses } from '../../lib/format'

/** Shared building blocks for the administrator console. */

export function AdminPageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink-50">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm text-ink-400">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}

/** Renders an error state with a retry action. Never shows a raw stack trace. */
export function AdminError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="glass-card flex flex-wrap items-center justify-between gap-3 p-5" role="alert">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-danger/35 bg-danger/10">
          <AlertTriangle className="h-4 w-4 text-danger" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink-100">We could not load this section</p>
          <p className="mt-0.5 text-xs text-ink-400">{message}</p>
        </div>
      </div>
      {onRetry ? (
        <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}

export function AdminTable({ head, children, caption }: { head: string[]; children: ReactNode; caption?: string }) {
  return (
    <div className="glass-card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] border-collapse text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02] text-left">
              {head.map((label) => (
                <th key={label} scope="col" className="whitespace-nowrap px-4 py-3 text-2xs font-semibold uppercase tracking-[0.14em] text-ink-400">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">{children}</tbody>
        </table>
      </div>
    </div>
  )
}

export function ScoreCell({ value }: { value: number | null | undefined }) {
  const tone = scoreTone(value)
  return <span className={`font-semibold tabular-nums ${toneClasses[tone].text}`}>{formatScore(value)}</span>
}

export function Sparkline({ points, height = 40 }: { points: number[]; height?: number }) {
  if (!points.length) return <div className="h-10 rounded-lg bg-white/[0.04]" aria-hidden />
  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const range = max - min || 1
  const path = points
    .map((value, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * 100
      const y = height - ((value - min) / range) * height
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-10 w-full" role="img" aria-label="Trend">
      <path d={path} fill="none" stroke="rgba(124,92,255,0.9)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
