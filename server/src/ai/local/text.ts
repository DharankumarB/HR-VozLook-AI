export const STOPWORDS = new Set(
  `a about above after again against all am an and any are aren't as at be because been before being below between both but by can cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he her here hers herself him himself his how i if in into is isn't it its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't she should shouldn't so some such than that the their theirs them themselves then there these they this those through to too under until up very was wasn't we were weren't what when where which while who whom why with won't would wouldn't you your yours yourself yourselves also using use used us will would want wanted like just really thing things get got make made much many lot etc via per within across upon among onto able may might must shall am pm eg ie`
    .split(/\s+/)
    .filter(Boolean),
)
const STOPWORDS_EXTENDED = new Set([
  ...STOPWORDS,
  'based',
  'using',
  'work',
  'working',
  'role',
  'team',
  'teams',
  'job',
  'company',
  'candidate',
  'strong',
  'good',
  'great',
  'excellent',
  'ability',
  'skills',
  'skill',
  'experience',
  'experienced',
  'years',
  'year',
  'including',
  'include',
  'includes',
  'responsible',
  'responsibilities',
  'plus',
  'preferred',
  'required',
  'requirement',
  'requirements',
  'knowledge',
  'understanding',
  'familiar',
  'familiarity',
  'proficiency',
  'proficient',
  'environment',
  'opportunity',
  'looking',
  'join',
  'apply',
  'new',
  'well',
  'help',
  'ensure',
  'ensuring',
  'provide',
  'including',
])

export const FILLER_WORDS = [
  'um',
  'uh',
  'umm',
  'uhh',
  'erm',
  'hmm',
  'like',
  'basically',
  'actually',
  'literally',
  'you know',
  'i mean',
  'kind of',
  'sort of',
  'stuff',
  'whatever',
  'okay so',
  'so yeah',
  'right',
]

export const HEDGING_WORDS = [
  'maybe',
  'perhaps',
  'i guess',
  'i think maybe',
  'probably',
  'possibly',
  'i am not sure',
  "i'm not sure",
  'not really sure',
  'might be',
  'somewhat',
  'a bit',
  'hopefully',
  'i believe maybe',
  'i tried',
  'i think it was',
]

export const STORY_MARKERS = [
  'at first',
  'initially',
  'the problem was',
  'the challenge was',
  'we had',
  'i had',
  'my task',
  'my role was',
  'i was responsible',
  'i was asked',
  'the goal was',
  'situation',
  'context',
]

export const ACTION_MARKERS = [
  'i built',
  'i implemented',
  'i designed',
  'i developed',
  'i created',
  'i wrote',
  'i used',
  'i applied',
  'i chose',
  'i decided',
  'we implemented',
  'we built',
  'i started by',
  'i approached',
  'i processed',
  'i trained',
  'i deployed',
  'i refactored',
  'i migrated',
  'i configured',
  'i researched',
  'i compared',
  'i tested',
  'i debugged',
  'i collaborated',
]

export const RESULT_MARKERS = [
  'as a result',
  'which improved',
  'improved',
  'reduced',
  'increased',
  'resulted in',
  'so we',
  'so the',
  'eventually',
  'in the end',
  'finally',
  'the outcome',
  'we achieved',
  'i achieved',
  'achieved',
  'faster',
  'accuracy',
  'performance improved',
  'learned',
  'takeaway',
]

export const STRUCTURE_MARKERS = [
  'first',
  'firstly',
  'second',
  'secondly',
  'third',
  'then',
  'next',
  'after that',
  'finally',
  'to start with',
  'on the other hand',
  'however',
  'therefore',
  'because',
  'in addition',
  'for example',
  'for instance',
  'such as',
  'in summary',
  'to summarise',
  'to summarize',
  'overall',
  'while',
]

export const PICTURE_MARKERS = [
  'for example',
  'for instance',
  'i built',
  'i developed',
  'i implemented',
  'i trained',
  'i designed',
  'i created',
  'i wrote',
  'we built',
  'we implemented',
  'i worked on',
  'i shipped',
  'in one project',
  'in a project',
  'in my project',
  'in the project',
  'we used',
  'i used',
  'in production',
  'at work',
  'during my internship',
  'in my internship',
  'recently i',
  'last year',
  'in college',
  'hackathon',
]

export const TECHNICAL_HINTS = [
  'algorithm',
  'architecture',
  'api',
  'database',
  'model',
  'dataset',
  'feature',
  'pipeline',
  'function',
  'component',
  'library',
  'framework',
  'server',
  'client',
  'query',
  'index',
  'deploy',
  'test',
  'debug',
  'latency',
  'throughput',
  'accuracy',
  'precision',
  'recall',
  'complexity',
  'cache',
  'schema',
  'training',
  'validation',
  'parameter',
  'configuration',
  'endpoint',
  'authentication',
  'encryption',
  'container',
  'cluster',
  'repository',
  'commit',
  'integration',
  'regression',
  'optimi',
]

export function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9+#.'-]*/g) ?? []).filter(Boolean)
}

export function contentWords(text: string): string[] {
  return words(text).filter((w) => w.length > 2 && !STOPWORDS.has(w))
}

export function significantWords(text: string): string[] {
  return words(text).filter((w) => w.length > 2 && !STOPWORDS_EXTENDED.has(w) && !/^\d+$/.test(w))
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])|(?<=[.!?])$|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
}

export function countPhrase(text: string, phrases: string[]): number {
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ')} `
  let total = 0
  for (const phrase of phrases) {
    const needle = ` ${phrase} `
    let index = haystack.indexOf(needle)
    while (index !== -1) {
      total++
      index = haystack.indexOf(needle, index + needle.length - 1)
    }
  }
  return total
}

export function keywordFrequency(text: string, max = 25): { term: string; count: number }[] {
  const tally = new Map<string, number>()
  for (const word of significantWords(text)) {
    if (word.length < 3) continue
    tally.set(word, (tally.get(word) ?? 0) + 1)
  }
  return [...tally.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, max)
}

/** Jaccard-ish overlap of a phrase against a text, tolerant to word order. */
export function phraseOverlap(phrase: string, text: string): number {
  const phraseWords = contentWords(phrase).filter((w) => w.length > 2)
  if (!phraseWords.length) return 0
  const textWords = new Set(words(text))
  let hits = 0
  for (const w of new Set(phraseWords)) {
    if (textWords.has(w)) hits++
    else if (w.endsWith('s') && textWords.has(w.slice(0, -1))) hits += 0.8
    else if (textWords.has(`${w}s`)) hits += 0.8
  }
  return hits / new Set(phraseWords).size
}

export function round(value: number, digits = 0): number {
  const factor = Math.pow(10, digits)
  return Math.round(value * factor) / factor
}

export function similarity(a: string, b: string): number {
  const setA = new Set(contentWords(a))
  const setB = new Set(contentWords(b))
  if (!setA.size || !setB.size) return 0
  let intersection = 0
  for (const token of setA) if (setB.has(token)) intersection++
  return intersection / Math.min(setA.size, setB.size)
}

export function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}
