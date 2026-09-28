import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Headphones,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Send,
  Sparkles,
  StopCircle,
  Video as VideoIcon,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import {
  VideoStage,
  VoiceRecorder,
  mediaRecorderSupported,
  speechRecognitionSupported,
  speechSynthesisSupported,
  useCamera,
  useDeliveryObservations,
  useSessionTimer,
  useVoiceRecorder,
} from '../components/interview/MediaStage'
import { ImmersiveRoom } from '../components/interview/ImmersiveRoom'
import { useInterviewerSpeech, type AvatarState } from '../components/interview/AvatarInterviewer'
import { CandidateBubble, InstantFeedback, ProgressRail, QuestionCard, TurnCounter } from '../components/interview/SessionPanels'
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, Modal, ProgressBar } from '../components/ui/primitives'
import { ApiError, api } from '../lib/api'
import { AVATAR_DISCLAIMER, METRIC_LABELS, PERSONAS } from '../lib/constants'
import { badgeTone, formatDuration, scoreTone, toneClasses } from '../lib/format'
import { useInterviewSession } from '../state/useInterviewSession'
import { useMeta } from '../lib/meta'
import { useToast } from '../state/ToastContext'

const FILLERS = ['um', 'uh', 'erm', 'like', 'you know', 'basically', 'actually', 'sort of']

function countFillers(text: string): number {
  const lower = text.toLowerCase()
  return FILLERS.reduce((total, filler) => {
    const matches = lower.match(new RegExp(`\\b${filler.replace(' ', '\\s+')}\\b`, 'g'))
    return total + (matches?.length ?? 0)
  }, 0)
}

