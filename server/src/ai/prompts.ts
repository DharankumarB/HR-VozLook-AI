import type { EvaluationContext, InterviewType, JobAnalysis, QuestionContext, ResumeAnalysis } from './types.js'
import { resolvePersona } from './personas.js'
import { languageInstruction } from './languages.js'

const PERSONA = `You are the AI interviewer inside "VozHireQ" by VozLook Studios — an AI-powered interview intelligence platform that helps candidates practise realistic interviews.
You are professional, calm and encouraging, like a senior hiring manager running a real interview.
You never claim to predict hiring outcomes, personality, honesty, intelligence or mental health. Assessments are practice feedback only.
You never ask about, and never reason about, protected personal characteristics.`

const JSON_RULE = `Respond with a SINGLE valid JSON object and nothing else — no markdown, no commentary, no code fences.
Use plain ASCII quotes. Never include trailing commas. Never omit required keys.`

/* ------------------------------------------------------------------ */
/* Resume                                                                */
/* ------------------------------------------------------------------ */

export function resumeExtractionPrompt(text: string, fileName?: string, targetRole?: string | null) {
  return {
    system: `${PERSONA}\nYou extract structured data from résumés.\n${JSON_RULE}`,
    prompt: `Extract a structured candidate profile from the résumé below.
If a field is absent, use null (strings) or [] (arrays). Never invent experience, employers, dates or skills that are not in the text.
Normalise skill names to their common industry spelling (e.g. "reactjs" -> "React", "node js" -> "Node.js").
${targetRole ? `The candidate is targeting this role, which may help disambiguate skills: ${targetRole}.` : ''}
File name: ${fileName ?? 'resume'}

Return exactly this JSON shape:
{
  "name": string|null,
  "headline": string|null,
  "email": string|null,
  "phone": string|null,
  "location": string|null,
  "links": string[],
  "summary": string|null,
  "education": [{ "degree": string, "institution": string, "year": string, "details": string }],
  "skills": string[],
  "technical_skills": string[],
  "soft_skills": string[],
  "programming_languages": string[],
  "frameworks": string[],
  "tools": string[],
  "projects": [{ "name": string, "description": string, "technologies": string[], "highlights": string[] }],
  "internships": [{ "role": string, "company": string, "duration": string, "description": string }],
  "experience": [{ "role": string, "company": string, "duration": string, "description": string, "highlights": string[] }],
  "certifications": string[],
  "achievements": string[],
  "years_experience": number,
  "seniority": "student"|"fresher"|"junior"|"mid"|"senior",
  "confidence": number
}

RÉSUMÉ TEXT:
"""
${text.slice(0, 24000)}
"""`,
  }
}

/* ------------------------------------------------------------------ */
/* Job description                                                       */
/* ------------------------------------------------------------------ */

export function jobExtractionPrompt(input: { title?: string; company?: string; description: string; targetRole?: string | null }) {
  return {
    system: `${PERSONA}\nYou extract hiring requirements from job descriptions.\n${JSON_RULE}`,
    prompt: `Extract the hiring requirements from this job description. Only use information present in the text.
Job title (given): ${input.title || 'not provided'}
Company (given): ${input.company || 'not provided'}
Target role hint: ${input.targetRole || 'not provided'}

Return exactly this JSON shape:
{
  "title": string|null,
  "company": string|null,
  "seniority": string|null,
  "required_skills": string[],
  "preferred_skills": string[],
  "responsibilities": string[],
  "technical_requirements": string[],
  "soft_requirements": string[],
  "experience_requirements": string,
  "keywords": string[],
  "domain": string,
  "confidence": number
}

"domain" must be one of: "ai/ml", "data", "frontend", "backend", "fullstack", "mobile", "devops", "cloud", "cybersecurity", "ui/ux", "qa", "general software".

JOB DESCRIPTION:
"""
${input.description.slice(0, 20000)}
"""`,
  }
}

/* ------------------------------------------------------------------ */
/* Question generation                                                   */
/* ------------------------------------------------------------------ */

