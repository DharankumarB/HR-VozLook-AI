import type { DifficultySetting, JobAnalysis, QuestionType, ResumeAnalysis } from './types.js'
import { similarity } from './local/text.js'
import { detectSkillNames } from './local/skills.js'

/**
 * Question validation.
 *
 * Every question — whether produced by the language model or the built-in engine — passes through this
 * gate before it is shown to a candidate. A failing question is discarded and the generator is asked
 * again (see services/questionPipeline.ts); the pipeline falls back to the deterministic bank if the
 * provider cannot produce anything valid.
 */

export interface QuestionCandidate {
  question: string
  type: QuestionType
  difficulty: 'easy' | 'medium' | 'hard'
  expected_topics: string[]
  resume_anchor?: string | null
  is_follow_up?: boolean
}

export interface ValidationContext {
  jobRole: string
  interviewType: 'technical' | 'hr' | 'behavioral' | 'mixed'
  difficulty: DifficultySetting
  resume: ResumeAnalysis | null
  job: JobAnalysis | null
  askedQuestions: string[]
  focusAreas?: string[]
}

export interface ValidationResult {
  valid: boolean
  score: number
  issues: string[]
  checks: {
    professional_quality: boolean
    answerable: boolean
    difficulty_match: boolean
    not_duplicate: boolean
    role_relevance: boolean
    resume_grounding: boolean
    job_relevance: boolean
    topics_present: boolean
  }
}

const BANNED_PATTERNS = [
  /\bas an ai\b/i,
  /\blorem ipsum\b/i,
  /json/i,
  /\bundefined\b/i,
  /\bnull\b/i,
  /\{\{|\}\}/,
  /\bTODO\b/i,
  /\bexpected_topics\b/i,
]

const HR_KEYWORDS = ['yourself', 'background', 'goal', 'strength', 'weakness', 'motivat', 'why do you', 'career', 'salary', 'notice period', 'relocat', 'team', 'conflict', 'pressure', 'deadline', 'manager', 'colleague', 'customer', 'proud', 'failure', 'feedback', 'leadership']
const SCENARIO_KEYWORDS = ['scenario', 'what would you do', 'imagine', 'suppose', 'requirement arrives', 'production', 'incident', 'outage', 'stakeholder', 'prioritis', 'prioritiz']

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function words(value: string): string[] {
  return value.split(/\s+/).filter(Boolean)
}

function roleKeywords(jobRole: string, job: JobAnalysis | null): string[] {
  return [
    ...words(jobRole.toLowerCase()).filter((word) => word.length > 3),
    ...(job?.required_skills ?? []).map((skill) => skill.toLowerCase()),
    ...(job?.keywords ?? []).slice(0, 12).map((keyword) => keyword.toLowerCase()),
    ...(job?.domain ? [job.domain.toLowerCase()] : []),
  ]
}

/** Résumé facts a question is allowed to reference. */
function resumeFacts(resume: ResumeAnalysis | null): string[] {
  if (!resume) return []
  return [
    ...(resume.projects ?? []).map((project) => project.name),
    ...(resume.projects ?? []).flatMap((project) => project.technologies ?? []),
    ...(resume.experience ?? []).flatMap((entry) => [entry.role ?? '', entry.company ?? '']),
    ...(resume.internships ?? []).flatMap((entry) => [entry.role ?? '', entry.company ?? '']),
    ...(resume.skills ?? []),
    ...(resume.certifications ?? []),
    ...(resume.education ?? []).flatMap((entry) => [entry.degree ?? '', entry.institution ?? '']),
  ]
    .filter((value) => value && value.length > 1)
    .map((value) => value.toLowerCase())
}

