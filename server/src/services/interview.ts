import { getStore } from '../db/index.js'
import type { Row } from '../db/store.js'
import { newId, nowIso } from '../db/store.js'
import { ApiError } from '../lib/errors.js'
import { getAiEngine } from '../ai/index.js'
import { resolvePersona } from '../ai/personas.js'
import { DEFAULT_LANGUAGE, resolveLanguage } from '../ai/languages.js'
import { generateValidatedQuestion } from './questionPipeline.js'
import { validateQuestion } from '../ai/validation.js'
import type {
  AnswerEvaluation,
  Difficulty,
  DifficultySetting,
  GeneratedQuestion,
  InterviewMode,
  InterviewStatus,
  InterviewType,
  QuestionContext,
} from '../ai/types.js'
import { evaluateAnswerLocally } from '../ai/local/evaluator.js'
import { getActiveResume, resumeAnalysisOf } from './resume.js'
import { getLatestJob, jobAnalysisOf } from './job.js'
import { computeInterviewScores } from './scoring.js'
import { generateReportForInterview } from './report.js'

export const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20] as const
const INTERVIEW_TYPES: InterviewType[] = ['technical', 'hr', 'behavioral', 'mixed']
const DIFFICULTIES: DifficultySetting[] = ['easy', 'medium', 'hard', 'adaptive']
const MODES: InterviewMode[] = ['text', 'voice', 'video']

