import type { AnswerEvaluation } from '../ai/types.js'
import { detectSkillNames } from '../ai/local/skills.js'
import { phraseOverlap } from '../ai/local/text.js'
import { SCORING_METHODOLOGY } from '../db/schema.js'

export interface InterviewScores {
  overall_score: number
  technical_score: number
  communication_score: number
  problem_solving_score: number
  relevance_score: number
  confidence_score: number
  role_alignment_score: number
  answered_count: number
  question_count: number
  methodology: Record<string, unknown>
}

const DIMENSION_KEYS = [
  'overall_score',
  'technical_score',
  'communication_score',
  'problem_solving_score',
  'relevance_score',
  'confidence_score',
  'role_alignment_score',
] as const

function mean(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function round(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)))
}

/**
 * Final interview metrics, computed only from stored per-answer evaluations.
 * Nothing here is random or hardcoded — every dimension is a documented function of the
 * candidate's own answers (see SCORING_METHODOLOGY, surfaced verbatim in the report UI and PDF).
 */
export function computeInterviewScores(input: {
  evaluations: AnswerEvaluation[]
  questionCount: number
  jobSkills: string[]
  /** Raw answer text, used to measure which role requirements were actually addressed. */
  answerTexts?: string[]
}): InterviewScores {
  const evaluations = input.evaluations.filter(Boolean)
  const answered = evaluations.length
  const questionCount = Math.max(input.questionCount, answered, 1)

  if (!answered) {
    return {
      overall_score: 0,
      technical_score: 0,
      communication_score: 0,
      problem_solving_score: 0,
      relevance_score: 0,
      confidence_score: 0,
      role_alignment_score: 0,
      answered_count: 0,
      question_count: questionCount,
      methodology: SCORING_METHODOLOGY as unknown as Record<string, unknown>,
    }
  }

  const technical = mean(evaluations.map((e) => e.technical_accuracy))
  const communication = mean(evaluations.map((e) => 0.7 * e.clarity + 0.3 * e.structure))
  const problemSolving = mean(evaluations.map((e) => 0.5 * e.problem_solving + 0.3 * e.completeness + 0.2 * e.technical_accuracy))
  const relevance = mean(evaluations.map((e) => e.relevance))
  const confidence = mean(evaluations.map((e) => e.confidence))

  const role_alignment = computeRoleAlignment(evaluations, input.jobSkills, input.answerTexts ?? [])

  const weighted =
    0.3 * technical + 0.2 * communication + 0.2 * problemSolving + 0.2 * relevance + 0.1 * role_alignment
  // Unanswered questions count as zero: the overall score reflects the whole interview, not just
  // the parts that were attempted (documented in the methodology shown in the report).
  const overall = weighted * (answered / questionCount)

  return {
    overall_score: round(overall),
    technical_score: round(technical),
    communication_score: round(communication),
    problem_solving_score: round(problemSolving),
    relevance_score: round(relevance),
    confidence_score: round(confidence),
    role_alignment_score: round(role_alignment),
    answered_count: answered,
    question_count: questionCount,
    methodology: SCORING_METHODOLOGY as unknown as Record<string, unknown>,
  }
}

/**
 * Role alignment = how much of the target role's requirement surface the candidate actually
 * addressed, measured both through the coverage map produced per answer and through direct
 * mentions in the answer text.
 */
export function computeRoleAlignment(
  evaluations: AnswerEvaluation[],
  jobSkills: string[],
  answerTexts: string[] = [],
): number {
  const skills = [...new Set(jobSkills.map((s) => s.trim()).filter(Boolean))].slice(0, 20)
  if (!skills.length) {
    // No job description on file: fall back to expected-topic coverage, which is still evidence-based.
    const covered = evaluations.flatMap((e) => e.coverage ?? [])
    if (!covered.length) return 0
    return (covered.filter((c) => c.covered).length / covered.length) * 100
  }

  const haystack = `${answerTexts.join('\n')}\n${evaluations
    .flatMap((e) => (e.coverage ?? []).filter((c) => c.covered).map((c) => c.topic))
    .join(' ')}`.toLowerCase()
  const detected = new Set(detectSkillNames(haystack).map((skill) => skill.toLowerCase()))

  const addressed = skills.filter(
    (skill) => detected.has(skill.toLowerCase()) || phraseOverlap(skill, haystack) >= 0.6,
  ).length

  // 65% of alignment comes from covering the role's requirement surface, 35% from demonstrated
  // technical depth on the answers that were given.
  const strongTechnical = evaluations.filter((e) => e.technical_accuracy >= 65).length
  const coverageComponent = (addressed / skills.length) * 100
  const depthComponent = evaluations.length ? (strongTechnical / evaluations.length) * 100 : 0
  return coverageComponent * 0.65 + depthComponent * 0.35
}

/** Directive used by résumé/JD analyses to weight technical questions toward the role. */
export function alignmentNotes(evaluations: AnswerEvaluation[], jobSkills: string[]): string[] {
  const missing = jobSkills.filter(
    (skill) => !evaluations.some((e) => (e.coverage ?? []).some((c) => c.covered && phraseOverlap(skill, c.topic) > 0.5)),
  )
  return missing.slice(0, 8)
}

export const SCORE_DIMENSIONS = DIMENSION_KEYS
