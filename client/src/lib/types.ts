/**
 * Shared types mirrored from the server API contract (server/src/ai/types.ts and /db/schema.ts).
 */

export type UserRole = 'user' | 'admin'
export type AccountStatus = 'active' | 'disabled'
export type LanguageCode = 'en' | 'hi' | 'ta' | 'te' | 'es' | 'de' | 'fr'
export type PersonaId = 'professional' | 'hr' | 'technical' | 'friendly' | 'strict'

export interface Profile {
  id: string
  user_id: string
  full_name: string | null
  email: string | null
  avatar_url: string | null
  target_role: string | null
  company: string | null
  experience_level: string | null
  preferred_mode: string | null
  preferred_language: LanguageCode | null
  /** Server-assigned. The client can read it but can never change it. */
  role: UserRole
  status: AccountStatus
  onboarding_completed: boolean | number
  created_at: string
  updated_at: string
}

export interface SessionUser {
  id: string
  email: string
  created_at?: string
  provider?: string
  role?: UserRole
  status?: AccountStatus
  full_name?: string | null
}

export interface LanguageOption {
  code: LanguageCode
  label: string
  native_label?: string
  enabled: boolean
  default?: boolean
}

export interface PersonaOption {
  id: PersonaId
  label: string
  description: string
  enabled: boolean
}

export interface SessionUser {
  id: string
  email: string
  created_at?: string
  provider?: string
}

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
  seniority: string
  confidence: number
  engine?: string
  pages?: number
  extraction?: string
}

