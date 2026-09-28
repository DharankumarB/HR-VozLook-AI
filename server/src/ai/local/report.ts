import type {
  CoachContextSummary,
  CoachResult,
  ImprovementWeek,
  InterviewMode,
  InterviewType,
  JobAnalysis,
  QuestionReview,
  ReportNarrative,
  ResumeAnalysis,
} from '../types.js'
import { detectSkillNames, normalizeSkillList } from './skills.js'
import { phraseOverlap } from './text.js'

export interface ReportInput {
  jobRole: string
  interviewType: InterviewType
  difficulty: string
  mode: InterviewMode
  candidateName?: string
  resume: ResumeAnalysis | null
  job: JobAnalysis | null
  reviews: QuestionReview[]
  scores: Record<string, number>
}

function scoreBand(score: number): string {
  if (score >= 85) return 'excellent'
  if (score >= 72) return 'strong'
  if (score >= 58) return 'developing'
  if (score >= 42) return 'patchy'
  return 'early'
}

/** Turns a weak answer into an explicit model opening the candidate can reuse. */
export function composeBetterApproach(review: {
  question: string
  answer: string
  missed_topics: string[]
  covered_topics: string[]
  scores: { structure: number; clarity: number; completeness: number }
}): string {
  const headline = review.missed_topics[0] ?? review.covered_topics[0] ?? 'the core concept'
  const second = review.missed_topics[1] ?? review.covered_topics[1]
  const parts: string[] = []
  parts.push(
    `Open with the headline instead of the chronology: “${review.answer
      .split(/\s+/)
      .slice(0, 12)
      .join(' ')
      .replace(/[.,;]$/, '')}” is your setup — lead with the conclusion, then justify it.`,
  )
  parts.push(
    `Then cover ${headline}${second ? ` and ${second}` : ''} explicitly; name the technology you chose and the reason you chose it.`,
  )
  parts.push('Add one measurable outcome (numbers, latency, accuracy, time saved) so the interviewer can trust the claim.')
  if (review.scores.structure < 70) parts.push('Signpost the structure: “First…, then…, and finally…”.')
  else parts.push('Close with what you would do differently today — it reads as senior and self-aware.')
  return parts.join(' ')
}

