import { z } from 'zod'
import { env } from '../env.js'
import { ApiError } from '../lib/errors.js'
import { withRetry, withTimeout } from '../lib/async.js'
import { cleanText, clampScore, extractJson, toStringArray } from './json.js'
import {
  coachPrompt,
  evaluationPrompt,
  followUpPrompt,
  jobExtractionPrompt,
  questionPrompt,
  reportPrompt,
  resumeExtractionPrompt,
} from './prompts.js'
import type {
  AiEngine,
  AnswerEvaluation,
  CoachResult,
  EvaluationContext,
  FollowUpDecision,
  GeneratedQuestion,
  JobAnalysis,
  QuestionContext,
  ReportNarrative,
  ResumeAnalysis,
} from './types.js'
import { generateQuestionLocally } from './local/questions.js'
import { evaluateAnswerLocally } from './local/evaluator.js'
import { buildReportLocally } from './local/report.js'

/* ------------------------------------------------------------------ */
/* Provider call                                                         */
/* ------------------------------------------------------------------ */

interface GenerateOptions {
  temperature?: number
  maxOutputTokens?: number
}

async function callGemini(system: string, prompt: string, opts: GenerateOptions = {}): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    env.ai.geminiModel,
  )}:generateContent`

  const body = {
    systemInstruction: { role: 'system', parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.55,
      topP: 0.9,
      maxOutputTokens: opts.maxOutputTokens ?? 4096,
      responseMimeType: 'application/json',
    },
    safetySettings: [],
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': env.ai.geminiApiKey,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const raw = await response.text().catch(() => '')
    // Never surface provider payloads (may echo request metadata) — log server-side, throw friendly error.
    console.error(`[vozlook][gemini] ${response.status} ${raw.slice(0, 400)}`)
    if (response.status === 429) throw ApiError.upstream('The AI service is rate limited right now. Please retry in a moment.')
    if (response.status === 400 || response.status === 403) throw ApiError.upstream('The configured AI key was rejected. Check GEMINI_API_KEY.')
    throw ApiError.upstream('The AI service is temporarily unavailable.')
  }

  const payload = (await response.json()) as any
  const candidate = payload?.candidates?.[0]
  const finish = candidate?.finishReason
  const parts: any[] = candidate?.content?.parts ?? []
  const text = parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('').trim()

  if (!text) {
    const blocked = payload?.promptFeedback?.blockReason
    console.error('[vozlook][gemini] empty completion', { finish, blocked })
    throw ApiError.upstream('The AI service returned an unusable response.')
  }
  if (finish === 'MAX_TOKENS' && !text.includes('}')) {
    throw ApiError.upstream('The AI response was truncated. Please retry.')
  }
  return text
}

/** Call the model, parse JSON, validate with zod, and retry once with a repair instruction on schema drift. */
async function generateValidated<T>(
  system: string,
  prompt: string,
  schema: z.ZodType<T, z.ZodTypeDef, any>,
  opts: GenerateOptions = {},
): Promise<T> {
  return withRetry(
    async (attempt) => {
      const repair =
        attempt === 0
          ? ''
          : '\n\nIMPORTANT: Your previous reply did not match the required JSON schema. Reply with ONLY the JSON object, exactly matching the required keys.'
      const raw = await withTimeout(callGemini(system, prompt + repair, opts), env.ai.timeoutMs, 'AI request')
      const json = extractJson(raw)
      const parsed = schema.safeParse(json)
      if (!parsed.success) {
        console.warn('[vozlook][gemini] schema drift:', parsed.error.issues.slice(0, 5))
        throw ApiError.upstream('The AI response did not match the expected schema.')
      }
      return parsed.data
    },
    { retries: env.ai.maxRetries, label: 'gemini' },
  )
}

/* ------------------------------------------------------------------ */
/* Schemas                                                               */
/* ------------------------------------------------------------------ */

const str = z.string().trim()
const score = z.preprocess((v) => clampScore(v), z.number())

const resumeSchema = z.object({
  name: z.union([str, z.null()]).optional().transform((v) => v ?? undefined),
  headline: z.union([str, z.null()]).optional().transform((v) => v ?? undefined),
  email: z.union([str, z.null()]).optional().transform((v) => v ?? undefined),
  phone: z.union([str, z.null()]).optional().transform((v) => v ?? undefined),
  location: z.union([str, z.null()]).optional().transform((v) => v ?? undefined),
  links: z.preprocess((v) => toStringArray(v, 8), z.array(str)).default([]),
  summary: z.union([str, z.null()]).optional().transform((v) => v ?? undefined),
  education: z
    .array(z.object({ degree: str.optional(), institution: str.optional(), year: str.optional(), details: str.optional() }).partial())
    .default([]),
  skills: z.preprocess((v) => toStringArray(v, 60), z.array(str)).default([]),
  technical_skills: z.preprocess((v) => toStringArray(v, 60), z.array(str)).default([]),
  soft_skills: z.preprocess((v) => toStringArray(v, 30), z.array(str)).default([]),
  programming_languages: z.preprocess((v) => toStringArray(v, 30), z.array(str)).default([]),
  frameworks: z.preprocess((v) => toStringArray(v, 30), z.array(str)).default([]),
  tools: z.preprocess((v) => toStringArray(v, 40), z.array(str)).default([]),
  projects: z
    .array(
      z.object({
        name: str,
        description: str.optional(),
        technologies: z.preprocess((v) => toStringArray(v, 15), z.array(str)).default([]),
        highlights: z.preprocess((v) => toStringArray(v, 8), z.array(str)).default([]),
      }),
    )
    .default([]),
  internships: z
    .array(z.object({ role: str.optional(), company: str.optional(), duration: str.optional(), description: str.optional() }).partial())
    .default([]),
  experience: z
    .array(
      z.object({
        role: str.optional(),
        company: str.optional(),
        duration: str.optional(),
        description: str.optional(),
        highlights: z.preprocess((v) => toStringArray(v, 8), z.array(str)).default([]),
      }).partial(),
    )
    .default([]),
  certifications: z.preprocess((v) => toStringArray(v, 20), z.array(str)).default([]),
  achievements: z.preprocess((v) => toStringArray(v, 20), z.array(str)).default([]),
  years_experience: z.preprocess((v) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(0, Math.min(50, n)) : 0
  }, z.number()).default(0),
  seniority: z.enum(['student', 'fresher', 'junior', 'mid', 'senior']).default('fresher'),
  confidence: z.preprocess((v) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n > 1 ? n / 100 : n)) : 0.6
  }, z.number()).default(0.6),
})

const jobSchema = z.object({
  title: z.union([str, z.null()]).optional().transform((v) => v ?? undefined),
  company: z.union([str, z.null()]).optional().transform((v) => v ?? undefined),
  seniority: z.union([str, z.null()]).optional().transform((v) => v ?? undefined),
  required_skills: z.preprocess((v) => toStringArray(v, 30), z.array(str)).default([]),
  preferred_skills: z.preprocess((v) => toStringArray(v, 25), z.array(str)).default([]),
  responsibilities: z.preprocess((v) => toStringArray(v, 20), z.array(str)).default([]),
  technical_requirements: z.preprocess((v) => toStringArray(v, 25), z.array(str)).default([]),
  soft_requirements: z.preprocess((v) => toStringArray(v, 15), z.array(str)).default([]),
  experience_requirements: cleanTextSchema('Not specified'),
  keywords: z.preprocess((v) => toStringArray(v, 40), z.array(str)).default([]),
  domain: str.default('general software'),
  confidence: z.preprocess((v) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n > 1 ? n / 100 : n)) : 0.6
  }, z.number()).default(0.6),
})

function cleanTextSchema(fallback = '') {
  return z.preprocess((v) => cleanText(v, fallback, 1200), z.string()).default(fallback)
}

const questionSchema = z.object({
  question: z.preprocess((v) => cleanText(v, '', 600), z.string()).refine((v) => v.length > 8, 'question too short'),
  type: z.enum(['technical', 'behavioral', 'hr', 'situational', 'resume']).default('technical'),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  expected_topics: z.preprocess((v) => toStringArray(v, 6), z.array(str)).default([]),
  resume_anchor: z.union([str, z.null()]).optional().transform((v) => v ?? null),
})

const followUpSchema = z.object({
  follow_up: z
    .union([
      z.object({
        question: z.preprocess((v) => cleanText(v, '', 600), z.string()),
        expected_topics: z.preprocess((v) => toStringArray(v, 5), z.array(str)).default([]),
      }),
      z.null(),
    ])
    .default(null),
})

const evaluationSchemaZ = z.object({
  relevance: score,
  technical_accuracy: score,
  completeness: score,
  clarity: score,
  structure: score,
  problem_solving: score.default(0),
  confidence: score.default(60),
  coverage: z
    .array(z.object({ topic: str, covered: z.coerce.boolean().default(false), evidence: str.optional() }))
    .default([]),
  feedback: cleanTextSchema(''),
  strengths: z.preprocess((v) => toStringArray(v, 6), z.array(str)).default([]),
  improvements: z.preprocess((v) => toStringArray(v, 6), z.array(str)).default([]),
})

const reportSchemaZ = z.object({
  summary: cleanTextSchema(''),
  strengths: z.preprocess((v) => toStringArray(v, 10), z.array(str)).default([]),
  weaknesses: z.preprocess((v) => toStringArray(v, 10), z.array(str)).default([]),
  recommendations: z.preprocess((v) => toStringArray(v, 10), z.array(str)).default([]),
  recommended_topics: z.preprocess((v) => toStringArray(v, 12), z.array(str)).default([]),
  improvement_plan: z
    .array(
      z.object({
        week: z.coerce.number().default(1),
        focus: cleanTextSchema('Practice'),
        actions: z.preprocess((v) => toStringArray(v, 8), z.array(str)).default([]),
      }),
    )
    .default([]),
  question_reviews: z
    .array(
      z.object({
        question_number: z.coerce.number(),
        what_worked: z.preprocess((v) => toStringArray(v, 6), z.array(str)).default([]),
        what_to_improve: z.preprocess((v) => toStringArray(v, 6), z.array(str)).default([]),
        better_approach: cleanTextSchema(''),
      }),
    )
    .default([]),
})

const coachSchemaZ = z.object({
  reply: cleanTextSchema(''),
  follow_ups: z.preprocess((v) => toStringArray(v, 4), z.array(str)).default([]),
  practice_questions: z
    .array(
      z.object({
        question: str,
        what_a_strong_answer_covers: z.preprocess((v) => toStringArray(v, 6), z.array(str)).default([]),
      }),
    )
    .default([]),
})

/* ------------------------------------------------------------------ */
/* Engine                                                                */
/* ------------------------------------------------------------------ */

export class GeminiEngine implements AiEngine {
  readonly label = `Gemini (${env.ai.geminiModel})`
  readonly kind = 'gemini' as const

  async analyzeResume(input: { text: string; fileName?: string; targetRole?: string | null }): Promise<ResumeAnalysis> {
    const { system, prompt } = resumeExtractionPrompt(input.text, input.fileName, input.targetRole)
    const parsed = await generateValidated(system, prompt, resumeSchema, { temperature: 0.2, maxOutputTokens: 4096 })
    return { ...parsed, engine: this.label } as ResumeAnalysis
  }

  async analyzeJob(input: { title?: string; company?: string; description: string; targetRole?: string | null }): Promise<JobAnalysis> {
    const { system, prompt } = jobExtractionPrompt(input)
    const parsed = await generateValidated(system, prompt, jobSchema, { temperature: 0.2, maxOutputTokens: 3072 })
    return { ...parsed, engine: this.label } as JobAnalysis
  }

  async generateQuestion(ctx: QuestionContext): Promise<GeneratedQuestion> {
    const { system, prompt } = questionPrompt(ctx)
    const parsed = await generateValidated(system, prompt, questionSchema, { temperature: 0.8, maxOutputTokens: 1200 })
    return {
      question: parsed.question,
      type: parsed.type,
      difficulty: parsed.difficulty,
      expected_topics: parsed.expected_topics.length ? parsed.expected_topics : fallbackTopics(ctx),
      resume_anchor: parsed.resume_anchor ?? null,
      is_follow_up: false,
    }
  }

  async evaluateAnswer(ctx: EvaluationContext): Promise<AnswerEvaluation> {
    const { system, prompt } = evaluationPrompt(ctx)
    const parsed = await generateValidated(system, prompt, evaluationSchemaZ, { temperature: 0.3, maxOutputTokens: 2200 })
    const local = evaluateAnswerLocally(ctx)
    return {
      ...parsed,
      coverage: parsed.coverage?.length ? parsed.coverage : local.coverage,
      feedback: parsed.feedback || local.feedback,
      strengths: parsed.strengths.length ? parsed.strengths : local.strengths,
      improvements: parsed.improvements.length ? parsed.improvements : local.improvements,
      signals: local.signals,
      engine: this.label,
    }
  }

  async maybeFollowUp(ctx: EvaluationContext & { evaluation: AnswerEvaluation; askedQuestions: string[] }): Promise<FollowUpDecision | null> {
    const missed = ctx.evaluation.coverage.filter((c) => !c.covered).map((c) => c.topic)
    const { system, prompt } = followUpPrompt({
      question: ctx.question,
      answer: ctx.answer,
      evaluation_summary: `relevance ${ctx.evaluation.relevance}, technical ${ctx.evaluation.technical_accuracy}, completeness ${ctx.evaluation.completeness}`,
      missed_topics: missed,
      interviewType: 'mixed',
      askedQuestions: ctx.askedQuestions,
    })
    const parsed = await generateValidated(system, prompt, followUpSchema, { temperature: 0.7, maxOutputTokens: 700 })
    if (!parsed.follow_up?.question) return null
    const duplicate = ctx.askedQuestions.some(
      (q) => q.toLowerCase().slice(0, 40) === parsed.follow_up!.question.toLowerCase().slice(0, 40),
    )
    if (duplicate) return null
    return {
      question: parsed.follow_up.question,
      type: 'follow_up',
      difficulty: ctx.difficulty,
      expected_topics: parsed.follow_up.expected_topics.length ? parsed.follow_up.expected_topics : missed.slice(0, 3),
      reason: 'Probing an under-explained point in your previous answer.',
    }
  }

  async generateReport(input: Parameters<AiEngine['generateReport']>[0]): Promise<ReportNarrative> {
    const local = buildReportLocally(input)
    const { system, prompt } = reportPrompt({
      jobRole: input.jobRole,
      interviewType: input.interviewType,
      candidateName: input.candidateName,
      resume: input.resume,
      job: input.job,
      scores: input.scores,
      reviews: input.reviews.map((r) => ({
        question_number: r.question_number,
        question: r.question,
        answer: r.answer,
        scores: r.scores as unknown as Record<string, number>,
        missed: r.missed_topics,
        worked: r.what_worked,
        improve: r.what_to_improve,
      })),
    })
    const parsed = await generateValidated(system, prompt, reportSchemaZ, { temperature: 0.45, maxOutputTokens: 6144 })

    const narrativeByNumber = new Map(parsed.question_reviews.map((r) => [Number(r.question_number), r]))
    const question_reviews = local.question_reviews.map((r) => {
      const ai = narrativeByNumber.get(r.question_number)
      if (!ai) return r
      return {
        ...r,
        what_worked: ai.what_worked.length ? ai.what_worked : r.what_worked,
        what_to_improve: ai.what_to_improve.length ? ai.what_to_improve : r.what_to_improve,
        better_approach: ai.better_approach || r.better_approach,
      }
    })

    return {
      summary: parsed.summary || local.summary,
      strengths: parsed.strengths.length ? parsed.strengths : local.strengths,
      weaknesses: parsed.weaknesses.length ? parsed.weaknesses : local.weaknesses,
      recommendations: parsed.recommendations.length ? parsed.recommendations : local.recommendations,
      recommended_topics: parsed.recommended_topics.length ? parsed.recommended_topics : local.recommended_topics,
      improvement_plan: parsed.improvement_plan.length ? parsed.improvement_plan : local.improvement_plan,
      question_reviews,
      engine: this.label,
    }
  }

  async coach(input: Parameters<AiEngine['coach']>[0]): Promise<CoachResult> {
    const { system, prompt } = coachPrompt({
      messages: input.messages,
      resume: input.resume,
      job: input.job,
      context: input.context,
      latestQuestion: input.latestQuestion,
    })
    const parsed = await generateValidated(system, prompt, coachSchemaZ, { temperature: 0.6, maxOutputTokens: 2048 })
    return {
      reply: parsed.reply,
      follow_ups: parsed.follow_ups,
      practice_questions: parsed.practice_questions.map((q) => ({
        question: q.question,
        what_a_strong_answer_covers: q.what_a_strong_answer_covers,
      })),
      engine: this.label,
    }
  }
}

function fallbackTopics(ctx: QuestionContext): string[] {
  const topics = ctx.job?.required_skills?.slice(0, 4) ?? []
  if (topics.length) return topics
  const fallback = generateQuestionLocally(ctx)
  return fallback.expected_topics
}
