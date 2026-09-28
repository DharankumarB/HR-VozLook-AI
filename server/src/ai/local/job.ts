import type { JobAnalysis } from '../types.js'
import { detectSkills, domainLabel, inferDomain, normalizeSkillList, skillsByCategory, SOFT_SKILL_HINTS } from './skills.js'
import { keywordFrequency } from './text.js'

const REQUIRED_HEADINGS = /^(requirements?|required\s+(skills|qualifications|experience)|must\s+have|minimum\s+qualifications?|what\s+you.?ll\s+need|who\s+you\s+are|qualifications?|skills?\s+required)\b/i
const PREFERRED_HEADINGS = /^(preferred\s+(skills|qualifications)?|nice\s+to\s+have|good\s+to\s+have|bonus\s+(points|skills)|added\s+advantage|plus\s+points)\b/i
const RESPONSIBILITY_HEADINGS = /^(responsibilities|your\s+responsibilities|what\s+you.?ll\s+do|key\s+responsibilities|duties|role\s+overview|job\s+description|the\s+role|about\s+the\s+role|day\s+to\s+day)\b/i
const SOFT_HEADINGS = /^(soft\s+skills|behavioural\s+skills|behavioral\s+skills|personal\s+attributes)\b/i
const EXCLUDE_HEADINGS = /^(about\s+(us|the\s+company)|company\s+overview|benefits?|perks|compensation|why\s+join|our\s+culture|equal\s+opportunity|how\s+to\s+apply)\b/i

interface Blocks {
  required: string[]
  preferred: string[]
  responsibilities: string[]
  soft: string[]
  other: string[]
}

function splitBlocks(description: string): Blocks {
  const lines = description.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Blocks = { required: [], preferred: [], responsibilities: [], soft: [], other: [] }
  let current: keyof Blocks = 'other'
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    const headingText = line.replace(/[^A-Za-z\s&/']/g, ' ').trim()
    if (headingText.length <= 60) {
      if (REQUIRED_HEADINGS.test(headingText)) {
        current = 'required'
        continue
      }
      if (PREFERRED_HEADINGS.test(headingText)) {
        current = 'preferred'
        continue
      }
      if (RESPONSIBILITY_HEADINGS.test(headingText)) {
        current = 'responsibilities'
        continue
      }
      if (SOFT_HEADINGS.test(headingText)) {
        current = 'soft'
        continue
      }
      if (EXCLUDE_HEADINGS.test(headingText)) {
        current = 'other'
        continue
      }
    }
    blocks[current].push(line.replace(/^[•\-*\u2022\d.)\s]+/, '').trim())
  }
  return blocks
}

const BULLET_SPLIT = /\s*[•\n;]\s*|\s{2,}(?=[A-Z])|\s+-\s+/

function toSentences(lines: string[], max: number, maxLen = 240): string[] {
  const out: string[] = []
  for (const line of lines) {
    for (const piece of line.split(BULLET_SPLIT)) {
      const value = piece.trim().replace(/\.$/, '')
      if (value.length < 8 || value.length > 400) continue
      out.push(value.slice(0, maxLen))
      if (out.length >= max) return out
    }
  }
  return out
}

function extractTitle(description: string, given?: string, targetRole?: string | null): string | undefined {
  if (given?.trim()) return given.trim().slice(0, 120)
  const lines = description.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 12)
  const roleRegex = /(engineer|developer|intern|analyst|designer|scientist|architect|consultant|manager|administrator|specialist|associate|lead)\b/i
  for (const line of lines) {
    const cleaned = line.replace(/^(job\s+title|role|position|designation)\s*[:\-]\s*/i, '').trim()
    if (roleRegex.test(cleaned) && cleaned.length <= 80 && !/^we\s|^our\s|^about\s/i.test(cleaned)) {
      return cleaned.replace(/[|,;]+$/, '').slice(0, 120)
    }
  }
  const titleMatch = description.match(/(?:job\s+title|position|role|designation)\s*[:\-]\s*([^\n]{3,80})/i)
  if (titleMatch?.[1]) return titleMatch[1].trim().slice(0, 120)
  return targetRole?.trim() || undefined
}

function extractCompany(description: string, given?: string): string | undefined {
  if (given?.trim()) return given.trim().slice(0, 120)
  const match = description.match(/(?:company|organisation|organization|employer)\s*[:\-]\s*([^\n]{2,80})/i)
  return match?.[1]?.trim().slice(0, 120)
}

