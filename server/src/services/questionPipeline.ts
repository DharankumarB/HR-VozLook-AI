import { getAiEngine } from '../ai/index.js'
import { biasDifficulty, resolvePersona } from '../ai/personas.js'
import { generateQuestionLocally } from '../ai/local/questions.js'
import { buildBlueprint, validateQuestion, type QuestionCandidate, type ValidationResult } from '../ai/validation.js'
import type { DifficultySetting, GeneratedQuestion, QuestionContext } from '../ai/types.js'

/**
 * The question pipeline.
 *
 *   résumé analysis ─┐
 *   job analysis ────┼─→ blueprint → (LLM | local engine) → validation → retry → final question
 *   candidate profile┘
 *
 * Nothing is shown to a candidate until it passes validation. Failed candidates are discarded and
 * regenerated with the validator's complaints fed back into the prompt; if the provider keeps failing we
 * fall back to the deterministic engine, which is validated the same way. Every attempt is recorded so
 * the admin dashboard can audit question quality.
 */

export interface PipelineResult {
  question: GeneratedQuestion
  validation: ValidationResult
  attempts: number
  engine: string
  rejected: { question: string; issues: string[] }[]
  blueprint: ReturnType<typeof buildBlueprint>
  durationMs: number
}

const MAX_ATTEMPTS = 3

export async function generateValidatedQuestion(
  ctx: QuestionContext & {
    askedTopics: string[]
    focusAreas?: string[]
    effectiveDifficulty?: 'easy' | 'medium' | 'hard'
  },
): Promise<PipelineResult> {
  const started = Date.now()
  const persona = resolvePersona(ctx.persona)
  const effectiveDifficulty = biasDifficulty(
    ctx.effectiveDifficulty ?? (ctx.difficulty === 'adaptive' ? 'medium' : ctx.difficulty),
    persona.difficultyBias,
  )

  const blueprint = buildBlueprint({
    interviewType: ctx.interviewType,
    difficulty: ctx.difficulty as DifficultySetting,
    effectiveDifficulty,
    questionNumber: ctx.questionNumber,
    resume: ctx.resume,
    job: ctx.job,
    askedTopics: ctx.askedTopics,
    focusAreas: ctx.focusAreas,
  })

  const engine = getAiEngine()
  const rejected: { question: string; issues: string[] }[] = []
  let attempts = 0
  let lastValidation: ValidationResult | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    attempts = attempt
    let candidate: GeneratedQuestion
    try {
      candidate = await engine.generateQuestion({
        ...ctx,
        difficulty: ctx.difficulty,
        blueprint,
        persona: persona.id,
        validationFeedback: rejected.flatMap((entry) => entry.issues).slice(-4),
      })
    } catch (error) {
      console.error('[vozhireq][pipeline] provider failed, using the built-in engine:', (error as Error).message)
      candidate = { ...generateQuestionLocally({ ...ctx, blueprint }), engine: 'local' } as GeneratedQuestion
    }

    const validation = validateQuestion(toCandidate(candidate), {
      jobRole: ctx.jobRole,
      interviewType: ctx.interviewType,
      difficulty: ctx.difficulty as DifficultySetting,
      resume: ctx.resume,
      job: ctx.job,
      askedQuestions: ctx.askedQuestions,
      focusAreas: ctx.focusAreas,
    })
    lastValidation = validation

    if (validation.valid) {
      return {
        question: { ...candidate, difficulty: candidate.difficulty ?? effectiveDifficulty },
        validation,
        attempts,
        engine: candidate.engine ?? engine.kind,
        rejected,
        blueprint,
        durationMs: Date.now() - started,
      }
    }

    rejected.push({ question: candidate.question, issues: validation.issues })
    console.warn(`[vozhireq][pipeline] attempt ${attempt} rejected: ${validation.issues.join(' ')}`)
  }

  // Last resort: ask the deterministic engine for a relaxed question and validate once more.
  const fallback = generateQuestionLocally({
    ...ctx,
    blueprint,
    askedQuestions: ctx.askedQuestions.slice(-1),
  })
  const fallbackValidation = validateQuestion(toCandidate(fallback), {
    jobRole: ctx.jobRole,
    interviewType: ctx.interviewType,
    difficulty: ctx.difficulty as DifficultySetting,
    resume: ctx.resume,
    job: ctx.job,
    // The relaxed fallback deliberately retries against a shorter history, so validate the same way.
    askedQuestions: ctx.askedQuestions.slice(-1),
    focusAreas: ctx.focusAreas,
  })

  return {
    question: fallback,
    validation: fallbackValidation.valid ? fallbackValidation : (lastValidation ?? fallbackValidation),
    attempts: attempts + 1,
    engine: 'local',
    rejected,
    blueprint,
    durationMs: Date.now() - started,
  }
}

function toCandidate(question: GeneratedQuestion): QuestionCandidate {
  return {
    question: question.question,
    type: question.type,
    difficulty: (question.difficulty === 'easy' || question.difficulty === 'hard' ? question.difficulty : 'medium') as
      | 'easy'
      | 'medium'
      | 'hard',
    expected_topics: question.expected_topics ?? [],
    resume_anchor: question.resume_anchor ?? null,
    is_follow_up: question.is_follow_up,
  }
}
