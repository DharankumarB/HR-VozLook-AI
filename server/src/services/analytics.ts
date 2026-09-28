import { getStore } from '../db/index.js'
import type { Row } from '../db/store.js'
import { jobAnalysisOf } from './job.js'

const METRIC_KEYS = [
  'overall_score',
  'technical_score',
  'communication_score',
  'problem_solving_score',
  'relevance_score',
  'confidence_score',
  'role_alignment_score',
] as const

export interface MetricPoint {
  interview_id: string
  job_role: string
  interview_type: string
  completed_at: string | null
  created_at: string
  overall_score: number | null
  technical_score: number | null
  communication_score: number | null
  problem_solving_score: number | null
  relevance_score: number | null
  confidence_score: number | null
  role_alignment_score: number | null
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null
}

function average(values: (number | null)[]): number | null {
  const list = values.filter((v): v is number => v != null)
  if (!list.length) return null
  return Math.round((list.reduce((sum, v) => sum + v, 0) / list.length) * 10) / 10
}

/** Chronological metric series built from completed interviews and their stored reports. */
export async function metricSeries(userId: string): Promise<MetricPoint[]> {
  const store = getStore()
  const interviews = await store.findMany<Row>('interviews', {
    where: { user_id: userId, status: 'completed' },
    order: { column: 'completed_at', ascending: true },
  })
  const series: MetricPoint[] = []
  for (const interview of interviews) {
    const report = await store.findOne<Row>('interview_reports', { where: { interview_id: interview.id } })
    if (!report) continue
    series.push({
      interview_id: String(interview.id),
      job_role: String(interview.job_role ?? 'Interview'),
      interview_type: String(interview.interview_type ?? 'mixed'),
      completed_at: interview.completed_at ? String(interview.completed_at) : null,
      created_at: String(interview.created_at),
      overall_score: num(report.overall_score) ?? num(interview.overall_score),
      technical_score: num(report.technical_score),
      communication_score: num(report.communication_score),
      problem_solving_score: num(report.problem_solving_score),
      relevance_score: num(report.relevance_score),
      confidence_score: num(report.confidence_score),
      role_alignment_score: num(report.role_alignment_score),
    })
  }
  return series
}

export interface WeakTopic {
  topic: string
  misses: number
  sessions: number
  lastSeen: string | null
}

/** Recurring gaps: expected topics the candidate has repeatedly not covered, across sessions. */
/**
 * Scaffolding topics produced by follow-up probes (e.g. "practical application"). They are useful
 * inside an evaluation but meaningless as study targets, so they are excluded from cross-session
 * weak-topic analytics.
 */
const NON_ACTIONABLE_TOPICS = new Set([
  'follow-up',
  'your actions',
  'situation',
  'practical application',
  'implementation detail',
  'result',
  'example',
  'concrete example',
  'learning plan',
  'mitigation',
  'specific example',
  'your specific contribution',
])

export async function weakTopics(userId: string, limit = 12): Promise<WeakTopic[]> {
  const store = getStore()
  const interviews = await store.findMany<Row>('interviews', {
    where: { user_id: userId, status: 'completed' },
    order: { column: 'completed_at', ascending: false },
    limit: 12,
  })
  const tally = new Map<string, { misses: number; sessions: Set<string>; lastSeen: string | null }>()

  for (const interview of interviews) {
    const evaluations = await store.findMany<Row>('answer_evaluations', { where: { interview_id: interview.id } })
    for (const evaluation of evaluations) {
      const coverage = (evaluation.coverage as { topic: string; covered: boolean }[] | null) ?? []
      for (const item of coverage) {
        if (!item?.topic || item.covered) continue
        const key = item.topic.trim()
        if (!key || NON_ACTIONABLE_TOPICS.has(key.toLowerCase())) continue
        const entry = tally.get(key) ?? { misses: 0, sessions: new Set<string>(), lastSeen: null }
        entry.misses += 1
        entry.sessions.add(String(interview.id))
        entry.lastSeen = entry.lastSeen ?? (interview.completed_at ? String(interview.completed_at) : String(interview.created_at))
        tally.set(key, entry)
      }
    }
  }

  return [...tally.entries()]
    .map(([topic, entry]) => ({ topic, misses: entry.misses, sessions: entry.sessions.size, lastSeen: entry.lastSeen }))
    .sort((a, b) => b.sessions - a.sessions || b.misses - a.misses || a.topic.localeCompare(b.topic))
    .slice(0, limit)
}

