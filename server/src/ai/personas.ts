/**
 * Interviewer personas.
 *
 * A persona shapes question tone, difficulty bias, follow-up pressure and the voice the browser should
 * use for text-to-speech. The architecture supports several personas; "professional" is the default
 * identity used throughout a session so the candidate always interviews with the same person.
 */

export type PersonaId = 'professional' | 'hr' | 'technical' | 'friendly' | 'strict'

export interface PersonaDefinition {
  id: PersonaId
  label: string
  description: string
  /** System-prompt tone instructions handed to the language model. */
  tone: string
  /** Difficulty nudge applied when the session uses adaptive difficulty. */
  difficultyBias: -1 | 0 | 1
  /** How eagerly follow-ups are asked. */
  followUpEagerness: 'low' | 'medium' | 'high'
  /** Voice guidance used by the browser speech synthesiser. */
  voice: { rate: number; pitch: number; preferFemale: boolean; hint: string }
  enabled: boolean
}

export const PERSONAS: Record<PersonaId, PersonaDefinition> = {
  professional: {
    id: 'professional',
    label: 'Professional AI Interviewer',
    description: 'Calm, corporate and consistent — the default VozHireQ interviewer.',
    tone: 'Warm but professional. Speak like an experienced hiring manager running a structured interview. Stay neutral, never flatter, never mock.',
    difficultyBias: 0,
    followUpEagerness: 'medium',
    voice: { rate: 0.97, pitch: 1.0, preferFemale: true, hint: 'calm, mid-range, corporate' },
    enabled: true,
  },
  hr: {
    id: 'hr',
    label: 'HR Interviewer',
    description: 'Focuses on motivation, culture fit, teamwork and career goals.',
    tone: 'Friendly HR tone. Prioritise motivation, collaboration, career goals and behavioural evidence. Avoid deep technical drilling.',
    difficultyBias: -1,
    followUpEagerness: 'medium',
    voice: { rate: 0.98, pitch: 1.05, preferFemale: true, hint: 'friendly, approachable' },
    enabled: true,
  },
  technical: {
    id: 'technical',
    label: 'Technical Interviewer',
    description: 'Senior engineer tone — implementation detail, trade-offs and depth.',
    tone: 'Senior engineer tone. Push for implementation detail, trade-offs, failure modes and measurable outcomes. Ask crisp, specific questions.',
    difficultyBias: 1,
    followUpEagerness: 'high',
    voice: { rate: 1.0, pitch: 0.95, preferFemale: false, hint: 'measured, precise' },
    enabled: true,
  },
  friendly: {
    id: 'friendly',
    label: 'Friendly Interviewer',
    description: 'Encouraging tone for early practice runs.',
    tone: 'Encouraging and patient. Use supportive phrasing, keep questions concrete, and leave room for the candidate to think aloud.',
    difficultyBias: -1,
    followUpEagerness: 'low',
    voice: { rate: 0.96, pitch: 1.08, preferFemale: true, hint: 'warm, encouraging' },
    enabled: true,
  },
  strict: {
    id: 'strict',
    label: 'Strict Technical Interviewer',
    description: 'High-pressure screening tone for late-stage practice.',
    tone: 'Direct and demanding. Challenge vague answers, ask for numbers and exact decisions, and never accept hand-waving.',
    difficultyBias: 1,
    followUpEagerness: 'high',
    voice: { rate: 1.02, pitch: 0.92, preferFemale: false, hint: 'brisk, demanding' },
    enabled: true,
  },
}

export const DEFAULT_PERSONA: PersonaId = 'professional'

export function resolvePersona(id?: string | null): PersonaDefinition {
  if (id && id in PERSONAS) return PERSONAS[id as PersonaId]
  return PERSONAS[DEFAULT_PERSONA]
}

export function listPersonas(): PersonaDefinition[] {
  return Object.values(PERSONAS)
}

/** Applies the persona's difficulty nudge on top of the adaptive band. */
export function biasDifficulty(difficulty: 'easy' | 'medium' | 'hard', bias: -1 | 0 | 1): 'easy' | 'medium' | 'hard' {
  const order = ['easy', 'medium', 'hard'] as const
  const index = Math.min(order.length - 1, Math.max(0, order.indexOf(difficulty) + bias))
  return order[index]!
}

/** Short instruction describing how the coach should sound for this persona. */
export function personaCoachStyle(id?: string | null): string {
  const persona = resolvePersona(id)
  return `Adopt the tone of a ${persona.label.toLowerCase()}: ${persona.tone}`
}