export const ESTIMATED_MINUTES: Record<InterviewType, number> = {
  technical: 9,
  hr: 7,
  behavioral: 8,
  mixed: 8,
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

export interface CreateInterviewInput {
  jobRole?: string
  interviewType?: string
  difficulty?: string
  mode?: string
  questionCount?: number
  resumeId?: string | null
  jobDescriptionId?: string | null
  settings?: Record<string, unknown>
}

export async function createInterview(userId: string, input: CreateInterviewInput): Promise<Row> {
  const store = getStore()
  const resume = await getActiveResume(userId)
  const job = await getLatestJob(userId)
  const jobAnalysis = jobAnalysisOf(job)

  const jobRole =
    asString(input.jobRole) ||
    asString(job?.title) ||
    jobAnalysis?.title ||
    (await store.findOne<Row>('profiles', { where: { user_id: userId } }))?.target_role ||
    'Software Engineer'

  const interviewType = (INTERVIEW_TYPES.includes(asString(input.interviewType) as InterviewType)
    ? asString(input.interviewType)
    : 'mixed') as InterviewType
  const difficulty = (DIFFICULTIES.includes(asString(input.difficulty) as DifficultySetting)
    ? asString(input.difficulty)
    : 'adaptive') as DifficultySetting
  const mode = (MODES.includes(asString(input.mode) as InterviewMode) ? asString(input.mode) : 'text') as InterviewMode
  const questionCount = QUESTION_COUNT_OPTIONS.includes(asNumber(input.questionCount, 10) as (typeof QUESTION_COUNT_OPTIONS)[number])
    ? asNumber(input.questionCount, 10)
    : 10

  const interview = await store.insert('interviews', {
    user_id: userId,
    resume_id: resume?.id ?? null,
    job_description_id: job?.id ?? null,
    job_role: jobRole.slice(0, 160),
    interview_type: interviewType,
    difficulty,
    interview_mode: mode,
    question_count: questionCount,
    settings: {
      ...(input.settings ?? {}),
      has_resume: Boolean(resume),
      has_job_description: Boolean(job),
      engine: getAiEngine().label,
    },
    status: 'created' as InterviewStatus,
  })

  await store.insert('interview_progress', {
    user_id: userId,
    interview_id: interview.id,
    metric_name: 'interview_started',
    metric_value: 1,
  })

  // Generate the first question immediately so the session screen has something to render.
  await nextQuestion(userId, String(interview.id))
  return (await store.findById<Row>('interviews', String(interview.id)))!
}

function questionContext(input: {
  interview: Row
  resume: Row | null
  job: Row | null
  questions: Row[]
  answers: Row[]
  evaluations: Row[]
}): QuestionContext {
  const resumeAnalysis = resumeAnalysisOf(input.resume)
  const jobAnalysis = jobAnalysisOf(input.job)
  const askedTopics = input.questions.flatMap((q) => (q.expected_topics as string[] | null) ?? [])
  const previousAnswers = input.questions
    .map((question, index) => {
      const answer = input.answers.find((a) => a.question_id === question.id)
      const evaluation = answer ? input.evaluations.find((e) => e.answer_id === answer.id) : null
      if (!answer) return null
      const score =
        evaluation != null
          ? (Number(evaluation.relevance_score) +
              Number(evaluation.technical_score) +
              Number(evaluation.completeness_score) +
              Number(evaluation.clarity_score)) /
            4
          : 0
      const weakTopics = (evaluation?.coverage as { topic: string; covered: boolean }[] | null)?.filter((c) => !c.covered).map((c) => c.topic) ?? []
      return {
        question: String(question.question),
        answer: String(answer.answer_text ?? ''),
        score: Number.isFinite(score) ? score : 0,
        weak_topics: weakTopics,
        index,
      }
    })
    .filter(Boolean) as { question: string; answer: string; score: number; weak_topics: string[]; index: number }[]

  const settings = (input.interview.settings ?? {}) as Record<string, unknown>
  const focusAreas = Array.isArray(settings.focus_areas)
    ? (settings.focus_areas as unknown[]).map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
    : []
  const persona = resolvePersona(asString(settings.persona) || null)
  const language = resolveLanguage(asString(settings.language) || DEFAULT_LANGUAGE)

  return {
    persona: persona.id,
    language: language.code,
    jobRole: String(input.interview.job_role),
    focusAreas,
    interviewType: input.interview.interview_type as InterviewType,
    difficulty: input.interview.difficulty as DifficultySetting,
    mode: input.interview.interview_mode as InterviewMode,
    resume: resumeAnalysis,
    job: jobAnalysis,
    askedQuestions: input.questions.map((q) => String(q.question)),
    askedTopics: [...new Set(askedTopics)],
    previousAnswers,
    questionNumber: input.questions.length + 1,
    totalQuestions: Number(input.interview.question_count),
  }
}

async function loadInterviewBundle(userId: string, interviewId: string) {
  const store = getStore()
  const interview = await store.findById<Row>('interviews', interviewId)
  if (!interview) throw ApiError.notFound('We could not find that interview.')
  if (interview.user_id !== userId) throw ApiError.forbidden()
  const questions = await store.findMany<Row>('interview_questions', {
    where: { interview_id: interviewId },
    order: { column: 'question_number', ascending: true },
  })
  const answers = await store.findMany<Row>('interview_answers', { where: { interview_id: interviewId } })
  const evaluations = await store.findMany<Row>('answer_evaluations', { where: { interview_id: interviewId } })
  const resume = interview.resume_id ? await store.findById<Row>('resumes', String(interview.resume_id)) : await getActiveResume(userId)
  const job = interview.job_description_id
    ? await store.findById<Row>('job_descriptions', String(interview.job_description_id))
    : await getLatestJob(userId)
  return { interview, questions, answers, evaluations, resume, job }
}

const MAX_FOLLOW_UPS_RATIO = 0.34

/** Generates and persists the next question (or a follow-up) for an interview. */
export async function nextQuestion(userId: string, interviewId: string): Promise<Row> {
  const store = getStore()
  const bundle = await loadInterviewBundle(userId, interviewId)
  const { interview, questions, answers, evaluations } = bundle

  if (interview.status === 'completed') throw ApiError.badRequest('This interview has already been completed.')

  const context = questionContext({ interview, resume: bundle.resume, job: bundle.job, questions, answers, evaluations })

  // Every question passes through the blueprint → generate → validate → deduplicate pipeline; a
  // candidate never sees a generic or ungrounded question. Attempts and scores are stored for audit.
  const pipeline = await generateValidatedQuestion({
    ...context,
    askedTopics: context.askedTopics,
    focusAreas: context.focusAreas,
  })
  const generated: GeneratedQuestion = pipeline.question

  const question = await store.insert('interview_questions', {
    interview_id: interviewId,
    question_number: questions.length + 1,
    question: generated.question,
    question_type: generated.type,
    difficulty: generated.difficulty as Difficulty,
    expected_topics: generated.expected_topics ?? [],
    resume_anchor: generated.resume_anchor ?? null,
    is_follow_up: generated.is_follow_up ? 1 : 0,
    parent_question_id: generated.parent_key ?? null,
    generation: {
      engine: pipeline.engine,
      attempts: pipeline.attempts,
      duration_ms: pipeline.durationMs,
      validation_score: pipeline.validation.score,
      valid: pipeline.validation.valid,
      checks: pipeline.validation.checks,
      issues: pipeline.validation.issues,
      rejected: pipeline.rejected.map((entry) => entry.question),
      blueprint: pipeline.blueprint,
      persona: context.persona,
      language: context.language,
    },
  })

  await store.updateById('interviews', interviewId, {
    status: 'in_progress',
    started_at: interview.started_at ?? nowIso(),
    current_question_id: question.id,
  })

  return question
}

export interface SubmitAnswerInput {
  questionId?: string
  answerText?: string
  durationSeconds?: number
  mediaMetrics?: Record<string, unknown> | null
  audioUrl?: string | null
  videoUrl?: string | null
}

/** In-process guard that makes double submissions for the same question impossible. */
const inFlight = new Map<string, Promise<unknown>>()

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) return existing as Promise<T>
  const promise = fn().finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return promise
}

