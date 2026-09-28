import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, api } from '../lib/api'
import type { AnswerRecord, EvaluationRecord, InterviewState, QuestionRecord } from '../lib/types'

/**
 * Client-side half of the interview state machine.
 *
 * IDLE → PREPARING → QUESTIONING → ANSWERING → PROCESSING → (FOLLOW_UP | QUESTIONING…) → COMPLETED
 *
 * The server is the source of truth (questions, answers and evaluations are persisted there), so a
 * refresh or a dropped connection resumes exactly where the candidate left off. Submissions are
 * guarded against double clicks and the backend additionally de-duplicates by question id.
 */
export type SessionPhase =
  | 'IDLE'
  | 'PREPARING'
  | 'QUESTIONING'
  | 'ANSWERING'
  | 'PROCESSING'
  | 'FOLLOW_UP'
  | 'COMPLETED'
  | 'ERROR'

export interface SessionModel {
  phase: SessionPhase
  state: InterviewState | null
  currentQuestion: QuestionRecord | null
  lastEvaluation: EvaluationRecord | null
  lastAnswer: AnswerRecord | null
  error: string | null
  busy: boolean
  loading: boolean
  load: () => Promise<void>
  submit: (input: {
    answerText: string
    durationSeconds?: number
    mediaMetrics?: Record<string, unknown> | null
    audioUrl?: string | null
    videoUrl?: string | null
  }) => Promise<{ completed: boolean; evaluation: EvaluationRecord | null }>
  skip: () => Promise<{ completed: boolean }>
  end: () => Promise<void>
  reset: () => void
}

export function useInterviewSession(interviewId: string | undefined): SessionModel {
  const [phase, setPhase] = useState<SessionPhase>('IDLE')
  const [state, setState] = useState<InterviewState | null>(null)
  const [lastEvaluation, setLastEvaluation] = useState<EvaluationRecord | null>(null)
  const [lastAnswer, setLastAnswer] = useState<AnswerRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const inFlight = useRef(false)

  const applyState = useCallback((next: InterviewState) => {
    setState(next)
    if (next.interview.status === 'completed') setPhase('COMPLETED')
    else if (next.currentQuestion) setPhase(next.currentQuestion.is_follow_up ? 'FOLLOW_UP' : 'QUESTIONING')
    else setPhase(next.interview.status === 'processing' ? 'PROCESSING' : 'QUESTIONING')
  }, [])

  const load = useCallback(async () => {
    if (!interviewId) return
    setLoading(true)
    setError(null)
    try {
      const next = await api.getInterview(interviewId)
      applyState(next)
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'We could not load this interview.'
      setError(message)
      setPhase('ERROR')
    } finally {
      setLoading(false)
    }
  }, [interviewId, applyState])

  useEffect(() => {
    void load()
  }, [load])

  const submit = useCallback<SessionModel['submit']>(
    async (input) => {
      if (!interviewId || !state?.currentQuestion) {
        throw new ApiError('There is no question to answer right now.')
      }
      if (inFlight.current) throw new ApiError('Your answer is already being evaluated.')
      inFlight.current = true
      setBusy(true)
      setPhase('PROCESSING')
      setError(null)
      try {
        const response = await api.submitAnswer(interviewId, {
          questionId: state.currentQuestion.id,
          answerText: input.answerText,
          durationSeconds: input.durationSeconds,
          mediaMetrics: input.mediaMetrics ?? null,
          audioUrl: input.audioUrl ?? null,
          videoUrl: input.videoUrl ?? null,
        })
        setLastEvaluation(response.evaluation)
        setLastAnswer(response.answer)
        applyState(response.state)
        return { completed: response.completed, evaluation: response.evaluation }
      } catch (caught) {
        const message = caught instanceof ApiError ? caught.message : 'We could not save that answer. Please try again.'
        setError(message)
        setPhase('QUESTIONING')
        throw caught
      } finally {
        inFlight.current = false
        setBusy(false)
      }
    },
    [interviewId, state, applyState],
  )

  const skip = useCallback(async () => {
    if (!interviewId || !state?.currentQuestion) throw new ApiError('There is no question to skip.')
    if (inFlight.current) throw new ApiError('Please wait for the current answer to finish.')
    inFlight.current = true
    setBusy(true)
    setPhase('PROCESSING')
    try {
      const response = await api.skipQuestion(interviewId, state.currentQuestion.id)
      setLastEvaluation(response.evaluation)
      setLastAnswer(response.answer)
      applyState(response.state)
      return { completed: response.completed }
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'We could not skip that question.'
      setError(message)
      setPhase('QUESTIONING')
      throw caught
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }, [interviewId, state, applyState])

  const end = useCallback(async () => {
    if (!interviewId) return
    setBusy(true)
    setPhase('PROCESSING')
    try {
      const response = await api.endInterview(interviewId)
      setState(response.state)
      setPhase('COMPLETED')
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'We could not finish the interview.'
      setError(message)
      setPhase('QUESTIONING')
      throw caught
    } finally {
      setBusy(false)
    }
  }, [interviewId])

  const reset = useCallback(() => {
    setPhase('IDLE')
    setError(null)
    setLastEvaluation(null)
    setLastAnswer(null)
  }, [])

  return useMemo(
    () => ({
      phase,
      state,
      currentQuestion: state?.currentQuestion ?? null,
      lastEvaluation,
      lastAnswer,
      error,
      busy,
      loading,
      load,
      submit,
      skip,
      end,
      reset,
    }),
    [phase, state, lastEvaluation, lastAnswer, error, busy, loading, load, submit, skip, end, reset],
  )
}
