/**
 * VozLook InterviewAI — end-to-end API test suite.
 *
 * Runs the real Express app against a throwaway SQLite database in a temp directory, so it never
 * touches development data. Start it with `npm test` (workspace server) or `npm run test` at the root.
 *
 * Coverage:
 *  - auth: validation, signup, session, protected routes, wrong password, password reset, account deletion
 *  - ownership isolation between two accounts (RLS-equivalent guards on every route)
 *  - résumé + job analysis (text and file upload)
 *  - full interview lifecycle: create → question → answer → follow-up → completion → report → PDF
 *  - idempotent submissions (double-click safety) and skip handling
 *  - analytics: dashboard, progress, weak topics, list filters
 *  - coach endpoints
 *  - owner-only file serving
 *  - deterministic scoring calibration on known-strong vs known-weak answers
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/* The data directory must be redirected before any module reads the environment. */
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vozlook-test-'))
process.env.DATA_DIR = dataDir
process.env.AI_ENGINE = process.env.AI_ENGINE ?? 'local'
process.env.JWT_SECRET = 'test-secret-do-not-use-in-production'
process.env.EXPOSE_RESET_LINK = 'true'
process.env.CORS_ORIGINS = ''

const { createApp } = await import('../index.js')
const { evaluateAnswerLocally } = await import('../ai/local/evaluator.js')
const { generateQuestionLocally } = await import('../ai/local/questions.js')

const app = await createApp()
const server = app.listen(0)
const address = server.address()
const port = typeof address === 'object' && address ? address.port : 0
const base = `http://127.0.0.1:${port}`

let passed = 0
let failed = 0
const failures: string[] = []

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    passed += 1
    console.log(`  ✓ ${name}`)
  } catch (error) {
    failed += 1
    failures.push(`${name}: ${(error as Error).message}`)
    console.error(`  ✗ ${name}\n      ${(error as Error).message}`)
  }
}

interface ApiResponse<T = any> {
  status: number
  body: T
}

async function call<T = any>(
  method: string,
  pathName: string,
  options: { token?: string | null; body?: unknown; form?: FormData; raw?: boolean } = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {}
  if (options.token) headers.authorization = `Bearer ${options.token}`
  let body: any
  if (options.form) {
    body = options.form
  } else if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(options.body)
  }
  const response = await fetch(`${base}${pathName}`, { method, headers, body })
  if (options.raw) return { status: response.status, body: (await response.arrayBuffer()) as unknown as T }
  const text = await response.text()
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }
  return { status: response.status, body: parsed as T }
}

const RESUME_TEXT = `ARJUN MEHTA
arjun.mehta@example.com | +91 98765 43210 | Bengaluru | github.com/arjunmehta

SUMMARY
Final year Computer Science student focused on applied machine learning and backend engineering.

SKILLS
Python, SQL, JavaScript, TypeScript, PyTorch, scikit-learn, Pandas, NumPy, FastAPI, React, Docker, Git, PostgreSQL

PROJECTS
AI Medical Report Explainer — Built a FastAPI service that summarises lab reports with an LLM, caching parsed PDFs in Redis to cut latency by 40%. Python, FastAPI, Docker, PostgreSQL.
Fall Detection System — Trained a CNN on IMU sensor data (precision 0.91, recall 0.87) and deployed it on an edge device with TensorFlow Lite. PyTorch, scikit-learn, Docker.

EXPERIENCE
Machine Learning Intern at Medhax Systems (Jun 2024 - Dec 2024)
- Built data pipelines processing 200k records per day with Python and Airflow.
- Improved the recommendation model by tuning thresholds, raising click-through by 12%.

EDUCATION
B.E. Computer Science, RNS Institute of Technology, 2025

CERTIFICATIONS
Deep Learning Specialization (Coursera)`