export interface SubmitAnswerResult {
  answer: Row
  evaluation: Row
  nextQuestion: Row | null
  completed: boolean
  progress: { answered: number; total: number }
}

function mediaMetricsFrom(input: SubmitAnswerInput, answerText: string) {
  const metrics = (input.mediaMetrics ?? {}) as Record<string, number | undefined>
  const wordCount = answerText.split(/\s+/).filter(Boolean).length
  const duration = typeof input.durationSeconds === 'number' ? input.durationSeconds : undefined
  return {
    ...metrics,
    word_count: typeof metrics.word_count === 'number' ? metrics.word_count : wordCount,
    duration_seconds: duration ?? metrics.duration_seconds,
    speaking_rate_wpm:
      typeof metrics.speaking_rate_wpm === 'number'
        ? metrics.speaking_rate_wpm
        : duration && duration > 3
          ? Math.round((wordCount / duration) * 60)
          : undefined,
  }
}

export async function submitAnswer(userId: string, interviewId: string, input: SubmitAnswerInput): Promise<SubmitAnswerResult> {
  const store = getStore()
  const bundle = await loadInterviewBundle(userId, interviewId)
  const { interview, questions, answers, evaluations } = bundle

  if (interview.status === 'completed') throw ApiError.badRequest('This interview is already complete.')

  const questionId = asString(input.questionId) || String(interview.current_question_id ?? '')
  const question = questions.find((q) => q.id === questionId)
  if (!question) throw ApiError.badRequest('That question does not belong to this interview.')

  return withLock(`answer:${questionId}`, async () => {
    const existing = await store.findOne<Row>('interview_answers', { where: { question_id: questionId } })
    if (existing) {
      // Idempotent: a refresh or double-click returns the stored result instead of re-evaluating.
      const evaluation = await store.findOne<Row>('answer_evaluations', { where: { answer_id: existing.id } })
      const current = await store.findById<Row>('interviews', interviewId)
      return {
        answer: existing,
        evaluation: evaluation ?? (await store.insert('answer_evaluations', { answer_id: existing.id, interview_id: interviewId })) as Row,
        nextQuestion: null,
        completed: current?.status === 'completed',
        progress: {
          answered: await store.count('interview_answers', { interview_id: interviewId }),
          total: Number(interview.question_count),
        },
      }
    }

    const answerText = asString(input.answerText).slice(0, 20000)
    if (!answerText) throw ApiError.badRequest('Write or record an answer before submitting.')

    const mediaMetrics = mediaMetricsFrom(input, answerText)

    const answer = await store.insert('interview_answers', {
      question_id: questionId,
      interview_id: interviewId,
      user_id: userId,
      answer_text: answerText,
      audio_url: input.audioUrl ?? null,
      video_url: input.videoUrl ?? null,
      duration_seconds: typeof input.durationSeconds === 'number' ? input.durationSeconds : null,
      media_metrics: mediaMetrics,
    })

    const activeSettings = (interview.settings ?? {}) as Record<string, unknown>
    const evaluationContext = {
      question: String(question.question),
      questionType: question.question_type as any,
      difficulty: question.difficulty as Difficulty,
      expectedTopics: (question.expected_topics as string[] | null) ?? [],
      resume: resumeAnalysisOf(bundle.resume),
      job: jobAnalysisOf(bundle.job),
      jobRole: String(interview.job_role),
      answer: answerText,
      mediaMetrics,
      persona: asString(activeSettings.persona) || undefined,
      language: asString(activeSettings.language) || DEFAULT_LANGUAGE,
    }

    const engine = getAiEngine()
    let evaluation: AnswerEvaluation
    try {
      evaluation = await engine.evaluateAnswer(evaluationContext)
    } catch (error) {
      console.error('[vozlook][interview] evaluation fell back to local analyser:', (error as Error).message)
      evaluation = evaluateAnswerLocally(evaluationContext)
    }

    const clarity = evaluation.clarity
    const storedEvaluation = await store.insert('answer_evaluations', {
      answer_id: answer.id,
      interview_id: interviewId,
      relevance_score: evaluation.relevance,
      technical_score: evaluation.technical_accuracy,
      completeness_score: evaluation.completeness,
      clarity_score: clarity,
      structure_score: evaluation.structure,
      communication_score: 0.7 * clarity + 0.3 * evaluation.structure,
      problem_solving_score: evaluation.problem_solving,
      confidence_score: evaluation.confidence,
      coverage: evaluation.coverage,
      feedback: evaluation.feedback,
      strengths: evaluation.strengths,
      improvements: evaluation.improvements,
      signals: evaluation.signals,
      engine: evaluation.engine ?? engine.label,
    })

    const answeredCount = await store.count('interview_answers', { interview_id: interviewId })
    const planned = Number(interview.question_count)
    const followUpLimit = Math.ceil(planned * MAX_FOLLOW_UPS_RATIO)
    const followUpsUsed = questions.filter((q) => Boolean(q.is_follow_up)).length

    let next: Row | null = null
    const askedQuestions = questions.map((q) => String(q.question))
    const worthProbing =
      evaluation.relevance >= 25 &&
      evaluation.relevance <= 88 &&
      (evaluation.completeness < 78 || evaluation.coverage.some((c) => !c.covered))

    if (worthProbing && followUpsUsed < followUpLimit && question.question_type !== 'hr') {
      try {
        const decision = await engine.maybeFollowUp({ ...evaluationContext, evaluation, askedQuestions })
        // Follow-ups go through the same validator as core questions: a second-rate probe is dropped
        // and the session simply moves on to the next planned question.
        const decisionCheck = decision
          ? validateQuestion(
              {
                question: decision.question,
                type: decision.type,
                difficulty: decision.difficulty,
                expected_topics: decision.expected_topics,
                resume_anchor: null,
                is_follow_up: true,
              },
              {
                jobRole: String(interview.job_role),
                interviewType: interview.interview_type as InterviewType,
                difficulty: interview.difficulty as DifficultySetting,
                resume: resumeAnalysisOf(bundle.resume),
                job: jobAnalysisOf(bundle.job),
                askedQuestions,
                focusAreas: [],
              },
            )
          : null
        if (decision && decisionCheck?.valid) {
          next = await store.insert('interview_questions', {
            interview_id: interviewId,
            question_number: questions.length + 1,
            question: decision.question,
            question_type: decision.type,
            difficulty: decision.difficulty,
            expected_topics: decision.expected_topics,
            resume_anchor: null,
            is_follow_up: 1,
            parent_question_id: questionId,
            generation: {
              engine: evaluation.engine ?? engine.label,
              attempts: 1,
              duration_ms: 0,
              validation_score: decisionCheck.score,
              valid: decisionCheck.valid,
              checks: decisionCheck.checks,
              issues: decisionCheck.issues,
              rejected: [],
              blueprint: null,
              persona: evaluationContext.persona,
              language: evaluationContext.language,
              kind: 'follow_up',
            },
          })
        }
      } catch (error) {
        console.error('[vozlook][interview] follow-up generation failed:', (error as Error).message)
      }
    }

    const coreQuestionsAsked = questions.filter((q) => !q.is_follow_up).length
    let completed = false

    if (!next) {
      if (coreQuestionsAsked >= planned) {
        completed = true
      } else {
        await store.updateById('interviews', interviewId, { current_question_id: null })
        next = await nextQuestion(userId, interviewId)
      }
    }

    await store.updateById('interviews', interviewId, {
      current_question_id: next?.id ?? null,
      status: completed ? 'processing' : 'in_progress',
    })

    if (completed) {
      try {
        await generateReportForInterview(userId, interviewId)
      } catch (error) {
        console.error('[vozlook][interview] report generation failed:', (error as Error).message)
        await store.updateById('interviews', interviewId, { status: 'completed', completed_at: nowIso() })
      }
    }

    return {
      answer,
      evaluation: storedEvaluation,
      nextQuestion: next,
      completed,
      progress: { answered: Math.min(answeredCount, planned), total: planned },
    }
  })
}

