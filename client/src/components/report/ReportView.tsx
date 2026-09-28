import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  Info,
  Lightbulb,
  ListChecks,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { METRIC_LABELS, QUESTION_TYPE_LABELS, SCORE_DISCLAIMER } from '../../lib/constants'
import { formatDateTime, formatScore, scoreTone, toneClasses } from '../../lib/format'
import type { InterviewRecord, ReportRecord } from '../../lib/types'
import { Badge, Card, ProgressBar, SectionHeader } from '../ui/primitives'

export function ScoreGrid({ report }: { report: ReportRecord }) {
  const metrics: [string, number][] = [
    ['overall_score', Number(report.overall_score)],
    ['technical_score', Number(report.technical_score)],
    ['communication_score', Number(report.communication_score)],
    ['problem_solving_score', Number(report.problem_solving_score)],
    ['relevance_score', Number(report.relevance_score)],
    ['confidence_score', Number(report.confidence_score)],
    ['role_alignment_score', Number(report.role_alignment_score)],
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {metrics.map(([key, value], index) => (
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.04 }}
          className="space-y-2"
        >
          <ProgressBar value={value} label={METRIC_LABELS[key] ?? key} showValue />
        </motion.div>
      ))}
    </div>
  )
}

export function ReportSection({
  title,
  icon,
  children,
  description,
  tone = 'default',
}: {
  title: string
  icon?: ReactNode
  children: ReactNode
  description?: string
  tone?: 'default' | 'positive' | 'attention'
}) {
  const tones = {
    default: 'border-white/[0.07]',
    positive: 'border-success/25',
    attention: 'border-warning/25',
  }
  return (
    <Card className={tones[tone]}>
      <SectionHeader title={title} subtitle={description} icon={icon} />
      {children}
    </Card>
  )
}

