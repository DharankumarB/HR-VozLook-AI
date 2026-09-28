import { getStore } from '../db/index.js'
import type { Row } from '../db/store.js'
import { getAiEngine } from '../ai/index.js'
import type { CoachMessage, CoachResult } from '../ai/types.js'
import { ApiError } from '../lib/errors.js'
import { getActiveResume, resumeAnalysisOf } from './resume.js'
import { getLatestJob, jobAnalysisOf } from './job.js'
import { weakTopics } from './analytics.js'

function sanitizeMessages(messages: unknown): CoachMessage[] {
  if (!Array.isArray(messages)) return []
  return messages
    .filter((message): message is { role: string; content: string } => Boolean(message) && typeof message === 'object')
    .map((message) => ({
      role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: String(message.content ?? '').slice(0, 4000),
    }))
    .filter((message) => message.content.trim().length > 0)
    .slice(-12)
}

export async function coachReply(userId: string, input: { messages?: unknown; question?: string }): Promise<CoachResult & { context: unknown }> {
  const store = getStore()
  const messages = sanitizeMessages(input.messages)
  const question = (typeof input.question === 'string' ? input.question : messages[messages.length - 1]?.content ?? '').trim()
  if (!question) throw ApiError.badRequest('Ask a question so I can help.')
  if (question.length > 2000) throw ApiError.badRequest('That message is too long — keep it under 2000 characters.')

  const profile = await store.findOne<Row>('profiles', { where: { user_id: userId } })
  const resume = await getActiveResume(userId)
  const job = await getLatestJob(userId)

  const completed = await store.findMany<Row>('interviews', {
    where: { user_id: userId, status: 'completed' },
    order: { column: 'completed_at', ascending: false },
    limit: 6,
  })

  const history = await Promise.all(
    completed.map(async (interview) => {
      const report = await store.findOne<Row>('interview_reports', { where: { interview_id: interview.id } })
      return {
        job_role: String(interview.job_role ?? 'Interview'),
        overall_score: report?.overall_score != null ? Number(report.overall_score) : null,
        completed_at: interview.completed_at ? String(interview.completed_at) : null,
      }
    }),
  )

  const latest = completed[0]
  const latestReport = latest ? await store.findOne<Row>('interview_reports', { where: { interview_id: latest.id } }) : null

  const context = {
    target_role: profile?.target_role ?? null,
    weak_topics: (await weakTopics(userId, 10)).map((topic) => topic.topic),
    recent_interview: latest
      ? {
          job_role: String(latest.job_role),
          overall_score: latestReport?.overall_score != null ? Number(latestReport.overall_score) : null,
          technical_score: latestReport?.technical_score != null ? Number(latestReport.technical_score) : null,
          communication_score: latestReport?.communication_score != null ? Number(latestReport.communication_score) : null,
          completed_at: latest.completed_at ? String(latest.completed_at) : null,
        }
      : null,
    history,
  }

  const engine = getAiEngine()
  const result = await engine.coach({
    messages: [...messages.filter((m) => m.content !== question), { role: 'user', content: question }],
    resume: resumeAnalysisOf(resume),
    job: jobAnalysisOf(job),
    context,
    latestQuestion: question,
  })

  return { ...result, context }
}

export async function coachSuggestions(userId: string) {
  const store = getStore()
  const profile = await store.findOne<Row>('profiles', { where: { user_id: userId } })
  const topics = await weakTopics(userId, 6)
  const suggestions = [
    'Why did I lose marks in my last interview?',
    'Help me improve my introduction.',
    'Give me 5 practice questions based on my weak areas.',
  ]
  if (topics.length) suggestions.splice(2, 0, `How can I improve my ${topics[0]!.topic} answers?`)
  return {
    suggestions,
    weak_topics: topics.map((topic) => topic.topic),
    target_role: profile?.target_role ?? null,
  }
}
