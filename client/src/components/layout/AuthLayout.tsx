import { motion } from 'framer-motion'
import { Bot, FileText, Gauge, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BRAND } from '../../lib/constants'

const HIGHLIGHTS = [
  { icon: FileText, title: 'Résumé and job grounded', description: 'Questions built from your projects, skills and the role you are targeting.' },
  { icon: Gauge, title: 'Adaptive follow-ups', description: 'The interviewer probes weak or vague answers the way a hiring manager would.' },
  { icon: Bot, title: 'Explainable feedback', description: 'Every score shows the dimension, the evidence and the formula behind it.' },
]

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[1.05fr_1fr]">
      {/* Left: brand panel */}
      <div className="relative hidden overflow-hidden border-r border-white/[0.06] p-10 lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid-fade" aria-hidden />
        <Link to="/" className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-sheen shadow-glow">
            <Sparkles className="h-5 w-5 text-white" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-semibold text-ink-50">{BRAND.product}</span>
            <span className="block text-2xs text-ink-500">{BRAND.tagline}</span>
          </span>
        </Link>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
          <span className="chip mb-5">{BRAND.productDescription}</span>
          <h2 className="max-w-md text-3xl font-semibold leading-tight text-ink-50">
            Meet Your <span className="text-gradient">AI Interviewer.</span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-300">
            Practice realistic interviews. Understand your performance. Grow with every attempt.
          </p>
          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-accent-soft">
                  <item.icon className="h-4 w-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-medium text-ink-100">{item.title}</span>
                  <span className="block text-xs text-ink-500">{item.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </motion.div>

        <p className="text-2xs text-ink-600">
          {BRAND.product} · {BRAND.studioLine}
        </p>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-sheen shadow-glow">
              <Sparkles className="h-5 w-5 text-white" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink-50">{BRAND.product}</span>
              <span className="block text-2xs text-ink-500">{BRAND.tagline}</span>
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-ink-50">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm leading-relaxed text-ink-400">{subtitle}</p> : null}
          <div className="mt-7">{children}</div>
          {footer ? <div className="mt-6 text-sm text-ink-400">{footer}</div> : null}
        </div>
      </div>
    </div>
  )
}
