import type { AnswerEvaluation, AnswerSignals, CoverageItem, CoverageItem as Coverage, EvaluationContext } from '../types.js'
import { detectSkillNames } from './skills.js'
import {
  ACTION_MARKERS,
  FILLER_WORDS,
  HEDGING_WORDS,
  PICTURE_MARKERS,
  RESULT_MARKERS,
  STORY_MARKERS,
  STRUCTURE_MARKERS,
  TECHNICAL_HINTS,
  contentWords,
  countPhrase,
  phraseOverlap,
  round,
  splitSentences,
  words,
} from './text.js'

/**
 * Deterministic answer analyser.
 *
 * It measures linguistic and delivery signals that can be verified from the transcript itself:
 * question/topic coverage, depth, sentence control, filler and hedging density, structural
 * signposting and evidence of reasoning. It deliberately does NOT attempt to judge personality,
 * honesty or mental state, and the UI labels every score a practice metric.
 *
 * When GEMINI_API_KEY is configured the semantic grader runs instead and this analyser supplies
 * the measured delivery signals that feed the confidence dimension.
 */

const OPTIMAL_WORDS: Record<string, [number, number]> = {
  easy: [45, 140],
  medium: [80, 210],
  hard: [110, 280],
}

/**
 * Interview questions ask for concepts, not keywords: "walk me through your architecture" is
 * answered by describing components and decisions. Coverage therefore also accepts a topic when
 * the answer contains the language interviewers expect for that concept.
 */
