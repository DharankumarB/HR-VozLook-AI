export type QuestionType = 'technical' | 'behavioral' | 'hr' | 'situational' | 'resume' | 'follow_up'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type InterviewType = 'technical' | 'hr' | 'behavioral' | 'mixed'
export type DifficultySetting = 'easy' | 'medium' | 'hard' | 'adaptive'
export type InterviewMode = 'text' | 'voice' | 'video'
export type InterviewStatus = 'created' | 'in_progress' | 'processing' | 'completed' | 'abandoned'

export interface EducationEntry {
  degree?: string
  institution?: string
  year?: string
  details?: string
}

export interface ProjectEntry {
  name: string
  description?: string
  technologies: string[]
  highlights?: string[]
}

export interface ExperienceEntry {
  role?: string
  company?: string
  duration?: string
  description?: string
  highlights?: string[]
}

export interface ResumeAnalysis {
  name?: string
  headline?: string
  email?: string
  phone?: string
  location?: string
  links: string[]
  summary?: string
  education: EducationEntry[]
  skills: string[]
  technical_skills: string[]
  soft_skills: string[]
  programming_languages: string[]
  frameworks: string[]
  tools: string[]
  projects: ProjectEntry[]
  internships: ExperienceEntry[]
  experience: ExperienceEntry[]
  certifications: string[]
  achievements: string[]
  years_experience: number
  seniority: 'student' | 'fresher' | 'junior' | 'mid' | 'senior'
  confidence: number
  engine?: string
}

export interface JobAnalysis {
  title?: string
  company?: string
  seniority?: string
  required_skills: string[]
  preferred_skills: string[]
  responsibilities: string[]
  technical_requirements: string[]
  soft_requirements: string[]
  experience_requirements: string
  keywords: string[]
  domain: string
  confidence: number
  engine?: string
}

export interface GeneratedQuestion {
  question: string
  type: QuestionType
  difficulty: Difficulty
  expected_topics: string[]
  resume_anchor?: string | null
  parent_key?: string | null
  is_follow_up?: boolean
  /** Which engine produced this question (surfaced in admin question audits). */
  engine?: string
}

export interface CoverageItem {
  topic: string
  covered: boolean
  evidence?: string
}

export interface AnswerSignals {
  word_count: number
  sentence_count: number
  avg_sentence_words: number
  filler_count: number
  filler_ratio: number
  hedging_count: number
  repetition_ratio: number
  example_markers: number
  structure_markers: number
  star_score: number
  digits: number
  technical_terms: number
  unique_word_ratio: number
  duration_seconds?: number
  words_per_minute?: number
  pause_ratio?: number
  long_pauses?: number
}

export interface AnswerEvaluation {
  relevance: number
  technical_accuracy: number
  completeness: number
  clarity: number
  structure: number
  problem_solving: number
  confidence: number
  coverage: CoverageItem[]
  feedback: string
  strengths: string[]
  improvements: string[]
  signals: AnswerSignals
  engine?: string
}

export interface FollowUpDecision {
  question: string
  type: QuestionType
  difficulty: Difficulty
  expected_topics: string[]
  reason: string
}

export interface QuestionContext {
  jobRole: string
  interviewType: InterviewType
  difficulty: DifficultySetting
  mode: InterviewMode
  /** Candidate-selected focus areas from the interview setup screen (highest priority topics). */
  focusAreas?: string[]
  /** Interviewer persona id (see ai/personas.ts). */
  persona?: string
  /** Language code the interview is conducted in (see ai/languages.ts). */
  language?: string
  /** Question blueprint produced by the pipeline (skills/anchors the question should target). */
  blueprint?: {
    target_type: QuestionType
    focus_skills: string[]
    resume_anchors: string[]
    must_cover_from_job: string[]
    min_difficulty: 'easy' | 'medium' | 'hard'
    rationale: string
  }
  /** Validator complaints from rejected candidates, fed back so the provider can correct itself. */
  validationFeedback?: string[]
  resume: ResumeAnalysis | null
  job: JobAnalysis | null
  askedQuestions: string[]
  askedTopics: string[]
  previousAnswers: {
    question: string
    answer: string
    score: number
    weak_topics: string[]
  }[]
  questionNumber: number
  totalQuestions: number
}

export interface EvaluationContext {
  question: string
  questionType: QuestionType
  difficulty: Difficulty
  expectedTopics: string[]
  resume: ResumeAnalysis | null
  job: JobAnalysis | null
  jobRole: string
  answer: string
  mediaMetrics?: {
    duration_seconds?: number
    word_count?: number
    filler_count?: number
    long_pauses?: number
    speaking_rate_wpm?: number
    clarity_score?: number
    camera_engagement?: number
    posture_consistency?: number
    movement_level?: number
  } | null
}

export interface QuestionReview {
  question_number: number
  question: string
  question_type: QuestionType
  difficulty: Difficulty
  answer: string
  scores: {
    relevance: number
    technical_accuracy: number
    completeness: number
    clarity: number
    structure: number
    problem_solving: number
    confidence: number
  }
  what_worked: string[]
  what_to_improve: string[]
  better_approach: string
  covered_topics: string[]
  missed_topics: string[]
}

export interface ImprovementWeek {
  week: number
  focus: string
  actions: string[]
}

export interface ReportNarrative {
  summary: string
  strengths: string[]
  weaknesses: string[]
  recommendations: string[]
  improvement_plan: ImprovementWeek[]
  question_reviews: QuestionReview[]
  recommended_topics: string[]
  engine?: string
}

export interface CoachMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CoachContextSummary {
  target_role?: string | null
  weak_topics: string[]
  recent_interview?: {
    job_role: string
    overall_score: number | null
    technical_score: number | null
    communication_score: number | null
    completed_at: string | null
  } | null
  history: { job_role: string; overall_score: number | null; completed_at: string | null }[]
}

export interface CoachPracticeQuestion {
  question: string
  what_a_strong_answer_covers: string[]
}

export interface CoachResult {
  reply: string
  follow_ups: string[]
  practice_questions: CoachPracticeQuestion[]
  engine?: string
}

export interface AiEngine {
  readonly label: string
  readonly kind: 'gemini' | 'local'
  analyzeResume(input: { text: string; fileName?: string; targetRole?: string | null }): Promise<ResumeAnalysis>
  analyzeJob(input: { title?: string; company?: string; description: string; targetRole?: string | null }): Promise<JobAnalysis>
  generateQuestion(ctx: QuestionContext): Promise<GeneratedQuestion>
  evaluateAnswer(ctx: EvaluationContext): Promise<AnswerEvaluation>
  maybeFollowUp(ctx: EvaluationContext & { evaluation: AnswerEvaluation; askedQuestions: string[] }): Promise<FollowUpDecision | null>
  generateReport(input: {
    jobRole: string
    interviewType: InterviewType
    difficulty: DifficultySetting
    mode: InterviewMode
    candidateName?: string
    resume: ResumeAnalysis | null
    job: JobAnalysis | null
    reviews: QuestionReview[]
    scores: Record<string, number>
  }): Promise<ReportNarrative>
  coach(input: {
    messages: CoachMessage[]
    resume: ResumeAnalysis | null
    job: JobAnalysis | null
    context: CoachContextSummary
    latestQuestion: string
  }): Promise<CoachResult>
}