export function validateQuestion(candidate: QuestionCandidate, ctx: ValidationContext): ValidationResult {
  const question = (candidate.question ?? '').trim()
  const lower = normalize(question)
  const issues: string[] = []

  /* 1. Professional quality -------------------------------------------------- */
  const professional =
    question.length >= 15 &&
    question.length <= 400 &&
    !BANNED_PATTERNS.some((pattern) => pattern.test(question)) &&
    !/\s{3,}/.test(question) &&
    (question.match(/\?/g) ?? []).length <= 2 &&
    /^[A-Za-z0-9"'\u201c\u2018(]/.test(question)
  if (!professional) issues.push('The question text is not professional or well formed.')

  /* 2. Answerability --------------------------------------------------------- */
  const wordList = words(question)
  const clauses = question.split(/[,;]|\band\b/).filter((clause) => clause.trim().length > 12)
  const answerable = wordList.length <= 60 && clauses.length <= 3 && !/\b(list all|everything|every single)\b/i.test(question)
  if (!answerable) issues.push('The question is too compound to answer in one response.')

  /* 3. Difficulty ------------------------------------------------------------ */
  const allowedDifficulties =
    ctx.difficulty === 'adaptive' ? ['easy', 'medium', 'hard'] : [ctx.difficulty]
  const difficultyMatch = allowedDifficulties.includes(candidate.difficulty)
  if (!difficultyMatch) issues.push(`Difficulty "${candidate.difficulty}" does not match the session setting.`)

  /* 4. Duplication ----------------------------------------------------------- */
  const duplicate = ctx.askedQuestions.some((previous) => similarity(previous, question) > 0.62 || normalize(previous) === lower)
  if (duplicate) issues.push('A very similar question has already been asked.')

  /* 5. Role / job / résumé relevance ---------------------------------------- */
  const keywords = roleKeywords(ctx.jobRole, ctx.job)
  const skillMentions = detectSkillNames(question).map((skill) => skill.toLowerCase())
  const roleHit = keywords.some((keyword) => keyword.length > 3 && lower.includes(keyword))
  const jobSkillHit = (ctx.job?.required_skills ?? []).some((skill) => lower.includes(skill.toLowerCase()))
  const focusHit = (ctx.focusAreas ?? []).some((area) => lower.includes(area.toLowerCase()))
  const genericBehavioural =
    (ctx.interviewType === 'hr' || ctx.interviewType === 'behavioral') &&
    (HR_KEYWORDS.some((keyword) => lower.includes(keyword)) || SCENARIO_KEYWORDS.some((keyword) => lower.includes(keyword)))
  const typeAligned =
    (candidate.type === 'hr' && HR_KEYWORDS.some((keyword) => lower.includes(keyword))) ||
    (candidate.type === 'situational' && SCENARIO_KEYWORDS.some((keyword) => lower.includes(keyword))) ||
    candidate.type === 'technical' ||
    candidate.type === 'resume' ||
    candidate.type === 'behavioral'

  const roleRelevance = roleHit || jobSkillHit || focusHit || skillMentions.length > 0 || genericBehavioural
  if (!roleRelevance) issues.push('The question is not clearly related to the target role, job requirements or the candidate’s skills.')
  if (!typeAligned) issues.push(`The question does not match its type (${candidate.type}).`)

  const mismatch = (ctx.job?.required_skills ?? []).length && !jobSkillHit && !roleHit && !focusHit && !genericBehavioural

  const facts = resumeFacts(ctx.resume)
  let resumeGrounding = true
  if (candidate.resume_anchor) {
    const anchor = normalize(candidate.resume_anchor)
    resumeGrounding = facts.some((fact) => fact.includes(anchor) || anchor.includes(fact))
    if (!resumeGrounding) issues.push(`The résumé anchor "${candidate.resume_anchor}" is not present in the candidate’s résumé.`)
  }

  /* 6. Blueprint topics ------------------------------------------------------ */
  const topics = (candidate.expected_topics ?? []).filter((topic) => topic && topic.trim().length > 1)
  const topicsPresent = topics.length >= 2 && topics.length <= 6
  if (!topicsPresent) issues.push('The question needs 2-6 expected topics for grading.')

  const checks = {
    professional_quality: professional,
    answerable,
    difficulty_match: difficultyMatch,
    not_duplicate: !duplicate,
    role_relevance: roleRelevance,
    resume_grounding: resumeGrounding,
    job_relevance: !mismatch,
    topics_present: topicsPresent,
  }

  const weights: Record<keyof typeof checks, number> = {
    professional_quality: 0.18,
    answerable: 0.12,
    difficulty_match: 0.12,
    not_duplicate: 0.16,
    role_relevance: 0.2,
    resume_grounding: 0.08,
    job_relevance: 0.09,
    topics_present: 0.05,
  }
  const score = (Object.keys(checks) as (keyof typeof checks)[]).reduce(
    (total, key) => total + (checks[key] ? weights[key] : 0),
    0,
  )

  // Hard failures: a duplicate, a résumé anchor that does not exist, unsafe text, or zero relevance.
  const hardFailures = [checks.not_duplicate, checks.professional_quality, checks.resume_grounding, checks.answerable, checks.topics_present]
  const valid = hardFailures.every(Boolean) && roleRelevance && score >= 0.72 && (checks.difficulty_match || ctx.difficulty === 'adaptive')

  return { valid, score: Math.round(score * 100) / 100, issues, checks }
}

/**
 * The question blueprint: what this interview still needs, ordered by priority. It gives the generator
 * explicit targets (résumé anchors, job skills, focus areas, type cycle) instead of a generic prompt.
 */
export interface QuestionBlueprint {
  target_type: QuestionType
  focus_skills: string[]
  resume_anchors: string[]
  must_cover_from_job: string[]
  min_difficulty: 'easy' | 'medium' | 'hard'
  rationale: string
}

export function buildBlueprint(input: {
  interviewType: 'technical' | 'hr' | 'behavioral' | 'mixed'
  difficulty: DifficultySetting
  effectiveDifficulty: 'easy' | 'medium' | 'hard'
  questionNumber: number
  resume: ResumeAnalysis | null
  job: JobAnalysis | null
  askedTopics: string[]
  focusAreas?: string[]
}): QuestionBlueprint {
  const typeCycle: Record<string, QuestionType[]> = {
    technical: ['technical', 'resume', 'technical', 'situational', 'technical'],
    behavioral: ['behavioral', 'situational', 'resume', 'behavioral'],
    hr: ['hr', 'behavioral', 'resume', 'hr'],
    mixed: ['resume', 'technical', 'behavioral', 'technical', 'situational', 'hr'],
  }
  const cycle = typeCycle[input.interviewType] ?? (typeCycle.mixed as QuestionType[])
  const targetType = input.questionNumber <= 1 ? (input.interviewType === 'hr' ? 'hr' : 'resume') : cycle[(input.questionNumber - 1) % cycle.length]!

  const asked = input.askedTopics.map((topic) => topic.toLowerCase())
  const uncoveredJob = (input.job?.required_skills ?? [])
    .filter((skill) => !asked.some((topic) => similarity(topic, skill) > 0.7))
    .slice(0, 6)
  const unusedProjects = (input.resume?.projects ?? []).slice(0, 4).map((project) => project.name)
  const focus = (input.focusAreas ?? []).filter(Boolean).slice(0, 4)

  const priority = [...focus, ...uncoveredJob, ...(input.resume?.skills ?? []).slice(0, 4)]

  return {
    target_type: targetType,
    focus_skills: priority.slice(0, 6),
    resume_anchors: unusedProjects,
    must_cover_from_job: uncoveredJob,
    min_difficulty: input.effectiveDifficulty,
    rationale: [
      `question ${input.questionNumber} of a ${input.interviewType} interview`,
      input.job ? `job requirements available: ${(input.job.required_skills ?? []).slice(0, 5).join(', ') || 'none parsed'}` : 'no job description on file',
      input.resume ? `résumé anchors available: ${unusedProjects.slice(0, 3).join(', ') || 'none'}` : 'no résumé on file',
      focus.length ? `candidate focus areas: ${focus.join(', ')}` : 'no focus areas selected',
    ].join(' · '),
  }
}