const TOPIC_RELATED: Record<string, string[]> = {
  architecture: ['design', 'pipeline', 'component', 'service', 'module', 'layer', 'structure', 'flow', 'stack', 'system', 'end to end', 'cnn', 'model', 'backend', 'frontend', 'api', 'chose'],
  design: ['architecture', 'component', 'schema', 'flow', 'structure', 'pattern'],
  tradeoff: ['instead', 'chose', 'because', 'versus', 'alternative', 'cost', 'latency', 'accuracy', 'slower', 'faster', 'weighed'],
  'trade-offs': ['instead', 'chose', 'because', 'versus', 'alternative', 'cost', 'latency', 'accuracy', 'decision'],
  'trade offs': ['instead', 'chose', 'because', 'versus', 'alternative', 'cost', 'decision'],
  contribution: ['i built', 'i wrote', 'i designed', 'i implemented', 'my role', 'i was responsible', 'i led', 'i created', 'i handled'],
  'your specific contribution': ['i built', 'i wrote', 'i designed', 'i implemented', 'my role', 'i was responsible', 'i created'],
  responsibilities: ['i was responsible', 'my role', 'i handled', 'day to day', 'i owned', 'i worked on'],
  testing: ['test', 'unit test', 'integration test', 'coverage', 'verified', 'regression'],
  testing_and_deployment: ['test', 'deploy', 'pipeline', 'ci', 'release'],
  deployment: ['deploy', 'container', 'docker', 'pipeline', 'release', 'production', 'hosted', 'served'],
  observability: ['log', 'metric', 'trace', 'monitor', 'alert', 'dashboard'],
  'evidence gathering': ['log', 'reproduce', 'trace', 'monitor', 'metric', 'data', 'investigate'],
  data: ['dataset', 'frames', 'records', 'samples', 'rows', 'labelled', 'data'],
  dataset: ['dataset', 'frames', 'records', 'samples', 'rows', 'images', 'data'],
  metrics: ['accuracy', 'precision', 'recall', 'f1', 'score', 'latency', 'measured'],
  'model choice': ['chose', 'selected', 'cnn', 'regression', 'transformer', 'baseline', 'model'],
  'model evaluation': ['validation', 'cross validation', 'accuracy', 'precision', 'recall', 'test set', 'holdout'],
  'problem framing': ['problem', 'goal', 'objective', 'needed', 'wanted', 'use case'],
  'your actions': ['i built', 'i started', 'i used', 'i trained', 'i deployed', 'i wrote'],
  'your contribution': ['i built', 'i wrote', 'i designed', 'i implemented', 'my role'],
  outcome: ['result', 'improved', 'reduced', 'increased', 'faster', 'achieved', 'impact', 'shipped', 'caught', 'on schedule', 'delivered', 'resulted', 'led to', 'saved'],
  result: ['result', 'improved', 'reduced', 'increased', 'achieved', 'impact', 'accuracy'],
  'measurable outcome': ['percent', 'reduced', 'improved', 'faster', 'accuracy', 'latency', 'by'],
  resampling: ['class weighting', 'class weights', 'smote', 'augmentation', 'oversampling', 'undersampling', 'focal loss', 'stratified', 'weighted loss'],
  'class weights': ['class weighting', 'weighted loss', 'focal loss', 'augmentation', 'minority'],
  'metric choice': ['precision', 'recall', 'f1', 'accuracy', 'auc', 'metric', 'measured'],
  'threshold tuning': ['threshold', 'cutoff', 'tuned', 'decision boundary'],
  'practical application': ['i used', 'i built', 'in my project', 'i applied', 'i implemented', 'i worked'],
  learning: ['learned', 'next time', 'differently', 'takeaway', 'realised', 'realized'],
  collaboration: ['team', 'we', 'together', 'reviewed', 'pair', 'stakeholder'],
  prioritisation: ['priority', 'first', 'deadline', 'important', 'highest', 'ranked'],
  implementation: ['wrote', 'implemented', 'built', 'code', 'function', 'class', 'api'],
  'implementation detail': ['implemented', 'wrote', 'function', 'code', 'api', 'detail', 'how'],
  efficiency: ['performance', 'faster', 'latency', 'memory', 'optimi', 'speed'],
  security: ['auth', 'encrypt', 'permission', 'token', 'validation', 'secure'],
  /* Behavioral / HR vocabulary — narrative and reflection language instead of technical terms. */
  situation: ['at my', 'during', 'one time', 'when i', 'last year', 'last month', 'we were', 'the problem was', 'context', 'internship', 'deadline', 'in college', 'at work'],
  actions: ['i explained', 'i proposed', 'i suggested', 'i wrote', 'i built', 'i asked', 'i organised', 'i organized', 'i worked with', 'so i'],
  communication: ['explained', 'proposed', 'suggested', 'discussed', 'presented', 'asked', 'listened', 'feedback', 'agreed', 'meeting', 'wrote to', 'shared'],
  impact: ['improved', 'reduced', 'increased', 'faster', 'saved', 'percent', 'result', 'shipped', 'delivered'],
  teamwork: ['team', 'we ', 'together', 'helped', 'pair', 'collaborat'],
  conflict: ['disagree', 'conflict', 'compromise', 'tension', 'debate', 'pushback', 'resolved'],
  motivation: ['because i', 'passionate', 'interested in', 'excited', 'career', 'want to', 'drawn to'],
  goals: ['goal', 'plan', 'next', 'aim', 'target', 'future', 'want to', 'looking for'],
  growth: ['learn', 'improve', 'feedback', 'mentor', 'developed', 'grew', 'training'],
  commitment: ['committed', 'dedicated', 'long term', 'invested', 'stay'],
  failure: ['failed', 'mistake', 'went wrong', 'lesson', 'learned'],
  leadership: ['led', 'mentored', 'owned', 'guided', 'coordinated', 'took charge'],
  'time management': ['priority', 'deadline', 'schedule', 'planned', 'organised', 'organized'],
  adaptability: ['adapted', 'changed', 'new tool', 'learned quickly', 'switched', 'flexible'],
  'handling pressure': ['deadline', 'pressure', 'stress', 'prioritised', 'prioritized', 'calm'],
  'role fit': ['match', 'experience', 'skills', 'contribute', 'excited about'],
  strengths: ['good at', 'strong', 'strength', 'skilled', 'i am able'],
  'areas for improvement': ['working on', 'improve', 'learning', 'struggle', 'get better'],
}

const GENERIC_QUESTION_WORDS = new Set([
  'tell','walk','explain','describe','talk','give','quick','overview','see','mentioned','would','could','please','question',
  'describe','day','day','about','what','when','why','how','which','while','your','you','the','and','for','with','using',
  'experience','worked','working','project','projects','built','build','use','used','think','example','specific','part',
  'role','team','company','thing','things','right','know','need','want','like','just','also','much','many','more','most',
  'case','point','points','level','details','detail','types','type','difference','between','compare','best','better','good',
  'strong','answer','covers','handle','handled','approach','approached','today','instead','again','still','first'
])

