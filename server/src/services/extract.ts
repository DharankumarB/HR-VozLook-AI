import { createRequire } from 'node:module'
import mammoth from 'mammoth'
import { ApiError } from '../lib/errors.js'

const require = createRequire(import.meta.url)

// pdf-parse's entry file ships a debug branch that executes when `module.parent` is undefined
// (which is the case under ESM), so we import the library module directly.
let pdfParse: ((buffer: Buffer) => Promise<{ text: string; numpages?: number; info?: unknown }>) | null = null
function loadPdfParse() {
  if (pdfParse) return pdfParse
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('pdf-parse/lib/pdf-parse.js')
    pdfParse = mod?.default ?? mod
  } catch {
    const mod = require('pdf-parse')
    pdfParse = mod?.default ?? mod
  }
  return pdfParse!
}

export const ACCEPTED_RESUME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
]

export const ACCEPTED_JOB_TYPES = [...ACCEPTED_RESUME_TYPES, 'text/csv']

export interface ExtractedText {
  text: string
  pages?: number
  method: 'pdf' | 'docx' | 'text'
}

export function extensionOf(fileName: string): string {
  return (fileName.split('.').pop() ?? '').toLowerCase()
}

export function assertSupportedUpload(fileName: string, mimeType: string, allowed = ACCEPTED_RESUME_TYPES) {
  const ext = extensionOf(fileName)
  const allowedExt = ['pdf', 'docx', 'doc', 'txt', 'md']
  const typeOk = allowed.includes(mimeType)
  const extOk = allowedExt.includes(ext)
  if (!typeOk && !extOk) {
    throw ApiError.badRequest('Unsupported file type. Upload a PDF, DOCX or TXT file.')
  }
  if (ext === 'doc' && mimeType === 'application/msword') {
    // legacy .doc binary format is not supported by the extractor
    throw ApiError.badRequest('Legacy .doc files are not supported. Please export your résumé as PDF or DOCX.')
  }
}

export function sanitizeExtractedText(raw: string): string {
  return raw
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]+$/gm, '')
    .trim()
    .slice(0, 200_000)
}

/** Returns true when the extracted text has enough signal to analyse. */
export function hasUsableText(text: string): boolean {
  const meaningful = text.replace(/[^A-Za-z0-9]/g, '')
  return meaningful.length >= 150
}

export async function extractText(buffer: Buffer, fileName: string): Promise<ExtractedText> {
  const ext = extensionOf(fileName)
  if (buffer.byteLength === 0) throw ApiError.badRequest('That file is empty.')

  try {
    if (ext === 'pdf') {
      const parse = loadPdfParse()
      const result = await parse(buffer)
      const text = sanitizeExtractedText(result?.text ?? '')
      if (!hasUsableText(text)) {
        throw ApiError.badRequest(
          'We could not read any text from that PDF — it looks like a scanned image. Upload a text-based PDF or a DOCX file.',
        )
      }
      return { text, pages: result?.numpages, method: 'pdf' }
    }

    if (ext === 'docx') {
      const result = await mammoth.extractRawText({ buffer })
      const text = sanitizeExtractedText(result.value ?? '')
      if (!hasUsableText(text)) throw ApiError.badRequest('We could not read any text from that DOCX file.')
      return { text, method: 'docx' }
    }

    if (ext === 'txt' || ext === 'md') {
      const text = sanitizeExtractedText(buffer.toString('utf8'))
      if (!hasUsableText(text)) throw ApiError.badRequest('That text file does not contain enough content to analyse.')
      return { text, method: 'text' }
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    console.error('[vozlook][extract] failed:', (error as Error).message)
    throw ApiError.badRequest('We could not read that file. Please try a PDF or DOCX export of your résumé.')
  }

  throw ApiError.badRequest('Unsupported file type. Upload a PDF, DOCX or TXT file.')
}