export interface ResumeRecord {
  id: string
  file_name: string
  file_url?: string
  mime_type?: string
  size_bytes?: number
  created_at: string
  updated_at?: string
  parsed_data: ResumeAnalysis | null
  extracted_text?: string
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

export interface JobRecord {
  id: string
  title: string
  company: string | null
  description: string
  parsed_requirements: JobAnalysis | null
  created_at: string
}

export type InterviewType = 'technical' | 'hr' | 'behavioral' | 'mixed'
export type DifficultySetting = 'easy' | 'medium' | 'hard' | 'adaptive'
export type InterviewMode = 'text' | 'voice' | 'video'
export type InterviewStatus = 'created' | 'in_progress' | 'processing' | 'completed' | 'abandoned'

export interface InterviewRecord {
  id: string
  user_id: string
  resume_id: string | null
  job_description_id: string | null
  job_role: string
  interview_type: InterviewType
  difficulty: DifficultySetting
  interview_mode: InterviewMode
  question_count: number
  status: InterviewStatus
  current_question_id: string | null
  started_at: string | null
  completed_at: string | null
  overall_score: number | null
  created_at: string
  report_id?: string | null
  has_report?: boolean
}

export interface QuestionRecord {
  id: string
  interview_id: string
  question_number: number
  question: string
  question_type: 'technical' | 'behavioral' | 'hr' | 'situational' | 'resume' | 'follow_up'
  difficulty: 'easy' | 'medium' | 'hard'
  expected_topics: string[]
  resume_anchor?: string | null
  is_follow_up: boolean
  created_at: string
}

export interface AnswerRecord {
  id: string
  question_id: string
  interview_id: string
  answer_text: string | null
  audio_url?: string | null
  video_url?: string | null
  duration_seconds: number | null
  media_metrics: MediaMetrics | null
  created_at: string
}

export interface MediaMetrics {
  duration_seconds?: number
  word_count?: number
  filler_count?: number
  long_pauses?: number
  speaking_rate_wpm?: number
  clarity_score?: number
  camera_engagement?: number
  posture_consistency?: number
  movement_level?: number
  skipped?: boolean
}

export interface CoverageItem {
  topic: string
  covered: boolean
  evidence?: string
}

export interface EvaluationRecord {
  id: string
  answer_id: string
  interview_id: string
  relevance_score: number
  technical_score: number
  completeness_score: number
  clarity_score: number
  structure_score: number
  communication_score: number
  problem_solving_score: number
  confidence_score: number
  coverage: CoverageItem[] | null
  feedback: string | null
  strengths: string[] | null
  improvements: string[] | null
  signals: Record<string, number | string | undefined> | null
  engine: string | null
  created_at: string
}

export interface LiveScores {
  overall_score: number
  technical_score: number
  communication_score: number
  problem_solving_score: number
  relevance_score: number
  confidence_score: number
  role_alignment_score: number
  answered_count: number
  question_count: number
  methodology?: ScoringMethodology
}

export interface InterviewState {
  interview: InterviewRecord
  questions: QuestionRecord[]
  answers: AnswerRecord[]
  evaluations: EvaluationRecord[]
  currentQuestion: QuestionRecord | null
  progress: { answered: number; planned: number; asked: number }
  liveScores: LiveScores
  hasReport: boolean
  reportId: string | null
  resumeSummary: { file_name: string; skills: string[] } | null
  jobSummary: { title: string; company: string | null; required_skills: string[] } | null
}

export interface QuestionReview {
  question_number: number
  question: string
  question_type: string
  difficulty: string
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

export interface ScoringMethodology {
  dimensions: { key: string; label: string; weight: number; formula: string }[]
  overall: string
  confidence: string
  note: string
}

export interface ReportRecord {
  id: string
  interview_id: string
  user_id: string
  overall_score: number
  technical_score: number
  communication_score: number
  problem_solving_score: number
  relevance_score: number
  confidence_score: number
  role_alignment_score: number
  summary: string
  strengths: string[]
  weaknesses: string[]
  recommendations: string[]
  improvement_plan: ImprovementWeek[]
  recommended_topics: string[]
  question_reviews: QuestionReview[]
  scoring_methodology: ScoringMethodology
  report_json: {
    answered_count?: number
    question_count?: number
    engine?: string
    generated_at?: string
    job?: { title?: string; company?: string; required_skills?: string[]; domain?: string } | null
    resume?: { name?: string; skills?: string[]; projects?: string[] } | null
  }
  engine: string
  created_at: string
}

export interface DashboardStats {
  interviews_completed: number
  interviews_started: number
  interviews_in_progress: number
  average_overall: number | null
  average_technical: number | null
  average_communication: number | null
  average_problem_solving: number | null
  last_score: number | null
  previous_score: number | null
  delta: number | null
}

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
  domain?: string | null
  question_count?: number
}

export interface WeakTopic {
  topic: string
  misses: number
  sessions: number
  lastSeen: string | null
}

export interface DashboardResponse {
  stats: DashboardStats
  recent: (InterviewRecord & { has_report: boolean; report_id: string | null })[]
  series: MetricPoint[]
  weak_topics: WeakTopic[]
  has_resume: boolean
  has_job: boolean
}

export interface ProgressResponse {
  series: MetricPoint[]
  trends: {
    metric: string
    values: number[]
    first: number | null
    last: number | null
    change: number | null
    best: number | null
  }[]
  averages_by_type: { interview_type: string; average: number | null; sessions: number }[]
  weak_topics: WeakTopic[]
  scored_interviews: number
}

export interface CoachPracticeQuestion {
  question: string
  what_a_strong_answer_covers: string[]
}

export interface CoachResponse {
  reply: string
  follow_ups: string[]
  practice_questions: CoachPracticeQuestion[]
  engine?: string
  context?: {
    target_role?: string | null
    weak_topics: string[]
    recent_interview?: { job_role: string; overall_score: number | null } | null
  }
}

export interface MetaResponse {
  product: string
  vendor: string
  data_mode: 'sqlite' | 'supabase'
  storage: 'supabase' | 'local'
  ai: { enabled: boolean; engine: string; gemini_configured: boolean; model: string }
  limits: { max_upload_mb: number }
  question_counts: number[]
  scoring_methodology: ScoringMethodology
  supabase_auth: { url: string; anon_key: string } | null
  auth: { password_reset_exposed: boolean; providers: string[] }
  product_description?: string
  tagline?: string
  default_language: LanguageCode
  languages: LanguageOption[]
  personas: PersonaOption[]
  default_persona: PersonaId
  google_auth: { enabled: boolean; client_id: string | null }
  admin: { surface: string; enabled: boolean; enforced_server_side: boolean }
  features?: Record<string, boolean>
  disclaimers?: Record<string, string>
}

/* ------------------------------- admin console ----------------------------- */

export interface AdminTotals {
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

export interface AdminOverview {
  totals: AdminTotals
  modes: { interview_mode: string; interviews: number; completed: number }[]
  types: { interview_type: string; interviews: number }[]
  completion_rate: number | null
  recent_users: AdminUserRow[]
  recent_interviews: AdminInterviewRow[]
  system: {
    data_mode: string
    storage: string
    ai_enabled: boolean
    ai_engine: string
    uptime_seconds: number
    generated_at: string
  }
}

export interface AdminUserRow {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  status: AccountStatus
  account_type: string
  registered_at: string
  last_active: string | null
  interviews: number
  completed_interviews: number
  average_score: number | null
  resumes: number
  reports: number
  avatar_url?: string | null
  provider?: string | null
}

export interface AdminInterviewRow {
  id: string
  user_id: string
  candidate: string
  email: string
  job_role: string
  interview_type: string
  interview_mode: string
  difficulty: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  duration_minutes: number | null
  questions: number
  answered: number
  score: number | null
  status: string
  has_report: boolean
}

export interface AdminReportInsights {
  totals: { reports: number; average_score: number | null; completed_interviews: number; scored_interviews: number }
  improvement_areas: { area: string; count: number; share: number }[]
  technical_weaknesses: { topic: string; count: number }[]
  top_roles: { role: string; interviews: number; average_score: number | null }[]
  score_distribution: { band: string; count: number }[]
  dimension_averages: { dimension: string; label: string; average: number | null }[]
}

export interface AdminAnalytics {
  range_days: number
  user_growth: { date: string; users: number; cumulative: number }[]
  monthly_growth: { month: string; users: number }[]
  interview_activity: { date: string; started: number; completed: number }[]
  performance: { date: string; average_score: number | null; interviews: number }[]
  popular_roles: { role: string; count: number; average_score: number | null }[]
  mode_usage: { mode: string; count: number }[]
  type_usage: { type: string; count: number }[]
  completion: { started: number; completed: number; abandoned: number; rate: number | null }
}

export interface AdminSetting {
  key: string
  label: string
  description: string
  value: unknown
  is_default: boolean
  updated_at: string | null
}

export interface AdminSettingsResponse {
  settings: AdminSetting[]
  editable_keys: string[]
  platform: {
    product: string
    product_description: string
    vendor: string
    tagline: string
    environment: string
    data_mode: string
    store: string
    storage: string
    ai: { enabled: boolean; engine: string; model: string; api_key_configured: boolean; timeout_ms: number; max_retries: number }
    auth: {
      providers: string[]
      supabase_auth: boolean
      google: { configured: boolean; client_id: string | null; secret_configured: boolean; supabase_oauth: boolean }
      password_reset_exposed: boolean
      session_days: number
    }
    admin: { surface: string; provisioning: number; enforced_server_side: boolean }
    limits: { max_upload_mb: number }
    languages: LanguageOption[]
    personas: { id: string; label: string; enabled: boolean }[]
    counts: { users: number; interviews: number; reports: number; resumes: number }
  }
}

export interface AdminLogEntry {
  id: string
  admin_email: string | null
  action: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface AdminInterviewDetail {
  interview: AdminInterviewRow & { settings: Record<string, unknown> | null }
  candidate: { id: string; email: string; full_name: string | null; role: UserRole; status: AccountStatus } | null
  questions: {
    id: string
    question_number: number
    question: string
    question_type: string
    difficulty: string
    expected_topics: string[] | null
    resume_anchor: string | null
    is_follow_up: boolean
    generation: Record<string, unknown> | null
  }[]
  answers: {
    id: string
    question_id: string
    answer_text: string | null
    duration_seconds: number | null
    created_at: string
    evaluation: {
      relevance_score: number
      technical_score: number
      completeness_score: number
      clarity_score: number
      structure_score: number
      communication_score: number
      problem_solving_score: number
      feedback: string | null
      strengths: string[] | null
      improvements: string[] | null
      coverage: { topic: string; covered: boolean }[] | null
      engine: string | null
    } | null
  }[]
  report: ReportRecord | null
}
