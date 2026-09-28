import PDFDocument from 'pdfkit'
import type { Row } from '../db/store.js'

/**
 * Professional PDF rendering of a completed interview report.
 * Uses PDFKit's built-in fonts, so no external font files are required.
 */

const BRAND = 'VozLook Studios'
const PRODUCT = 'VozHireQ'
const ACCENT = '#7C5CFF'
const PAGE_BG = '#0B0B12'
const INK = '#F2F4F8'
const MUTED = '#9BA2B8'
const LINE = '#2A2F3D'
const GOOD = '#34D399'
const WARN = '#F59E0B'
const BAD = '#DC2626'

/** PDFKit's standard fonts are WinAnsi-encoded — replace anything outside that range. */
function safe(value: unknown, max = 4000): string {
  const text = typeof value === 'string' ? value : value == null ? '' : String(value)
  return text
    .replace(/[\u2192\u27A1]/g, '->')
    .replace(/[\u00D7]/g, 'x')
    .replace(/[\u2713\u2714]/g, '-')
    .replace(/[\u2717\u2718]/g, '-')
    .replace(/[\u2022\u25CF\u25AA\u25A0]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\u00A0/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\u0000-\u00FF]/g, '')
    .slice(0, max)
}

function scoreColor(value: number): string {
  if (value >= 75) return GOOD
  if (value >= 55) return WARN
  return BAD
}

export interface ReportPdfInput {
  candidateName: string
  candidateEmail?: string | null
  targetRole: string
  interview: Row
  report: Row
}

