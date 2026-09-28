import { getStore } from '../db/index.js'
import type { Row } from '../db/store.js'
import { nowIso } from '../db/store.js'
import { ApiError } from '../lib/errors.js'
import { getAiEngine } from '../ai/index.js'
import type { AnswerEvaluation, QuestionReview, ReportNarrative } from '../ai/types.js'
import { composeBetterApproach } from '../ai/local/report.js'
import { computeInterviewScores } from './scoring.js'
import { jobAnalysisOf } from './job.js'
import { resumeAnalysisOf } from './resume.js'
import { renderReportPdf } from './pdf.js'

function evaluationFromRow(row: Row): AnswerEvaluation {
  return {
    relevance: Number(row.relevance_score ?? 0),
    technical_accuracy: Number(row.technical_score ?? 0),
    completeness: Number(row.completeness_score ?? 0),
    clarity: Number(row.clarity_score ?? 0),
    structure: Number(row.structure_score ?? 0),
    problem_solving: Number(row.problem_solving_score ?? 0),
    confidence: Number(row.confidence_score ?? 0),
    coverage: (row.coverage as AnswerEvaluation['coverage']) ?? [],
    feedback: String(row.feedback ?? ''),
    strengths: (row.strengths as string[] | null) ?? [],
    improvements: (row.improvements as string[] | null) ?? [],
    signals: (row.signals as AnswerEvaluation['signals']) ?? ({} as AnswerEvaluation['signals']),
    engine: row.engine ? String(row.engine) : undefined,
  }
}

export async function buildQuestionReviews(interviewId: string): Promise<{
  reviews: QuestionReview[]
  evaluations: AnswerEvaluation[]
  answered: number
  questionCount: number
}> {
  const store = getStore()
  const questions = await store.findMany<Row>('interview_questions', {
    where: { interview_id: interviewId },
    order: { column: 'question_number', ascending: true },
  })
  const answers = await store.findMany<Row>('interview_answers', { where: { interview_id: interviewId } })
  const evaluationRows = await store.findMany<Row>('answer_evaluations', { where: { interview_id: interviewId } })

  const reviews: QuestionReview[] = []
  const evaluations: AnswerEvaluation[] = []

  for (const question of questions) {
    const answer = answers.find((a) => a.question_id === question.id)
    const evaluationRow = answer ? evaluationRows.find((e) => e.answer_id === answer.id) : null
    const evaluation = evaluationRow ? evaluationFromRow(evaluationRow) : null
    const coverage = evaluation?.coverage ?? ((question.expected_topics as string[] | null) ?? []).map((topic) => ({ topic, covered: false }))
    const answerText = String(answer?.answer_text ?? '')

    const review: QuestionReview = {
      question_number: Number(question.question_number),
      question: String(question.question),
      question_type: question.question_type as QuestionReview['question_type'],
      difficulty: question.difficulty as QuestionReview['difficulty'],
      answer: answerText,
      scores: {
        relevance: evaluation?.relevance ?? 0,
        technical_accuracy: evaluation?.technical_accuracy ?? 0,
        completeness: evaluation?.completeness ?? 0,
        clarity: evaluation?.clarity ?? 0,
        structure: evaluation?.structure ?? 0,
        problem_solving: evaluation?.problem_solving ?? 0,
        confidence: evaluation?.confidence ?? 0,
      },
      what_worked: answerText.trim() ? evaluation?.strengths ?? [] : [],
      what_to_improve:
        answerText.trim()
          ? evaluation?.improvements ?? []
          : ['This question was not answered. Prepare a 90-second answer and retake the interview.'],
      better_approach: '',
      covered_topics: coverage.filter((c) => c.covered).map((c) => c.topic),
      missed_topics: coverage.filter((c) => !c.covered).map((c) => c.topic),
    }
    review.better_approach = composeBetterApproach({
      question: review.question,
      answer: review.answer || 'I would start from the outcome',
      missed_topics: review.missed_topics,
      covered_topics: review.covered_topics,
      scores: review.scores,
    })
    reviews.push(review)
    if (evaluation) evaluations.push(evaluation)
  }

  return {
    reviews,
    evaluations,
    answered: reviews.filter((r) => r.answer.trim().length > 0).length,
    questionCount: questions.filter((q) => !q.is_follow_up).length || questions.length,
  }
}