export default function InterviewSession() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const session = useInterviewSession(id)
  const { meta } = useMeta()
  const camera = useCamera()
  const [speakerEnabled, setSpeakerEnabled] = useState(true)

  /* The avatar's voice: one speaker, cancelled before every utterance so audio can never overlap. */
  const [answerText, setAnswerText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(true)
  const [endOpen, setEndOpen] = useState(false)
  const [observations, setObservations] = useState<{ camera_engagement: number; posture_consistency: number; movement_level: number } | null>(null)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const [reportPolling, setReportPolling] = useState(false)
  const spokenQuestionId = useRef<string | null>(null)
  const timer = useSessionTimer(session.phase === 'ANSWERING' || session.phase === 'FOLLOW_UP' || session.phase === 'QUESTIONING')

  /* The avatar's voice: one speaker, cancelled before every utterance so audio can never overlap. */
  const speech = useInterviewerSpeech({ rate: 0.97, pitch: 1, lang: 'en-US' })
  const recorder = useVoiceRecorder({ maxSeconds: 300 })
  useDeliveryObservations(camera, setObservations)

  const interview = session.state?.interview
  const mode = interview?.interview_mode ?? 'text'
  const question = session.currentQuestion
  const persona = useMemo(() => {
    const stored = (session.state?.interview as unknown as { settings?: Record<string, unknown> } | undefined)?.settings?.persona
    const match = PERSONAS.find((entry) => entry.id === stored)
    return match?.id ?? PERSONAS[0]!.id
  }, [session.state?.interview])

  /* Keep the typed answer in sync with the live transcript while recording. */
  useEffect(() => {
    if (mode !== 'text' && recorder.transcript) setAnswerText(recorder.transcript)
  }, [mode, recorder.transcript])

  /**
   * Speak each new question once it is actually available.
   *
   * The avatar must never start talking before the question text exists, and it must never talk over a
   * previous utterance — `speech.speak` cancels any in-flight audio first.
   */
  useEffect(() => {
    if (!question?.question || mode === 'text' || !speakerEnabled) return
    if (spokenQuestionId.current === question.id) return
    spokenQuestionId.current = question.id
    speech.speak(question.question)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id, mode, speakerEnabled])

  const interviewLanguage = useMemo(() => {
    const stored = (session.state?.interview as unknown as { settings?: Record<string, unknown> } | undefined)?.settings?.language
    const code = typeof stored === 'string' ? stored : meta?.default_language ?? 'en'
    return code
  }, [session.state?.interview, meta?.default_language])

  /* Ask for the microphone once we know the interview mode. */
  useEffect(() => {
    if (mode === 'text') return
    if (mode === 'video' && !camera.ready && !camera.error) void camera.start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  /* Warn before a refresh discards the on-screen answer. The interview itself is saved server-side. */
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!answerText.trim()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [answerText])

  /* The report is generated right after the last answer — poll until it is stored. */
  useEffect(() => {
    if (session.phase !== 'COMPLETED' || session.state?.hasReport) {
      setReportPolling(false)
      return
    }
    setReportPolling(true)
    let attempts = 0
    const interval = window.setInterval(() => {
      attempts += 1
      void session
        .load()
        .then(() => undefined)
        .catch(() => undefined)
      if (attempts >= 14) {
        window.clearInterval(interval)
        setReportPolling(false)
      }
    }, 2500)
    return () => window.clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.phase, session.state?.hasReport])

  const wordCount = useMemo(() => answerText.trim().split(/\s+/).filter(Boolean).length, [answerText])

  const mediaMetrics = useMemo(() => {
    const metrics: Record<string, unknown> = {
      word_count: wordCount,
      duration_seconds: Math.max(recorder.durationSeconds, timer.seconds),
      filler_count: countFillers(answerText),
    }
    if (wordCount && metrics.duration_seconds) {
      const minutes = Math.max(Number(metrics.duration_seconds) / 60, 0.15)
      metrics.speaking_rate_wpm = Math.round(wordCount / minutes)
    }
    if (observations) Object.assign(metrics, observations)
    return metrics
  }, [answerText, recorder.durationSeconds, timer.seconds, wordCount, observations])

  const submit = useCallback(async () => {
    if (!session.currentQuestion) return
    if (wordCount < 4) {
      toast.error('Answer too short', 'Give at least a couple of sentences so the AI can evaluate your reasoning.')
      return
    }
    setSubmitting(true)
    setUploadNotice(null)
    try {
      let audioUrl: string | null = null
      if (recorder.audioBlob && mediaRecorderSupported && id) {
        try {
          const uploaded = await api.uploadMedia(id, recorder.audioBlob, 'audio', `answer-${session.currentQuestion.id}.webm`)
          audioUrl = uploaded.url
        } catch {
          setUploadNotice('Your recording could not be attached — the written transcript was still evaluated.')
        }
      }
      const result = await session.submit({
        answerText: answerText.trim(),
        durationSeconds: Math.max(recorder.durationSeconds, timer.seconds),
        mediaMetrics,
        audioUrl,
      })
      setAnswerText('')
      recorder.reset()
      timer.reset()
      setFeedback(true)
      if (result.completed) {
        toast.success('Interview complete', 'Generating your practice report…')
      } else {
        toast.success('Answer saved', 'Here comes the next question.')
      }
    } catch (caught) {
      toast.error('Could not save the answer', caught instanceof ApiError ? caught.message : 'Please try again in a moment.')
    } finally {
      setSubmitting(false)
    }
  }, [session, answerText, recorder, timer, mediaMetrics, wordCount, toast, id])

  const skip = useCallback(async () => {
    setSubmitting(true)
    try {
      const result = await session.skip()
      setAnswerText('')
      recorder.reset()
      timer.reset()
      toast.warning('Question skipped', result.completed ? 'Interview complete — generating your report.' : 'Skipped questions are scored as gaps in your report.')
    } catch (caught) {
      toast.error('Could not skip', caught instanceof ApiError ? caught.message : 'Please try again.')
    } finally {
      setSubmitting(false)
    }
  }, [session, recorder, timer, toast])

  const finishNow = useCallback(async () => {
    setEndOpen(false)
    try {
      await session.end()
      toast.success('Interview finished', 'Your report is ready.')
    } catch (caught) {
      toast.error('Could not finish the interview', caught instanceof ApiError ? caught.message : 'Please try again.')
    }
  }, [session, toast])

  /* ---------------------------------------------------------------- */
  /* Screens                                                           */
  /* ---------------------------------------------------------------- */

  if (!id) {
    return (
      <AppShell title="Interview">
        <ErrorState title="Missing interview" message="This link does not point to an interview." />
      </AppShell>
    )
  }

  if (session.loading) {
    return (
      <AppShell title="Preparing your interview" subtitle="Loading your session…">
        <Card>
          <LoadingState label="Fetching your interview…" rows={4} />
        </Card>
      </AppShell>
    )
  }

  if (session.phase === 'ERROR' || !session.state || !interview) {
    return (
      <AppShell title="Interview">
        <ErrorState
          title="We could not load this interview"
          message={session.error ?? 'The session may have been removed.'}
          onRetry={() => void session.load()}
        />
        <div className="mt-4">
          <Link to="/dashboard" className="btn-secondary">
            Back to dashboard
          </Link>
        </div>
      </AppShell>
    )
  }

  const live = session.state.liveScores
  const planned = interview.question_count
  const asked = session.state.progress.asked
  const currentIndex = Math.min(asked || 1, planned)

  if (session.phase === 'COMPLETED') {
    return (
      <AppShell title="Interview complete" subtitle={`${interview.job_role} · ${interview.interview_type} · ${interview.interview_mode}`}>
        <div className="space-y-6">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-success/15">
                <CheckCircle2 className="h-7 w-7 text-success" aria-hidden />
              </span>
              <h2 className="mt-4 text-xl font-semibold text-ink-50">You finished the interview</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-ink-300">
                {live.answered_count} of {planned} questions answered. Your practice report breaks down every answer, the topics you missed and a
                plan for the next three weeks.
              </p>

              <div className="mx-auto mt-6 grid max-w-2xl gap-4 sm:grid-cols-2">
                {(
                  [
                    ['overall_score', live.overall_score],
                    ['technical_score', live.technical_score],
                    ['communication_score', live.communication_score],
                    ['relevance_score', live.relevance_score],
                  ] as [string, number][]
                ).map(([key, value]) => (
                  <ProgressBar key={key} value={value} label={METRIC_LABELS[key]} showValue />
                ))}
              </div>

              <div className="mt-7 flex flex-wrap justify-center gap-3">
                {session.state.hasReport ? (
                  <Link to={`/interview/${interview.id}/report`} className="btn-primary !px-6 !py-3">
                    View full report
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                ) : (
                  <span className="btn-secondary !px-6 !py-3">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    {reportPolling ? 'Preparing your report…' : 'Report queued'}
                  </span>
                )}
                <Link to="/dashboard" className="btn-ghost !px-6 !py-3">
                  Back to dashboard
                </Link>
              </div>
              {!session.state.hasReport ? (
                <button type="button" className="mt-4 text-2xs text-accent-soft hover:underline" onClick={() => void session.load()}>
                  Check again
                </button>
              ) : null}
            </Card>
          </motion.div>

          <Card>
            <p className="section-title">Your answers</p>
            <ul className="mt-3 space-y-3">
              {session.state.answers.map((answer) => {
                const questionRecord = session.state?.questions.find((item) => item.id === answer.question_id)
                const evaluation = session.state?.evaluations.find((item) => item.answer_id === answer.id)
                return (
                  <li key={answer.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                    <p className="text-xs text-ink-400">{questionRecord?.question}</p>
                    <p className="mt-1.5 line-clamp-3 text-sm text-ink-200">{answer.answer_text || 'Skipped'}</p>
                    {evaluation ? (
                      <p className={`mt-2 text-2xs ${toneClasses[scoreTone(evaluation.relevance_score)].text}`}>
                        Relevance {Math.round(evaluation.relevance_score)}% · Technical {Math.round(evaluation.technical_score)}%
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>
      </AppShell>
    )
  }

  const modeFallback = mode !== 'text' && (mode === 'voice' ? !speechRecognitionSupported : !speechRecognitionSupported && !camera.ready)

  /* ------------------------------------------------------------------ */
  /* Avatar interview room (voice + video modes)                         */
  /* ------------------------------------------------------------------ */

  if (mode !== 'text') {
    // Derived from what is actually happening on screen: speaking, listening, thinking or idle.
    const avatarState: AvatarState = speech.speaking
      ? question?.is_follow_up
        ? 'FOLLOW_UP'
        : 'SPEAKING'
      : session.phase === 'PROCESSING'
        ? 'PROCESSING'
        : recorder.recording
          ? 'LISTENING'
          : session.phase === 'QUESTIONING' || session.phase === 'PREPARING'
            ? 'THINKING'
            : 'IDLE'

    return (
      <ImmersiveRoom
        question={question}
        questionIndex={currentIndex - 1}
        totalQuestions={planned}
        timerSeconds={timer.seconds}
        avatarState={avatarState}
        avatarSpeaking={speech.speaking}
        mouthOpenness={speech.mouthOpenness}
        persona={persona}
        camera={camera}
        mode={mode}
        answerText={answerText}
        onAnswerTextChange={setAnswerText}
        onSubmit={() => void submit()}
        onSkip={() => void skip()}
        onEnd={() => setEndOpen(true)}
        onReplayQuestion={() => question && speakerEnabled && speech.speak(question.question)}
        onToggleRecorder={() => void (recorder.recording ? recorder.stop() : recorder.start())}
        onToggleSpeaker={() => {
          if (speakerEnabled) speech.stop()
          setSpeakerEnabled(!speakerEnabled)
        }}
        voiceSupported={speech.supported}
        speakerEnabled={speakerEnabled}
        recorder={recorder}
        submitting={submitting || session.phase === 'PROCESSING'}
        canSubmit={Boolean(question) && wordCount >= 4 && !recorder.recording}
        notice={
          camera.error
            ? `${camera.error} You can continue with a voice interview — every question is still spoken and your microphone still records.`
            : modeFallback
              ? 'Speech recognition is unavailable in this browser, so type your answer in the panel above. The evaluation is identical.'
              : uploadNotice
        }
        finished={false}
        footer={
          <>
            <Modal
              open={endOpen}
              onClose={() => setEndOpen(false)}
              title="End the interview now?"
              description="Unanswered questions are recorded as gaps. You will still receive a full report for the answers you have already given."
              footer={
                <>
                  <Button variant="ghost" onClick={() => setEndOpen(false)}>
                    Keep going
                  </Button>
                  <Button variant="danger" onClick={() => void finishNow()}>
                    End and generate report
                  </Button>
                </>
              }
            />
            <p className="pb-2 text-center text-2xs text-ink-600">{AVATAR_DISCLAIMER}</p>
          </>
        }
      />
    )
  }

  return (
    <AppShell
      title={interview.job_role}
      subtitle={`${interview.interview_type} interview · ${interview.difficulty} · ${mode} mode`}
      actions={
        <div className="flex items-center gap-2">
          {mode !== 'text' && speech.supported ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (speakerEnabled) speech.stop()
                setSpeakerEnabled(!speakerEnabled)
              }}
              icon={speakerEnabled ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
            >
              {speakerEnabled ? 'Interviewer voice on' : 'Voice off'}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => setEndOpen(true)} icon={<StopCircle className="h-4 w-4" aria-hidden />}>
            Finish now
          </Button>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Card className="!p-4 sm:!p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent">
                  <Clock className="h-3 w-3" aria-hidden /> {formatDuration(timer.seconds)} this answer
                </Badge>
                <Badge tone="neutral">
                  {interview.interview_mode === 'text' ? (
                    <MessageSquare className="h-3 w-3" aria-hidden />
                  ) : interview.interview_mode === 'voice' ? (
                    <Mic className="h-3 w-3" aria-hidden />
                  ) : (
                    <VideoIcon className="h-3 w-3" aria-hidden />
                  )}
                  {interview.interview_mode}
                </Badge>
                {session.lastEvaluation ? (
                  <Badge tone={badgeTone(scoreTone(session.lastEvaluation.relevance_score))}>
                    Last answer {Math.round(session.lastEvaluation.relevance_score)}% relevant
                  </Badge>
                ) : null}
              </div>
              <p className="text-2xs text-ink-500">Answers are saved to your account as you submit them.</p>
            </div>
            <div className="mt-4">
              <ProgressRail answered={session.state.progress.answered} planned={planned} asked={asked} currentIndex={currentIndex} />
            </div>
          </Card>

          {session.error ? <ErrorState title="Something went wrong" message={session.error} onRetry={() => void session.load()} /> : null}

          <Card>
            <AnimatePresence mode="wait">
              {question ? (
                <QuestionCard
                  key={question.id}
                  question={question}
                  index={currentIndex}
                  total={planned}
                  isFollowUp={question.is_follow_up}
                />
              ) : (
                <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <LoadingState label="Preparing your next question…" rows={2} />
                </motion.div>
              )}
            </AnimatePresence>

            {mode !== 'text' && speech.supported ? (
              <button
                type="button"
                onClick={() => question && speakerEnabled && speech.speak(question.question)}
                className="mt-3 inline-flex items-center gap-1.5 text-2xs text-accent-soft hover:underline"
              >
                <Headphones className="h-3 w-3" aria-hidden /> Read the question aloud again
              </button>
            ) : null}
          </Card>

          {/* Answer area */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="section-title">Your answer</p>
              <TurnCounter seconds={timer.seconds} words={wordCount} />
            </div>

            {modeFallback ? (
              <p className="mt-3 flex items-start gap-2 rounded-2xl border border-warning/30 bg-warning/[0.07] p-3 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {mode === 'video'
                  ? camera.error ?? 'Camera access is unavailable in this browser. You can keep answering by voice or typing.'
                  : 'Speech recognition is not available in this browser. Type your answer — the evaluation works exactly the same.'}
              </p>
            ) : null}

            {speechRecognitionSupported ? (
              <div className="mt-4">
                <VoiceRecorder recorder={recorder} />
              </div>
            ) : null}

            <div className="mt-4">
              <textarea
                value={answerText}
                onChange={(event) => setAnswerText(event.target.value)}
                rows={7}
                disabled={submitting || session.phase === 'PROCESSING'}
                placeholder={
                  mode === 'text'
                    ? 'Structure your answer: what the situation was, what you did, and the result. Aim for 60–120 seconds of speaking.'
                    : 'Your spoken answer appears here as you talk — edit it before submitting if the transcription needs a fix.'
                }
                className="input-base min-h-[9rem] text-sm leading-relaxed"
                aria-label="Your answer"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-2xs text-ink-500">
                <span>
                  {wordCount} words · {answerText.length} characters
                  {countFillers(answerText) ? ` · ${countFillers(answerText)} filler word${countFillers(answerText) > 1 ? 's' : ''}` : ''}
                </span>
                {recorder.recording ? (
                  <span className="text-danger">Recording — stop the mic before submitting.</span>
                ) : null}
              </div>
            </div>

            {uploadNotice ? <p className="mt-3 text-2xs text-warning">{uploadNotice}</p> : null}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                onClick={() => void submit()}
                loading={submitting || session.phase === 'PROCESSING'}
                disabled={!question || wordCount < 1 || recorder.recording}
                icon={<Send className="h-4 w-4" aria-hidden />}
              >
                Submit Answer
              </Button>
              <Button variant="ghost" onClick={() => void skip()} disabled={!question || submitting} icon={<X className="h-4 w-4" aria-hidden />}>
                Skip question
              </Button>
              {session.phase === 'PROCESSING' ? (
                <span className="flex items-center gap-2 text-xs text-ink-400">
                  <Sparkles className="h-3.5 w-3.5 animate-pulse text-accent" aria-hidden />
                  Analysing your answer…
                </span>
              ) : null}
            </div>
          </Card>

          <AnimatePresence>
            {session.lastEvaluation && feedback && session.phase !== 'PROCESSING' ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
                <InstantFeedback evaluation={session.lastEvaluation} onDismiss={() => setFeedback(false)} />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {session.lastAnswer?.answer_text ? (
            <div className="space-y-3">
              <CandidateBubble>{session.lastAnswer.answer_text}</CandidateBubble>
            </div>
          ) : null}
        </div>

        {/* Side rail */}
        <div className="space-y-5">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <p className="section-title">Live practice scores</p>
              <Badge tone={badgeTone(scoreTone(live.overall_score))}>Overall {Math.round(live.overall_score)}%</Badge>
            </div>
            <div className="mt-4 space-y-3">
              {(
                [
                  ['technical_score', live.technical_score],
                  ['communication_score', live.communication_score],
                  ['problem_solving_score', live.problem_solving_score],
                  ['relevance_score', live.relevance_score],
                  ['role_alignment_score', live.role_alignment_score],
                ] as [string, number][]
              ).map(([key, value]) => (
                <ProgressBar key={key} value={value} label={METRIC_LABELS[key]} showValue size="sm" />
              ))}
            </div>
            <p className="mt-4 text-2xs leading-relaxed text-ink-500">
              Weighted from the answers submitted so far using the documented formulas. These are practice signals, not a hiring decision.
            </p>
          </Card>

          <Card>
            <p className="section-title">Session details</p>
            <dl className="mt-3 space-y-2 text-xs">
              {[
                ['Role', interview.job_role],
                ['Type', interview.interview_type],
                ['Difficulty', interview.difficulty],
                ['Mode', interview.interview_mode],
                ['Questions planned', String(planned)],
                ['Answers evaluated', `${session.state.evaluations.length}`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-ink-500">{label}</dt>
                  <dd className="text-right text-ink-200">{value}</dd>
                </div>
              ))}
            </dl>
            {session.state.resumeSummary ? (
              <p className="mt-4 text-2xs text-ink-500">
                Résumé: {session.state.resumeSummary.file_name} · {session.state.resumeSummary.skills.length} skills detected
              </p>
            ) : null}
            {session.state.jobSummary ? (
              <p className="mt-1 text-2xs text-ink-500">
                Target: {session.state.jobSummary.title}
                {session.state.jobSummary.company ? ` at ${session.state.jobSummary.company}` : ''}
              </p>
            ) : null}
          </Card>

          <p className="text-2xs leading-relaxed text-ink-600">
            Delivery observations (camera brightness and movement) are computed on your device only and are never used to judge personality,
            honesty or suitability.
          </p>
        </div>
      </div>

      <Modal
        open={endOpen}
        onClose={() => setEndOpen(false)}
        title="Finish the interview now?"
        description="Unanswered questions are recorded as gaps. You will get a full report for the answers you have already given."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEndOpen(false)}>
              Keep answering
            </Button>
            <Button variant="danger" onClick={() => void finishNow()}>
              Finish and generate report
            </Button>
          </>
        }
      />

      {!question ? (
        <div className="mt-6">
          <EmptyState
            icon={<Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
            title="Waiting for the next question"
            description="This usually takes a second. If nothing appears, reload the session — your answers are already saved."
            action={
              <Button variant="secondary" onClick={() => void session.load()}>
                Reload session
              </Button>
            }
          />
        </div>
      ) : null}
    </AppShell>
  )
}