export function questionPrompt(ctx: QuestionContext) {
  const { resume, job } = ctx
  const resumeBlock = resume
    ? `CANDIDATE RÉSUMÉ SUMMARY
Name: ${resume.name ?? 'unknown'}
Headline: ${resume.headline ?? 'n/a'}
Skills: ${resume.skills.slice(0, 30).join(', ') || 'n/a'}
Projects: ${resume.projects.slice(0, 6).map((p) => `${p.name} (${(p.technologies || []).slice(0, 4).join('/')})`).join('; ') || 'n/a'}
Experience: ${[...resume.experience, ...resume.internships].slice(0, 5).map((e) => `${e.role ?? 'role'} @ ${e.company ?? 'n/a'}`).join('; ') || 'n/a'}
Certifications: ${resume.certifications.slice(0, 5).join('; ') || 'n/a'}`
    : 'CANDIDATE RÉSUMÉ SUMMARY\nNo résumé on file — ask role-focused questions that do not assume specific projects.'

  const jobBlock = job
    ? `TARGET JOB
Title: ${job.title ?? ctx.jobRole}
Company: ${job.company ?? 'n/a'}
Required skills: ${job.required_skills.slice(0, 20).join(', ') || 'n/a'}
Preferred skills: ${job.preferred_skills.slice(0, 12).join(', ') || 'n/a'}
Responsibilities: ${job.responsibilities.slice(0, 6).join(' | ') || 'n/a'}
Technical requirements: ${job.technical_requirements.slice(0, 10).join(' | ') || 'n/a'}`
    : `TARGET JOB\nRole: ${ctx.jobRole}\nNo job description on file.`

  const focusBlock = ctx.focusAreas?.length
    ? `\nCANDIDATE FOCUS AREAS (prioritise these topics early, then move on)\n${ctx.focusAreas.join(', ')}`
    : ''

  const history = ctx.previousAnswers.length
    ? `INTERVIEW SO FAR\n${ctx.previousAnswers
        .map((p, i) => `${i + 1}. Q: ${p.question}\n   A (score ${Math.round(p.score)}/100): ${p.answer.slice(0, 700)}\n   Gaps: ${p.weak_topics.join(', ') || 'none noted'}`)
        .join('\n')}`
    : 'INTERVIEW SO FAR\nThis is the first question.'

  const difficultyRule =
    ctx.difficulty === 'adaptive'
      ? `Difficulty is ADAPTIVE: pick the level that best fits the candidate's latest answer — raise it when the previous answer scored above 78, keep it medium around 55-78, lower it below 55.`
      : `Target difficulty: ${ctx.difficulty}.`

  const persona = resolvePersona(ctx.persona)
  const blueprintBlock = ctx.blueprint
    ? `QUESTION BLUEPRINT (follow it)
Target question type: ${ctx.blueprint.target_type}
Focus skills to probe: ${ctx.blueprint.focus_skills.join(', ') || 'n/a'}
Anchor on one of these résumé items: ${ctx.blueprint.resume_anchors.join(' | ') || 'n/a'}
Must cover from the job description: ${ctx.blueprint.must_cover_from_job.join(', ') || 'n/a'}
Minimum difficulty: ${ctx.blueprint.min_difficulty}
Why this question now: ${ctx.blueprint.rationale}`
    : ''

  const feedbackBlock = ctx.validationFeedback?.length
    ? `YOUR PREVIOUS ATTEMPTS WERE REJECTED BY THE QUESTION VALIDATOR — fix all of these:\n${ctx.validationFeedback.map((item) => `- ${item}`).join('\n')}`
    : ''

  return {
    system: `${PERSONA}
Interviewer persona: ${persona.label}. ${persona.tone}
You are generating question ${ctx.questionNumber} of ${ctx.totalQuestions} for a ${ctx.interviewType} interview (${ctx.mode} mode).
${languageInstruction(ctx.language)}
${JSON_RULE}`,
    prompt: `${resumeBlock}

${jobBlock}${focusBlock}

${blueprintBlock}

${history}

ALREADY ASKED (never repeat or paraphrase these):
${ctx.askedQuestions.length ? ctx.askedQuestions.map((q) => `- ${q}`).join('\n') : '- none yet'}
Topics already covered: ${ctx.askedTopics.join(', ') || 'none'}
${feedbackBlock ? `\n${feedbackBlock}\n` : ''}
RULES
1. Ask exactly ONE question, phrased the way a real interviewer would speak it aloud.
2. Ground it in the candidate's résumé or the job requirements whenever possible; prefer a concrete anchor (a named project, a listed technology, a responsibility). Never invent a project, employer or technology that is not in the material above.
3. ${difficultyRule} Follow the persona's difficulty bias (${persona.difficultyBias > 0 ? 'raise' : persona.difficultyBias < 0 ? 'lower' : 'neutral'}).
4. The question must be answerable in 60-120 seconds and must not be a multi-part essay prompt.
5. expected_topics: 3-5 short concepts a strong answer should touch, used later to grade the answer.
6. Mix question types according to the interview type "${ctx.interviewType}".
7. Never ask for personal/sensitive information, and never ask about protected characteristics.
8. Write the whole question in one language only, as instructed above.

Return exactly:
{"question": string, "type": "technical"|"behavioral"|"hr"|"situational"|"resume", "difficulty": "easy"|"medium"|"hard", "expected_topics": string[], "resume_anchor": string|null}`,
  }
}

