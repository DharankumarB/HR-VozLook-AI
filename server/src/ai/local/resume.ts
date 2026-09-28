import type { EducationEntry, ExperienceEntry, ProjectEntry, ResumeAnalysis } from '../types.js'
import { detectSkills, detectSkillNames, inferDomain, normalizeSkillList, skillsByCategory, SOFT_SKILL_HINTS } from './skills.js'
import { keywordFrequency, significantWords, titleCase } from './text.js'

const SECTION_PATTERNS: { key: SectionKey; regex: RegExp }[] = [
  { key: 'summary', regex: /^(professional\s+)?(summary|profile|objective|about\s+me|career\s+objective|career\s+summary)\b/i },
  { key: 'education', regex: /^(education|academic\s+(background|details|qualifications?)|qualifications?)\b/i },
  { key: 'skills', regex: /^(technical\s+)?(skills?|skill\s+set|core\s+competenc|technologies|technical\s+proficienc)\w*/i },
  { key: 'experience', regex: /^(work\s+)?(experience|employment|professional\s+experience|work\s+history|career\s+history)\b/i },
  { key: 'internships', regex: /^(internships?|internship\s+experience|industrial\s+training)\b/i },
  { key: 'projects', regex: /^(academic\s+|personal\s+|key\s+|major\s+)?(projects?|project\s+work|portfolio)\b/i },
  { key: 'certifications', regex: /^(certifications?|licenses?|courses?|trainings?|certificates?)\b/i },
  { key: 'achievements', regex: /^(achievements?|awards?|honors?|honours?|accomplishments?|extracurricular|activities|publications?)\b/i },
  { key: 'languages', regex: /^(languages?\s+known|languages?)\b/i },
]

type SectionKey = 'summary' | 'education' | 'skills' | 'experience' | 'internships' | 'projects' | 'certifications' | 'achievements' | 'languages'

function isHeading(line: string): SectionKey | null {
  const clean = line.replace(/[^A-Za-z\s&/]/g, ' ').trim()
  if (!clean || clean.length > 48) return null
  for (const { key, regex } of SECTION_PATTERNS) {
    if (regex.test(clean)) return key
  }
  return null
}

export function normalizeResumeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[•▪◦●‣·]/g, '• ')
    .replace(/[ \t]{2,}/g, '  ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function splitSections(text: string): Record<string, string> {
  const lines = text.split('\n')
  const sections: Record<string, string[]> = { header: [] }
  let current = 'header'
  for (const line of lines) {
    const key = isHeading(line)
    const looksLikeHeading = key && line.trim().length < 48 && !line.trim().endsWith('.')
    if (looksLikeHeading) {
      current = key!
      sections[current] = sections[current] ?? []
      continue
    }
    sections[current] = sections[current] ?? []
    sections[current].push(line)
  }
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(sections)) out[key] = value.join('\n').trim()
  return out
}

function extractName(headerText: string): string | undefined {
  const lines = headerText.split('\n').map((l) => l.trim()).filter(Boolean)
  for (const line of lines.slice(0, 6)) {
    if (/@|https?:|www\.|\+?\d[\d\s().-]{6,}/.test(line)) continue
    if (isHeading(line)) continue
    const cleaned = line.replace(/[^A-Za-z.'\-\s]/g, ' ').replace(/\s+/g, ' ').trim()
    const parts = cleaned.split(' ').filter(Boolean)
    if (parts.length < 1 || parts.length > 4) continue
    if (parts.some((p) => p.length < 2)) continue
    const capitalized = parts.filter((p) => /^[A-Z]/.test(p)).length
    if (capitalized >= Math.ceil(parts.length / 2)) return titleCase(cleaned.toLowerCase())
  }
  return undefined
}

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec'
const DATE_RANGE = new RegExp(
  `((?:${MONTHS})[a-z]*\\.?\\s*\\d{4}|\\d{4}|present|current|now)\\s*(?:-|–|—|to|until)\\s*((?:${MONTHS})[a-z]*\\.?\\s*\\d{4}|\\d{4}|present|current|now)`,
  'gi',
)

function parseYear(value: string): number | null {
  const match = value.match(/\d{4}/)
  return match ? Number(match[0]) : null
}

export function estimateYearsOfExperience(text: string): number {
  const now = new Date().getFullYear()
  const lower = text.toLowerCase()
  let totalMonths = 0
  for (const match of lower.matchAll(DATE_RANGE)) {
    const start = match[1] ?? ''
    const end = match[2] ?? ''
    const startYear = parseYear(start)
    if (!startYear) continue
    const endYear = /present|current|now/.test(end) ? now : parseYear(end)
    if (!endYear) continue
    let startMonth = 0
    const startMonthMatch = start.match(new RegExp(`(${MONTHS})`, 'i'))
    if (startMonthMatch) {
      startMonth = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
        startMonthMatch[1].slice(0, 3).toLowerCase(),
      )
    }
    let endMonth = 11
    const endMonthMatch = end.match(new RegExp(`(${MONTHS})`, 'i'))
    if (endMonthMatch) {
      endMonth = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
        endMonthMatch[1].slice(0, 3).toLowerCase(),
      )
    }
    const months = (endYear - startYear) * 12 + (endMonth - startMonth)
    if (months > 0 && months < 12 * 45) totalMonths += months
  }
  const explicit = lower.match(/(\d{1,2})(?:\.\d)?\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)/)
  const explicitYears = explicit ? Number(explicit[1]) : 0
  const fromRanges = totalMonths / 12
  return Math.max(explicitYears, Math.min(40, Math.round(fromRanges * 10) / 10))
}