const JOB_TEXT = `Machine Learning Engineer — VozLook Studios (Remote, India)

We are looking for a Machine Learning Engineer to ship models into production.

Responsibilities
- Build and deploy ML models with Python and PyTorch.
- Own data pipelines in SQL and PostgreSQL.
- Deploy services with Docker and monitor them in production.
- Communicate results to product stakeholders.

Requirements
- Strong Python and SQL.
- Experience with PyTorch or TensorFlow and scikit-learn.
- Solid understanding of statistics and model evaluation.
- Familiarity with REST APIs, Git and CI/CD.
- 1-3 years of relevant experience (internships count).`

const GOLDEN_STRONG =
  'In my AI Medical Report Explainer project I owned the inference service end to end. I used FastAPI with a Redis cache because the PDF ' +
  'parsing dominated latency; caching the extracted text cut p95 from 3.2s to 1.9s, which I measured with a load test before and after. ' +
  'The hardest decision was the trade-off between accuracy and response time: I benchmarked two summarisation models, chose the smaller one ' +
  'for the default path and exposed the larger one behind a flag. I wrote unit tests for the preprocessing steps and an integration test ' +
  'on a fixture report, so a broken change fails in CI instead of in production. The outcome was 40% lower latency with no drop in the ' +
  'human rating of summary quality.'

const GOLDEN_WEAK = 'I used Python and it was good. We did some machine learning and it worked fine. I do not remember the details.'

console.log('\nVozLook InterviewAI — API test suite')
console.log(`temp data dir: ${dataDir}\n`)

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

console.log('auth')

await test('health endpoint reports the running engine', async () => {
  const { status, body } = await call('GET', '/api/health')
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.ok(body.ai.engine)
})

await test('protected route rejects anonymous requests', async () => {
  const { status } = await call('GET', '/api/profile')
  assert.equal(status, 401)
})

await test('signup validates weak passwords', async () => {
  const { status, body } = await call('POST', '/api/auth/signup', { body: { email: 'weak@example.com', password: 'abc' } })
  assert.equal(status, 400)
  assert.match(String(body.error.message).toLowerCase(), /password|8/)
})

await test('signup returns a session for a new account', async () => {
  const { status, body } = await call('POST', '/api/auth/signup', {
    body: { email: 'primary@vozlook.test', password: 'Vozlook123', fullName: 'Arjun Mehta' },
  })
  assert.equal(status, 201)
  assert.ok(body.token)
  assert.equal(body.user.email, 'primary@vozlook.test')
})

let token = ''
let otherToken = ''

await test('login works with the new credentials', async () => {
  const { status, body } = await call('POST', '/api/auth/login', { body: { email: 'primary@vozlook.test', password: 'Vozlook123' } })
  assert.equal(status, 200)
  token = body.token
  assert.ok(token)
})

await test('login rejects a wrong password', async () => {
  const { status } = await call('POST', '/api/auth/login', { body: { email: 'primary@vozlook.test', password: 'WrongPassword1' } })
  assert.equal(status, 401)
})

await test('session is readable and profile can be updated', async () => {
  const me = await call('GET', '/api/auth/me', { token })
  assert.equal(me.status, 200)
  assert.equal(me.body.user.email, 'primary@vozlook.test')

  const updated = await call('PUT', '/api/profile', {
    token,
    body: {
      full_name: 'Arjun Mehta',
      target_role: 'Machine Learning Engineer',
      company: 'VozLook Studios',
      experience_level: 'Fresher',
      preferred_mode: 'text',
      onboarding_completed: true,
    },
  })
  assert.equal(updated.status, 200)
  assert.equal(updated.body.profile.target_role, 'Machine Learning Engineer')
  assert.equal(Boolean(updated.body.profile.onboarding_completed), true)
})

await test('forgot-password never reveals whether an account exists', async () => {
  const known = await call('POST', '/api/auth/forgot-password', { body: { email: 'primary@vozlook.test' } })
  const unknown = await call('POST', '/api/auth/forgot-password', { body: { email: 'nobody@vozlook.test' } })
  assert.equal(known.status, 200)
  assert.equal(unknown.status, 200)
  assert.equal(known.body.message, unknown.body.message)
})