export async function skipQuestion(userId: string, interviewId: string, input: { questionId?: string }): Promise<SubmitAnswerResult> {
  const store = getStore()
  const bundle = await loadInterviewBundle(userId, interviewId)
  const questionId = asString(input.questionId) || String(bundle.interview.current_question_id ?? '')
  const question = bundle.questions.find((q) => q.id === questionId)
  if (!question) throw ApiError.badRequest('That question does not belong to this interview.')

  const existing = await store.findOne<Row>('interview_answers', { where: { question_id: questionId } })
  if (!existing) {
    const answer = await store.insert('interview_answers', {
      question_id: questionId,
      interview_id: interviewId,
      user_id: userId,
      answer_text: '',
      media_metrics: { skipped: true },
    })
    await store.insert('answer_evaluations', {
      answer_id: answer.id,
      interview_id: interviewId,
      relevance_score: 0,
      technical_score: 0,
      completeness_score: 0,
      clarity_score: 0,
      structure_score: 0,
      communication_score: 0,
      problem_solving_score: 0,
      confidence_score: 0,
      coverage: ((question.expected_topics as string[] | null) ?? []).map((topic) => ({ topic, covered: false })),
      feedback: 'You skipped this question. Skipped questions score zero and are recorded in the report as gaps to practise.',
      strengths: [],
      improvements: [`Prepare an answer for: ${question.question}`],
      signals: { word_count: 0, sentence_count: 0 },
      engine: 'system',
    })
  }

  return submitAnswerNext(userId, interviewId)
}