function parseBulletEntries(block: string): string[] {
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[•\-*\u2022\d.)\s]+/, '').trim())
    .filter((line) => line.length > 2)
}

function parseEducation(block: string): EducationEntry[] {
  if (!block.trim()) return []
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
  const entries: EducationEntry[] = []
  let current: EducationEntry | null = null

  const degreeRegex =
    /(b\.?\s?tech|b\.?\s?e\b|bachelor|b\.?\s?sc|b\.?\s?ca|b\.?\s?com|m\.?\s?tech|m\.?\s?e\b|master|m\.?\s?sc|m\.?\s?ca|mba|ph\.?\s?d|diploma|higher secondary|hsc|sslc|12th|10th|intermediate|pursuing|class of)/i

  for (const line of lines) {
    const hasDegree = degreeRegex.test(line)
    const yearMatch = line.match(/(19|20)\d{2}(\s*[-–]\s*((19|20)\d{2}|present))?/i)
    const cgpaMatch = line.match(/(cgpa|gpa|percentage|grade)\s*[:\-]?\s*([\d.]+)/i)

    if (hasDegree || (yearMatch && !current) || (!current && line.length > 12)) {
      if (current) entries.push(current)
      current = {
        degree: hasDegree ? line.replace(/\s*\|\s*/g, ' | ').slice(0, 160) : line.slice(0, 160),
        institution: undefined,
        year: yearMatch ? yearMatch[0].replace(/\s*[-–]\s*/g, ' – ') : undefined,
        details: cgpaMatch ? `${cgpaMatch[1].toUpperCase()}: ${cgpaMatch[2]}` : undefined,
      }
    } else if (current) {
      if (!current.institution && /(university|college|institute|school|academy|polytechnic)/i.test(line)) {
        current.institution = line.slice(0, 160)
      } else if (cgpaMatch && !current.details) {
        current.details = `${cgpaMatch[1].toUpperCase()}: ${cgpaMatch[2]}`
      } else if (!current.year && yearMatch) {
        current.year = yearMatch[0]
      } else if (current.details) {
        current.details = `${current.details}; ${line.slice(0, 120)}`
      }
    }
  }
  if (current) entries.push(current)
  return entries.slice(0, 6)
}

const TECH_KEYWORD = /(python|java|javascript|typescript|react|node|sql|tensorflow|pytorch|flask|django|opencv|firebase|supabase|aws|docker|tailwind|next\.?js|kotlin|flutter|mongodb|postgres|mysql|redis|api|machine learning|deep learning|nlp|computer vision|llm|html|css|git|figma|matlab|arduino|streamlit)/i