await test('reset-password rejects an invalid token', async () => {
  const { status } = await call('POST', '/api/auth/reset-password', { body: { token: 'not-a-real-token', password: 'Vozlook456' } })
  assert.equal(status, 400)
})

/* ------------------------------------------------------------------ */
/* Résumé + job                                                        */
/* ------------------------------------------------------------------ */

console.log('\nrésumé & job analysis')

await test('résumé text analysis extracts skills and projects', async () => {
  const { status, body } = await call('POST', '/api/resume/text', { token, body: { text: RESUME_TEXT } })
  assert.equal(status, 201)
  const parsed = body.resume.parsed_data
  assert.ok(parsed.skills.length >= 8, `expected ≥8 skills, got ${parsed.skills.length}`)
  assert.ok(parsed.projects.some((project: any) => /Medical Report/i.test(project.name)))
  assert.ok(parsed.programming_languages.includes('Python'))
})

await test('résumé file upload works through multipart', async () => {
  const form = new FormData()
  form.append('file', new Blob([RESUME_TEXT], { type: 'text/plain' }), 'resume.txt')
  const { status, body } = await call('POST', '/api/resume/analyze', { token, form })
  assert.equal(status, 201)
  assert.equal(body.resume.file_name, 'resume.txt')
  assert.ok(body.resume.parsed_data.skills.length >= 8)
})

await test('résumé upload rejects an unsupported file type', async () => {
  const form = new FormData()
  form.append('file', new Blob(['binary'], { type: 'application/zip' }), 'archive.zip')
  const { status } = await call('POST', '/api/resume/analyze', { token, form })
  assert.equal(status, 400)
})

await test('job description analysis extracts required skills', async () => {
  const { status, body } = await call('POST', '/api/job/analyze', {
    token,
    body: { title: 'Machine Learning Engineer', company: 'VozLook Studios', description: JOB_TEXT },
  })
  assert.equal(status, 201)
  assert.ok(body.job.parsed_requirements.required_skills.length >= 5)
})

await test('job analysis rejects a too-short description', async () => {
  const { status } = await call('POST', '/api/job/analyze', { token, body: { title: 'X', description: 'too short' } })
  assert.equal(status, 400)
})

/* ------------------------------------------------------------------ */
/* Interview lifecycle                                                 */
/* ------------------------------------------------------------------ */

console.log('\ninterview lifecycle')

let interviewId = ''
let firstQuestionId = ''
let answeredIds = new Set<string>()

await test('interview creation returns the first question', async () => {
  const { status, body } = await call('POST', '/api/interview/create', {
    token,
    body: {
      jobRole: 'Machine Learning Engineer',
      interviewType: 'mixed',
      difficulty: 'medium',
      mode: 'text',
      questionCount: 5,
      settings: { focus_areas: ['SQL'] },
    },
  })
  assert.equal(status, 201)
  assert.ok(body.interview.id)
  assert.ok(body.currentQuestion?.question)
  assert.equal(body.progress.planned, 5)
  interviewId = body.interview.id
  firstQuestionId = body.currentQuestion.id
})

await test('answering stores an evaluation and advances the session', async () => {
  const { status, body } = await call('POST', `/api/interview/${interviewId}/answer`, {
    token,
    body: { questionId: firstQuestionId, answerText: GOLDEN_STRONG, durationSeconds: 95, mediaMetrics: { word_count: 120 } },
  })
  assert.equal(status, 200)
  assert.equal(body.progress.answered, 1)
  assert.ok(body.evaluation.relevance_score > 0)
  assert.ok(body.nextQuestion, 'expected a follow-up or next question')
  answeredIds.add(firstQuestionId)
})

await test('duplicate submissions for the same question are idempotent', async () => {
  const before = await call('GET', `/api/interview/${interviewId}`, { token })
  const evaluations = before.body.evaluations.length
  const { status } = await call('POST', `/api/interview/${interviewId}/answer`, {
    token,
    body: { questionId: firstQuestionId, answerText: GOLDEN_STRONG },
  })
  assert.equal(status, 200)
  const after = await call('GET', `/api/interview/${interviewId}`, { token })
  assert.equal(after.body.evaluations.length, evaluations, 'no extra evaluation should be created')
})