export function followUpPrompt(ctx: {
  question: string
  answer: string
  evaluation_summary: string
  missed_topics: string[]
  interviewType: InterviewType
  askedQuestions: string[]
}) {
  return {
    system: `${PERSONA}\nYou decide whether a natural follow-up question is warranted, and write it.\n${JSON_RULE}`,
    prompt: `Previous question: ${ctx.question}
Candidate answer: ${ctx.answer.slice(0, 2000)}
Evaluation: ${ctx.evaluation_summary}
Topics the answer missed: ${ctx.missed_topics.join(', ') || 'none'}
Already asked (do not repeat): ${ctx.askedQuestions.map((q) => `- ${q}`).join('\n') || '- none'}

Write ONE short probing follow-up that digs into a specific weak or under-explained point of THIS answer — the way a real interviewer says "interesting, and how exactly did you…".
If the answer was already thorough, comprehensive and specific, respond with {"follow_up": null}.

Return exactly: {"follow_up": {"question": string, "expected_topics": string[]} | null}`,
  }
}

/* ------------------------------------------------------------------ */
/* Answer evaluation                                                     */
/* ------------------------------------------------------------------ */

export function evaluationPrompt(ctx: EvaluationContext) {
  const persona = resolvePersona(ctx.persona)
  const deliverable = ctx.mediaMetrics
    ? `MEASURED DELIVERY SIGNALS (from the candidate's audio/video — objective measurements, not judgements)
duration: ${ctx.mediaMetrics.duration_seconds ?? 'n/a'}s
words: ${ctx.mediaMetrics.word_count ?? 'n/a'}
filler words: ${ctx.mediaMetrics.filler_count ?? 'n/a'}
long pauses: ${ctx.mediaMetrics.long_pauses ?? 'n/a'}
speaking rate: ${ctx.mediaMetrics.speaking_rate_wpm ?? 'n/a'} wpm
speech clarity: ${ctx.mediaMetrics.clarity_score ?? 'n/a'}/100
camera engagement: ${ctx.mediaMetrics.camera_engagement ?? 'n/a'}/100
posture consistency: ${ctx.mediaMetrics.posture_consistency ?? 'n/a'}/100`
    : 'MEASURED DELIVERY SIGNALS\nNo audio/video captured (text answer). Judge clarity and confidence from the written answer only.'

  return {
    system: `${PERSONA}
Interviewer persona: ${persona.label}. ${persona.tone}
You grade one interview answer. Be fair, specific and constructive — never flatter, never harsh.
Grade only what is observable in the answer: relevance, technical correctness, completeness, clarity, structure, communication and role alignment.
Never infer or comment on personality, honesty, intelligence, mental health, age, gender, nationality, religion, disability or any other protected characteristic.
${languageInstruction(ctx.language)}
${JSON_RULE}`,
    prompt: `TARGET ROLE: ${ctx.jobRole}
QUESTION (${ctx.questionType}, ${ctx.difficulty}): ${ctx.question}
EXPECTED TOPICS: ${ctx.expectedTopics.join(', ') || 'general'}
CANDIDATE RÉSUMÉ CONTEXT: ${ctx.resume ? ctx.resume.skills.slice(0, 20).join(', ') : 'n/a'}
ROLE REQUIREMENTS: ${ctx.job ? ctx.job.required_skills.slice(0, 20).join(', ') : 'n/a'}
${deliverable}

CANDIDATE ANSWER:
"""
${ctx.answer.slice(0, 8000)}
"""

GRADING RULES
- relevance: did the answer address the question actually asked? (0-100)
- technical_accuracy: are the technical statements correct and role-appropriate? Do not award points for buzzwords without substance.
- completeness: were the expected topics covered with enough depth?
- clarity: is it easy to follow? penalise run-ons, vague pronouns, unexplained jargon, filler density.
- structure: logical organisation (situation/approach/technology/result), signposting, an example where one was called for.
- problem_solving: evidence of reasoning — trade-offs, debugging steps, alternatives considered, metrics.
- confidence: delivery signals only (filler words, hedging, directness, concrete specifics). It is NOT a personality or honesty judgement.
- If the answer is empty, off-topic or a refusal, scores must be low and the feedback must say exactly what was missing.
- coverage: for every expected topic, say whether the answer covered it, quoting <=12 words of evidence when it did.

Return exactly:
{
  "relevance": number, "technical_accuracy": number, "completeness": number,
  "clarity": number, "structure": number, "problem_solving": number, "confidence": number,
  "coverage": [{"topic": string, "covered": boolean, "evidence": string}],
  "feedback": string,
  "strengths": string[],
  "improvements": string[]
}
Feedback is 2-4 sentences, addressed to the candidate as "you", and must reference something specific from their answer.
strengths and improvements hold 1-3 short bullet-sized statements each.`,
  }
}