function parseProjects(block: string): ProjectEntry[] {
  if (!block.trim()) return []
  const lines = block.split('\n')
  const entries: ProjectEntry[] = []
  let current: ProjectEntry | null = null
  let bulletBuffer: string[] = []

  const flushBullets = () => {
    if (current && bulletBuffer.length) {
      current.description = current.description ?? bulletBuffer.join(' ')
      current.technologies = normalizeSkillList([
        ...current.technologies,
        ...detectSkillNames(bulletBuffer.join(' ')),
      ])
      current.highlights = bulletBuffer.slice(0, 4).map((b) => b.slice(0, 220))
      bulletBuffer = []
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    const isBullet = /^[•\-*]/.test(rawLine.trim()) || /^\d+[.)]/.test(line)
    const shortish = line.replace(/^[•\-*\d.)\s]+/, '').length <= 90

    /* "Project Name — short description" on one flush-left line is a very common résumé layout. */
    const separatorMatch = line.match(/^([^—–:;|]{3,70}?)\s*(?:—|–|\s\|\s)\s*(.{15,})$/)
    const indented = /^\s/.test(rawLine)
    const inlineHeading = Boolean(
      separatorMatch && !indented && separatorMatch[1].split(/\s+/).length <= 10 && /^[A-Z0-9]/.test(separatorMatch[1]),
    )

    if (
      !isBullet &&
      (inlineHeading || (shortish && (current === null || /[:–-]$/.test(line) || TECH_KEYWORD.test(line) || line === line.replace(/[a-z]/g, (c) => c))))
    ) {
      flushBullets()
      const rawName = inlineHeading ? separatorMatch![1] : line.replace(/^[•\-*\d.)\s]+/, '').replace(/[|,:]\s*$/, '')
      const name = rawName.replace(/[|,:]\s*$/, '').trim()
      if (name.length > 2) {
        if (current) entries.push(current)
        current = { name: name.slice(0, 120), description: undefined, technologies: [], highlights: [] }
        const techInline = detectSkillNames(name)
        if (techInline.length) current.technologies = normalizeSkillList(techInline)
        if (inlineHeading) {
          const detail = separatorMatch![2].trim()
          current.description = detail.slice(0, 400)
          current.highlights = [detail.slice(0, 220)]
          const techDetail = detectSkillNames(detail)
          current.technologies = normalizeSkillList([...current.technologies, ...techDetail])
        }
        continue
      }
    }
    if (isBullet) {
      bulletBuffer.push(line.replace(/^[•\-*\d.)\s]+/, '').trim())
    } else if (current) {
      if (!current.description) current.description = line.slice(0, 400)
      else bulletBuffer.push(line)
    }
  }
  flushBullets()
  if (current) entries.push(current)
  return entries.filter((p) => p.name).slice(0, 10)
}

function parseExperience(block: string): ExperienceEntry[] {
  if (!block.trim()) return []
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
  const entries: ExperienceEntry[] = []
  let current: ExperienceEntry | null = null
  const bullets: string[] = []

  const flush = () => {
    if (current) {
      if (bullets.length) {
        current.description = current.description ?? bullets.slice(0, 5).join(' ')
        current.highlights = bullets.slice(0, 5).map((b) => b.slice(0, 220))
      }
      entries.push(current)
    }
    current = null
    bullets.length = 0
  }

  for (const line of lines) {
    const isBullet = /^[•\-*]/.test(line) || /^\d+[.)]/.test(line)
    if (isBullet) {
      bullets.push(line.replace(/^[•\-*\d.)\s]+/, '').trim())
      continue
    }
    const dateMatch = line.match(/((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}|\d{4})\s*(?:-|–|—|to)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}|\d{4}|present|current)/i)
    const roleLine = /(engineer|developer|intern|analyst|designer|consultant|manager|associate|trainee|scientist|architect|lead|specialist)/i.test(line)
    if (!isBullet && (roleLine || dateMatch) && line.length < 140) {
      flush()
      const withoutDates = line.replace(dateMatch?.[0] ?? '', '').replace(/[|,–-]\s*$/, '').trim()
      const parts = withoutDates.split(/\s*[|–—]\s*|\s+at\s+|\s*,\s*/).map((p) => p.trim()).filter(Boolean)
      current = {
        role: parts[0]?.slice(0, 100),
        company: parts[1]?.slice(0, 100),
        duration: dateMatch?.[0]?.replace(/\s*[-–—]\s*/g, ' – '),
      }
      continue
    }
    if (current && !current.description) current.description = line.slice(0, 400)
    else bullets.push(line)
  }
  flush()
  return entries.filter((e) => e.role || e.company).slice(0, 10)
}

function parseCertifications(block: string): string[] {
  return parseBulletEntries(block)
    .map((line) => line.replace(/\s{2,}/g, ' ').slice(0, 160))
    .filter((line) => line.length > 3)
    .slice(0, 15)
}

/**
 * Deterministic résumé parser — the local-engine counterpart of the Gemini extraction prompt.
 * Rules are transparent and conservative: anything not present in the text is left empty.
 */
