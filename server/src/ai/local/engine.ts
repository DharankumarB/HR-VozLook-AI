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
} from '../types.js'
import { parseResumeLocally } from './resume.js'
import { parseJobLocally } from './job.js'
import { generateFollowUpLocally, generateQuestionLocally } from './questions.js'
import { evaluateAnswerLocally } from './evaluator.js'
import { buildReportLocally, coachLocally } from './report.js'
import { maybeFallbackQuestion } from './fallbacks.js'

/**
 * The deterministic engine. It is always available: it powers the app when no LLM key is
 * configured and acts as the safety net when a provider call fails, so the interview can never
 * break mid-session because of an external service.
 */
export class LocalEngine implements AiEngine {
  readonly label = 'VozLook analysis engine (local)'
  readonly kind = 'local' as const

  async analyzeResume(input: { text: string; fileName?: string; targetRole?: string | null }): Promise<ResumeAnalysis> {
    return parseResumeLocally(input.text, { fileName: input.fileName, targetRole: input.targetRole })
  }

  async analyzeJob(input: { title?: string; company?: string; description: string; targetRole?: string | null }): Promise<JobAnalysis> {
    return parseJobLocally(input)
  }

  async generateQuestion(ctx: QuestionContext): Promise<GeneratedQuestion> {
    return generateQuestionLocally(ctx)
  }

  async evaluateAnswer(ctx: EvaluationContext): Promise<AnswerEvaluation> {
    return evaluateAnswerLocally(ctx)
  }

  async maybeFollowUp(
    ctx: EvaluationContext & { evaluation: AnswerEvaluation; askedQuestions: string[] },
  ): Promise<FollowUpDecision | null> {
    const decision = generateFollowUpLocally({ ...ctx, askedQuestions: ctx.askedQuestions })
    if (!decision) return null
    return {
      question: decision.question,
      type: 'follow_up',
      difficulty: ctx.difficulty,
      expected_topics: decision.expected_topics,
      reason: decision.reason,
    }
  }

  async generateReport(input: Parameters<AiEngine['generateReport']>[0]): Promise<ReportNarrative> {
    return buildReportLocally(input)
  }

  async coach(input: Parameters<AiEngine['coach']>[0]): Promise<CoachResult> {
    return coachLocally(input)
  }
}

export { maybeFallbackQuestion }
