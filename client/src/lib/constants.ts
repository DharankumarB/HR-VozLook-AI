import type { DifficultySetting, InterviewMode, InterviewType, LanguageCode, PersonaId } from './types'

export const BRAND = {
  vendor: 'VozLook Studios',
  product: 'VozHireQ',
  productDescription: 'AI-Powered Interview Intelligence',
  tagline: 'Practice. Perform. Grow.',
  studioLine: 'by VozLook Studios',
  supportEmail: 'vozlookstudios@gmail.com',
  adminSurface: '/admin',
}

/**
 * Languages. English is the only language enabled today; the rest are architecture-ready so more can
 * be switched on server-side (see server/src/ai/languages.ts) without a client release.
 */
export const LANGUAGES: { code: LanguageCode; label: string; native: string; enabled: boolean }[] = [
  { code: 'en', label: 'English', native: 'English', enabled: true },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी', enabled: false },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்', enabled: false },
  { code: 'te', label: 'Telugu', native: 'తెలుగు', enabled: false },
  { code: 'es', label: 'Spanish', native: 'Español', enabled: false },
  { code: 'de', label: 'German', native: 'Deutsch', enabled: false },
  { code: 'fr', label: 'French', native: 'Français', enabled: false },
]

export const PERSONAS: { id: PersonaId; label: string; description: string }[] = [
  { id: 'professional', label: 'Professional AI Interviewer', description: 'Balanced corporate interviewer — the VozHireQ default' },
  { id: 'technical', label: 'Technical Interviewer', description: 'Senior engineer tone: depth, trade-offs and failure modes' },
  { id: 'hr', label: 'HR Interviewer', description: 'Motivation, teamwork, career goals and culture fit' },
  { id: 'friendly', label: 'Friendly Interviewer', description: 'Encouraging tone for a first practice run' },
  { id: 'strict', label: 'Strict Technical', description: 'Hard pressure, precise answers — senior loop practice' },
]

export const AVATAR_DISCLAIMER =
  'The AI interviewer is an animated assistant. Its mouth moves in time with the spoken question rather than reproducing true lip-sync.'

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