export function parseResumeLocally(
  rawText: string,
  opts: { fileName?: string; targetRole?: string | null } = {},
): ResumeAnalysis {
  const text = normalizeResumeText(rawText)
  const sections = splitSections(text)
  const lower = text.toLowerCase()

  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/)?.[0]
  const phone = text.match(/(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3,5}\)?[\s.-]?){2,4}\d{2,4}/)?.[0]?.trim()
  const links = [...new Set((text.match(/https?:\/\/[^\s)"']+|www\.[^\s)"']+|(?:linkedin|github|gitlab)\.com\/[^\s)"']+/gi) ?? []).map((l) => l.replace(/[.,;)]+$/, '')))].slice(0, 6)
  const locationMatch = text.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?,\s*(?:[A-Z][a-z]+\s)?(?:India|USA|UK|Canada|Germany|Australia|Singapore|UAE|Netherlands|Remote))\b/)

  const skillDefs = detectSkills(text)
  const skillsSection = sections.skills ?? ''
  const sectionSkills = normalizeSkillList(
    skillsSection
      .split(/[\n,;|•]|\s{3,}|\s-\s/)
      .map((s) => s.replace(/^[^A-Za-z]*/, '').trim())
      .filter((s) => s.length > 1 && s.length < 40),
    60,
  )
  const skillNames = normalizeSkillList([...sectionSkills, ...skillDefs.map((d) => d.name)], 60)
  const technicalFromSection = sectionSkills.filter((skill) => detectSkills(skill).length > 0)
  const softFromSection = sectionSkills.filter((skill) => SOFT_SKILL_HINTS.some((hint) => skill.toLowerCase().includes(hint)))
  // Anything in the skills section that the taxonomy does not know is still a real skill.
  const unknownSectionSkills = sectionSkills.filter(
    (skill) => !technicalFromSection.includes(skill) && !softFromSection.includes(skill) && skill.split(' ').length <= 4,
  )

  const technical_skills = normalizeSkillList([
    ...technicalFromSection,
    ...unknownSectionSkills,
    ...skillsByCategory(skillDefs, 'language'),
    ...skillsByCategory(skillDefs, 'framework'),
    ...skillsByCategory(skillDefs, 'tool'),
    ...skillsByCategory(skillDefs, 'database'),
    ...skillsByCategory(skillDefs, 'cloud'),
    ...skillsByCategory(skillDefs, 'concept'),
  ], 60)

  const soft_skills = normalizeSkillList(
    [...softFromSection, ...softFromSection.length ? [] : ['Communication', 'Problem Solving']],
    15,
  )

  const projects = parseProjects(sections.projects ?? '')
  const experience = parseExperience(sections.experience ?? '')
  const internships = parseExperience(sections.internships ?? '')
  const education = parseEducation(sections.education ?? '')

  const years = estimateYearsOfExperience([sections.experience, sections.internships].filter(Boolean).join('\n'))
  const studentish = /student|pursuing|final year|pre[- ]final|b\.?tech\s*\d|bachelor.*pursuing/i.test(lower)
  const seniority: ResumeAnalysis['seniority'] =
    years >= 8 ? 'senior' : years >= 3 ? 'mid' : years >= 1 ? 'junior' : studentish || !experience.length ? 'student' : 'fresher'

  const summary =
    (sections.summary ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join(' ') ||
    (projects[0]
      ? `Candidate profile built from ${projects.length} project${projects.length > 1 ? 's' : ''}, ${experience.length} role${experience.length === 1 ? '' : 's'} and ${skillNames.length} identified skills.`
      : `Candidate profile built from the uploaded résumé with ${skillNames.length} identified skills.`)

  const headerText = sections.header ?? text.split('\n').slice(0, 6).join('\n')
  const name = extractName(headerText)
  const headlineLine = (sections.header ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /(engineer|developer|intern|student|analyst|designer|scientist|consultant)/i.test(l) && l.length < 90)

  const confidenceFields = [
    Boolean(name),
    Boolean(email),
    skillNames.length > 3,
    education.length > 0,
    projects.length > 0 || experience.length > 0,
    years > 0,
    Boolean(summary),
  ]
  const confidence = Math.min(0.98, 0.25 + confidenceFields.filter(Boolean).length * 0.11)

  const keywords = keywordFrequency(text, 25).map((k) => k.term)

  return {
    name,
    headline: headlineLine?.slice(0, 120) ?? (opts.targetRole ? `Aspiring ${opts.targetRole}` : undefined),
    email,
    phone: phone && phone.replace(/\D/g, '').length >= 7 ? phone : undefined,
    location: locationMatch?.[1],
    links,
    summary,
    education,
    skills: skillNames,
    technical_skills,
    soft_skills,
    programming_languages: normalizeSkillList(
      skillDefs
        .filter((d) => d.category === 'language')
        .map((d) => d.name)
        .concat(sectionSkills.filter((s) => /^(python|java(?:script)?|typescript|c\+\+|c|sql|go|rust|kotlin|swift|php|r|scala|dart|matlab)$/i.test(s))),
    ),
    frameworks: normalizeSkillList(skillDefs.filter((d) => d.category === 'framework').map((d) => d.name)),
    tools: normalizeSkillList(skillDefs.filter((d) => d.category === 'tool').map((d) => d.name)),
    projects,
    internships,
    experience,
    certifications: parseCertifications(sections.certifications ?? ''),
    achievements: parseCertifications(sections.achievements ?? ''),
    years_experience: years,
    seniority,
    confidence,
    engine: 'local',
  }
}

export function resumeStats(resume: ResumeAnalysis) {
  return {
    words: significantWords([resume.summary ?? '', ...resume.skills, ...resume.projects.map((p) => p.description ?? '')].join(' ')).length,
    skills: resume.skills.length,
    projects: resume.projects.length,
    roles: resume.experience.length + resume.internships.length,
  }
}