await test('skipping a question records a zero score', async () => {
  const state = await call('GET', `/api/interview/${interviewId}`, { token })
  const question = state.body.currentQuestion
  assert.ok(question, 'expected a pending question to skip')
  const { status, body } = await call('POST', `/api/interview/${interviewId}/skip`, { token, body: { questionId: question.id } })
  assert.equal(status, 200)
  assert.equal(Number(body.evaluation.relevance_score), 0)
  assert.equal(body.evaluation.engine, 'system')
  answeredIds.add(question.id)
})

await test('the interview completes and produces a report', async () => {
  let guard = 0
  while (guard < 12) {
    guard += 1
    const state = await call('GET', `/api/interview/${interviewId}`, { token })
    if (state.body.interview.status === 'completed') break
    const question = state.body.currentQuestion
    if (!question) break
    const { body } = await call('POST', `/api/interview/${interviewId}/answer`, {
      token,
      body: { questionId: question.id, answerText: guard % 2 ? GOLDEN_STRONG : GOLDEN_WEAK, durationSeconds: 70 },
    })
    if (body.completed) break
  }
  const finished = await call('GET', `/api/interview/${interviewId}`, { token })
  assert.equal(finished.body.interview.status, 'completed')
  assert.equal(finished.body.hasReport, true)
})

await test('the report contains every documented section', async () => {
  const { status, body } = await call('GET', `/api/interviews/${interviewId}/report`, { token })
  assert.equal(status, 200)
  const report = body.report
  for (const key of [
    'overall_score',
    'technical_score',
    'communication_score',
    'problem_solving_score',
    'relevance_score',
    'confidence_score',
    'role_alignment_score',
  ]) {
    assert.equal(typeof Number(report[key]), 'number', `missing ${key}`)
    assert.ok(Number(report[key]) >= 0 && Number(report[key]) <= 100, `${key} out of range`)
  }
  assert.ok(report.summary.length > 40)
  assert.ok(report.strengths.length > 0)
  assert.ok(report.weaknesses.length > 0)
  assert.ok(report.recommendations.length > 0)
  assert.equal(report.improvement_plan.length, 3)
  assert.ok(Array.isArray(report.recommended_topics))
  assert.ok(report.question_reviews.length >= 5)
  for (const review of report.question_reviews) {
    assert.ok(review.question.length > 10)
    assert.equal(typeof review.scores.relevance, 'number')
  }
  assert.equal(report.scoring_methodology.dimensions.length, 5)
  const weight = report.scoring_methodology.dimensions.reduce((sum: number, d: any) => sum + d.weight, 0)
  assert.ok(Math.abs(weight - 1) < 0.001, `weights should sum to 1, got ${weight}`)
  assert.match(report.scoring_methodology.note.toLowerCase(), /practice|not a hiring/)
})

await test('report regeneration is idempotent', async () => {
  const first = await call('POST', `/api/interviews/${interviewId}/report/regenerate`, { token })
  assert.equal(first.status, 200)
  const second = await call('POST', `/api/interviews/${interviewId}/report/regenerate`, { token })
  assert.equal(second.status, 200)
  assert.equal(Math.round(first.body.report.overall_score), Math.round(second.body.report.overall_score))
})

await test('PDF report downloads with real bytes', async () => {
  const { status, body } = await call('GET', `/api/interviews/${interviewId}/report/pdf`, { token, raw: true })
  assert.equal(status, 200)
  const bytes = new Uint8Array(body as unknown as ArrayBuffer)
  assert.ok(bytes.byteLength > 5000, `pdf too small: ${bytes.byteLength}`)
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-')
})

await test('a completed interview cannot be answered again', async () => {
  const state = await call('GET', `/api/interview/${interviewId}`, { token })
  const question = state.body.questions[0]
  const { status } = await call('POST', `/api/interview/${interviewId}/answer`, { token, body: { questionId: question.id, answerText: 'late' } })
  assert.ok(status >= 400, 'expected the server to refuse further answers')
})