export async function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 54, bottom: 66, left: 54, right: 54 },
    bufferPages: true,
    info: {
      Title: `${PRODUCT} Report - ${input.targetRole}`,
      Author: BRAND,
      Subject: 'AI mock interview practice report',
      Creator: PRODUCT,
    },
  })

  const chunks: Buffer[] = []
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const left = doc.page.margins.left
  let y = doc.page.margins.top

  const ensure = (height: number) => {
    if (y + height > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
      y = doc.page.margins.top
    }
  }

  const heading = (text: string) => {
    ensure(46)
    y += 12
    doc.fillColor(ACCENT).fontSize(10.5).font('Helvetica-Bold').text(safe(text).toUpperCase(), left, y, { characterSpacing: 1 })
    y += 16
    doc.moveTo(left, y).lineTo(left + pageWidth, y).lineWidth(0.8).strokeColor(LINE).stroke()
    y += 10
    doc.fillColor(INK).font('Helvetica')
  }

  const paragraph = (text: string, opts: { color?: string; size?: number; bold?: boolean } = {}) => {
    const body = safe(text)
    if (!body) return
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size ?? 10).fillColor(opts.color ?? INK)
    const height = doc.heightOfString(body, { width: pageWidth, lineGap: 2 })
    ensure(height + 4)
    doc.text(body, left, y, { width: pageWidth, lineGap: 2 })
    y = doc.y + 6
  }

  const bullets = (items: unknown[], marker = '-') => {
    const list = (Array.isArray(items) ? items : []).map((item) => safe(item, 600)).filter(Boolean)
    if (!list.length) return
    doc.font('Helvetica').fontSize(10).fillColor(INK)
    for (const item of list) {
      const height = doc.heightOfString(item, { width: pageWidth - 16, lineGap: 2 })
      ensure(height + 2)
      doc.fillColor(ACCENT).text(marker, left, y, { width: 12, continued: false })
      doc.fillColor(INK).text(item, left + 14, y, { width: pageWidth - 14, lineGap: 2 })
      y = doc.y + 3
    }
    y += 4
  }

  const scoreBar = (label: string, value: number) => {
    ensure(24)
    const barWidth = pageWidth * 0.55
    const barX = left + pageWidth - barWidth
    doc.font('Helvetica').fontSize(10).fillColor(INK).text(safe(label, 60), left, y + 2, { width: pageWidth - barWidth - 12 })
    doc.roundedRect(barX, y + 3, barWidth, 9).fillColor('#232838').fill()
    const filled = Math.max(0, Math.min(1, value / 100)) * barWidth
    if (filled > 0) doc.roundedRect(barX, y + 3, filled, 9).fillColor(scoreColor(value)).fill()
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(scoreColor(value))
      .text(`${Math.round(value)}%`, barX + barWidth + 6, y + 1, { width: 40 })
    y += 22
  }

  /* ------------------------------- cover ------------------------------- */
  // Premium dark styling: every page is painted in the VozHireQ palette before content is drawn.
  doc.on('pageAdded', () => {
    doc.rect(0, 0, doc.page.width, doc.page.height).fillColor(PAGE_BG).fill()
    doc.rect(0, 0, doc.page.width, 3).fillColor(ACCENT).fill()
  })

  doc.rect(0, 0, doc.page.width, 128).fillColor(PAGE_BG).fill()
  doc.rect(0, 0, doc.page.width, 6).fillColor(ACCENT).fill()
  doc.rect(0, 124, doc.page.width, 4).fillColor('#22D3EE').fill()
  y = doc.page.margins.top + 8
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#9B86FF').text(BRAND.toUpperCase(), left, y, { characterSpacing: 2 })
  y = doc.y + 4
  doc.font('Helvetica').fontSize(8).fillColor('#8A90A6').text('AI-Powered Interview Intelligence  |  ' + PRODUCT + '  |  Practice. Perform. Grow.', left, y)
  y = doc.y + 20

  doc.font('Helvetica-Bold').fontSize(26).fillColor('#F6F7FB').text('Interview Practice Report', left, y)
  y = doc.y + 6
  doc.font('Helvetica').fontSize(11).fillColor('#9BA2B8').text(safe(input.targetRole, 120), left, y)
  y = doc.y + 8
  doc.font('Helvetica').fontSize(9).fillColor('#6C7286').text('Generated by VozHireQ  |  Practice metrics only - not a hiring decision', left, y)
  y = 150

  const metaRows: [string, string][] = [
    ['Candidate', input.candidateName || 'Candidate'],
    ['Interview type', safe(input.interview.interview_type, 40)],
    ['Difficulty', safe(input.interview.difficulty, 40)],
    ['Mode', safe(input.interview.interview_mode, 40)],
    ['Questions', String(input.report.report_json?.answered_count ?? input.interview.question_count ?? '')],
    ['Date', new Date(String(input.interview.completed_at ?? input.interview.created_at)).toUTCString()],
  ]
  ensure(metaRows.length * 16 + 10)
  for (const [key, value] of metaRows) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text(`${key}:`, left, y, { width: 110, continued: false })
    doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(value, left + 118, y, { width: pageWidth - 118 })
    y = doc.y + 3
  }

  y += 14
  heading('Practice metrics')
  scoreBar('Overall', Number(input.report.overall_score ?? 0))
  scoreBar('Technical knowledge', Number(input.report.technical_score ?? 0))
  scoreBar('Communication', Number(input.report.communication_score ?? 0))
  scoreBar('Problem solving', Number(input.report.problem_solving_score ?? 0))
  scoreBar('Answer relevance', Number(input.report.relevance_score ?? 0))
  scoreBar('Delivery confidence', Number(input.report.confidence_score ?? 0))
  scoreBar('Role alignment', Number(input.report.role_alignment_score ?? 0))

  heading('Interview summary')
  paragraph(input.report.summary ?? '', { size: 10 })

  heading('Strengths')
  bullets(input.report.strengths, '+')

  heading('Areas to improve')
  bullets(input.report.weaknesses, '!')

  heading('Recommended topics')
  bullets(input.report.recommended_topics, '-')

  heading('Personalised practice plan')
  const plan = (Array.isArray(input.report.improvement_plan) ? input.report.improvement_plan : []) as {
    week: number
    focus: string
    actions: string[]
  }[]
  for (const week of plan) {
    ensure(40)
    paragraph(`Week ${week.week}: ${safe(week.focus, 120)}`, { bold: true, size: 10.5, color: ACCENT })
    bullets(week.actions, '-')
  }

  /* -------------------------- question review -------------------------- */
  const reviews = (Array.isArray(input.report.question_reviews) ? input.report.question_reviews : []) as any[]
  if (reviews.length) {
    const answeredOnly = reviews.filter((r) => (r.answer ?? '').toString().trim().length)
    heading(`Question-by-question review (${answeredOnly.length}/${reviews.length} answered)`)
    for (const review of reviews) {
      ensure(120)
      y += 6
      doc.moveTo(left, y).lineTo(left + pageWidth, y).lineWidth(0.5).strokeColor(LINE).stroke()
      y += 8
      paragraph(`Q${review.question_number} - ${safe(review.question, 300)}`, { bold: true, size: 10.5 })
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
      const scores = review.scores ?? {}
      doc.text(
        safe(
          `relevance ${Math.round(scores.relevance ?? 0)}  |  technical ${Math.round(scores.technical_accuracy ?? 0)}  |  completeness ${Math.round(
            scores.completeness ?? 0,
          )}  |  clarity ${Math.round(scores.clarity ?? 0)}  |  structure ${Math.round(scores.structure ?? 0)}  |  problem solving ${Math.round(
            scores.problem_solving ?? 0,
          )}  |  confidence ${Math.round(scores.confidence ?? 0)}`,
          300,
        ),
        left,
        y,
      )
      y = doc.y + 6
      paragraph(review.answer ? `Answer: ${safe(review.answer, 900)}` : 'Answer: (not answered)', { size: 9.5 })
      if ((review.what_worked ?? []).length) {
        paragraph('What worked', { bold: true, size: 9.5, color: GOOD })
        bullets(review.what_worked, '+')
      }
      if ((review.what_to_improve ?? []).length) {
        paragraph('What to improve', { bold: true, size: 9.5, color: WARN })
        bullets(review.what_to_improve, '!')
      }
      if (review.better_approach) {
        paragraph('A stronger approach', { bold: true, size: 9.5, color: ACCENT })
        paragraph(review.better_approach, { size: 9.5 })
      }
    }
  }

  heading('How scoring works')
  const methodology = input.report.scoring_methodology ?? {}
  const dimensions = (methodology.dimensions ?? []) as { label: string; weight: number; formula: string }[]
  for (const dimension of dimensions) {
    paragraph(`${safe(dimension.label, 60)} (weight ${Math.round((dimension.weight ?? 0) * 100)}%): ${safe(dimension.formula, 220)}`, { size: 9 })
  }
  paragraph(safe(methodology.overall ?? '', 300), { size: 9 })
  paragraph(safe(methodology.confidence ?? '', 400), { size: 9 })

  heading('Disclaimer')
  paragraph(
    `These metrics are practice and self-improvement signals generated from the answers recorded in this session. They are not a hiring decision, not an assessment of personality, honesty, intelligence or mental state, and they do not predict employment outcomes. Use them as coaching input, not as a verdict. ${PRODUCT} is an interview preparation tool by ${BRAND}.`,
    { size: 9, color: MUTED },
  )

  /* --------------------------- footers/pages --------------------------- */
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        `${BRAND}  |  ${PRODUCT}  |  Generated ${new Date().toUTCString()}`,
        doc.page.margins.left,
        doc.page.height - 46,
        { width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 60, lineBreak: false },
      )
    doc.text(`Page ${i + 1} of ${range.count}`, doc.page.width - doc.page.margins.right - 60, doc.page.height - 46, {
      width: 60,
      align: 'right',
      lineBreak: false,
    })
  }

  doc.end()
  return finished
}
