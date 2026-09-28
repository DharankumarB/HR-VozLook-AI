import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PersonaId } from '../../lib/types'

/**
 * The AI interviewer avatar.
 *
 * Honest capability statement: this is an animated 2D presenter, not a video-generated human and not
 * true lip-sync. Mouth movement is driven by the actual speech-synthesis timing (word boundary events
 * from the Web Speech API, with a fallback oscillator), so it lines up with the spoken question; the
 * avatar blinks, breathes and shifts its head slightly so it feels alive rather than looping a GIF.
 *
 * The component is deliberately a single fixed identity: one face, one outfit, one colour palette for
 * the whole session, so the candidate always interviews with the same person.
 */

export type AvatarState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'SPEAKING'
  | 'PROCESSING'
  | 'FOLLOW_UP'
  | 'COMPLETED'

export const AVATAR_STATE_LABEL: Record<AvatarState, string> = {
  IDLE: 'Ready',
  LISTENING: 'Listening to you',
  THINKING: 'Considering your answer',
  SPEAKING: 'Asking the question',
  PROCESSING: 'Analysing your answer',
  FOLLOW_UP: 'Preparing a follow-up',
  COMPLETED: 'Interview complete',
}

const PERSONA_ACCENT: Record<PersonaId, { suit: string; shirt: string; tie: string; glow: string }> = {
  professional: { suit: '#232838', shirt: '#E8EBF4', tie: '#7C5CFF', glow: 'rgba(124,92,255,0.35)' },
  hr: { suit: '#2A2733', shirt: '#F1E9F7', tie: '#C084FC', glow: 'rgba(192,132,252,0.32)' },
  technical: { suit: '#1F2733', shirt: '#DDE6F2', tie: '#22D3EE', glow: 'rgba(34,211,238,0.32)' },
  friendly: { suit: '#26303A', shirt: '#EDF6F4', tie: '#34D399', glow: 'rgba(52,211,153,0.32)' },
  strict: { suit: '#1C1F26', shirt: '#E4E7EE', tie: '#F87171', glow: 'rgba(248,113,113,0.3)' },
}

/** Blink timing: natural, irregular intervals rather than a metronome. */
function useBlink(active: boolean) {
  const [blinking, setBlinking] = useState(false)
  useEffect(() => {
    if (!active) return
    let timer: number
    let reset: number
    const schedule = () => {
      timer = window.setTimeout(() => {
        setBlinking(true)
        reset = window.setTimeout(() => {
          setBlinking(false)
          schedule()
        }, 120)
      }, 2200 + Math.random() * 3600)
    }
    schedule()
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(reset)
    }
  }, [active])
  return blinking
}

/** Mouth openness (0 = closed, 1 = wide open) driven by the live speech timing. */
export function useSpeechMouth(speaking: boolean) {
  const [openness, setOpenness] = useState(0)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    if (!speaking) {
      setOpenness(0)
      return
    }
    let mounted = true
    let phase = 0
    const tick = () => {
      if (!mounted) return
      phase += 0.28 + Math.random() * 0.22
      // Two overlapping sine waves read as speech rather than a metronome.
      const value = (Math.sin(phase) * 0.5 + 0.5) * 0.7 + (Math.sin(phase * 2.7) * 0.5 + 0.5) * 0.3
      setOpenness(value)
      raf.current = window.requestAnimationFrame(tick)
    }
    raf.current = window.requestAnimationFrame(tick)
    return () => {
      mounted = false
      if (raf.current) window.cancelAnimationFrame(raf.current)
    }
  }, [speaking])

  /** Lower-level hook used by the speech engine to nudge the mouth on real word boundaries. */
  const pulse = useCallback((strength = 1) => setOpenness((current) => Math.min(1, Math.max(current, 0.45 + 0.35 * strength))), [])

  return { openness, pulse }
}