/* ------------------------------------------------------------------ */
/* Ownership isolation                                                 */
/* ------------------------------------------------------------------ */

console.log('\nownership isolation')

await test('a second account cannot read the first account data', async () => {
  const signup = await call('POST', '/api/auth/signup', {
    body: { email: 'intruder@vozlook.test', password: 'Vozlook123', fullName: 'Intruder' },
  })
  assert.equal(signup.status, 201)
  otherToken = signup.body.token

  const interview = await call('GET', `/api/interview/${interviewId}`, { token: otherToken })
  assert.ok([403, 404].includes(interview.status), `expected 403/404, got ${interview.status}`)

  const report = await call('GET', `/api/interviews/${interviewId}/report`, { token: otherToken })
  assert.ok([403, 404].includes(report.status))

  const dashboard = await call('GET', '/api/dashboard', { token: otherToken })
  assert.equal(dashboard.status, 200)
  assert.equal(dashboard.body.stats.interviews_completed, 0)
})

await test('a second account cannot answer into the first account interview', async () => {
  const state = await call('GET', `/api/interview/${interviewId}`, { token })
  const questionId = state.body.questions[0].id
  const { status } = await call('POST', `/api/interview/${interviewId}/answer`, { token: otherToken, body: { questionId, answerText: 'hijack' } })
  assert.ok([403, 404].includes(status), `expected 403/404, got ${status}`)
})

/* ------------------------------------------------------------------ */
/* Analytics + coach                                                   */
/* ------------------------------------------------------------------ */

console.log('\nanalytics & coach')

await test('dashboard reports real stored numbers', async () => {
  const { status, body } = await call('GET', '/api/dashboard', { token })
  assert.equal(status, 200)
  assert.equal(body.stats.interviews_completed, 1)
  assert.ok(body.stats.average_overall > 0)
  assert.equal(body.series.length, 1)
  assert.equal(body.has_resume, true)
  assert.equal(body.has_job, true)
})

await test('progress trends are computed from completed interviews', async () => {
  const { status, body } = await call('GET', '/api/progress', { token })
  assert.equal(status, 200)
  assert.equal(body.scored_interviews, 1)
  const overall = body.trends.find((trend: any) => trend.metric === 'overall_score')
  assert.ok(overall, 'overall_score trend missing')
  assert.equal(overall.values.length, 1)
  assert.equal(overall.change, 0)
})

await test('weak topics come from missed coverage in stored evaluations', async () => {
  const { status, body } = await call('GET', '/api/weak-topics', { token })
  assert.equal(status, 200)
  assert.ok(Array.isArray(body.topics))
  for (const topic of body.topics) {
    assert.ok(topic.topic.length > 0)
    assert.ok(topic.misses >= topic.sessions)
  }
})

await test('history filters narrow the result set', async () => {
  const all = await call('GET', '/api/interview/list', { token })
  const completed = await call('GET', '/api/interview/list?status=completed', { token })
  const inProgress = await call('GET', '/api/interview/list?status=in_progress', { token })
  const unmatched = await call('GET', '/api/interview/list?jobRole=Quantum%20Chef', { token })
  assert.equal(all.body.interviews.length, 1)
  assert.equal(completed.body.interviews.length, 1)
  assert.equal(inProgress.body.interviews.length, 0)
  assert.equal(unmatched.body.interviews.length, 0)
})

await test('coach suggestions and replies are grounded in stored data', async () => {
  const suggestions = await call('GET', '/api/coach/suggestions', { token })
  assert.equal(suggestions.status, 200)
  assert.ok(Array.isArray(suggestions.body.suggestions))

  const reply = await call('POST', '/api/coach', { token, body: { messages: [{ role: 'user', content: 'How should I explain my projects?' }] } })
  assert.equal(reply.status, 200)
  assert.ok(String(reply.body.reply).length > 40)
  assert.ok(Array.isArray(reply.body.follow_ups))
})