async function submitAnswerNext(userId: string, interviewId: string): Promise<SubmitAnswerResult> {
  const store = getStore()
  const bundle = await loadInterviewBundle(userId, interviewId)
  const { questions, interview } = bundle
  const planned = Number(interview.question_count)
  const coreAsked = questions.filter((q) => !q.is_follow_up).length

  if (coreAsked >= planned) {
    await store.updateById('interviews', interviewId, { status: 'processing' })
    await generateReportForInterview(userId, interviewId)
    const answer = bundle.answers[bundle.answers.length - 1]!
    return {
      answer,
      evaluation: (await store.findOne<Row>('answer_evaluations', { where: { answer_id: answer.id } }))!,
      nextQuestion: null,
      completed: true,
      progress: { answered: coreAsked, total: planned },
    }
  }

  const next = await nextQuestion(userId, interviewId)
  const answer = bundle.answers[bundle.answers.length - 1]!
  return {
    answer,
    evaluation: (await store.findOne<Row>('answer_evaluations', { where: { answer_id: answer.id } }))!,
    nextQuestion: next,
    completed: false,
    progress: { answered: coreAsked, total: planned },
  }
}

export async function endInterviewEarly(userId: string, interviewId: string): Promise<Row> {
  const store = getStore()
  const interview = await store.findById<Row>('interviews', interviewId)
  if (!interview || interview.user_id !== userId) throw ApiError.notFound('We could not find that interview.')
  await store.updateById('interviews', interviewId, { status: 'processing', current_question_id: null })
  const report = await generateReportForInterview(userId, interviewId)
  return report
}

