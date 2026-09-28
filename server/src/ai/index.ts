import { aiEnabled, aiEngineLabel, env } from '../env.js'
import type { AiEngine } from './types.js'
import { GeminiEngine } from './gemini.js'
import { LocalEngine } from './local/engine.js'

/**
 * Facade that guarantees a usable AI engine at all times.
 *
 * Primary  : Gemini (only when GEMINI_API_KEY is configured)
 * Fallback : the deterministic VozLook analysis engine
 *
 * If a provider call fails mid-interview, the fallback keeps the session alive instead of
 * presenting the user with a broken screen. The failure is logged server-side only.
 */
class ResilientEngine implements AiEngine {
  readonly kind: 'gemini' | 'local'
  readonly label: string
  private primary: AiEngine | null
  private fallback: AiEngine

  constructor(primary: AiEngine | null, fallback: AiEngine) {
    this.primary = primary
    this.fallback = fallback
    this.kind = primary ? primary.kind : fallback.kind
    this.label = primary ? primary.label : fallback.label
  }

  private async run<T>(op: string, primaryCall: (engine: AiEngine) => Promise<T>, fallbackCall: () => Promise<T>): Promise<T> {
    if (!this.primary) return fallbackCall()
    try {
      return await primaryCall(this.primary)
    } catch (error) {
      console.error(`[vozlook][ai] ${op} failed on ${this.primary.label} — using local engine:`, (error as Error).message)
      return fallbackCall()
    }
  }

  analyzeResume = (input: Parameters<AiEngine['analyzeResume']>[0]) =>
    this.run('analyzeResume', (e) => e.analyzeResume(input), () => this.fallback.analyzeResume(input))

  analyzeJob = (input: Parameters<AiEngine['analyzeJob']>[0]) =>
    this.run('analyzeJob', (e) => e.analyzeJob(input), () => this.fallback.analyzeJob(input))

  generateQuestion = (ctx: Parameters<AiEngine['generateQuestion']>[0]) =>
    this.run('generateQuestion', (e) => e.generateQuestion(ctx), () => this.fallback.generateQuestion(ctx))

  evaluateAnswer = (ctx: Parameters<AiEngine['evaluateAnswer']>[0]) =>
    this.run('evaluateAnswer', (e) => e.evaluateAnswer(ctx), () => this.fallback.evaluateAnswer(ctx))

  maybeFollowUp = (ctx: Parameters<AiEngine['maybeFollowUp']>[0]) =>
    this.run('maybeFollowUp', (e) => e.maybeFollowUp(ctx), () => this.fallback.maybeFollowUp(ctx))

  generateReport = (input: Parameters<AiEngine['generateReport']>[0]) =>
    this.run('generateReport', (e) => e.generateReport(input), () => this.fallback.generateReport(input))

  coach = (input: Parameters<AiEngine['coach']>[0]) =>
    this.run('coach', (e) => e.coach(input), () => this.fallback.coach(input))
}

let engine: ResilientEngine | null = null

export function getAiEngine(): ResilientEngine {
  if (!engine) {
    engine = new ResilientEngine(aiEnabled ? new GeminiEngine() : null, new LocalEngine())
  }
  return engine
}

export function aiStatus() {
  return {
    engine: aiEngineLabel,
    kind: aiEnabled ? 'gemini' : 'local',
    geminiConfigured: Boolean(env.ai.geminiApiKey),
    model: env.ai.geminiModel,
  }
}

export type { AiEngine }