export function buildReportLocally(input: ReportInput): ReportNarrative {
  const answered = input.reviews.filter((r) => r.answer && r.answer.trim().length > 0)
  const scores = input.scores
  const overall = Math.round(scores.overall_score ?? 0)
  const technical = Math.round(scores.technical_score ?? 0)
  const communication = Math.round(scores.communication_score ?? 0)
  const problemSolving = Math.round(scores.problem_solving_score ?? 0)
  const relevance = Math.round(scores.relevance_score ?? 0)
  const confidence = Math.round(scores.confidence_score ?? 0)
  const alignment = Math.round(scores.role_alignment_score ?? 0)
  const candidate = input.candidateName || input.resume?.name || 'Candidate'

  const strongReviews = [...answered].sort((a, b) => average(b) - average(a)).slice(0, 2)
  const weakReviews = [...answered].sort((a, b) => average(a) - average(b)).slice(0, 3)
  const missedTopics = normalizeSkillList(answered.flatMap((r) => r.missed_topics), 30)
  const coveredTopics = normalizeSkillList(answered.flatMap((r) => r.covered_topics), 30)
  const answerText = answered.map((r) => r.answer).join('\n')
  const detectedInAnswers = new Set(detectSkillNames(answerText).map((skill) => skill.toLowerCase()))
  const requiredSkills = (input.job?.required_skills ?? []).filter(Boolean)
  const addressedSkills = requiredSkills.filter(
    (skill) => detectedInAnswers.has(skill.toLowerCase()) || phraseOverlap(skill, answerText) >= 0.6,
  )
  const missingRequirements = requiredSkills.filter((skill) => !addressedSkills.includes(skill))
  const fillers = 0

  /* ---------------- summary ---------------- */
  const bestQuestion = strongReviews[0]
  const worstQuestion = weakReviews[0]
  const summaryParts: string[] = []
  summaryParts.push(
    `${candidate}, you completed a ${input.reviews.length}-question ${input.interviewType} mock interview for ${input.jobRole} in ${input.mode} mode and scored ${overall}/100 overall — a ${scoreBand(
      overall,
    )} result.`,
  )
  summaryParts.push(
    `Your strongest dimension was ${bestDimension({ technical, communication, problemSolving, relevance, confidence, alignment })}, and the weakest was ${worstDimension({
      technical,
      communication,
      problemSolving,
      relevance,
      confidence,
      alignment,
    })}.`,
  )
  if (bestQuestion) summaryParts.push(`You were at your best on question ${bestQuestion.question_number} ("${truncate(bestQuestion.question)}").`)
  if (worstQuestion) summaryParts.push(`Question ${worstQuestion.question_number} cost you the most marks — ${weakReason(worstQuestion)}`)
  if (missedTopics.length)
    summaryParts.push(`Across the session, these expected points were never said out loud: ${missedTopics.slice(0, 5).join(', ')}.`)
  if (!answered.length) summaryParts.push('No answers were recorded in this session, so the report focuses on the questions you were asked.')

  /* ---------------- strengths ---------------- */
  const strengths: string[] = []
  if (technical >= 70) strengths.push(`Technical answers held up: you covered ${coveredTopics.slice(0, 3).join(', ') || 'the core role topics'} with working-level detail.`)
  if (communication >= 70) strengths.push('Communication was clear enough that an interviewer could follow your reasoning without interrupting.')
  if (relevance >= 70) strengths.push('You answered the question that was actually asked rather than a nearby one — that is what keeps an interview on track.')
  if (problemSolving >= 70) strengths.push('You reasoned through problems out loud: options, trade-offs and reasoning were visible.')
  if (confidence >= 70) strengths.push('Delivery was composed — few filler words and little hedging language across your answers.')
  if (alignment >= 65) strengths.push(`Your answers mapped onto the ${input.jobRole} requirements, not just generic theory.`)
  for (const review of strongReviews) {
    if (review.what_worked.length) strengths.push(`Q${review.question_number}: ${review.what_worked[0]}`)
  }
  if (!strengths.length) strengths.push('You showed up and completed the full interview — the report below turns it into a concrete practice plan.')

  /* ---------------- weaknesses ---------------- */
  const weaknesses: string[] = []
  if (technical < 70) weaknesses.push(`Technical depth on the role's core requirements is the biggest gap (${technical}/100). Answers named the right tools but rarely explained why they were right for the problem.`)
  if (communication < 70) weaknesses.push(`Delivery reduced clarity (${communication}/100): long sentences and ${fillers || 'some'} filler words made strong points harder to follow.`)
  if (problemSolving < 70) weaknesses.push(`Problem-solving evidence was thin (${problemSolving}/100) — few answers showed the alternatives you rejected, the debugging steps you took, or the constraints you were working under.`)
  if (relevance < 70) weaknesses.push(`Some answers drifted from the question asked (relevance ${relevance}/100).`)
  if (confidence < 70) weaknesses.push(`Hedging language and incomplete claims lowered the confidence signal (${confidence}/100) — this is a delivery pattern, not commentary on your ability.`)
  if (alignment < 70) {
    weaknesses.push(
      `Role alignment was ${alignment}/100. Across ${answered.length || input.reviews.length} answers you addressed ${addressedSkills.length} of the ${requiredSkills.length} requirements this role asks for${
        missingRequirements.length ? `; never mentioned: ${missingRequirements.slice(0, 6).join(', ')}` : ''
      }.`,
    )
  } else if (missingRequirements.length) {
    weaknesses.push(`The role's requirements were mostly covered, but these never came up: ${missingRequirements.slice(0, 5).join(', ')}.`)
  }
  for (const review of weakReviews) {
    if (review.what_to_improve.length) weaknesses.push(`Q${review.question_number}: ${review.what_to_improve[0]}`)
  }
  const recurring = recurringWeakness(answered)
  if (recurring) weaknesses.push(`Recurring pattern across the session: ${recurring}`)
  if (!weaknesses.length) weaknesses.push('No repeating weakness stood out — the next step is raising difficulty and tightening specificity.')

  /* ---------------- recommendations ---------------- */
  const recommendations: string[] = []
  if (missedTopics.length)
    recommendations.push(`Write and speak a two-minute answer for each of these uncovered topics: ${missedTopics.slice(0, 5).join(', ')}.`)
  recommendations.push(
    `Use the Problem → Approach → Technology → Result structure for every technical answer. Practice out loud with a timer: 90 seconds, no notes.`,
  )
  if (communication < 75 || confidence < 75)
    recommendations.push('Record three answers on your phone and count filler words in the playback. Target fewer than three per answer.')
  if (relevance < 80) recommendations.push('Re-state the question in your first sentence ("You are asking about X — in my project I handled it by…"). It keeps you anchored.')
  if (problemSolving < 75) recommendations.push('Practise narrating trade-offs: for two of your own projects, list the option you rejected and why.')
  if (input.job?.responsibilities?.length)
    recommendations.push(`Prepare one concrete story per responsibility in this JD, starting with "${truncate(input.job.responsibilities[0], 70)}".`)
  if (missingRequirements.length)
    recommendations.push(
      `Write a one-line "where I used it" note for each requirement you never mentioned: ${missingRequirements.slice(0, 6).join(', ')}.`,
    )
  recommendations.push('Retake this interview in the same configuration in 5-7 days and compare the dimension scores in Progress.')

  /* ---------------- improvement plan ---------------- */
  const focus1 = missedTopics[0] ?? input.job?.required_skills?.[0] ?? 'core role fundamentals'
  const focus2 = missedTopics[1] ?? input.job?.required_skills?.[1] ?? 'technical depth'
  const improvement_plan: ImprovementWeek[] = [
    {
      week: 1,
      focus: `Close the knowledge gaps: ${focus1}`,
      actions: [
        `Write a 300-word explainer on ${focus1}, then deliver it aloud in under two minutes.`,
        `Re-answer the weak questions in this report (Q${weakReviews.map((r) => r.question_number).slice(0, 3).join(', Q') || '-'}) with the suggested structure.`,
        'Record two answers per day and count filler words and hesitations in the playback.',
      ],
    },
    {
      week: 2,
      focus: `Deepen technical storytelling: ${focus2}`,
      actions: [
        `Prepare three STAR stories (situation, task, action, result) drawn from ${input.resume?.projects?.[0]?.name ?? 'your strongest project'}.`,
        `Add a measurable outcome to every project story: numbers, accuracy, latency, users, time saved.`,
        'Answer five role-specific technical questions in 90 seconds each, out loud, without notes.',
      ],
    },
    {
      week: 3,
      focus: 'Re-test and compare',
      actions: [
        `Retake this interview (${input.jobRole}, ${input.interviewType}) and compare the dimension scores in Progress.`,
        'Target a 5-10 point improvement in your weakest dimension rather than a jump everywhere at once.',
        `Do a final pass on ${input.job?.required_skills?.slice(0, 3).join(', ') || 'the role requirements'} and confirm you can give one worked example each.`,
      ],
    },
  ]

  const recommended_topics = normalizeSkillList(
    [...missingRequirements, ...missedTopics, ...(input.job?.preferred_skills ?? [])].filter(
      (topic) => !coveredTopics.some((covered) => covered.toLowerCase() === topic.toLowerCase()),
    ),
    10,
  )

  const question_reviews = input.reviews.map((review) => ({
    ...review,
    better_approach: review.better_approach || composeBetterApproach(review),
  }))

  return {
    summary: summaryParts.join(' '),
    strengths: dedupe(strengths).slice(0, 7),
    weaknesses: dedupe(weaknesses).slice(0, 6),
    recommendations: dedupe(recommendations).slice(0, 8),
    improvement_plan,
    question_reviews,
    recommended_topics,
    engine: 'local',
  }
}

