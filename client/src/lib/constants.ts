import type { DifficultySetting, InterviewMode, InterviewType } from './types'

export const BRAND = {
  vendor: 'VozLook Studios',
  product: 'VozLook InterviewAI',
  tagline: 'Practice. Perform. Improve.',
  studioLine: 'AI × Design × Innovation',
}

export const INTERVIEW_TYPES: { value: InterviewType; label: string; description: string; estimate: number }[] = [
  { value: 'technical', label: 'Technical', description: 'Skills, systems and problem solving in your target role', estimate: 9 },
  { value: 'behavioral', label: 'Behavioral', description: 'STAR-style stories about how you actually work', estimate: 8 },
  { value: 'hr', label: 'HR', description: 'Motivation, fit and background questions', estimate: 7 },
  { value: 'mixed', label: 'Mixed', description: 'A realistic full loop: résumé, technical, behavioral and HR', estimate: 8 },
]

export const DIFFICULTIES: { value: DifficultySetting; label: string; description: string }[] = [
  { value: 'easy', label: 'Easy', description: 'Warm-up and fundamentals' },
  { value: 'medium', label: 'Medium', description: 'Standard industry interview level' },
  { value: 'hard', label: 'Hard', description: 'Senior level depth and trade-offs' },
  { value: 'adaptive', label: 'Adaptive', description: 'Follows your answers — harder when you do well' },
]

export const INTERVIEW_MODES: { value: InterviewMode; label: string; description: string; icon: 'message' | 'mic' | 'video' }[] = [
  { value: 'text', label: 'Text', description: 'Type your answers — works everywhere', icon: 'message' },
  { value: 'voice', label: 'Voice', description: 'The interviewer speaks, you answer out loud', icon: 'mic' },
  { value: 'video', label: 'Video', description: 'Camera practice with delivery feedback', icon: 'video' },
]

export const EXPERIENCE_LEVELS = ['Student', 'Fresher', '1-2 years', '3-5 years', '5+ years'] as const

export const QUESTION_COUNTS = [5, 10, 15, 20] as const

export const METRIC_LABELS: Record<string, string> = {
  overall_score: 'Overall',
  technical_score: 'Technical knowledge',
  communication_score: 'Communication',
  problem_solving_score: 'Problem solving',
  relevance_score: 'Answer relevance',
  confidence_score: 'Delivery confidence',
  role_alignment_score: 'Role alignment',
}

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  technical: 'Technical',
  behavioral: 'Behavioral',
  hr: 'HR',
  situational: 'Situational',
  resume: 'Résumé based',
  follow_up: 'Follow-up',
}

export const STATUS_LABELS: Record<string, string> = {
  created: 'Ready',
  in_progress: 'In progress',
  processing: 'Analysing',
  completed: 'Completed',
  abandoned: 'Abandoned',
}

export const SCORE_DISCLAIMER =
  'These metrics are practice and self-improvement signals generated from your own answers. They are not a hiring decision, not an assessment of personality, honesty or mental state, and they do not predict employment outcomes.'

export const ANSWER_MIN_CHARS = 2
