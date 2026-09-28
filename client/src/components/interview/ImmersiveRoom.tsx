import { Camera, CameraOff, Headphones, Mic, MicOff, Send, Sparkles, StopCircle, UserRound, Volume2, VolumeX, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AvatarInterviewer, type AvatarState } from './AvatarInterviewer'
import { Badge, Button, IconButton } from '../ui/primitives'
import { BRAND } from '../../lib/constants'
import { formatDuration } from '../../lib/format'
import type { PersonaId, QuestionRecord } from '../../lib/types'
import type { CameraState, VoiceRecorderState } from './MediaStage'

/**
 * Cinematic interview room used for the avatar (voice and video) modes.
 *
 * Layout follows the product brief: the AI interviewer dominates the screen, the candidate's own
 * camera sits in a small floating card, the question index sits top-centre, and every control the
 * candidate needs (microphone, camera, speaker, submit, end) is pinned to the bottom bar. No dashboard
 * chrome competes with the interview itself.
 */
export function ImmersiveRoom({
  question,
  questionIndex,
  totalQuestions,
  timerSeconds,
  avatarState,
  avatarSpeaking,
  mouthOpenness,
  persona,
  camera,
  mode,
  answerText,
  onAnswerTextChange,
  onSubmit,
  onSkip,
  onEnd,
  onReplayQuestion,
  onToggleRecorder,
  onToggleSpeaker,
  voiceSupported,
  speakerEnabled,
  recorder,
  submitting,
  canSubmit,
  notice,
  finished,
  footer,
}: {
  question: QuestionRecord | null
  questionIndex: number
  totalQuestions: number
  timerSeconds: number
  avatarState: AvatarState
  avatarSpeaking: boolean
  mouthOpenness: number
  persona: PersonaId
  camera: CameraState
  mode: 'voice' | 'video'
  answerText: string
  onAnswerTextChange: (value: string) => void
  onSubmit: () => void
  onSkip: () => void
  onEnd: () => void
  onReplayQuestion: () => void
  onToggleRecorder: () => void
  onToggleSpeaker: () => void
  voiceSupported: boolean
  speakerEnabled: boolean
  recorder: VoiceRecorderState
  submitting: boolean
  canSubmit: boolean
  notice?: string | null
  finished: boolean
  footer?: ReactNode
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [answerOpen, setAnswerOpen] = useState(false)

  useEffect(() => {
    const element = videoRef.current
    if (!element) return
    element.srcObject = camera.stream
    if (camera.stream) void element.play().catch(() => undefined)
  }, [camera.stream])

  // The question panel appears once the avatar has finished speaking, so text never spoils the audio.
  const questionVisible = Boolean(question) && !avatarSpeaking

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-ink-950">
      {/* Top bar: brand, question index, live state */}
      <header className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-ink-950/85 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-sheen shadow-glow">
            <Sparkles className="h-4 w-4 text-white" aria-hidden />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold text-ink-50">{BRAND.product}</span>
            <span className="hidden text-2xs text-ink-500 sm:block">{BRAND.studioLine}</span>
          </span>
        </div>

        <div className="order-3 flex w-full items-center justify-center gap-2 sm:order-none sm:w-auto">
          <Badge tone="accent">
            Question {Math.min(questionIndex + 1, totalQuestions)} / {totalQuestions}
          </Badge>
          <Badge tone="neutral">{formatDuration(timerSeconds)}</Badge>
          {question?.is_follow_up ? <Badge tone="neon">Follow-up</Badge> : null}
        </div>

        <div className="flex items-center gap-2">
          {camera.error ? (
            <Badge tone="warning">
              <CameraOff className="h-3 w-3" aria-hidden /> Camera off
            </Badge>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onEnd} icon={<StopCircle className="h-4 w-4" aria-hidden />} disabled={finished}>
            End Interview
          </Button>
        </div>
      </header>

      {/* Stage */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1 p-3 sm:p-5">
          <div className="relative flex h-full min-h-[46vh] items-center justify-center">
            <div className="h-full w-full max-w-3xl">
              <AvatarInterviewer state={avatarState} speaking={avatarSpeaking} persona={persona} mouthOpenness={mouthOpenness} />
            </div>

            {/* Candidate preview */}
            <div className="absolute bottom-3 right-3 w-28 overflow-hidden rounded-2xl border border-white/12 bg-black/70 shadow-card sm:bottom-4 sm:right-4 sm:w-44 lg:w-56">
              <video ref={videoRef} muted playsInline className="aspect-[4/3] w-full object-cover" aria-label="Your camera preview" />
              {!camera.stream ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-ink-950/85 text-center">
                  <UserRound className="h-5 w-5 text-ink-500" aria-hidden />
                  <span className="px-2 text-2xs text-ink-500">{camera.error ? 'Camera unavailable' : 'Camera off'}</span>
                </div>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-2 py-1 text-2xs text-ink-300">
                <span>You</span>
                {recorder.recording ? <span className="text-danger">● rec</span> : null}
              </div>
            </div>
          </div>

          {/* Question overlay */}
          <AnimatePresence>
            {question ? (
              <motion.div
                key={question.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: questionVisible ? 1 : 0.35, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.32 }}
                className="pointer-events-none absolute inset-x-3 bottom-3 sm:inset-x-6 sm:bottom-5"
              >
                <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-black/60 px-4 py-3 backdrop-blur-xl sm:px-6 sm:py-4">
                  <p className="text-2xs uppercase tracking-[0.18em] text-ink-400">
                    {questionVisible ? 'The interviewer asked' : 'Listening…'}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-50 sm:text-base">{question.question}</p>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Answer panel — collapsed by default to keep the room cinematic */}
        <div className="border-t border-white/[0.06] bg-ink-950/95 px-3 pt-3 sm:px-6">
          <button
            type="button"
            onClick={() => setAnswerOpen((open) => !open)}
            className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 text-left"
            aria-expanded={answerOpen}
          >
            <span className="text-2xs uppercase tracking-[0.18em] text-ink-400">
              {recorder.recording ? 'Live transcript — you are recording' : 'Your answer'}
            </span>
            <span className="text-2xs text-accent-soft">{answerOpen ? 'Hide' : 'Review / edit your answer'}</span>
          </button>

          <AnimatePresence initial={false}>
            {answerOpen ? (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <textarea
                  value={answerText}
                  onChange={(event) => onAnswerTextChange(event.target.value)}
                  rows={5}
                  disabled={submitting || finished}
                  placeholder={
                    mode === 'video'
                      ? 'Your spoken answer appears here as you talk — edit it before submitting if the transcription needs a fix.'
                      : 'Your spoken answer appears here as you talk — edit it before submitting if the transcription needs a fix.'
                  }
                  className="input-base mt-2 max-h-52 min-h-[7rem] text-sm leading-relaxed"
                  aria-label="Your answer"
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {notice ? <p className="mx-auto mt-2 max-w-3xl text-2xs text-warning">{notice}</p> : null}

          {/* Bottom control bar */}
          <div className="mx-auto mt-3 flex max-w-3xl flex-wrap items-center justify-center gap-2 pb-3 sm:gap-3 sm:pb-4">
            <IconButton
              label={recorder.recording ? 'Stop the microphone' : 'Answer with your voice'}
              onClick={onToggleRecorder}
              disabled={finished || submitting}
              className={recorder.recording ? '!border-danger/50 !bg-danger/15 !text-danger' : ''}
            >
              {recorder.recording ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
            </IconButton>

            <IconButton
              label={camera.stream ? (camera.videoEnabled ? 'Turn your camera off' : 'Turn your camera on') : 'Start your camera'}
              onClick={() => (camera.stream ? camera.toggleVideo() : void camera.start())}
              disabled={finished}
            >
              {camera.stream && camera.videoEnabled ? <Camera className="h-4 w-4" aria-hidden /> : <CameraOff className="h-4 w-4" aria-hidden />}
            </IconButton>

            <IconButton label={speakerEnabled ? 'Mute the interviewer' : 'Unmute the interviewer'} onClick={onToggleSpeaker} disabled={!voiceSupported}>
              {speakerEnabled ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
            </IconButton>

            <IconButton label="Read the question aloud again" onClick={onReplayQuestion} disabled={!question || !voiceSupported}>
              <Headphones className="h-4 w-4" aria-hidden />
            </IconButton>

            <Button onClick={onSubmit} loading={submitting} disabled={!canSubmit} icon={<Send className="h-4 w-4" aria-hidden />}>
              Submit Answer
            </Button>

            <Button variant="ghost" onClick={onSkip} disabled={!question || submitting} icon={<X className="h-4 w-4" aria-hidden />}>
              Skip
            </Button>
          </div>
        </div>
      </div>

      {footer}
    </div>
  )
}