export function BulletList({ items, tone = 'neutral' }: { items: string[]; tone?: 'neutral' | 'positive' | 'warning' }) {
  const markers = {
    neutral: <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-500" aria-hidden />,
    positive: <BadgeCheck className="mt-1 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />,
    warning: <AlertTriangle className="mt-1 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />,
  }
  if (!items?.length) return <p className="text-sm text-ink-500">Nothing recorded for this section.</p>
  return (
    <ul className="space-y-2.5">
      {items.map((item, index) => (
        <li key={`${index}-${item.slice(0, 24)}`} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-200">
          {markers[tone]}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export function QuestionReviewList({ report }: { report: ReportRecord }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const reviews = report.question_reviews ?? []
  if (!reviews.length) return <p className="text-sm text-ink-500">No question-level review was recorded.</p>

  return (
    <div className="space-y-3">
      {reviews.map((review, index) => {
        const open = openIndex === index
        const average =
          (review.scores.relevance +
            review.scores.technical_accuracy +
            review.scores.completeness +
            review.scores.clarity +
            review.scores.structure +
            review.scores.problem_solving) /
          6
        const tone = toneClasses[scoreTone(average)]
        return (
          <div key={review.question_number} className="overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.02]">
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : index)}
              aria-expanded={open}
              className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-white/[0.03]"
            >
              <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border text-xs font-semibold ${tone.border} ${tone.bg} ${tone.text}`}>
                {Math.round(average)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Q{review.question_number}</span>
                  <Badge>{QUESTION_TYPE_LABELS[review.question_type] ?? review.question_type}</Badge>
                  <Badge tone="neutral">{review.difficulty}</Badge>
                  {!review.answer?.trim() ? <Badge tone="danger">Not answered</Badge> : null}
                </span>
                <span className="mt-1.5 block text-sm font-medium leading-relaxed text-ink-100">{review.question}</span>
              </span>
              <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
            </button>

            {open ? (
              <div className="space-y-4 border-t border-white/[0.06] p-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ['Relevance', review.scores.relevance],
                    ['Technical', review.scores.technical_accuracy],
                    ['Completeness', review.scores.completeness],
                    ['Clarity', review.scores.clarity],
                    ['Structure', review.scores.structure],
                    ['Problem solving', review.scores.problem_solving],
                    ['Delivery', review.scores.confidence],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                      <p className="text-2xs text-ink-500">{label}</p>
                      <p className={`text-sm font-semibold tabular-nums ${toneClasses[scoreTone(Number(value))].text}`}>{Math.round(Number(value))}%</p>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="section-title mb-1.5">Your answer</p>
                  <p className="whitespace-pre-wrap rounded-2xl border border-white/[0.06] bg-ink-900/50 p-3 text-sm leading-relaxed text-ink-200">
                    {review.answer?.trim() ? review.answer : 'No answer was captured for this question.'}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="section-title mb-1.5 flex items-center gap-1.5">
                      <BadgeCheck className="h-3.5 w-3.5 text-success" aria-hidden /> What worked
                    </p>
                    <BulletList items={review.what_worked} tone="positive" />
                  </div>
                  <div>
                    <p className="section-title mb-1.5 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden /> What to improve
                    </p>
                    <BulletList items={review.what_to_improve} tone="warning" />
                  </div>
                </div>

                {review.missed_topics?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-2xs text-ink-500">Not covered:</span>
                    {review.missed_topics.map((topic) => (
                      <span key={topic} className="chip border-warning/25 bg-warning/[0.06] text-warning">
                        {topic}
                      </span>
                    ))}
                  </div>
                ) : null}

                {review.better_approach ? (
                  <div className="rounded-2xl border border-accent/25 bg-accent/[0.07] p-3.5">
                    <p className="section-title mb-1.5 flex items-center gap-1.5 text-accent-soft">
                      <Lightbulb className="h-3.5 w-3.5" aria-hidden /> A stronger approach
                    </p>
                    <p className="text-sm leading-relaxed text-ink-200">{review.better_approach}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function ImprovementPlan({ report }: { report: ReportRecord }) {
  if (!report.improvement_plan?.length) return <p className="text-sm text-ink-500">No practice plan was generated.</p>
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {report.improvement_plan.map((week) => (
        <div key={week.week} className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-accent/15 text-xs font-semibold text-accent-soft">
              {week.week}
            </span>
            <p className="text-sm font-semibold text-ink-100">{week.focus}</p>
          </div>
          <ul className="mt-3 space-y-2">
            {week.actions?.map((action) => (
              <li key={action} className="flex items-start gap-2 text-xs leading-relaxed text-ink-300">
                <ListChecks className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function MethodologyPanel({ report }: { report: ReportRecord }) {
  const [open, setOpen] = useState(false)
  const methodology = report.scoring_methodology
  return (
    <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-4">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ink-100">
          <Info className="h-4 w-4 text-neon" aria-hidden />
          How scoring works
        </span>
        <ChevronDown className={`h-4 w-4 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open ? (
        <div className="mt-4 space-y-3 text-xs leading-relaxed text-ink-300">
          {methodology?.dimensions?.map((dimension) => (
            <p key={dimension.key}>
              <span className="font-semibold text-ink-100">
                {dimension.label} ({Math.round(dimension.weight * 100)}%):
              </span>{' '}
              {dimension.formula}
            </p>
          ))}
          {methodology?.overall ? <p className="text-ink-200">{methodology.overall}</p> : null}
          {methodology?.confidence ? <p>{methodology.confidence}</p> : null}
          <p className="rounded-2xl border border-white/[0.07] bg-ink-900/60 p-3 text-ink-400">{methodology?.note ?? SCORE_DISCLAIMER}</p>
        </div>
      ) : null}
    </div>
  )
}

export function ReportHeader({ report, interview }: { report: ReportRecord; interview: InterviewRecord }) {
  const tone = toneClasses[scoreTone(Number(report.overall_score))]
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">
            <Trophy className="h-3 w-3" aria-hidden /> Practice report
          </Badge>
          <Badge>{interview.interview_type}</Badge>
          <Badge tone="neutral">{interview.interview_mode}</Badge>
          <Badge tone="neutral">{interview.difficulty}</Badge>
        </div>
        <h1 className="mt-3 text-xl font-semibold text-ink-50 sm:text-2xl">{interview.job_role}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-3 text-2xs text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {formatDateTime(interview.completed_at ?? interview.created_at)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5" aria-hidden />
            {report.report_json?.answered_count ?? 0} of {report.report_json?.question_count ?? interview.question_count} questions answered
          </span>
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            Engine: {report.engine}
          </span>
        </p>
      </div>
      <div className={`rounded-3xl border p-4 text-center ${tone.border} ${tone.bg}`}>
        <p className="text-2xs uppercase tracking-wider text-ink-400">Overall</p>
        <p className={`text-3xl font-semibold tabular-nums ${tone.text}`}>{formatScore(report.overall_score)}</p>
      </div>
    </div>
  )
}