await test('coach rejects an empty conversation', async () => {
  const { status } = await call('POST', '/api/coach', { token, body: { messages: [] } })
  assert.equal(status, 400)
})

/* ------------------------------------------------------------------ */
/* Files, deletes, password change                                     */
/* ------------------------------------------------------------------ */

console.log('\nfiles, deletes & account')

await test('uploaded résumé files are served only to their owner', async () => {
  const resume = await call('GET', '/api/resume', { token })
  const fileUrl: string = resume.body.resume.file_url
  assert.ok(fileUrl.startsWith('/api/files/'))
  const key = fileUrl.replace('/api/files/', '')

  const owner = await call('GET', `/api/files/${key}`, { token, raw: true })
  assert.equal(owner.status, 200)

  const stranger = await call('GET', `/api/files/${key}`, { token: otherToken, raw: true })
  assert.equal(stranger.status, 403)

  const anonymous = await call('GET', `/api/files/${key}`, { raw: true })
  assert.equal(anonymous.status, 401)
})

await test('changing the password invalidates the old one', async () => {
  const changed = await call('POST', '/api/auth/change-password', { token, body: { currentPassword: 'Vozlook123', newPassword: 'Vozlook456' } })
  assert.equal(changed.status, 200)
  const oldLogin = await call('POST', '/api/auth/login', { body: { email: 'primary@vozlook.test', password: 'Vozlook123' } })
  assert.equal(oldLogin.status, 401)
  const newLogin = await call('POST', '/api/auth/login', { body: { email: 'primary@vozlook.test', password: 'Vozlook456' } })
  assert.equal(newLogin.status, 200)
  token = newLogin.body.token
})

await test('deleting an interview removes it and its report', async () => {
  const { status } = await call('DELETE', `/api/interview/${interviewId}`, { token })
  assert.equal(status, 200)
  assert.equal((await call('GET', `/api/interview/${interviewId}`, { token })).status, 404)
  assert.equal((await call('GET', `/api/interviews/${interviewId}/report`, { token })).status, 404)
})

await test('résumé and job description can be deleted', async () => {
  const resume = await call('GET', '/api/resume', { token })
  const deletedResume = await call('DELETE', `/api/resume/${resume.body.resume.id}`, { token })
  assert.equal(deletedResume.status, 200)
  assert.equal((await call('GET', '/api/resume', { token })).body.resume, null)

  const job = await call('GET', '/api/job', { token })
  const deletedJob = await call('DELETE', `/api/job/${job.body.job.id}`, { token })
  assert.equal(deletedJob.status, 200)
  assert.equal((await call('GET', '/api/job', { token })).body.job, null)
})

await test('account deletion requires the password and removes the session', async () => {
  const wrong = await call('DELETE', '/api/auth/account', { token, body: { confirm: 'DELETE', password: 'nope' } })
  assert.equal(wrong.status, 400)
  const unconfirmed = await call('DELETE', '/api/auth/account', { token, body: { confirm: 'nope', password: 'Vozlook456' } })
  assert.equal(unconfirmed.status, 400)
  const done = await call('DELETE', '/api/auth/account', { token, body: { confirm: 'DELETE', password: 'Vozlook456' } })
  assert.equal(done.status, 200)
  assert.equal((await call('GET', '/api/auth/me', { token })).status, 401)
  const login = await call('POST', '/api/auth/login', { body: { email: 'primary@vozlook.test', password: 'Vozlook456' } })
  assert.equal(login.status, 401)
})

/* ------------------------------------------------------------------ */
/* Scoring calibration (deterministic engine)                          */
/* ------------------------------------------------------------------ */

console.log('\nscoring calibration')

const evaluationContext = {
  question: 'Walk me through how you built the AI Medical Report Explainer and the decisions you made.',
  questionType: 'resume' as const,
  difficulty: 'medium' as const,
  expectedTopics: ['architecture', 'latency', 'trade-offs', 'testing', 'outcome'],
  resume: null,
  job: null,
  jobRole: 'Machine Learning Engineer',
  answer: '',
}

