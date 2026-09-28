import { getStore } from '../db/index.js'
import type { Row } from '../db/store.js'
import { getAiEngine } from '../ai/index.js'
import type { JobAnalysis } from '../ai/types.js'
import { parseJobLocally } from '../ai/local/job.js'
import { normalizeSkillList } from '../ai/local/skills.js'
import { ApiError } from '../lib/errors.js'

function preferArray<T>(ai: T[] | undefined | null, local: T[] | undefined | null): T[] {
  if (ai && ai.length) return ai
  return local ?? []
}

export function mergeJobAnalysis(ai: JobAnalysis | null, local: JobAnalysis): JobAnalysis {
  if (!ai) return local
  return {
    ...local,
    ...ai,
    title: ai.title || local.title,
    company: ai.company || local.company,
    seniority: ai.seniority || local.seniority,
    required_skills: normalizeSkillList(preferArray(ai.required_skills, local.required_skills), 30),
    preferred_skills: normalizeSkillList(preferArray(ai.preferred_skills, local.preferred_skills), 25),
    responsibilities: preferArray(ai.responsibilities, local.responsibilities),
    technical_requirements: preferArray(ai.technical_requirements, local.technical_requirements),
    soft_requirements: preferArray(ai.soft_requirements, local.soft_requirements),
    experience_requirements: ai.experience_requirements && ai.experience_requirements !== 'Not specified' ? ai.experience_requirements : local.experience_requirements,
    keywords: preferArray(ai.keywords, local.keywords),
    domain: ai.domain || local.domain,
    confidence: Math.max(ai.confidence ?? 0, local.confidence),
  }
}

export async function createJobDescription(input: {
  userId: string
  title?: string
  company?: string
  description: string
  targetRole?: string | null
}): Promise<Row> {
  const store = getStore()
  const description = input.description.trim()
  if (description.length < 60) {
    throw ApiError.badRequest('Paste a job description with at least a few bullet points so we can analyse the requirements.')
  }

  const engine = getAiEngine()
  const local = parseJobLocally({ title: input.title, company: input.company, description, targetRole: input.targetRole })
  let analysis = local
  try {
    const ai = await engine.analyzeJob({
      title: input.title,
      company: input.company,
      description,
      targetRole: input.targetRole ?? null,
    })
    analysis = mergeJobAnalysis(ai, local)
  } catch (error) {
    console.error('[vozlook][job] analysis fell back to local parse:', (error as Error).message)
  }

  const existing = await store.findMany<Row>('job_descriptions', { where: { user_id: input.userId } })
  if (existing.length) await store.remove('job_descriptions', { user_id: input.userId })

  return store.insert('job_descriptions', {
    user_id: input.userId,
    title: analysis.title || input.title || 'Target role',
    company: analysis.company || input.company || null,
    description,
    parsed_requirements: { ...analysis, engine: engine.label },
  })
}

export async function getLatestJob(userId: string): Promise<Row | null> {
  return getStore().findOne<Row>('job_descriptions', {
    where: { user_id: userId },
    order: { column: 'created_at', ascending: false },
  })
}

export function jobAnalysisOf(job: Row | null): JobAnalysis | null {
  if (!job) return null
  const parsed = job.parsed_requirements as JobAnalysis | null
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.required_skills)) return parsed
  if (job.description) return parseJobLocally({ description: String(job.description) })
  return null
}

export async function deleteJob(userId: string, jobId: string): Promise<void> {
  const store = getStore()
  const job = await store.findById<Row>('job_descriptions', jobId)
  if (!job || job.user_id !== userId) throw ApiError.notFound('We could not find that job description.')
  await store.remove('job_descriptions', { id: jobId, user_id: userId })
}