/* ------------------------------------------------------------------ */
/* Report                                                                */
/* ------------------------------------------------------------------ */

export function reportPrompt(input: {
  jobRole: string
  interviewType: InterviewType
  candidateName?: string
  resume: ResumeAnalysis | null
  job: JobAnalysis | null
  reviews: { question_number: number; question: string; answer: string; scores: Record<string, number>; missed: string[]; worked: string[]; improve: string[] }[]
  scores: Record<string, number>
}) {
  const reviewBlock = input.reviews
    .map(
      (r) => `Q${r.question_number}: ${r.question}
  answer: ${r.answer.slice(0, 900) || '(no answer given)'}
  scores: relevance ${r.scores.relevance}, technical ${r.scores.technical_accuracy}, completeness ${r.scores.completeness}, clarity ${r.scores.clarity}, structure ${r.scores.structure}, problem solving ${r.scores.problem_solving}, confidence ${r.scores.confidence}
  worked: ${r.worked.join(' | ') || '-'}
  improve: ${r.improve.join(' | ') || '-'}
  missed topics: ${r.missed.join(', ') || 'none'}`,
    )
    .join('\n\n')

  return {
    system: `${PERSONA}\nYou write the final practice report for a completed mock interview.
The report is coaching material for the candidate. It must never suggest the candidate will or will not be hired, and must never speculate about personality, honesty or mental state.\n${JSON_RULE}`,
    prompt: `CANDIDATE: ${input.candidateName ?? 'Candidate'}
TARGET ROLE: ${input.jobRole}
INTERVIEW TYPE: ${input.interviewType}
ROLE REQUIREMENTS: ${input.job ? input.job.required_skills.slice(0, 20).join(', ') : 'n/a'}
CANDIDATE SKILLS: ${input.resume ? input.resume.skills.slice(0, 25).join(', ') : 'n/a'}

COMPUTED PRACTICE METRICS (fixed — do not contradict or recompute these):
overall ${Math.round(input.scores.overall_score ?? 0)}, technical ${Math.round(input.scores.technical_score ?? 0)}, communication ${Math.round(input.scores.communication_score ?? 0)}, problem solving ${Math.round(input.scores.problem_solving_score ?? 0)}, relevance ${Math.round(input.scores.relevance_score ?? 0)}, confidence ${Math.round(input.scores.confidence_score ?? 0)}, role alignment ${Math.round(input.scores.role_alignment_score ?? 0)}

QUESTION-BY-QUESTION DATA
${reviewBlock}

RULES
- strengths / weaknesses must be earned from the evidence above (cite the question number or the answer detail).
- weaknesses must name a pattern, not a person ("answers skipped the trade-off discussion in Q4", not "you are weak at system design").
- recommendations: 4-6 concrete, actionable items tied to the target role.
- improvement_plan: exactly 3 weeks of practice, each with 3-4 actions the candidate can do today.
- question_reviews: one entry per question, in order, each with a "better_approach" that rewrites the answer's opening 2-3 sentences the way a stronger candidate would.
- recommended_topics: 5-8 study topics derived from missed topics and role requirements.
- summary: 3-5 sentences, second person, balanced and specific, quoting at least one concrete detail.

Return exactly:
{
  "summary": string,
  "strengths": string[],
  "weaknesses": string[],
  "recommendations": string[],
  "recommended_topics": string[],
  "improvement_plan": [{"week": number, "focus": string, "actions": string[]}],
  "question_reviews": [{"question_number": number, "what_worked": string[], "what_to_improve": string[], "better_approach": string}]
}`,
  }
}

