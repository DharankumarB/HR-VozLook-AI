import { ApiError } from '../lib/errors.js'

/** Pull the first JSON object/array out of a model response, tolerating prose or code fences. */
export function extractJson<T = unknown>(raw: string): T {
  if (!raw || !raw.trim()) throw ApiError.upstream('AI returned an empty response')
  let text = raw.trim()

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) text = fence[1].trim()

  const firstBrace = text.search(/[[{]/)
  if (firstBrace === -1) throw ApiError.upstream('AI response did not contain JSON')
  const opener = text[firstBrace]
  const closer = opener === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = firstBrace; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === opener) depth++
    else if (ch === closer) {
      depth--
      if (depth === 0) {
        const candidate = text.slice(firstBrace, i + 1)
        return parseLenient(candidate)
      }
    }
  }
  return parseLenient(text.slice(firstBrace))
}

function parseLenient(candidate: string): any {
  try {
    return JSON.parse(candidate)
  } catch {
    // Common model glitches: trailing commas, smart quotes, unescaped newlines inside strings.
    const repaired = candidate
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/\n(?=[^"]*"(?:\s*[,}]))/g, '\\n')
    try {
      return JSON.parse(repaired)
    } catch {
      throw ApiError.upstream('AI returned malformed JSON')
    }
  }
}

export function clampScore(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function toStringArray(value: unknown, max = 12): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''))
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, max)
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/\n|;|,(?=\s*[A-Z])/)
      .map((s) => s.replace(/^[-•*\d.\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, max)
  }
  return []
}

export function cleanText(value: unknown, fallback = '', max = 4000): string {
  if (typeof value === 'string') return value.trim().slice(0, max)
  if (typeof value === 'number') return String(value)
  return fallback
}

export function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}
