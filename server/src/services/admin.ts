import { getStore } from '../db/index.js'
import type { Row } from '../db/store.js'
import { nowIso } from '../db/store.js'
import { roleOf, adminEmails } from '../auth/roles.js'
import { SCORING_METHODOLOGY } from '../db/schema.js'
import { isScaffoldingTopic } from '../ai/local/skills.js'
import { aiEngineLabel, aiEnabled, env, storageMode } from '../env.js'

/**
 * Admin data layer.
 *
 * Everything here reads the live database. No metric is hardcoded, seeded or estimated: each number is
 * an aggregate over rows that the application itself wrote while users practised.
 */

async function all<T = Row>(table: Parameters<ReturnType<typeof getStore>['findMany']>[0], query?: any): Promise<T[]> {
  const store = getStore()
  return (await store.findMany(table, query)) as unknown as T[]
}

function dayKey(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function startOfToday(): number {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
}

function average(values: number[]): number | null {
  const clean = values.filter((value) => Number.isFinite(value))
  if (!clean.length) return null
  return Math.round((clean.reduce((sum, value) => sum + value, 0) / clean.length) * 10) / 10
}

function bucketDays(days: number): string[] {
  const out: string[] = []
  for (let index = days - 1; index >= 0; index -= 1) {
    out.push(new Date(Date.now() - index * 86_400_000).toISOString().slice(0, 10))
  }
  return out
}

function bucketMonths(months: number): string[] {
  const out: string[] = []
  const now = new Date()
  for (let index = months - 1; index >= 0; index -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1))
    out.push(date.toISOString().slice(0, 7))
  }
  return out
}

export interface AdminOverview {
  totals: {
    users: number
    admins: number
    active_users_30d: number
    interviews_started: number
    interviews_completed: number
    interviews_today: number
    interviews_in_progress: number
    average_score: number | null
    resumes: number
    job_descriptions: number
    job_roles: number
    reports: number
  }
  modes: { interview_mode: string; interviews: number; completed: number }[]
  types: { interview_type: string; interviews: number }[]
  completion_rate: number | null
  recent_users: { id: string; email: string; full_name: string | null; role: string; created_at: string; interviews: number }[]
  recent_interviews: {
    id: string
    candidate: string
    job_role: string
    interview_type: string
    interview_mode: string
    status: string
    overall_score: number | null
    created_at: string
  }[]
  system: { label: string; value: string; status: 'ok' | 'warning' | 'error' }[]
}