/**
 * Generates (or returns the existing) final report for an interview.
 * Idempotent: calling it twice never produces duplicate reports or duplicate progress rows.
 */
export async function generateReportForInterview(userId: string, interviewId: string, options: { force?: boolean } = {}): Promise<Row> {
  const store = getStore()
  const interview = await store.findById<Row>('interviews', interviewId)
  if (!interview) throw ApiError.notFound('We could not find that interview.')
  if (interview.user_id !== userId) throw ApiError.forbidden()

  const existing = await store.findOne<Row>('interview_reports', { where: { interview_id: interviewId } })
  if (existing && !options.force) {
    if (interview.status !== 'completed') {
      await store.updateById('interviews', interviewId, {
        status: 'completed',
        completed_at: interview.completed_at ?? nowIso(),
        overall_score: Number(existing.overall_score ?? interview.overall_score ?? 0),
      })
    }
    return existing
  }

  const { reviews, evaluations, answered, questionCount } = await buildQuestionReviews(interviewId)
  const job = interview.job_description_id ? await store.findById<Row>('job_descriptions', String(interview.job_description_id)) : null
  const resume = interview.resume_id ? await store.findById<Row>('resumes', String(interview.resume_id)) : null
  const jobAnalysis = jobAnalysisOf(job)
  const resumeAnalysis = resumeAnalysisOf(resume)

  const scores = computeInterviewScores({
    evaluations,
    questionCount,
    jobSkills: jobAnalysis?.required_skills ?? [],
    answerTexts: reviews.map((review) => review.answer).filter(Boolean),
  })

  const profile = await store.findOne<Row>('profiles', { where: { user_id: userId } })
  const engine = getAiEngine()

  let narrative: ReportNarrative = {
    summary: '',
    strengths: [],
    weaknesses: [],
    recommendations: [],
    improvement_plan: [],
    question_reviews: reviews,
    recommended_topics: [],
    engine: engine.label,
  }

  try {
    narrative = await engine.generateReport({
      jobRole: String(interview.job_role),
      interviewType: interview.interview_type as any,
      difficulty: interview.difficulty as any,
      mode: interview.interview_mode as any,
      candidateName: profile?.full_name ?? resumeAnalysis?.name ?? undefined,
      resume: resumeAnalysis,
      job: jobAnalysis,
      reviews,
      scores: scores as unknown as Record<string, number>,
    })
  } catch (error) {
    console.error('[vozlook][report] narrative generation failed:', (error as Error).message)
  }

  const reportJson = {
    generated_at: nowIso(),
    answered_count: answered,
    question_count: questionCount,
    engine: narrative.engine ?? engine.label,
    dimension_scores: {
      overall: scores.overall_score,
      technical: scores.technical_score,
      communication: scores.communication_score,
      problem_solving: scores.problem_solving_score,
      relevance: scores.relevance_score,
      confidence: scores.confidence_score,
      role_alignment: scores.role_alignment_score,
    },
    job: jobAnalysis
      ? {
          title: jobAnalysis.title,
          company: jobAnalysis.company,
          required_skills: jobAnalysis.required_skills,
          domain: jobAnalysis.domain,
        }
      : null,
    resume: resumeAnalysis
      ? {
          name: resumeAnalysis.name,
          skills: resumeAnalysis.skills.slice(0, 30),
          projects: resumeAnalysis.projects.map((p) => p.name).slice(0, 6),
        }
      : null,
    engine_signals: evaluations.map((e, index) => ({ question: reviews[index]?.question_number ?? index + 1, signals: e.signals })),
  }

  const payload = {
    interview_id: interviewId,
    user_id: userId,
    overall_score: scores.overall_score,
    technical_score: scores.technical_score,
    communication_score: scores.communication_score,
    problem_solving_score: scores.problem_solving_score,
    relevance_score: scores.relevance_score,
    confidence_score: scores.confidence_score,
    role_alignment_score: scores.role_alignment_score,
    summary: narrative.summary,
    strengths: narrative.strengths,
    weaknesses: narrative.weaknesses,
    recommendations: narrative.recommendations,
    improvement_plan: narrative.improvement_plan,
    recommended_topics: narrative.recommended_topics,
    question_reviews: narrative.question_reviews,
    scoring_methodology: scores.methodology,
    report_json: reportJson,
    engine: narrative.engine ?? engine.label,
  }

  const saved = existing
    ? ((await store.updateById('interview_reports', String(existing.id), payload), await store.findById<Row>('interview_reports', String(existing.id)))!)
    : await store.insert('interview_reports', payload)

  await store.updateById('interviews', interviewId, {
    status: 'completed',
    completed_at: interview.completed_at ?? nowIso(),
    overall_score: scores.overall_score,
  })

  // Progress rows: one per metric per interview, replaced on regeneration.
  await store.remove('interview_progress', { interview_id: interviewId, metric_name: 'interview_completed' })
  const metricRows: { metric_name: string; metric_value: number }[] = [
    { metric_name: 'overall_score', metric_value: scores.overall_score },
    { metric_name: 'technical_score', metric_value: scores.technical_score },
    { metric_name: 'communication_score', metric_value: scores.communication_score },
    { metric_name: 'problem_solving_score', metric_value: scores.problem_solving_score },
    { metric_name: 'relevance_score', metric_value: scores.relevance_score },
    { metric_name: 'confidence_score', metric_value: scores.confidence_score },
    { metric_name: 'role_alignment_score', metric_value: scores.role_alignment_score },
  ]
  for (const metric of metricRows) {
    const duplicate = await store.findOne<Row>('interview_progress', {
      where: { interview_id: interviewId, metric_name: metric.metric_name },
    })
    if (duplicate) {
      await store.updateById('interview_progress', String(duplicate.id), { metric_value: metric.metric_value })
    } else {
      await store.insert('interview_progress', {
        user_id: userId,
        interview_id: interviewId,
        metric_name: metric.metric_name,
        metric_value: metric.metric_value,
      })
    }
  }
  await store.insert('interview_progress', {
    user_id: userId,
    interview_id: interviewId,
    metric_name: 'interview_completed',
    metric_value: 1,
  })

  return saved
}