function average(review: QuestionReview): number {
  const s = review.scores
  return (s.relevance + s.technical_accuracy + s.completeness + s.clarity + s.structure + s.problem_solving) / 6
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>()
  return list.filter((item) => {
    const key = item.toLowerCase().slice(0, 80)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function truncate(value: string, max = 60): string {
  return value.length > max ? `${value.slice(0, max - 1).trim()}…` : value
}

function bestDimension(scores: Record<string, number>): string {
  const labels: Record<string, string> = {
    technical: 'technical knowledge',
    communication: 'communication',
    problemSolving: 'problem solving',
    relevance: 'answer relevance',
    confidence: 'delivery confidence',
    alignment: 'role alignment',
  }
  const entries = Object.entries(scores) as [keyof typeof labels, number][]
  const top = entries.sort((a, b) => b[1] - a[1])[0]!
  return `${labels[top[0]]} (${top[1]}/100)`
}

function worstDimension(scores: Record<string, number>): string {
  const labels: Record<string, string> = {
    technical: 'technical knowledge',
    communication: 'communication',
    problemSolving: 'problem solving',
    relevance: 'answer relevance',
    confidence: 'delivery confidence',
    alignment: 'role alignment',
  }
  const entries = Object.entries(scores) as [keyof typeof labels, number][]
  const bottom = entries.sort((a, b) => a[1] - b[1])[0]!
  return `${labels[bottom[0]]} (${bottom[1]}/100)`
}

function weakReason(review: QuestionReview): string {
  if (!review.answer || review.answer.trim().length < 5) return 'no answer was recorded, which scored zero across every dimension.'
  if (review.missed_topics.length) return `you did not reach ${review.missed_topics.slice(0, 2).join(' or ')}.`
  if (review.scores.structure < 55) return 'the answer had the ingredients but no visible structure.'
  return 'the answer stayed at a high level instead of walking through specifics.'
}

function recurringWeakness(reviews: QuestionReview[]): string | null {
  if (reviews.length < 2) return null
  const lowStructure = reviews.filter((r) => r.scores.structure < 60).length
  const lowComplete = reviews.filter((r) => r.scores.completeness < 60).length
  const lowConfidence = reviews.filter((r) => r.scores.confidence < 60).length
  const lowTechnical = reviews.filter((r) => r.scores.technical_accuracy < 60).length
  const threshold = Math.max(2, Math.ceil(reviews.length * 0.5))
  if (lowComplete >= threshold) return 'answers repeatedly stop short of the expected depth (completeness below 60 in most questions).'
  if (lowStructure >= threshold) return 'answers lack a consistent structure — listeners have to assemble the point themselves.'
  if (lowTechnical >= threshold) return 'technical statements stay generic across questions; specifics and terminology are missing.'
  if (lowConfidence >= threshold) return 'delivery signals (fillers, hedging, short responses) dip consistently in longer answers.'
  return null
}

/* ------------------------------------------------------------------ */
/* Coach (local, deterministic)                                          */
/* ------------------------------------------------------------------ */

export function coachLocally(input: {
  messages: { role: 'user' | 'assistant'; content: string }[]
  resume: ResumeAnalysis | null
  job: JobAnalysis | null
  context: CoachContextSummary
  latestQuestion: string
}): CoachResult {
  const question = input.latestQuestion.toLowerCase()
  const weak = input.context.weak_topics.slice(0, 6)
  const recent = input.context.recent_interview
  const role = input.context.target_role || input.job?.title || 'your target role'
  const skills = input.resume?.skills ?? []
  const jdSkills = input.job?.required_skills ?? []
  const lines: string[] = []
  const practice_questions: { question: string; what_a_strong_answer_covers: string[] }[] = []

  const wantsQuestions = /question|practice|quiz|drill|ask me|mock/.test(question)
  const wantsScore = /mark|lose|score|why.*(low|less)|deduct/.test(question)
  const wantsIntro = /introduc|tell me about yourself|self.?intro/.test(question)
  const wantsTopic = /python|sql|react|java|model|ml|machine learning|system design|project|communication|filler|structure|confidence/.test(question)

  if (wantsScore) {
    if (recent) {
      const weakest = Object.entries({
        technical: recent.technical_score ?? 0,
        communication: recent.communication_score ?? 0,
      }).sort((a, b) => a[1] - b[1])[0]!
      lines.push(
        `In your most recent interview (${recent.job_role}, scored ${Math.round(recent.overall_score ?? 0)}/100), the biggest deduction was in **${weakest[0]}** (${Math.round(weakest[1])}/100).`,
      )
    } else {
      lines.push('You have not completed an interview yet, so there are no marks to explain — run one and I can break the scoring down answer by answer.')
    }
    if (weak.length) lines.push(`Recurring gaps across your sessions: ${weak.join(', ')}. Those are where the points are leaking.`)
    lines.push(
      'The scoring engine marks five dimensions: technical knowledge (30%), communication (20%), problem solving (20%), answer relevance (20%) and role alignment (10%). Depth, structure and relevance move that number fastest — not vocabulary.',
    )
    lines.push('Open the report for the retake plan — each question shows exactly which expected topic was never mentioned.')
  }

  if (wantsIntro) {
    const top = skills.slice(0, 3).join(', ')
    const project = input.resume?.projects?.[0]?.name
    lines.push(
      `Here is a structure for a 45-second introduction aimed at ${role}: 1) who you are and what you build, 2) one proof point${project ? ` — "${project}"` : ''} with a measurable result, 3) why this role, in one sentence.`,
    )
    lines.push(
      `Draft: "I'm a ${input.resume?.headline ?? 'software engineer'} focused on ${top || 'building reliable software'}. ${
        project ? `Most recently I built ${project}, where I handled … and it improved … .` : 'Most recently I worked on … where I improved … .'
      } I'm applying for ${role} because … ."`,
    )
    lines.push('Record it, listen once, and cut every phrase that does not name a technology, a number or an outcome.')
  }

  if (wantsTopic && !wantsScore && !wantsIntro) {
    const topic = ['python', 'sql', 'react', 'java', 'machine learning', 'ml', 'system design', 'communication', 'confidence', 'structure', 'project'].find((t) => question.includes(t))
    if (topic) {
      lines.push(
        `On **${topic}**, work in this order: (1) define it in one sentence, (2) give a project example where you used it, (3) explain one decision or trade-off, (4) state the measurable result.`,
      )
      if (topic === 'communication' || topic === 'confidence' || topic === 'structure') {
        lines.push('For delivery: 90-second answers, three signposted beats, zero filler, and end with the outcome rather than trailing off.')
      } else {
        lines.push(`Prepare three stories around ${topic} now — one from your résumé, one from a failure, one where you chose between options.`)
      }
    }
  }

  if (wantsQuestions || (!lines.length && !wantsIntro)) {
    const sourceTopics = weak.length ? weak : jdSkills.slice(0, 5)
    const fallback = sourceTopics.length ? sourceTopics : ['problem solving', 'technical depth', 'project explanation']
    for (const topic of fallback.slice(0, 5)) {
      practice_questions.push({
        question: `Walk me through ${topic}. What did you do, and what would you change today?`,
        what_a_strong_answer_covers: [topic, 'specific example', 'technical decision', 'measurable outcome'],
      })
    }
  }

  if (!lines.length) {
    lines.push(
      `I coach from your own data: target role ${role}, ${skills.length ? `résumé skills (${skills.slice(0, 5).join(', ')})` : 'no résumé uploaded yet'}, and ${
        recent ? `a recent ${recent.job_role} interview at ${Math.round(recent.overall_score ?? 0)}/100` : 'no completed interviews yet'
      }.`,
    )
    lines.push(
      weak.length
        ? `Your recurring weak topics are ${weak.join(', ')} — ask me about any of them, or ask for practice questions and I will drill those.`
        : 'Ask me why you lost marks, for practice questions on your weak areas, or to rewrite your introduction.',
    )
  }

  const follow_ups = [
    'Why did I lose marks in my last interview?',
    `${weak[0] ? `How do I improve my ${weak[0]} answers?` : `Give me practice questions for ${role}.`}`,
    'Help me improve my introduction.',
  ]

  return {
    reply: lines.join('\n\n'),
    follow_ups,
    practice_questions,
    engine: 'local',
  }
}