export async function adminOverview(): Promise<AdminOverview> {
  const store = getStore()
  const users = await all<Row>('users')
  const profiles = await all<Row>('profiles')
  const interviews = await all<Row>('interviews')
  const reports = await all<Row>('interview_reports')

  const completed = interviews.filter((row) => row.status === 'completed')
  const todayStart = startOfToday()
  const interviewsToday = completed.filter((row) => new Date(String(row.completed_at ?? row.created_at)).getTime() >= todayStart).length

  const scoreByInterview = new Map(reports.map((report) => [String(report.interview_id), Number(report.overall_score)]))
  const scores = completed.map((row) => Number(row.overall_score ?? scoreByInterview.get(String(row.id)) ?? NaN)).filter((value) => Number.isFinite(value))

  const cutoff = Date.now() - 30 * 86_400_000
  const activeUserIds = new Set(
    interviews
      .filter((row) => new Date(String(row.created_at)).getTime() >= cutoff)
      .map((row) => String(row.user_id)),
  )

  const modes = ['text', 'voice', 'video'].map((mode) => {
    const rows = interviews.filter((row) => row.interview_mode === mode)
    return { interview_mode: mode, interviews: rows.length, completed: rows.filter((row) => row.status === 'completed').length }
  })
  const types = ['technical', 'hr', 'behavioral', 'mixed'].map((type) => ({
    interview_type: type,
    interviews: interviews.filter((row) => row.interview_type === type).length,
  }))

  const profileByUser = new Map(profiles.map((profile) => [String(profile.user_id), profile]))
  const interviewCount = new Map<string, number>()
  for (const interview of interviews) {
    const key = String(interview.user_id)
    interviewCount.set(key, (interviewCount.get(key) ?? 0) + 1)
  }

  const recentUsers = users
    .slice()
    .sort((a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime())
    .slice(0, 6)
    .map((user) => {
      const profile = profileByUser.get(String(user.id)) ?? null
      return {
        id: String(user.id),
        email: String(user.email),
        full_name: profile?.full_name ? String(profile.full_name) : null,
        role: roleOf(profile),
        created_at: String(user.created_at),
        interviews: interviewCount.get(String(user.id)) ?? 0,
      }
    })

  const userById = new Map(users.map((user) => [String(user.id), user]))
  const recentInterviews = interviews
    .slice()
    .sort((a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime())
    .slice(0, 8)
    .map((interview) => {
      const profile = profileByUser.get(String(interview.user_id))
      const user = userById.get(String(interview.user_id))
      return {
        id: String(interview.id),
        candidate: String(profile?.full_name ?? user?.email ?? 'Unknown candidate'),
        job_role: String(interview.job_role),
        interview_type: String(interview.interview_type),
        interview_mode: String(interview.interview_mode),
        status: String(interview.status),
        overall_score: interview.overall_score != null ? Number(interview.overall_score) : null,
        created_at: String(interview.created_at),
      }
    })

  const storage = storageMode()
  const system = [
    { label: 'Data store', value: store.kind === 'supabase' ? 'Supabase Postgres' : 'SQLite (local)', status: 'ok' as const },
    { label: 'File storage', value: storage === 'supabase' ? 'Supabase Storage' : 'Local disk', status: 'ok' as const },
    {
      label: 'AI engine',
      value: aiEnabled ? `${aiEngineLabel} — provider calls enabled` : `${aiEngineLabel} — no API key configured`,
      status: aiEnabled ? ('ok' as const) : ('warning' as const),
    },
    { label: 'Database health', value: (await store.ping()) ? 'Responding' : 'Unreachable', status: (await store.ping()) ? ('ok' as const) : ('error' as const) },
    { label: 'Admin provisioning', value: `${adminEmails().length} address(es)`, status: 'ok' as const },
  ]

  return {
    totals: {
      users: users.length,
      admins: profiles.filter((profile) => roleOf(profile) === 'admin').length,
      active_users_30d: activeUserIds.size,
      interviews_started: interviews.length,
      interviews_completed: completed.length,
      interviews_today: interviewsToday,
      interviews_in_progress: interviews.filter((row) => row.status === 'in_progress' || row.status === 'created' || row.status === 'processing').length,
      average_score: average(scores),
      resumes: await store.count('resumes'),
      job_descriptions: await store.count('job_descriptions'),
      job_roles: new Set(interviews.map((row) => String(row.job_role).trim().toLowerCase())).size,
      reports: reports.length,
    },
    modes,
    types,
    completion_rate: interviews.length ? Math.round((completed.length / interviews.length) * 1000) / 10 : null,
    recent_users: recentUsers,
    recent_interviews: recentInterviews,
    system,
  }
}

export interface AdminAnalytics {
  range_days: number
  user_growth: { label: string; users: number; cumulative: number }[]
  monthly_growth: { label: string; users: number }[]
  interview_activity: { label: string; started: number; completed: number }[]
  performance: { label: string; average_score: number | null; interviews: number }[]
  popular_roles: { role: string; interviews: number; average_score: number | null }[]
  mode_usage: { mode: string; interviews: number }[]
  type_usage: { type: string; interviews: number }[]
  completion: { started: number; completed: number; abandoned: number; rate: number | null }
  funnel: { stage: string; value: number }[]
}

export async function adminAnalytics(rangeDays = 30): Promise<AdminAnalytics> {
  const store = getStore()
  const days = Math.min(Math.max(rangeDays, 7), 180)
  const users = await all<Row>('users')
  const interviews = await all<Row>('interviews')
  const reports = await all<Row>('interview_reports')
  const resumes = await all<Row>('resumes')

  const userDay = new Map<string, number>()
  for (const user of users) {
    const key = dayKey(String(user.created_at))
    if (key) userDay.set(key, (userDay.get(key) ?? 0) + 1)
  }
  let running = 0
  const user_growth = bucketDays(days).map((label) => {
    const count = userDay.get(label) ?? 0
    running += count
    return { label, users: count, cumulative: running }
  })

  const monthKeys = bucketMonths(6)
  const monthCount = new Map<string, number>()
  for (const user of users) {
    const key = String(user.created_at).slice(0, 7)
    monthCount.set(key, (monthCount.get(key) ?? 0) + 1)
  }
  const monthly_growth = monthKeys.map((label) => ({ label, users: monthCount.get(label) ?? 0 }))

  const startedByDay = new Map<string, number>()
  const completedByDay = new Map<string, number>()
  for (const interview of interviews) {
    const created = dayKey(String(interview.created_at))
    if (created) startedByDay.set(created, (startedByDay.get(created) ?? 0) + 1)
    if (interview.completed_at) {
      const done = dayKey(String(interview.completed_at))
      if (done) completedByDay.set(done, (completedByDay.get(done) ?? 0) + 1)
    }
  }
  const interview_activity = bucketDays(days).map((label) => ({
    label,
    started: startedByDay.get(label) ?? 0,
    completed: completedByDay.get(label) ?? 0,
  }))

  const reportByInterview = new Map(reports.map((report) => [String(report.interview_id), report]))
  const performance = bucketDays(Math.min(days, 30)).map((label) => {
    const rows = interviews.filter((interview) => dayKey(String(interview.completed_at ?? '')) === label)
    const scores = rows.map((row) => Number(row.overall_score ?? reportByInterview.get(String(row.id))?.overall_score ?? NaN)).filter((value) => Number.isFinite(value))
    return { label, average_score: average(scores), interviews: rows.length }
  })

  const roleMap = new Map<string, number[]>()
  for (const interview of interviews) {
    const role = String(interview.job_role).trim() || 'Unspecified'
    const score = Number(interview.overall_score ?? reportByInterview.get(String(interview.id))?.overall_score ?? NaN)
    const list = roleMap.get(role) ?? []
    if (Number.isFinite(score)) list.push(score)
    roleMap.set(role, list)
  }
  const popular_roles = [...roleMap.entries()]
    .map(([role, scores]) => ({ role, interviews: interviews.filter((row) => String(row.job_role).trim() === role).length, average_score: average(scores) }))
    .sort((a, b) => b.interviews - a.interviews)
    .slice(0, 8)

  const mode_usage = ['text', 'voice', 'video'].map((mode) => ({ mode, interviews: interviews.filter((row) => row.interview_mode === mode).length }))
  const type_usage = ['technical', 'hr', 'behavioral', 'mixed'].map((type) => ({ type, interviews: interviews.filter((row) => row.interview_type === type).length }))

  const completed = interviews.filter((row) => row.status === 'completed').length
  const abandoned = interviews.filter((row) => row.status === 'abandoned').length
  const resumeUserIds = new Set(resumes.map((row) => String(row.user_id)))
  const interviewUserIds = new Set(interviews.map((row) => String(row.user_id)))
  const reportUserIds = new Set(interviews.filter((row) => row.status === 'completed').map((row) => String(row.user_id)))

  return {
    range_days: days,
    user_growth,
    monthly_growth,
    interview_activity,
    performance,
    popular_roles,
    mode_usage,
    type_usage,
    completion: {
      started: interviews.length,
      completed,
      abandoned,
      rate: interviews.length ? Math.round((completed / interviews.length) * 1000) / 10 : null,
    },
    funnel: [
      { stage: 'Registered', value: users.length },
      { stage: 'Resume uploaded', value: resumeUserIds.size },
      { stage: 'Interview started', value: interviewUserIds.size },
      { stage: 'Interview completed', value: reportUserIds.size },
    ],
  }
}

export interface AdminUserRow {
  id: string
  email: string
  full_name: string | null
  role: string
  status: string
  provider: string
  created_at: string
  last_active_at: string | null
  interviews: number
  completed: number
  average_score: number | null
  has_resume: boolean
  has_job: boolean
}

export async function adminUsers(filters: { search?: string; role?: string; status?: string; from?: string; to?: string } = {}): Promise<AdminUserRow[]> {
  const store = getStore()
  const users = await all<Row>('users')
  const profiles = await all<Row>('profiles')
  const interviews = await all<Row>('interviews')
  const resumeUserIds = new Set((await all<Row>('resumes')).map((row) => String(row.user_id)))
  const jobUserIds = new Set((await all<Row>('job_descriptions')).map((row) => String(row.user_id)))
  const profileByUser = new Map(profiles.map((profile) => [String(profile.user_id), profile]))

  const rows: AdminUserRow[] = users.map((user) => {
    const profile = profileByUser.get(String(user.id)) ?? null
    const userInterviews = interviews.filter((row) => String(row.user_id) === String(user.id))
    const scores = userInterviews.map((row) => Number(row.overall_score ?? NaN)).filter((value) => Number.isFinite(value))
    const lastActive = userInterviews
      .map((row) => String(row.completed_at ?? row.created_at))
      .sort()
      .pop() ?? null
    return {
      id: String(user.id),
      email: String(user.email),
      full_name: profile?.full_name ? String(profile.full_name) : null,
      role: roleOf(profile),
      status: profile?.status === 'disabled' ? 'disabled' : 'active',
      provider: String(user.auth_provider ?? 'password'),
      created_at: String(user.created_at),
      last_active_at: lastActive ?? String(profile?.updated_at ?? user.created_at),
      interviews: userInterviews.length,
      completed: userInterviews.filter((row) => row.status === 'completed').length,
      average_score: average(scores),
      has_resume: resumeUserIds.has(String(user.id)),
      has_job: jobUserIds.has(String(user.id)),
    }
  })

  const search = filters.search?.trim().toLowerCase()
  return rows
    .filter((row) => {
      if (search && !`${row.email} ${row.full_name ?? ''}`.toLowerCase().includes(search)) return false
      if (filters.role && filters.role !== 'all' && row.role !== filters.role) return false
      if (filters.status && filters.status !== 'all' && row.status !== filters.status) return false
      if (filters.from && new Date(row.created_at).getTime() < new Date(filters.from).getTime()) return false
      if (filters.to && new Date(row.created_at).getTime() > new Date(`${filters.to}T23:59:59.999Z`).getTime()) return false
      return true
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export async function adminUserDetail(userId: string) {
  const store = getStore()
  const user = await store.findById<Row>('users', userId)
  if (!user) return null
  const profile = await store.findOne<Row>('profiles', { where: { user_id: userId } })
  const interviews = await all<Row>('interviews', { where: { user_id: userId }, order: { column: 'created_at', ascending: false } })
  const resume = await store.findOne<Row>('resumes', { where: { user_id: userId }, order: { column: 'created_at', ascending: false } })
  const job = await store.findOne<Row>('job_descriptions', { where: { user_id: userId }, order: { column: 'created_at', ascending: false } })

  return {
    user: {
      id: String(user.id),
      email: String(user.email),
      created_at: String(user.created_at),
      provider: String(user.auth_provider ?? 'password'),
      role: roleOf(profile),
      status: profile?.status === 'disabled' ? 'disabled' : 'active',
    },
    profile: profile
      ? {
          full_name: profile.full_name ?? null,
          target_role: profile.target_role ?? null,
          company: profile.company ?? null,
          experience_level: profile.experience_level ?? null,
          preferred_mode: profile.preferred_mode ?? null,
          preferred_language: profile.preferred_language ?? 'en',
          onboarding_completed: Boolean(profile.onboarding_completed),
          created_at: String(profile.created_at),
        }
      : null,
    resume: resume ? { id: String(resume.id), file_name: String(resume.file_name), created_at: String(resume.created_at), skills: ((resume.parsed_data as any)?.skills ?? []).slice(0, 20) } : null,
    job: job ? { id: String(job.id), title: String(job.title ?? ''), company: job.company ? String(job.company) : null, created_at: String(job.created_at) } : null,
    interviews: interviews.map((interview) => ({
      id: String(interview.id),
      job_role: String(interview.job_role),
      interview_type: String(interview.interview_type),
      interview_mode: String(interview.interview_mode),
      difficulty: String(interview.difficulty),
      status: String(interview.status),
      question_count: Number(interview.question_count),
      overall_score: interview.overall_score != null ? Number(interview.overall_score) : null,
      created_at: String(interview.created_at),
      completed_at: interview.completed_at ? String(interview.completed_at) : null,
    })),
  }
}

export async function adminInterviews(filters: { search?: string; type?: string; mode?: string; status?: string; from?: string; to?: string } = {}) {
  const store = getStore()
  const interviews = await all<Row>('interviews', { order: { column: 'created_at', ascending: false } })
  const users = await all<Row>('users')
  const profiles = await all<Row>('profiles')
  const userById = new Map(users.map((user) => [String(user.id), user]))
  const nameByUser = new Map(profiles.map((profile) => [String(profile.user_id), String(profile.full_name ?? '')]))
  const reports = await all<Row>('interview_reports')
  const reportByInterview = new Map(reports.map((report) => [String(report.interview_id), report]))

  const search = filters.search?.trim().toLowerCase()
  return interviews
    .map((interview) => {
      const answers = Number(interview.question_count)
      const report = reportByInterview.get(String(interview.id))
      const startedAt = interview.started_at ? new Date(String(interview.started_at)).getTime() : null
      const completedAt = interview.completed_at ? new Date(String(interview.completed_at)).getTime() : null
      const user = userById.get(String(interview.user_id))
      return {
        id: String(interview.id),
        candidate: nameByUser.get(String(interview.user_id)) || String(user?.email ?? 'Unknown'),
        email: String(user?.email ?? ''),
        job_role: String(interview.job_role),
        interview_type: String(interview.interview_type),
        interview_mode: String(interview.interview_mode),
        difficulty: String(interview.difficulty),
        status: String(interview.status),
        question_count: answers,
        overall_score: interview.overall_score != null ? Number(interview.overall_score) : null,
        has_report: Boolean(report),
        duration_minutes: startedAt && completedAt ? Math.max(1, Math.round((completedAt - startedAt) / 60000)) : null,
        created_at: String(interview.created_at),
        completed_at: interview.completed_at ? String(interview.completed_at) : null,
      }
    })
    .filter((row) => {
      if (search && !`${row.candidate} ${row.email} ${row.job_role}`.toLowerCase().includes(search)) return false
      if (filters.type && filters.type !== 'all' && row.interview_type !== filters.type) return false
      if (filters.mode && filters.mode !== 'all' && row.interview_mode !== filters.mode) return false
      if (filters.status && filters.status !== 'all' && row.status !== filters.status) return false
      if (filters.from && new Date(row.created_at).getTime() < new Date(filters.from).getTime()) return false
      if (filters.to && new Date(row.created_at).getTime() > new Date(`${filters.to}T23:59:59.999Z`).getTime()) return false
      return true
    })
}

/** Full interview transcript for administrative inspection (never exposes credentials). */
export async function adminInterviewDetail(interviewId: string) {
  const store = getStore()
  const interview = await store.findById<Row>('interviews', interviewId)
  if (!interview) return null
  const questions = await all<Row>('interview_questions', { where: { interview_id: interviewId }, order: { column: 'question_number', ascending: true } })
  const answers = await all<Row>('interview_answers', { where: { interview_id: interviewId } })
  const evaluations = await all<Row>('answer_evaluations', { where: { interview_id: interviewId } })
  const report = await store.findOne<Row>('interview_reports', { where: { interview_id: interviewId } })
  const user = await store.findById<Row>('users', String(interview.user_id))
  const profile = await store.findOne<Row>('profiles', { where: { user_id: interview.user_id } })

  return {
    interview: {
      id: String(interview.id),
      job_role: String(interview.job_role),
      interview_type: String(interview.interview_type),
      interview_mode: String(interview.interview_mode),
      difficulty: String(interview.difficulty),
      status: String(interview.status),
      question_count: Number(interview.question_count),
      overall_score: interview.overall_score != null ? Number(interview.overall_score) : null,
      settings: interview.settings ?? {},
      created_at: String(interview.created_at),
      started_at: interview.started_at ? String(interview.started_at) : null,
      completed_at: interview.completed_at ? String(interview.completed_at) : null,
    },
    candidate: {
      user_id: String(interview.user_id),
      name: profile?.full_name ?? null,
      email: user?.email ?? null,
      role: roleOf(profile),
      status: profile?.status === 'disabled' ? ('disabled' as const) : ('active' as const),
    },
    questions: questions.map((question) => {
      const answer = answers.find((row) => row.question_id === question.id) ?? null
      const evaluation = answer ? evaluations.find((row) => row.answer_id === answer.id) ?? null : null
      return {
        id: String(question.id),
        question_number: Number(question.question_number),
        question: String(question.question),
        question_type: String(question.question_type),
        difficulty: String(question.difficulty),
        is_follow_up: Boolean(question.is_follow_up),
        expected_topics: (question.expected_topics as string[] | null) ?? [],
        generation: question.generation ?? null,
        answer: answer ? String(answer.answer_text ?? '') : null,
        answer_created_at: answer ? String(answer.created_at) : null,
        answer_duration_seconds: answer && answer.duration_seconds != null ? Number(answer.duration_seconds) : null,
        answer_metrics: answer?.media_metrics ?? null,
        evaluation: evaluation
          ? {
              relevance: Number(evaluation.relevance_score),
              technical: Number(evaluation.technical_score),
              completeness: Number(evaluation.completeness_score),
              clarity: Number(evaluation.clarity_score),
              structure: Number(evaluation.structure_score),
              problem_solving: Number(evaluation.problem_solving_score),
              confidence: Number(evaluation.confidence_score),
              communication: evaluation.communication_score != null ? Number(evaluation.communication_score) : Number(evaluation.clarity_score),
              coverage: (evaluation.coverage as { topic: string; covered: boolean }[] | null) ?? [],
              feedback: evaluation.feedback ?? null,
              strengths: (evaluation.strengths as string[] | null) ?? [],
              improvements: (evaluation.improvements as string[] | null) ?? [],
              engine: evaluation.engine ?? null,
            }
          : null,
      }
    }),
    report: report
      ? {
          id: String(report.id),
          overall_score: Number(report.overall_score),
          technical_score: Number(report.technical_score),
          communication_score: Number(report.communication_score),
          relevance_score: Number(report.relevance_score),
          problem_solving_score: Number(report.problem_solving_score),
          role_alignment_score: Number(report.role_alignment_score),
          summary: String(report.summary ?? ''),
          strengths: (report.strengths as string[] | null) ?? [],
          weaknesses: (report.weaknesses as string[] | null) ?? [],
          recommendations: (report.recommendations as string[] | null) ?? [],
          recommended_topics: (report.recommended_topics as string[] | null) ?? [],
          created_at: String(report.created_at),
        }
      : null,
  }
}

export interface AdminReportInsights {
  totals: { reports: number; average_score: number | null; scored_interviews: number }
  improvement_areas: { area: string; mentions: number; share: number }[]
  technical_weaknesses: { topic: string; misses: number; sessions: number }[]
  top_roles: { role: string; reports: number; average_score: number | null }[]
  score_distribution: { band: string; reports: number }[]
  dimension_averages: { metric: string; label: string; average: number | null; weight: number }[]
}

export async function adminReportInsights(): Promise<AdminReportInsights> {
  const store = getStore()
  const reports = await all<Row>('interview_reports')
  const evaluations = await all<Row>('answer_evaluations')
  const interviews = await all<Row>('interviews')
  const interviewById = new Map(interviews.map((interview) => [String(interview.id), interview]))

  const scores = reports.map((report) => Number(report.overall_score)).filter((value) => Number.isFinite(value))
  const bands = ['0-39', '40-54', '55-69', '70-84', '85-100']
  const score_distribution = bands.map((band) => {
    const [min, max] = band.split('-').map(Number) as [number, number]
    return { band, reports: scores.filter((score) => score >= min && score <= max).length }
  })

  const areaTally = new Map<string, number>()
  const topicTally = new Map<string, { misses: number; sessions: Set<string> }>()

  for (const evaluation of evaluations) {
    const improvements = (evaluation.improvements as string[] | null) ?? []
    for (const item of improvements) {
      const key = normalizeArea(item)
      if (!key) continue
      areaTally.set(key, (areaTally.get(key) ?? 0) + 1)
    }
    const coverage = (evaluation.coverage as { topic: string; covered: boolean }[] | null) ?? []
    for (const item of coverage) {
      if (item.covered || !item.topic) continue
      if (isScaffoldingTopic(item.topic)) continue
      const key = item.topic.trim()
      const entry = topicTally.get(key) ?? { misses: 0, sessions: new Set<string>() }
      entry.misses += 1
      entry.sessions.add(String(evaluation.interview_id))
      topicTally.set(key, entry)
    }
  }

  const totalImprovements = [...areaTally.values()].reduce((sum, value) => sum + value, 0) || 1
  const improvement_areas = [...areaTally.entries()]
    .map(([area, mentions]) => ({ area, mentions, share: Math.round((mentions / totalImprovements) * 1000) / 10 }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 8)

  const technical_weaknesses = [...topicTally.entries()]
    .map(([topic, entry]) => ({ topic, misses: entry.misses, sessions: entry.sessions.size }))
    .sort((a, b) => b.sessions - a.sessions || b.misses - a.misses)
    .slice(0, 12)

  const roleMap = new Map<string, number[]>()
  for (const report of reports) {
    const interview = interviewById.get(String(report.interview_id))
    const role = String(interview?.job_role ?? 'Unspecified')
    const list = roleMap.get(role) ?? []
    list.push(Number(report.overall_score))
    roleMap.set(role, list)
  }
  const top_roles = [...roleMap.entries()]
    .map(([role, values]) => ({ role, reports: values.length, average_score: average(values) }))
    .sort((a, b) => b.reports - a.reports)
    .slice(0, 8)

  const dimension_averages = SCORING_METHODOLOGY.dimensions.map((dimension) => {
    const key = dimension.key.replace('_score', '') as 'technical' | 'communication' | 'problem_solving' | 'relevance' | 'role_alignment'
    const column = `${key === 'role_alignment' ? 'role_alignment' : key}_score`
    const values = reports.map((report) => Number(report[column] ?? NaN)).filter((value) => Number.isFinite(value))
    return { metric: dimension.key, label: dimension.label, average: average(values), weight: dimension.weight }
  })

  return {
    totals: {
      reports: reports.length,
      average_score: average(scores),
      scored_interviews: scores.length,
    },
    improvement_areas,
    technical_weaknesses,
    top_roles,
    score_distribution,
    dimension_averages,
  }
}

/** Maps free-text improvement sentences onto short, countable categories. */
function normalizeArea(text: string): string | null {
  const value = (text ?? '').toLowerCase()
  if (value.length < 8) return null
  if (/structur|order|sequence|flow|star|problem.{0,5}approach.{0,5}result/.test(value)) return 'Answer structure'
  if (/clarity|clear|concise|rambl|waffle|filler|pace|speak/.test(value)) return 'Communication clarity'
  if (/technical|depth|detail|specific|implementation|trade-?off/.test(value)) return 'Technical depth'
  if (/example|evidence|metric|number|quantif|outcome|result/.test(value)) return 'Concrete evidence and results'
  if (/role|requirement|job|align|relevan/.test(value)) return 'Role alignment'
  if (/explain|walk through|reason|justify|problem/.test(value)) return 'Problem explanation'
  if (/confiden|hedg|uncertain/.test(value)) return 'Delivery confidence'
  if (/length|short|brief|too long|time/.test(value)) return 'Answer length and pacing'
  return 'Other improvement notes'
}

export async function adminLogs(limit = 100) {
  const store = getStore()
  const logs = await all<Row>('admin_logs', { order: { column: 'created_at', ascending: false }, limit })
  return logs.map((log) => ({
    id: String(log.id),
    admin_email: log.admin_email ? String(log.admin_email) : null,
    action: String(log.action),
    target_type: log.target_type ? String(log.target_type) : null,
    target_id: log.target_id ? String(log.target_id) : null,
    metadata: log.metadata ?? null,
    created_at: String(log.created_at),
  }))
}

export interface AuditEntry {
  admin_user_id: string
  admin_email: string
  action: string
  target_type?: string | null
  target_id?: string | null
  metadata?: Record<string, unknown> | null
}

/** Writes an audit entry. Every admin endpoint calls this — failures never break the request. */
export async function recordAdminAction(entry: AuditEntry): Promise<void> {
  try {
    const store = getStore()
    await store.insert('admin_logs', {
      admin_user_id: entry.admin_user_id,
      admin_email: entry.admin_email,
      action: entry.action,
      target_type: entry.target_type ?? null,
      target_id: entry.target_id ?? null,
      metadata: entry.metadata ?? null,
      created_at: nowIso(),
    })
  } catch (error) {
    console.error('[vozhireq][admin] could not write audit log:', (error as Error).message)
  }
}

export const DEFAULT_SETTINGS: { key: string; label: string; description: string; value: unknown }[] = [
  { key: 'default_interview_type', label: 'Default interview type', description: 'Pre-selected type on the interview setup screen.', value: 'mixed' },
  { key: 'default_difficulty', label: 'Default difficulty', description: 'Pre-selected difficulty for new interviews.', value: 'adaptive' },
  { key: 'default_question_count', label: 'Default question count', description: 'Number of core questions in a new interview.', value: 5 },
  { key: 'default_persona', label: 'Default interviewer persona', description: 'Voice and tone of the AI interviewer.', value: 'professional' },
  { key: 'adaptive_follow_ups', label: 'Adaptive follow-ups', description: 'Allow the interviewer to probe weak answers.', value: true },
  { key: 'max_upload_mb', label: 'Upload limit (MB)', description: 'Maximum résumé or job-description file size.', value: env.maxUploadMb },
  { key: 'scoring_weights', label: 'Scoring weights', description: 'Dimension weights used in every report.', value: SCORING_METHODOLOGY.dimensions.map((dimension) => ({ key: dimension.key, weight: dimension.weight })) },
]

export async function adminSettings() {
  const store = getStore()
  const stored = await all<Row>('system_settings')
  const byKey = new Map(stored.map((row) => [String(row.key), row]))
  return DEFAULT_SETTINGS.map((setting) => {
    const row = byKey.get(setting.key)
    return {
      key: setting.key,
      label: setting.label,
      description: setting.description,
      value: row ? row.value : setting.value,
      updated_at: row ? String(row.updated_at) : null,
      default_value: setting.value,
      source: row ? 'database' : 'default',
    }
  })
}

export async function updateAdminSetting(key: string, value: unknown, adminUserId: string, adminEmail: string) {
  const store = getStore()
  const existing = await store.findOne<Row>('system_settings', { where: { key } })
  if (existing) {
    await store.updateById('system_settings', String(existing.id), { value, updated_by: adminUserId })
  } else {
    await store.insert('system_settings', { key, value, updated_by: adminUserId })
  }
  await recordAdminAction({ admin_user_id: adminUserId, admin_email: adminEmail, action: 'settings_changed', target_type: 'system_setting', target_id: key, metadata: { value } })
  return adminSettings()
}

export async function setUserStatus(userId: string, status: 'active' | 'disabled') {
  const store = getStore()
  const profile = await store.findOne<Row>('profiles', { where: { user_id: userId } })
  if (!profile) return null
  await store.updateById('profiles', String(profile.id), { status })
  return { userId, status }
}

export async function deleteUserEverywhere(userId: string) {
  const store = getStore()
  const interviews = await store.findMany<Row>('interviews', { where: { user_id: userId } })
  for (const interview of interviews) {
    await store.remove('interview_questions', { interview_id: interview.id })
    await store.remove('interview_answers', { interview_id: interview.id })
    await store.remove('answer_evaluations', { interview_id: interview.id })
    await store.remove('interview_reports', { interview_id: interview.id })
  }
  await store.remove('interviews', { user_id: userId })
  await store.remove('resumes', { user_id: userId })
  await store.remove('job_descriptions', { user_id: userId })
  await store.remove('interview_progress', { user_id: userId })
  await store.remove('password_resets', { user_id: userId })
  await store.remove('profiles', { user_id: userId })
  await store.remove('users', { id: userId })
}
