/**
 * Supported UI / interview languages.
 *
 * The product ships English only; every other entry is architecture-ready so more languages can be
 * enabled by adding dictionary files and flipping `enabled`. The selected language is stored on the
 * profile (`profiles.preferred_language`) and copied into each interview's settings so the AI is
 * instructed to answer in exactly one language — no accidental mixed-language output.
 */

export type LanguageCode = 'en' | 'hi' | 'ta' | 'te' | 'es' | 'de' | 'fr'

export interface LanguageDefinition {
  code: LanguageCode
  label: string
  nativeLabel: string
  englishName: string
  enabled: boolean
}

export const LANGUAGES: LanguageDefinition[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', englishName: 'English', enabled: true },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', englishName: 'Hindi', enabled: false },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்', englishName: 'Tamil', enabled: false },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు', englishName: 'Telugu', enabled: false },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español', englishName: 'Spanish', enabled: false },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch', englishName: 'German', enabled: false },
  { code: 'fr', label: 'French', nativeLabel: 'Français', englishName: 'French', enabled: false },
]

export const DEFAULT_LANGUAGE: LanguageCode = 'en'

export function enabledLanguages(): LanguageDefinition[] {
  return LANGUAGES.filter((language) => language.enabled)
}

export function resolveLanguage(code?: string | null): LanguageDefinition {
  const match = LANGUAGES.find((language) => language.code === code && language.enabled)
  if (match) return match
  return LANGUAGES.find((language) => language.code === DEFAULT_LANGUAGE)!
}

export function isSupportedLanguage(code?: string | null): boolean {
  return Boolean(LANGUAGES.find((language) => language.code === code && language.enabled))
}

/** Instruction injected into every AI prompt so output is single-language and natural. */
export function languageInstruction(code?: string | null): string {
  const language = resolveLanguage(code)
  return `Write every sentence of your response in ${language.englishName} (${language.code}). Do not mix languages, do not translate key terms that are normally kept in English, and never emit another language.`
}
