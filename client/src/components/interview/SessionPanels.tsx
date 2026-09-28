import { motion } from 'framer-motion'
import { Bot, CheckCircle2, CornerDownRight, Lightbulb, SkipForward, Sparkles, Target, User } from 'lucide-react'
import type { ReactNode } from 'react'
import { QUESTION_TYPE_LABELS } from '../../lib/constants'
import { formatDuration } from '../../lib/format'
import type { EvaluationRecord, QuestionRecord } from '../../lib/types'
import { Badge, ProgressBar } from '../ui/primitives'

export function AiBubble({ children, speaking }: { children: ReactNode; speaking?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-accent-sheen shadow-glow">
        <Bot className="h-4 w-4 text-white" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 rounded-3xl rounded-tl-lg border border-accent/25 bg-accent/[0.08] p-4">
        {speaking ? (
          <p className="mb-2 flex items-center gap-2 text-2xs text-accent-soft">
            <Sparkles className="h-3 w-3 animate-pulse" aria-hidden /> Interviewer is speaking…
          </p>
        ) : null}
        <div className="text-sm leading-relaxed text-ink-100 sm:text-[15px]">{children}</div>
      </div>
    </div>
  )
}

export function CandidateBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start justify-end gap-3">
      <div className="min-w-0 max-w-[85%] rounded-3xl rounded-tr-lg border border-white/10 bg-white/[0.05] p-4">
        <div className="text-sm leading-relaxed text-ink-200">{children}</div>
      </div>
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
        <User className="h-4 w-4 text-ink-300" aria-hidden />
      </span>
    </div>
  )
}

export function QuestionCard({
  question,
  index,
  total,
  isFollowUp,
}: {
  question: QuestionRecord
  index: number
  total: number
  isFollowUp?: boolean
}) {
  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">
          <Target className="h-3 w-3" aria-hidden />
          Question {index} of {total}
        </Badge>
        <Badge>{QUESTION_TYPE_LABELS[question.question_type] ?? question.question_type}</Badge>
        <Badge tone="neutral">{question.difficulty}</Badge>
        {isFollowUp || question.is_follow_up ? (
          <Badge tone="neon">
            <CornerDownRight className="h-3 w-3" aria-hidden /> Follow-up
          </Badge>
        ) : null}
      </div>
      <AiBubble>
        <p className="text-base font-medium leading-relaxed text-ink-50 sm:text-lg">{question.question}</p>
        {question.expected_topics?.length ? (
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-2xs text-ink-400">
            <Lightbulb className="h-3 w-3 text-warning" aria-hidden />
            A strong answer usually covers:
            {question.expected_topics.map((topic) => (
              <span key={topic} className="chip">
                {topic}
              </span>
            ))}
          </p>
        ) : null}
        {question.resume_anchor ? (
          <p className="mt-2 text-2xs text-ink-500">Drawn from your résumé: {question.resume_anchor}</p>
        ) : null}
      </AiBubble>
    </motion.div>
  )
}

export function ProgressRail({
  answered,
  planned,
  asked,
  currentIndex,
}: {
  answered: number
  planned: number
  asked: number
  currentIndex: number
}) {
  return (
    <div className="space-y-3 rounded-3xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-300">
          Question {Math.min(currentIndex, planned)} of {planned}
        </span>
        <span className="text-ink-500">
          {answered} answered{asked > planned ? ` · ${asked - planned} follow-up${asked - planned > 1 ? 's' : ''}` : ''}
        </span>
      </div>
      <ProgressBar value={Math.min(asked, planned)} max={planned} tone="none" size="sm" />
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: planned }).map((_, index) => (
          <span
            key={index}
            className={`h-1.5 flex-1 rounded-full ${index < answered ? 'bg-accent' : 'bg-white/10'}`}
            aria-hidden
          />
        ))}
      </div>
    </div>
  )
}

export function InstantFeedback({
  evaluation,
  onDismiss,
}: {
  evaluation: EvaluationRecord
  onDismiss?: () => void
}) {
  const covered = (evaluation.coverage ?? []).filter((item) => item.covered)
  const missed = (evaluation.coverage ?? []).filter((item) => !item.covered)
  return (
    <div className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-100">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
          Answer analysed
        </div>
        {onDismiss ? (
          <button type="button" onClick={onDismiss} className="text-2xs text-ink-500 hover:text-ink-200">
            Hide
          </button>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-2xs sm:grid-cols-4">
        {[
          ['Relevance', evaluation.relevance_score],
          ['Technical', evaluation.technical_score],
          ['Completeness', evaluation.completeness_score],
          ['Clarity', evaluation.clarity_score],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <p className="text-ink-500">{label}</p>
            <p className="text-sm font-semibold tabular-nums text-ink-100">{Math.round(Number(value))}%</p>
          </div>
        ))}
      </div>
      {covered.length || missed.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {covered.map((item) => (
            <span key={item.topic} className="chip border-success/30 bg-success/10 text-success">
              ✓ {item.topic}
            </span>
          ))}
          {missed.map((item) => (
            <span key={item.topic} className="chip border-warning/25 bg-warning/[0.07] text-warning">
              {item.topic}
            </span>
          ))}
        </div>
      ) : null}
      {evaluation.feedback ? <p className="mt-3 text-xs leading-relaxed text-ink-300">{evaluation.feedback}</p> : null}
    </div>
  )
}

export function TurnCounter({ seconds, words }: { seconds: number; words: number }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-2xs text-ink-400">
      <span className="chip">Answer time {formatDuration(seconds)}</span>
      <span className="chip">{words} words</span>
      <span className="chip">
        <SkipForward className="h-3 w-3" aria-hidden /> You can skip — skipped answers score zero and are reported as gaps
      </span>
    </div>
  )
}