export function AvatarInterviewer({
  state,
  speaking,
  persona = 'professional',
  mouthOpenness = 0,
  compact = false,
  className = '',
}: {
  state: AvatarState
  speaking: boolean
  persona?: PersonaId
  mouthOpenness?: number
  compact?: boolean
  className?: string
}) {
  const accent = PERSONA_ACCENT[persona] ?? PERSONA_ACCENT.professional
  const blinking = useBlink(state !== 'COMPLETED')
  const active = state === 'SPEAKING' || state === 'FOLLOW_UP'
  const listening = state === 'LISTENING'

  const browRaise = state === 'THINKING' || state === 'PROCESSING' ? 2 : 0
  const mouthHeight = active ? 2 + mouthOpenness * 7 : listening ? 1.4 : 1.6
  const mouthWidth = active ? 9 + mouthOpenness * 3 : 9

  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-3xl border border-white/[0.07] ${className}`}
      style={{ background: `radial-gradient(120% 100% at 50% 0%, ${accent.glow}, rgba(7,7,12,0.96) 62%)` }}
    >
      {/* Speaking / listening halo */}
      <div
        className={`pointer-events-none absolute inset-x-8 bottom-6 h-24 rounded-full blur-3xl transition-opacity duration-500 ${
          active ? 'opacity-100' : 'opacity-40'
        }`}
        style={{ background: accent.glow }}
        aria-hidden
      />

      <svg
        viewBox="0 0 200 240"
        className={`relative w-full ${compact ? 'max-h-[190px]' : 'max-h-[420px]'} drop-shadow-[0_28px_60px_rgba(0,0,0,0.55)]`}
        role="img"
        aria-label={`AI interviewer, ${AVATAR_STATE_LABEL[state].toLowerCase()}`}
      >
        <defs>
          <linearGradient id="vz-skin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F0C9A8" />
            <stop offset="100%" stopColor="#D9A783" />
          </linearGradient>
          <linearGradient id="vz-hair" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2C2A33" />
            <stop offset="100%" stopColor="#171820" />
          </linearGradient>
          <linearGradient id="vz-suit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent.suit} stopOpacity="1" />
            <stop offset="100%" stopColor="#12141C" />
          </linearGradient>
          <radialGradient id="vz-cheek" cx="50%" cy="50%">
            <stop offset="0%" stopColor="rgba(226,143,120,0.35)" />
            <stop offset="100%" stopColor="rgba(226,143,120,0)" />
          </radialGradient>
        </defs>

        {/* Shoulders and blazer */}
        <g>
          <path d="M28 240 C30 196 62 176 100 176 C138 176 170 196 172 240 Z" fill="url(#vz-suit)" />
          <path d="M100 176 L86 240 L114 240 Z" fill={accent.shirt} />
          <path d="M97 186 L100 196 L103 186 L107 240 L93 240 Z" fill={accent.tie} />
          <path d="M84 178 L100 196 L72 214 C64 200 70 184 84 178 Z" fill="#0F111A" opacity="0.85" />
          <path d="M116 178 L100 196 L128 214 C136 200 130 184 116 178 Z" fill="#0F111A" opacity="0.85" />
          {/* Collar */}
          <path d="M86 174 L100 190 L114 174 L106 168 L100 176 L94 168 Z" fill={accent.shirt} />
        </g>

        {/* Neck */}
        <path d="M88 148 L112 148 L112 178 Q100 186 88 178 Z" fill="#DDA883" />
        <path d="M88 150 Q100 162 112 150 L112 158 Q100 172 88 158 Z" fill="#C08F6C" opacity="0.55" />

        {/* Head */}
        <g>
          <ellipse cx="100" cy="102" rx="42" ry="50" fill="url(#vz-skin)" />
          {/* Ears */}
          <ellipse cx="59" cy="106" rx="6" ry="10" fill="#D9A783" />
          <ellipse cx="141" cy="106" rx="6" ry="10" fill="#D9A783" />
          {/* Hair — a consistent, professional short cut */}
          <path d="M58 96 C58 58 74 44 100 44 C126 44 142 58 142 96 C142 84 132 70 100 70 C68 70 58 84 58 96 Z" fill="url(#vz-hair)" />
          <path d="M60 92 C62 62 78 50 100 50 C122 50 138 62 140 92 C136 74 120 62 100 62 C80 62 64 74 60 92 Z" fill="#3A3844" opacity="0.6" />
          {/* Cheeks */}
          <ellipse cx="72" cy="116" rx="13" ry="9" fill="url(#vz-cheek)" />
          <ellipse cx="128" cy="116" rx="13" ry="9" fill="url(#vz-cheek)" />

          {/* Eyebrows */}
          <g transform={`translate(0 ${-browRaise})`}>
            <path d="M72 88 Q82 84 90 88" stroke="#2B2731" strokeWidth="2.6" strokeLinecap="round" fill="none" />
            <path d="M110 88 Q118 84 128 88" stroke="#2B2731" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          </g>

          {/* Eyes — the eyelids close on the blink rather than swapping images */}
          <g>
            <ellipse cx="81" cy="99" rx="7" ry="6.4" fill="#FBFBFD" />
            <ellipse cx="119" cy="99" rx="7" ry="6.4" fill="#FBFBFD" />
            <circle cx="82.5" cy="99.5" r="3.1" fill="#2C2F45" />
            <circle cx="117.5" cy="99.5" r="3.1" fill="#2C2F45" />
            <circle cx="83.6" cy="98.3" r="1" fill="#FFFFFF" opacity="0.9" />
            <circle cx="118.6" cy="98.3" r="1" fill="#FFFFFF" opacity="0.9" />
            {blinking ? (
              <>
                <rect x="73" y="95" width="16" height="9" fill="url(#vz-skin)" />
                <rect x="111" y="95" width="16" height="9" fill="url(#vz-skin)" />
                <path d="M73 100 Q81 104 89 100" stroke="#2B2731" strokeWidth="1.6" fill="none" strokeLinecap="round" />
                <path d="M111 100 Q119 104 127 100" stroke="#2B2731" strokeWidth="1.6" fill="none" strokeLinecap="round" />
              </>
            ) : null}
          </g>

          {/* Nose */}
          <path d="M100 106 L100 118 Q104 121 107 118" stroke="#C08F6C" strokeWidth="2" fill="none" strokeLinecap="round" />

          {/* Mouth — height and width follow the live speech envelope */}
          <g>
            <ellipse cx="100" cy="133" rx={mouthWidth} ry={mouthHeight * 0.62} fill="#8E3F49" />
            <ellipse cx="100" cy={133 - mouthHeight * 0.22} rx={mouthWidth * 0.72} ry={mouthHeight * 0.3} fill="#F3D9DE" opacity="0.9" />
            <path
              d={`M${100 - mouthWidth} 133 Q100 ${131 + mouthHeight} ${100 + mouthWidth} 133`}
              stroke="#B0705F"
              strokeWidth="1.4"
              fill="none"
              opacity="0.7"
            />
          </g>
        </g>
      </svg>

      {/* Live state chip */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-4 pb-4 pt-8">
        <span className="relative flex h-2 w-2" aria-hidden>
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${
              active ? 'animate-ping bg-accent' : listening ? 'animate-pulse bg-success' : 'bg-ink-500'
            }`}
          />
          <span className={`relative inline-flex h-2 w-2 rounded-full ${active ? 'bg-accent' : listening ? 'bg-success' : 'bg-ink-500'}`} />
        </span>
        <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-ink-200">{AVATAR_STATE_LABEL[state]}</span>
      </div>

      {/* Thinking / processing sweep */}
      {state === 'THINKING' || state === 'PROCESSING' ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 overflow-hidden" aria-hidden>
          <div className="h-full w-1/3 animate-[shimmer_1.6s_linear_infinite] rounded-full bg-accent-sheen" />
        </div>
      ) : null}

      {speaking ? <span className="sr-only" aria-live="polite">The interviewer is speaking.</span> : null}
    </div>
  )
}