export async function getReportForInterview(userId: string, interviewId: string): Promise<{ report: Row; interview: Row; candidateName: string }> {
  const store = getStore()
  const interview = await store.findById<Row>('interviews', interviewId)
  if (!interview) throw ApiError.notFound('We could not find that interview.')
  if (interview.user_id !== userId) throw ApiError.forbidden()

  let report = await store.findOne<Row>('interview_reports', { where: { interview_id: interviewId } })
  if (!report) {
    if (interview.status === 'completed' || interview.status === 'processing') {
      report = await generateReportForInterview(userId, interviewId)
    } else {
      throw ApiError.badRequest('This interview is not complete yet — finish the interview to unlock the report.')
    }
  }

  const profile = await store.findOne<Row>('profiles', { where: { user_id: userId } })
  const resume = interview.resume_id ? await store.findById<Row>('resumes', String(interview.resume_id)) : null
  const candidateName = profile?.full_name || resumeAnalysisOf(resume)?.name || 'Candidate'

  return { report, interview, candidateName }
}

export async function buildReportPdf(userId: string, interviewId: string): Promise<{ buffer: Buffer; fileName: string }> {
  const { report, interview, candidateName } = await getReportForInterview(userId, interviewId)
  const buffer = await renderReportPdf({
    candidateName,
    targetRole: String(interview.job_role),
    interview,
    report,
  })
  const slug = String(interview.job_role ?? 'interview')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  const date = new Date(String(interview.completed_at ?? interview.created_at)).toISOString().slice(0, 10)
  return { buffer, fileName: `vozlook-interviewai-report-${slug || 'interview'}-${date}.pdf` }
}
