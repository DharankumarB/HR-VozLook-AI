import type { GeneratedQuestion, QuestionContext } from '../types.js'

/** Last-resort question when both the provider and the curated banks have nothing fresh left. */
export function maybeFallbackQuestion(ctx: QuestionContext): GeneratedQuestion {
  return {
    question: `Let's go deeper on ${ctx.jobRole}: describe a decision you made in a recent technical task, the alternative you rejected, and what the outcome was.`,
    type: 'technical',
    difficulty: 'medium',
    expected_topics: ['context', 'decision made', 'alternative rejected', 'outcome'],
    resume_anchor: null,
    is_follow_up: false,
  }
}