/** Words the question is really asking about: skills, named entities and expected topics. */
function questionFocus(question: string, expectedTopics: string[]): string[] {
  const focus = new Set<string>()
  for (const topic of expectedTopics) {
    for (const word of contentWords(topic)) if (word.length > 2) focus.add(word)
  }
  for (const skill of detectSkillNames(question)) focus.add(skill.toLowerCase())
  for (const word of contentWords(question)) {
    if (word.length < 4 || GENERIC_QUESTION_WORDS.has(word)) continue
    focus.add(word)
  }
  // Quoted / capitalised anchors such as a project name
  for (const match of question.matchAll(/"([^"]{3,60})"/g)) {
    for (const word of contentWords(match[1] ?? '')) focus.add(word)
  }
  for (const token of question.split(/\s+/)) {
    const clean = token.replace(/[^A-Za-z]/g, '')
    if (clean.length > 3 && /^[A-Z]/.test(clean) && !GENERIC_QUESTION_WORDS.has(clean.toLowerCase())) focus.add(clean.toLowerCase())
  }
  return [...focus].filter((word) => word.length > 2)
}

function relatedTopics(topic: string): string[] {
  const key = topic.toLowerCase().trim()
  const direct = TOPIC_RELATED[key]
  if (direct) return direct
  for (const [candidate, values] of Object.entries(TOPIC_RELATED)) {
    if (key.includes(candidate) || candidate.includes(key)) return values
  }
  return []
}

function coverageOf(topics: string[], answer: string): Coverage[] {
  const text = answer.toLowerCase()
  const seen = new Map<string, Coverage>()
  for (const rawTopic of topics) {
    const topic = rawTopic.trim()
    if (!topic) continue
    const key = topic.toLowerCase()
    if (seen.has(key)) continue
    const overlap = phraseOverlap(topic, text)
    const topicWords = contentWords(topic).filter((w) => w.length > 2)
    const directHit =
      topicWords.length > 0 && topicWords.some((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text))
    const related = relatedTopics(topic)
    const relatedHits = related.filter((phrase) => text.includes(phrase)).length
    const relatedHit = relatedHits >= (related.length > 8 ? 2 : 1)
    // "your contribution / responsibilities" style topics are evidenced by ownership language.
    const ownershipTopic = /contribution|your role|your actions|responsibilit|involvement|specific/i.test(topic)
    const ownershipHit = ownershipTopic && countPhrase(answer, [...ACTION_MARKERS, 'my role', 'i owned', 'i handled', 'i led']) >= 2
    const covered = overlap >= 0.5 || (topicWords.length === 1 && directHit) || relatedHit || ownershipHit
    let evidence: string | undefined
    if (covered) {
      const sentence = splitSentences(answer).find((s) => phraseOverlap(topic, s) >= 0.45)
      if (sentence) evidence = sentence.split(/\s+/).slice(0, 14).join(' ')
    }
    seen.set(key, { topic, covered, evidence })
  }
  return [...seen.values()]
}

export function computeSignals(answer: string, media?: EvaluationContext['mediaMetrics']): AnswerSignals {
  const clean = answer.trim()
  const wordList = words(clean)
  const sentences = splitSentences(clean)
  const sentenceCount = Math.max(sentences.length, clean ? 1 : 0)
  const avgSentenceWords = sentenceCount ? wordList.length / sentenceCount : 0
  const fillerCount = countPhrase(clean, FILLER_WORDS)
  const hedgingCount = countPhrase(clean, HEDGING_WORDS)
  const uniqueWords = new Set(wordList.filter((w) => w.length > 3))
  const contentWordCount = contentWords(clean).length || 1
  const repetitionRatio = 1 - Math.min(1, uniqueWords.size / Math.max(1, wordList.length * 0.75))
  const digitCount = (clean.match(/\b\d+(\.\d+)?(%|\s*(ms|s|seconds|minutes|hours|k|gb|mb|x))?\b/gi) ?? []).length
  const technicalTerms = wordList.filter((w) => TECHNICAL_HINTS.some((hint) => w.startsWith(hint) || w.includes(hint))).length

  const storyScore = countPhrase(clean, STORY_MARKERS)
  const actionScore = countPhrase(clean, ACTION_MARKERS)
  const resultScore = countPhrase(clean, RESULT_MARKERS)
  const starScore = Math.min(1, (Math.min(storyScore, 1) + Math.min(actionScore, 2) / 2 + Math.min(resultScore, 1)) / 3)

  const duration = media?.duration_seconds
  const wordsPerMinute = duration && duration > 3 ? (wordList.length / duration) * 60 : undefined
  const measuredFillers = media?.filler_count

  return {
    word_count: wordList.length,
    sentence_count: sentenceCount,
    avg_sentence_words: round(avgSentenceWords, 1),
    filler_count: measuredFillers != null ? measuredFillers : fillerCount,
    filler_ratio: round(clamp01((measuredFillers != null ? measuredFillers : fillerCount) / Math.max(12, wordList.length)), 4),
    hedging_count: hedgingCount,
    repetition_ratio: round(clamp01(repetitionRatio), 3),
    example_markers: countPhrase(clean, PICTURE_MARKERS),
    structure_markers: countPhrase(clean, STRUCTURE_MARKERS),
    star_score: round(starScore, 3),
    digits: digitCount,
    technical_terms: technicalTerms,
    unique_word_ratio: round(wordList.length ? uniqueWords.size / wordList.length : 0, 3),
    duration_seconds: duration,
    words_per_minute: wordsPerMinute ? round(wordsPerMinute, 0) : undefined,
    pause_ratio: media?.long_pauses != null ? media.long_pauses : undefined,
    long_pauses: media?.long_pauses,
  }
}