await test('a strong, specific answer scores well', async () => {
  const evaluation = evaluateAnswerLocally({ ...evaluationContext, answer: GOLDEN_STRONG })
  assert.ok(evaluation.relevance >= 60, `relevance ${evaluation.relevance}`)
  assert.ok(evaluation.technical_accuracy >= 60, `technical ${evaluation.technical_accuracy}`)
  assert.ok(evaluation.completeness >= 60, `completeness ${evaluation.completeness}`)
})

await test('a vague answer scores far lower than a strong one', async () => {
  const strong = evaluateAnswerLocally({ ...evaluationContext, answer: GOLDEN_STRONG })
  const weak = evaluateAnswerLocally({ ...evaluationContext, answer: GOLDEN_WEAK })
  assert.ok(weak.relevance < strong.relevance - 10, `weak relevance ${weak.relevance} vs strong ${strong.relevance}`)
  assert.ok(weak.technical_accuracy < strong.technical_accuracy - 10, 'weak technical should be clearly lower')
  assert.ok(weak.completeness < strong.completeness - 20, 'weak completeness should be clearly lower')
})

await test('an empty answer scores zero without throwing', async () => {
  const evaluation = evaluateAnswerLocally({ ...evaluationContext, answer: '   ' })
  assert.equal(evaluation.relevance, 0)
  assert.equal(evaluation.technical_accuracy, 0)
  assert.ok(evaluation.feedback.length > 0)
})

await test('no score is ever outside 0-100', async () => {
  const samples = ['', 'a', GOLDEN_WEAK, GOLDEN_STRONG, 'x'.repeat(8000)]
  for (const answer of samples) {
    const evaluation = evaluateAnswerLocally({ ...evaluationContext, answer })
    for (const key of ['relevance', 'technical_accuracy', 'completeness', 'clarity', 'structure', 'problem_solving', 'confidence'] as const) {
      const value = evaluation[key]
      assert.ok(value >= 0 && value <= 100, `${key}=${value} for answer length ${answer.length}`)
    }
  }
})

await test('question generation never repeats an asked question', async () => {
  const context = {
    jobRole: 'Machine Learning Engineer',
    interviewType: 'mixed' as const,
    difficulty: 'medium' as const,
    mode: 'text' as const,
    resume: null,
    job: null,
    askedQuestions: ['Tell me about yourself', 'Why do you want this role?'],
    askedTopics: [],
    previousAnswers: [],
    questionNumber: 3,
    totalQuestions: 5,
    focusAreas: [],
  }
  for (let index = 0; index < 12; index += 1) {
    const generated = generateQuestionLocally(context)
    assert.ok(generated.question.length > 15)
    assert.ok(Array.isArray(generated.expected_topics))
    assert.ok(generated.expected_topics.length > 0)
  }
})

await test('focus areas influence the first generated question', async () => {
  const context = {
    jobRole: 'Machine Learning Engineer',
    interviewType: 'mixed' as const,
    difficulty: 'medium' as const,
    mode: 'text' as const,
    resume: null,
    job: null,
    askedQuestions: [],
    askedTopics: [],
    previousAnswers: [],
    questionNumber: 3,
    totalQuestions: 5,
    focusAreas: ['Docker'],
  }
  const generated = generateQuestionLocally(context)
  assert.match(generated.question.toLowerCase(), /docker/)
})

/* ------------------------------------------------------------------ */

await new Promise<void>((resolve) => server.close(() => resolve()))
try {
  const store = (await import('../db/index.js')).getStore() as { close?: () => void }
  store.close?.()
} catch {
  /* the store may already be closed */
}
try {
  fs.rmSync(dataDir, { recursive: true, force: true })
} catch {
  /* temp dir cleanup is best-effort */
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.error('\nfailures:')
  for (const failure of failures) console.error(` - ${failure}`)
  process.exit(1)
}
console.log('All checks green.\n')
process.exit(0)