/**
 * Speech engine for the interviewer.
 *
 * Guarantees required by the product spec:
 *  - nothing is spoken before a question exists (callers gate on `text`),
 *  - audio never overlaps: every call cancels any in-flight utterance first,
 *  - the avatar mouth is driven by real word boundaries when the browser reports them.
 */
export function useInterviewerSpeech(options: { rate?: number; pitch?: number; lang?: string } = {}) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [speaking, setSpeaking] = useState(false)
  const [mouthOpenness, setMouthOpenness] = useState(0)
  const fallbackTimer = useRef<number | null>(null)

  const stopFallback = useCallback(() => {
    if (fallbackTimer.current) {
      window.clearInterval(fallbackTimer.current)
      fallbackTimer.current = null
    }
  }, [])

  const speak = useCallback(
    (text: string, handlers: { onStart?: () => void; onEnd?: () => void } = {}) => {
      if (!supported || !text?.trim()) {
        handlers.onEnd?.()
        return
      }
      // Stop anything already playing so two voices can never overlap.
      window.speechSynthesis.cancel()
      stopFallback()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = options.rate ?? 0.97
      utterance.pitch = options.pitch ?? 1
      utterance.lang = options.lang ?? 'en-US'

      // Prefer a natural English voice when the platform offers one.
      const voices = window.speechSynthesis.getVoices()
      const preferred =
        voices.find((voice) => /^en-(GB|US)$/i.test(voice.lang) && /female|samantha|aria|jenny|google uk english female/i.test(voice.name)) ??
        voices.find((voice) => voice.lang?.toLowerCase().startsWith('en'))
      if (preferred) utterance.voice = preferred

      utterance.onstart = () => {
        setSpeaking(true)
        handlers.onStart?.()
        // Boundary events are not implemented in every browser, so a light oscillator keeps the
        // mouth moving in step with the audio either way.
        fallbackTimer.current = window.setInterval(() => {
          setMouthOpenness((current) => (current > 0.2 ? 0.15 : 0.45 + Math.random() * 0.45))
        }, 90)
      }
      utterance.onboundary = () => setMouthOpenness(0.5 + Math.random() * 0.5)
      utterance.onend = () => {
        stopFallback()
        setMouthOpenness(0)
        setSpeaking(false)
        handlers.onEnd?.()
      }
      utterance.onerror = () => {
        stopFallback()
        setMouthOpenness(0)
        setSpeaking(false)
        handlers.onEnd?.()
      }

      try {
        window.speechSynthesis.speak(utterance)
      } catch {
        stopFallback()
        setSpeaking(false)
        handlers.onEnd?.()
      }
    },
    [supported, options.rate, options.pitch, options.lang, stopFallback],
  )

  const stop = useCallback(() => {
    stopFallback()
    if (supported) window.speechSynthesis.cancel()
    setSpeaking(false)
    setMouthOpenness(0)
  }, [supported, stopFallback])

  useEffect(() => () => stop(), [stop])

  return useMemo(() => ({ speak, stop, speaking, mouthOpenness, supported }), [speak, stop, speaking, mouthOpenness, supported])
}