export async function dashboardData(userId: string) {
  const store = getStore()
  const interviews = await store.findMany<Row>('interviews', {
    where: { user_id: userId },
    order: { column: 'created_at', ascending: false },
  })
  const completed = interviews.filter((row) => row.status === 'completed')
  const inProgress = interviews.filter((row) => row.status === 'in_progress' || row.status === 'created' || row.status === 'processing')

  const series = await metricSeries(userId)
  const reports = await Promise.all(
    interviews.slice(0, 5).map(async (interview) => {
      const report = await store.findOne<Row>('interview_reports', { where: { interview_id: interview.id } })
      return {
        id: interview.id,
        job_role: interview.job_role,
        interview_type: interview.interview_type,
        interview_mode: interview.interview_mode,
        difficulty: interview.difficulty,
        status: interview.status,
        created_at: interview.created_at,
        completed_at: interview.completed_at,
        overall_score: report?.overall_score ?? interview.overall_score ?? null,
        report_id: report?.id ?? null,
        has_report: Boolean(report),
        question_count: Number(interview.question_count ?? 0),
      }
    }),
  )

  const last = series[series.length - 1]
  const previous = series[series.length - 2]

  return {
    stats: {
      interviews_completed: completed.length,
      interviews_started: interviews.length,
      interviews_in_progress: inProgress.length,
      average_overall: average(series.map((point) => point.overall_score)),
      average_technical: average(series.map((point) => point.technical_score)),
      average_communication: average(series.map((point) => point.communication_score)),
      average_problem_solving: average(series.map((point) => point.problem_solving_score)),
      last_score: last?.overall_score ?? null,
      previous_score: previous?.overall_score ?? null,
      delta: last?.overall_score != null && previous?.overall_score != null ? Math.round((last.overall_score - previous.overall_score) * 10) / 10 : null,
    },
    recent: reports,
    series,
    weak_topics: await weakTopics(userId, 8),
    has_resume: (await store.count('resumes', { user_id: userId })) > 0,
    has_job: (await store.count('job_descriptions', { user_id: userId })) > 0,
  }
}

export async function progressData(userId: string) {
  const store = getStore()
  const series = await metricSeries(userId)
  const trends = METRIC_KEYS.map((key) => {
    const values = series.map((point) => point[key]).filter((v): v is number => v != null)
    const first = values[0] ?? null
    const last = values.length ? values[values.length - 1]! : null
    return {
      metric: key,
      values,
      first,
      last,
      change: first != null && last != null ? Math.round((last - first) * 10) / 10 : null,
      best: values.length ? Math.max(...values) : null,
    }
  })

  const interviews = await store.findMany<Row>('interviews', {
    where: { user_id: userId },
    order: { column: 'created_at', ascending: false },
  })

  const sessionDetails = await Promise.all(
    series.map(async (point) => {
      const interview = interviews.find((row) => row.id === point.interview_id)
      const job = interview?.job_description_id
        ? await store.findById<Row>('job_descriptions', String(interview.job_description_id))
        : null
      return {
        ...point,
        domain: jobAnalysisOf(job)?.domain ?? null,
        question_count: Number(interview?.question_count ?? 0),
      }
    }),
  )

  const byType = new Map<string, number[]>()
  for (const point of series) {
    if (point.overall_score == null) continue
    const list = byType.get(point.interview_type) ?? []
    list.push(point.overall_score)
    byType.set(point.interview_type, list)
  }

  return {
    series: sessionDetails,
    trends,
    averages_by_type: [...byType.entries()].map(([type, values]) => ({
      interview_type: type,
      average: average(values),
      sessions: values.length,
    })),
    weak_topics: await weakTopics(userId, 12),
    scored_interviews: series.length,
  }
}