export async function getInterviewState(userId: string, interviewId: string) {
  const store = getStore()
  const bundle = await loadInterviewBundle(userId, interviewId)
  const { interview, questions, answers, evaluations } = bundle
  const report = await store.findOne<Row>('interview_reports', { where: { interview_id: interviewId } })

  const answeredIds = new Set(answers.map((a) => a.question_id))
  const currentQuestion =
    questions.find((q) => q.id === interview.current_question_id) ??
    questions.find((q) => !answeredIds.has(q.id)) ??
    null

  const scores = computeInterviewScores({
    evaluations: evaluations
      .map((e) => {
        const answer = answers.find((a) => a.id === e.answer_id)
        if (!answer) return null
        return {
          relevance: Number(e.relevance_score ?? 0),
          technical_accuracy: Number(e.technical_score ?? 0),
          completeness: Number(e.completeness_score ?? 0),
          clarity: Number(e.clarity_score ?? 0),
          structure: Number(e.structure_score ?? 0),
          problem_solving: Number(e.problem_solving_score ?? 0),
          confidence: Number(e.confidence_score ?? 0),
          coverage: (e.coverage as any) ?? [],
          feedback: String(e.feedback ?? ''),
          strengths: (e.strengths as string[] | null) ?? [],
          improvements: (e.improvements as string[] | null) ?? [],
          signals: (e.signals as any) ?? {},
        } as AnswerEvaluation
      })
      .filter(Boolean) as AnswerEvaluation[],
    questionCount: questions.filter((q) => !q.is_follow_up).length || Number(interview.question_count),
    jobSkills: jobAnalysisOf(bundle.job)?.required_skills ?? [],
    answerTexts: answers.map((a) => String(a.answer_text ?? '')).filter(Boolean),
  })

  return {
    interview: {
      ...interview,
      question_count: Number(interview.question_count),
    },
    questions: questions.map((q) => ({ ...q, is_follow_up: Boolean(q.is_follow_up) })),
    answers: answers.map((a) => ({ ...a, media_metrics: a.media_metrics ?? null })),
    evaluations,
    currentQuestion: currentQuestion ? { ...currentQuestion, is_follow_up: Boolean(currentQuestion.is_follow_up) } : null,
    progress: {
      answered: answers.length,
      planned: Number(interview.question_count),
      asked: questions.filter((q) => !q.is_follow_up).length,
    },
    liveScores: scores,
    hasReport: Boolean(report),
    reportId: report?.id ?? null,
    resumeSummary: bundle.resume
      ? {
          file_name: bundle.resume.file_name,
          skills: (resumeAnalysisOf(bundle.resume)?.skills ?? []).slice(0, 12),
        }
      : null,
    jobSummary: bundle.job
      ? {
          title: bundle.job.title,
          company: bundle.job.company,
          required_skills: (jobAnalysisOf(bundle.job)?.required_skills ?? []).slice(0, 12),
        }
      : null,
  }
}

export async function listInterviews(userId: string, filters: { jobRole?: string; interviewType?: string; from?: string; to?: string; status?: string } = {}) {
  const store = getStore()
  let rows = await store.findMany<Row>('interviews', {
    where: { user_id: userId },
    order: { column: 'created_at', ascending: false },
  })
  if (filters.jobRole) {
    const needle = filters.jobRole.toLowerCase()
    rows = rows.filter((row) => String(row.job_role ?? '').toLowerCase().includes(needle))
  }
  if (filters.interviewType) rows = rows.filter((row) => row.interview_type === filters.interviewType)
  if (filters.status) rows = rows.filter((row) => row.status === filters.status)
  if (filters.from) rows = rows.filter((row) => String(row.created_at) >= filters.from!)
  if (filters.to) rows = rows.filter((row) => String(row.created_at) <= filters.to!)

  const withReports = await Promise.all(
    rows.map(async (row) => {
      const report = await store.findOne<Row>('interview_reports', { where: { interview_id: row.id } })
      return {
        ...row,
        question_count: Number(row.question_count),
        report_id: report?.id ?? null,
        has_report: Boolean(report),
      }
    }),
  )
  return withReports
}

export async function deleteInterview(userId: string, interviewId: string): Promise<void> {
  const store = getStore()
  const interview = await store.findById<Row>('interviews', interviewId)
  if (!interview || interview.user_id !== userId) throw ApiError.notFound('We could not find that interview.')
  const answers = await store.findMany<Row>('interview_answers', { where: { interview_id: interviewId } })
  for (const answer of answers) {
    await store.remove('answer_evaluations', { answer_id: answer.id })
  }
  await store.remove('interview_answers', { interview_id: interviewId })
  await store.remove('interview_questions', { interview_id: interviewId })
  await store.remove('interview_reports', { interview_id: interviewId })
  await store.remove('interview_progress', { interview_id: interviewId })
  await store.remove('interviews', { id: interviewId, user_id: userId })
}

export function newIdForTests(): string {
  return newId()
}