function extractExperienceRequirement(description: string): string {
  const rangeMatch = description.match(/(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\+?\s*(?:years?|yrs?)/i)
  if (rangeMatch) return `${rangeMatch[1]}-${rangeMatch[2]} years`
  const plusMatch = description.match(/(\d{1,2})\s*\+\s*(?:years?|yrs?)/i)
  if (plusMatch) return `${plusMatch[1]}+ years`
  const plainMatch = description.match(/(\d{1,2})\s*(?:years?|yrs?)\s*(?:of\s*)?(?:relevant\s*|industry\s*)?(?:experience|exp)/i)
  if (plainMatch) return `${plainMatch[1]} years`
  if (/fresher|entry[\s-]level|graduate|no\s+prior\s+experience|0-1\s*year/i.test(description)) return 'Entry level / fresher'
  return 'Not specified'
}

/**
 * Deterministic job-description parser. Extracts the role requirements a human recruiter would
 * highlight, then separates must-haves from nice-to-haves using the JD's own section headings.
 */
export function parseJobLocally(input: {
  title?: string
  company?: string
  description: string
  targetRole?: string | null
}): JobAnalysis {
  const description = input.description.replace(/\r\n?/g, '\n').trim()
  const blocks = splitBlocks(description)
  const requiredText = [blocks.required, blocks.other].flat().join('\n')
  const preferredText = blocks.preferred.join('\n')
  const responsibilityText = blocks.responsibilities.length ? blocks.responsibilities.join('\n') : description

  const allSkillDefs = detectSkills(description)
  const requiredDefs = detectSkills(requiredText)
  const preferredDefs = detectSkills(preferredText)

  const requiredNames = requiredDefs.map((d) => d.name)
  const preferredNames = preferredDefs.map((d) => d.name).filter((n) => !requiredNames.includes(n))

  // Fallback: if the JD had no recognisable headings, treat the most frequent detected skills as required.
  const required_skills = normalizeSkillList(
    requiredNames.length >= 3 ? requiredNames : allSkillDefs.map((d) => d.name),
    25,
  )
  const preferred_skills = normalizeSkillList(preferredNames, 20)

  const title = extractTitle(description, input.title, input.targetRole)
  const company = extractCompany(description, input.company)
  const domain = inferDomain(`${title ?? ''} ${input.targetRole ?? ''} ${description}`).domain

  const responsibilities = toSentences(blocks.responsibilities.length ? blocks.responsibilities : responsibilityText.split('\n').filter((l) => /^\s*[•\-*]/.test(l)), 12)
  const technical_requirements = toSentences(
    requiredText.split('\n').filter((l) => l.trim().length > 12),
    12,
  )
  const soft_requirements = normalizeSkillList(
    [
      ...(blocks.soft.length ? detectSkills(blocks.soft.join('\n')).map((d) => d.name) : []),
      ...SOFT_SKILL_HINTS.filter((hint) => description.toLowerCase().includes(hint)).map((hint) =>
        hint
          .split(' ')
          .map((w) => w[0].toUpperCase() + w.slice(1))
          .join(' '),
      ),
    ],
    12,
  )

  const seniorityMatch = description.match(/\b(intern|entry[\s-]level|junior|mid[\s-]level|senior|lead|principal|staff)\b/i)
  const keywords = keywordFrequency(`${title ?? ''} ${required_skills.join(' ')} ${responsibilityText}`, 30).map((k) => k.term)

  const confidenceFields = [
    Boolean(title),
    required_skills.length > 2,
    responsibilities.length > 2,
    technical_requirements.length > 1,
    extractExperienceRequirement(description) !== 'Not specified',
    domain !== 'general software',
  ]

  return {
    title,
    company,
    seniority: seniorityMatch?.[1]?.toLowerCase().replace(/-/g, ' '),
    required_skills,
    preferred_skills,
    responsibilities,
    technical_requirements,
    soft_requirements: soft_requirements.length ? soft_requirements : ['Communication', 'Problem Solving'],
    experience_requirements: extractExperienceRequirement(description),
    keywords,
    domain: domainLabel(domain) === 'Software Engineering' && !required_skills.length ? 'general software' : domain,
    confidence: Math.min(0.95, 0.3 + confidenceFields.filter(Boolean).length * 0.11),
    engine: 'local',
  }
}

export function parseJobLocallySafe(description: string, fallbackTitle?: string | null): JobAnalysis {
  try {
    return parseJobLocally({ description, targetRole: fallbackTitle })
  } catch {
    return {
      title: fallbackTitle ?? undefined,
      required_skills: [],
      preferred_skills: [],
      responsibilities: [],
      technical_requirements: [],
      soft_requirements: ['Communication'],
      experience_requirements: 'Not specified',
      keywords: [],
      domain: 'general software',
      confidence: 0.3,
      engine: 'local',
    }
  }
}
