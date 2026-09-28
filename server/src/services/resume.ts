import { getStore } from '../db/index.js'
import type { Row } from '../db/store.js'
import { getAiEngine } from '../ai/index.js'
import type { ResumeAnalysis } from '../ai/types.js'
import { parseResumeLocally } from '../ai/local/resume.js'
import { normalizeSkillList } from '../ai/local/skills.js'
import { ApiError } from '../lib/errors.js'
import { extractText } from './extract.js'
import { deleteObject, putObject } from './storage.js'

function preferArray<T>(ai: T[] | undefined | null, local: T[] | undefined | null): T[] {
  if (ai && ai.length) return ai
  return local ?? []
}

/**
 * Merge the provider extraction with the deterministic parse.
 * The provider wins on content it produced; the local parser fills anything left empty so the
 * candidate profile is never blank because a model returned a partial object.
 */
export function mergeResumeAnalysis(ai: ResumeAnalysis | null, local: ResumeAnalysis): ResumeAnalysis {
  if (!ai) return local
  return {
    ...local,
    ...ai,
    name: ai.name || local.name,
    headline: ai.headline || local.headline,
    email: ai.email || local.email,
    phone: ai.phone || local.phone,
    location: ai.location || local.location,
    links: preferArray(ai.links, local.links),
    summary: ai.summary || local.summary,
    education: preferArray(ai.education, local.education),
    skills: normalizeSkillList(preferArray(ai.skills, local.skills), 60),
    technical_skills: normalizeSkillList(preferArray(ai.technical_skills, local.technical_skills), 60),
    soft_skills: normalizeSkillList(preferArray(ai.soft_skills, local.soft_skills), 20),
    programming_languages: normalizeSkillList(preferArray(ai.programming_languages, local.programming_languages), 30),
    frameworks: normalizeSkillList(preferArray(ai.frameworks, local.frameworks), 30),
    tools: normalizeSkillList(preferArray(ai.tools, local.tools), 40),
    projects: preferArray(ai.projects, local.projects),
    internships: preferArray(ai.internships, local.internships),
    experience: preferArray(ai.experience, local.experience),
    certifications: preferArray(ai.certifications, local.certifications),
    achievements: preferArray(ai.achievements, local.achievements),
    years_experience: ai.years_experience > 0 ? ai.years_experience : local.years_experience,
    seniority: ai.seniority || local.seniority,
    confidence: Math.max(ai.confidence ?? 0, local.confidence),
  }
}

export interface AnalyzeResumeOptions {
  userId: string
  fileName: string
  mimeType: string
  buffer: Buffer
  targetRole?: string | null
}

export async function uploadAndAnalyzeResume(options: AnalyzeResumeOptions): Promise<Row> {
  const store = getStore()
  const extracted = await extractText(options.buffer, options.fileName)
  const stored = await putObject({
    userId: options.userId,
    bucket: 'resumes',
    fileName: options.fileName,
    buffer: options.buffer,
    contentType: options.mimeType || 'application/octet-stream',
  })

  const engine = getAiEngine()
  const local = parseResumeLocally(extracted.text, { fileName: options.fileName, targetRole: options.targetRole })
  let analysis = local
  try {
    const ai = await engine.analyzeResume({
      text: extracted.text,
      fileName: options.fileName,
      targetRole: options.targetRole ?? null,
    })
    analysis = mergeResumeAnalysis(ai, local)
  } catch (error) {
    // The engine facade already falls back; this guards against unexpected errors.
    console.error('[vozlook][resume] analysis fell back to local parse:', (error as Error).message)
  }

  // Replace the previous résumé for this user (single active résumé per candidate).
  const existing = await store.findMany<Row>('resumes', { where: { user_id: options.userId } })
  for (const row of existing) {
    if (row.file_url) await deleteObject(row.file_url)
  }
  if (existing.length) await store.remove('resumes', { user_id: options.userId })

  return store.insert('resumes', {
    user_id: options.userId,
    file_name: options.fileName,
    file_url: stored.url,
    mime_type: options.mimeType || 'application/octet-stream',
    size_bytes: stored.size,
    extracted_text: extracted.text,
    parsed_data: { ...analysis, pages: extracted.pages, extraction: extracted.method, engine: engine.label },
  })
}

export async function getActiveResume(userId: string): Promise<Row | null> {
  return getStore().findOne<Row>('resumes', { where: { user_id: userId }, order: { column: 'created_at', ascending: false } })
}

export function resumeAnalysisOf(resume: Row | null): ResumeAnalysis | null {
  if (!resume) return null
  const parsed = resume.parsed_data as ResumeAnalysis | null
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.skills)) return parsed
  if (resume.extracted_text) return parseResumeLocally(String(resume.extracted_text))
  return null
}

export async function deleteResume(userId: string, resumeId: string): Promise<void> {
  const store = getStore()
  const resume = await store.findById<Row>('resumes', resumeId)
  if (!resume || resume.user_id !== userId) throw ApiError.notFound('We could not find that résumé.')
  if (resume.file_url) await deleteObject(resume.file_url)
  await store.remove('resumes', { id: resumeId, user_id: userId })
}