function textHas(text: string, term: string): boolean {
  const needle = term.toLowerCase()
  if (!needle) return false
  if (text.includes(needle)) return true
  if (needle.length > 4 && text.includes(needle.slice(0, Math.max(4, needle.length - 2)))) return true
  return false
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function band(value: number, min: number, max: number): number {
  if (value >= min && value <= max) return 1
  if (value < min) return clamp01(value / Math.max(1, min))
  return clamp01(1 - (value - max) / Math.max(20, max * 1.4))
}

function round1(value: number): number {
  return round(value, 1)
}

export function evaluateAnswerLocally(ctx: EvaluationContext): AnswerEvaluation {
  const answer = (ctx.answer ?? '').trim()
  const media = ctx.mediaMetrics ?? null

  if (!answer || answer.replace(/[^a-z0-9]/gi, '').length < 3) {
    const signals = computeSignals('', media)
    return {
      relevance: 0,
      technical_accuracy: 0,
      completeness: 0,
      clarity: 0,
      structure: 0,
      problem_solving: 0,
      confidence: 0,
      coverage: ctx.expectedTopics.map((topic) => ({ topic, covered: false })),
      feedback:
        'No answer was captured for this question, so it could not be assessed. In a real interview, say what you know out loud or acknowledge the gap and describe how you would find the answer — silence scores nothing.',
      strengths: [],
      improvements: [
        'Provide an answer next time: even a partial, structured attempt earns more than a blank response.',
        'If you do not know the topic, say so and explain how you would approach it.',
      ],
      signals,
      engine: 'local',
    }
  }

  const signals = computeSignals(answer, media)
  const coverage = coverageOf(ctx.expectedTopics ?? [], answer)
  const coverageRatio = coverage.length ? coverage.filter((c) => c.covered).length / coverage.length : 0.5

  const roleSkills = (ctx.job?.required_skills ?? []).slice(0, 20)
  const roleSkillHits = roleSkills.filter((skill) => phraseOverlap(skill, answer) >= 0.6).length
  const roleSkillRatio = roleSkills.length ? roleSkillHits / Math.min(roleSkills.length, 8) : 0

  const [minWords, maxWords] = OPTIMAL_WORDS[ctx.difficulty] ?? OPTIMAL_WORDS.medium!
  const depth = band(signals.word_count, minWords, maxWords)
  const sentenceControl = band(signals.avg_sentence_words, 8, 26)

  // ---- relevance -------------------------------------------------------
  // Two questions matter: did the answer address the specific thing that was asked (focus terms),
  // and did it cover the concepts a strong answer must contain (expected topics)?
  const focusTerms = questionFocus(ctx.question, ctx.expectedTopics ?? [])
  const focusHits = focusTerms.filter((term) => textHas(answer, term)).length
  const focusOverlap = focusTerms.length ? focusHits / focusTerms.length : coverageRatio
  const grounding = coverage.length ? 0.55 * coverageRatio + 0.45 * focusOverlap : focusOverlap

  const depthFactor = clamp01(signals.word_count / Math.max(40, minWords))
  let relevance = 18 + 60 * clamp01(grounding) + 12 * depthFactor + Math.min(6, signals.technical_terms)
  if (signals.word_count < 20) relevance *= 0.62
  if (coverage.length && coverageRatio === 0 && focusOverlap < 0.35) relevance = Math.min(relevance, 34)
  // Naming and addressing the central concept counts even when the answer is brief.
  if (coverage[0]?.covered) relevance = Math.max(relevance, 45)
  relevance = Math.max(8, Math.min(97, relevance))

  // ---- technical accuracy ---------------------------------------------
  // Verification of factual correctness needs the semantic grader; this dimension measures
  // technical depth signals: role/expected-topic coverage, domain vocabulary density and specificity.
  const topicTechnical = coverage.length
    ? coverage.filter((c) => c.covered).length / coverage.length
    : clamp01(coverageRatio)
  const technicalDensity = clamp01(signals.technical_terms / Math.max(6, signals.word_count / 18))
  let technical = 30 + 40 * topicTechnical + 20 * technicalDensity + 8 * clamp01(roleSkillRatio)
  if (signals.word_count < 30) technical *= 0.7
  if (signals.digits > 0) technical += 3
  technical = Math.max(5, Math.min(97, technical))

  // ---- completeness ---------------------------------------------------
  let completeness = 30 + 50 * coverageRatio + 20 * depth + Math.min(6, signals.example_markers * 2)
  if (ctx.questionType === 'behavioral' && signals.star_score > 0) completeness += 4
  completeness = Math.max(5, Math.min(97, completeness))

  // ---- clarity --------------------------------------------------------
  const fillerPenalty = Math.min(26, signals.filler_ratio * 130)
  const repetitionPenalty = Math.min(10, Math.max(0, signals.repetition_ratio - 0.55) * 40)
  const longSentencePenalty = Math.max(0, signals.avg_sentence_words - 30) * 1.1
  let clarity = 92 - fillerPenalty - repetitionPenalty - longSentencePenalty + 12 * sentenceControl
  if (signals.word_count < 25) clarity -= 22
  const measuredClarity = media?.clarity_score
  if (measuredClarity != null) clarity = 0.65 * clarity + 0.35 * measuredClarity
  clarity = Math.max(5, Math.min(98, clarity))

  // ---- structure ------------------------------------------------------
  let structure =
    46 +
    16 * Math.min(1, signals.structure_markers / 3) +
    14 * signals.star_score +
    10 * Math.min(1, signals.example_markers / 2) +
    Math.min(8, signals.digits * 2) +
    6 * band(signals.sentence_count, 3, 12)
  if (signals.avg_sentence_words > 34) structure -= 8
  if (signals.word_count < 25) structure -= 18
  structure = Math.max(5, Math.min(97, structure))

  // ---- problem solving -------------------------------------------------
  const tradeoffWords = countPhrase(answer, ['because', 'trade-off', 'tradeoff', 'instead', 'alternative', 'decided', 'chose', 'compared', 'reason', 'why', 'approach', 'step', 'optimis', 'optimiz', 'constraint', 'assumption', 'edge case', 'scal'])
  let problemSolving =
    40 +
    14 * signals.star_score +
    Math.min(18, tradeoffWords * 3) +
    14 * depth +
    Math.min(10, signals.technical_terms / 3) +
    8 * clamp01(roleSkillRatio)
  if (ctx.questionType === 'behavioral' && signals.star_score < 0.2) problemSolving -= 10
  problemSolving = Math.max(5, Math.min(97, problemSolving))

  // ---- confidence (delivery signals only) ------------------------------
  const hedgePenalty = Math.min(22, signals.hedging_count * 6)
  const specificity = Math.min(12, signals.digits * 3 + signals.example_markers * 3)
  let confidence = 84 - fillerPenalty * 1.2 - hedgePenalty + specificity + 6 * clamp01(signals.unique_word_ratio)
  if (media?.camera_engagement != null) confidence = 0.85 * confidence + 0.15 * media.camera_engagement
  if (media?.speaking_rate_wpm != null) {
    const rate = media.speaking_rate_wpm
    if (rate < 95) confidence -= Math.min(10, (95 - rate) * 0.25)
    else if (rate > 190) confidence -= Math.min(8, (rate - 190) * 0.15)
  }
  if (signals.long_pauses != null) confidence -= Math.min(10, signals.long_pauses * 2)
  confidence = Math.max(5, Math.min(97, confidence))

  const scores = {
    relevance: Math.round(relevance),
    technical_accuracy: Math.round(technical),
    completeness: Math.round(completeness),
    clarity: Math.round(clarity),
    structure: Math.round(structure),
    problem_solving: Math.round(problemSolving),
    confidence: Math.round(confidence),
  }

  const missed = coverage.filter((c) => !c.covered).map((c) => c.topic)
  const covered = coverage.filter((c) => c.covered).map((c) => c.topic)

  const strengths: string[] = []
  if (covered.length) strengths.push(`Covered the core ground: ${covered.slice(0, 3).join(', ')}.`)
  if (signals.structure_markers >= 2) strengths.push('Signposted the answer, which made the reasoning easy to follow.')
  if (signals.example_markers >= 1) strengths.push('Backed the answer with a concrete example from your own work.')
  if (signals.digits >= 2) strengths.push('Used specific numbers, which makes claims verifiable.')
  if (signals.star_score >= 0.5) strengths.push('Told it as a story (situation → action → result) rather than listing facts.')
  if (signals.filler_ratio < 0.015 && signals.word_count > 40) strengths.push('Clean delivery with almost no filler words.')
  if (signals.word_count >= maxWords) strengths.push('Answered with real depth rather than a one-line summary.')

  const improvements: string[] = []
  if (missed.length) improvements.push(`Work these points in next time: ${missed.slice(0, 4).join(', ')}.`)
  if (signals.filler_count >= 4)
    improvements.push(`Reduce filler words ("${FILLER_WORDS.slice(0, 4).join('", "')}" …) — ${signals.filler_count} detected, they dilute authority.`)
  if (signals.hedging_count >= 2) improvements.push('Replace hedging ("maybe", "I guess") with a direct claim plus your reasoning.')
  if (signals.example_markers === 0) improvements.push('Add one concrete example (Problem → Approach → Technology → Result) to make the answer credible.')
  if (signals.digits === 0 && signals.word_count > 60) improvements.push('Quantify something: dataset size, latency, accuracy, users, time saved.')
  if (signals.word_count < minWords) improvements.push(`Expand to roughly ${minWords}-${maxWords} words — the answer was ${signals.word_count} words, which reads as thin for a ${ctx.difficulty} question.`)
  if (signals.word_count > maxWords * 1.35) improvements.push(`Tighten the answer — ${signals.word_count} words is long; lead with the headline, then support it.`)
  if (signals.avg_sentence_words > 30) improvements.push('Break up long sentences; aim for 12-22 words per sentence.')
  if (signals.structure_markers === 0) improvements.push('Structure the answer explicitly: "First…, then…, finally…".')
  if (!improvements.length) improvements.push('Keep the same structure and add one measurable outcome to make it even stronger.')

  const feedbackParts: string[] = []
  const verdict =
    scores.relevance >= 75 && scores.technical_accuracy >= 70
      ? 'That is a solid answer'
      : scores.relevance >= 55
        ? 'That answer lands partially'
        : 'That answer drifts away from what was asked'
  feedbackParts.push(`${verdict}.`)
  if (covered.length) feedbackParts.push(`You handled ${covered.slice(0, 2).join(' and ')}.`)
  if (missed.length) feedbackParts.push(`The interviewer would still want to hear about ${missed.slice(0, 2).join(' and ')}.`)
  if (signals.filler_count >= 4) feedbackParts.push(`${signals.filler_count} filler words were counted — slowing down for one breath would fix that.`)
  if (signals.word_count < minWords) feedbackParts.push(`At ${signals.word_count} words this is shorter than a strong ${ctx.difficulty} answer.`)
  else if (signals.example_markers === 0) feedbackParts.push('There is no concrete example yet — one worked example would lift this significantly.')

  return {
    ...scores,
    coverage,
    feedback: feedbackParts.join(' '),
    strengths: strengths.slice(0, 4),
    improvements: improvements.slice(0, 4),
    signals,
    engine: 'local',
  } satisfies AnswerEvaluation
}

export function coverageSummary(coverage: CoverageItem[]): { covered: string[]; missed: string[] } {
  return {
    covered: coverage.filter((c) => c.covered).map((c) => c.topic),
    missed: coverage.filter((c) => !c.covered).map((c) => c.topic),
  }
}

export function roundScores(evaluation: AnswerEvaluation) {
  return {
    relevance: Math.round(evaluation.relevance),
    technical_accuracy: Math.round(evaluation.technical_accuracy),
    completeness: Math.round(evaluation.completeness),
    clarity: Math.round(evaluation.clarity),
    structure: Math.round(evaluation.structure),
    problem_solving: Math.round(evaluation.problem_solving),
    confidence: Math.round(evaluation.confidence),
  }
}

export { round1 }
