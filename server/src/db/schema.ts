/**
 * Single source of truth for the persistence model.
 *
 * The same logical schema is created in two places:
 *  - `server/src/db/sqlite.ts` (default local/self-hosted mode)
 *  - `supabase/migrations/0001_init.sql` (production Supabase mode, with RLS enabled)
 *
 * JSON columns hold structured objects; the SQLite driver serialises them, Postgres stores jsonb.
 */

export interface TableDef {
  columns: string[]
  jsonColumns: string[]
}

export const TABLES: Record<string, TableDef> = {
  users: {
    columns: ['id', 'email', 'password_hash', 'auth_provider', 'created_at', 'updated_at'],
    jsonColumns: [],
  },
  password_resets: {
    columns: ['id', 'user_id', 'token_hash', 'expires_at', 'used_at', 'created_at'],
    jsonColumns: [],
  },
  profiles: {
    columns: [
      'id',
      'user_id',
      'full_name',
      'email',
      'avatar_url',
      'target_role',
      'company',
      'experience_level',
      'preferred_mode',
      'onboarding_completed',
      'created_at',
      'updated_at',
    ],
    jsonColumns: [],
  },
  resumes: {
    columns: ['id', 'user_id', 'file_name', 'file_url', 'mime_type', 'size_bytes', 'extracted_text', 'parsed_data', 'created_at', 'updated_at'],
    jsonColumns: ['parsed_data'],
  },
  job_descriptions: {
    columns: ['id', 'user_id', 'title', 'company', 'description', 'parsed_requirements', 'created_at', 'updated_at'],
    jsonColumns: ['parsed_requirements'],
  },
  interviews: {
    columns: [
      'id',
      'user_id',
      'resume_id',
      'job_description_id',
      'job_role',
      'interview_type',
      'difficulty',
      'interview_mode',
      'question_count',
      'settings',
      'status',
      'current_question_id',
      'started_at',
      'completed_at',
      'overall_score',
      'created_at',
      'updated_at',
    ],
    jsonColumns: ['settings'],
  },
  interview_questions: {
    columns: [
      'id',
      'interview_id',
      'question_number',
      'question',
      'question_type',
      'difficulty',
      'expected_topics',
      'resume_anchor',
      'is_follow_up',
      'parent_question_id',
      'created_at',
    ],
    jsonColumns: ['expected_topics'],
  },
  interview_answers: {
    columns: [
      'id',
      'question_id',
      'interview_id',
      'user_id',
      'answer_text',
      'audio_url',
      'video_url',
      'duration_seconds',
      'media_metrics',
      'created_at',
    ],
    jsonColumns: ['media_metrics'],
  },
  answer_evaluations: {
    columns: [
      'id',
      'answer_id',
      'interview_id',
      'relevance_score',
      'technical_score',
      'completeness_score',
      'clarity_score',
      'structure_score',
      'communication_score',
      'problem_solving_score',
      'confidence_score',
      'coverage',
      'feedback',
      'strengths',
      'improvements',
      'signals',
      'engine',
      'created_at',
    ],
    jsonColumns: ['coverage', 'strengths', 'improvements', 'signals'],
  },
  interview_reports: {
    columns: [
      'id',
      'interview_id',
      'user_id',
      'overall_score',
      'technical_score',
      'communication_score',
      'problem_solving_score',
      'relevance_score',
      'confidence_score',
      'role_alignment_score',
      'summary',
      'strengths',
      'weaknesses',
      'recommendations',
      'improvement_plan',
      'recommended_topics',
      'question_reviews',
      'scoring_methodology',
      'report_json',
      'engine',
      'created_at',
      'updated_at',
    ],
    jsonColumns: [
      'strengths',
      'weaknesses',
      'recommendations',
      'improvement_plan',
      'recommended_topics',
      'recommended_topics',
      'question_reviews',
      'scoring_methodology',
      'report_json',
    ],
  },
  interview_progress: {
    columns: ['id', 'user_id', 'interview_id', 'metric_name', 'metric_value', 'created_at'],
    jsonColumns: [],
  },
}

export type TableName = keyof typeof TABLES

/** Transparent, documented scoring weights (surfaced verbatim in the report UI and PDF). */
export const SCORING_METHODOLOGY = {
  dimensions: [
    { key: 'technical_score', label: 'Technical Knowledge', weight: 0.3, formula: 'mean of per-answer technical accuracy scores' },
    { key: 'communication_score', label: 'Communication', weight: 0.2, formula: '0.7 × clarity + 0.3 × structure, averaged over answers' },
    { key: 'problem_solving_score', label: 'Problem Solving', weight: 0.2, formula: '0.5 × completeness + 0.3 × approach signals + 0.2 × technical, averaged' },
    { key: 'relevance_score', label: 'Answer Relevance', weight: 0.2, formula: 'mean of per-answer relevance to the asked question' },
    { key: 'role_alignment_score', label: 'Role Alignment', weight: 0.1, formula: 'share of job-requirement topics covered across technical answers' },
  ],
  overall: 'overall = 0.30×technical + 0.20×communication + 0.20×problem solving + 0.20×relevance + 0.10×role alignment',
  confidence:
    'confidence = answer delivery signals only (filler-word ratio, hedging language, sentence-length control, example specificity). With voice answers, filler words and long pauses measured from the transcript are blended in. It is not a measure of personality, honesty or mental state.',
  note: 'All metrics are practice metrics, computed from your own answers in this session. They are not a hiring decision and do not predict employment outcomes.',
} as const