/* ------------------------------------------------------------------ */
/* Coach                                                                 */
/* ------------------------------------------------------------------ */

export function coachPrompt(input: {
  messages: { role: 'user' | 'assistant'; content: string }[]
  resume: ResumeAnalysis | null
  job: JobAnalysis | null
  context: {
    target_role?: string | null
    weak_topics: string[]
    recent_interview?: { job_role: string; overall_score: number | null; technical_score: number | null; communication_score: number | null; completed_at: string | null } | null
    history: { job_role: string; overall_score: number | null; completed_at: string | null }[]
  }
  latestQuestion: string
}) {
  const ctx = input.context
  return {
    system: `${PERSONA}
You are now the candidate's personal interview coach. Be warm, direct and practical — like a mentor who has read their résumé and their last mock interview.
Rules you must follow:
- Ground every answer in the candidate's own data below. If you do not have data for something, say what you would need.
- Never promise a job offer or predict hiring outcomes. Never assess personality, honesty or mental state.
- Prefer concrete drills, phrasings and rewrites over generic advice. When asked for questions, write real interview questions with what a strong answer should cover.
- Keep answers under 320 words unless the user asks for a detailed plan.
${JSON_RULE}`,
    prompt: `CANDIDATE CONTEXT
Target role: ${ctx.target_role || 'not set'}
Résumé skills: ${input.resume ? input.resume.skills.slice(0, 25).join(', ') : 'no résumé on file'}
Role requirements: ${input.job ? input.job.required_skills.slice(0, 20).join(', ') : 'no job description on file'}
Recurring weak topics across past interviews: ${ctx.weak_topics.slice(0, 12).join(', ') || 'none recorded yet'}
Most recent interview: ${ctx.recent_interview ? `${ctx.recent_interview.job_role} — overall ${Math.round(ctx.recent_interview.overall_score ?? 0)}/100, technical ${Math.round(ctx.recent_interview.technical_score ?? 0)}, communication ${Math.round(ctx.recent_interview.communication_score ?? 0)}` : 'no completed interviews yet'}
Recent history: ${ctx.history.slice(0, 6).map((h) => `${h.job_role}: ${h.overall_score == null ? 'n/a' : Math.round(h.overall_score)}`).join(', ') || 'none'}

CONVERSATION SO FAR
${input.messages.map((m) => `${m.role === 'user' ? 'Candidate' : 'Coach'}: ${m.content.slice(0, 1200)}`).join('\n')}

LATEST CANDIDATE MESSAGE: ${input.latestQuestion}

Return exactly:
{
  "reply": string,
  "follow_ups": string[],
  "practice_questions": [{"question": string, "what_a_strong_answer_covers": string[]}]
}
"follow_ups" holds 2-3 short suggested next questions the candidate might ask.
"practice_questions" holds practice questions only when the user asked for questions/practice — otherwise [].`,
  }
}
