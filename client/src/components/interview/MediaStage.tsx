import { Camera, CameraOff, Mic, MicOff, Pause, Play, RotateCcw, Square, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Badge } from '../ui/primitives'
import { formatDuration } from '../../lib/format'

/* ------------------------------------------------------------------ */
/* Capability detection                                                  */
/* ------------------------------------------------------------------ */

interface SpeechRecognitionAlternativeLike {
  transcript: string
}
interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: SpeechRecognitionAlternativeLike
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: { length: number; [index: number]: SpeechRecognitionResultLike }
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const globalAny = window as unknown as Record<string, unknown>
  const ctor = (globalAny.SpeechRecognition ?? globalAny.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined
  return ctor ?? null
}

export const speechRecognitionSupported = Boolean(getSpeechRecognition())
export const speechSynthesisSupported = typeof window !== 'undefined' && 'speechSynthesis' in window
export const mediaRecorderSupported = typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined'

/* ------------------------------------------------------------------ */
/* Text to speech (AI interviewer voice)                                 */
/* ------------------------------------------------------------------ */

export function useInterviewerVoice() {
  const [speaking, setSpeaking] = useState(false)
  const [enabled, setEnabled] = useState(true)

  const speak = useCallback(
    (text: string) => {
      if (!speechSynthesisSupported || !enabled || !text) return
      try {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 0.98
        utterance.pitch = 1
        utterance.lang = navigator.language || 'en-US'
        utterance.onstart = () => setSpeaking(true)
        utterance.onend = () => setSpeaking(false)
        utterance.onerror = () => setSpeaking(false)
        window.speechSynthesis.speak(utterance)
      } catch {
        setSpeaking(false)
      }
    },
    [enabled],
  )

  const stop = useCallback(() => {
    if (!speechSynthesisSupported) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [])

  useEffect(() => () => stop(), [stop])

  return { speak, stop, speaking, enabled, setEnabled, supported: speechSynthesisSupported }
}

/* ------------------------------------------------------------------ */
/* Voice answer recorder (speech-to-text + optional audio capture)       */
/* ------------------------------------------------------------------ */

export interface VoiceRecorderState {
  supported: boolean
  recording: boolean
  transcript: string
  interim: string
  durationSeconds: number
  error: string | null
  audioBlob: Blob | null
  audioUrl: string | null
  start: () => Promise<void>
  stop: () => void
  reset: () => void
}

export function useVoiceRecorder(options: { onTranscript?: (text: string) => void; maxSeconds?: number } = {}): VoiceRecorderState {
  const [recording, setRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const transcriptRef = useRef('')
  const timerRef = useRef<number | null>(null)
  const maxSeconds = options.maxSeconds ?? 300

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    recognitionRef.current?.stop?.()
    recognitionRef.current = null
    recorderRef.current?.state === 'recording' && recorderRef.current.stop()
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setRecording(false)
  }, [])

  useEffect(() => cleanup, [cleanup])

  const start = useCallback(async () => {
    setError(null)
    setAudioBlob(null)
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)

    const Recognition = getSpeechRecognition()
    if (!Recognition) {
      setError('Live speech-to-text is not available in this browser. You can still record audio and type the transcript.')
    }

    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream
        if (mediaRecorderSupported) {
          const recorder = new MediaRecorder(stream)
          chunksRef.current = []
          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunksRef.current.push(event.data)
          }
          recorder.onstop = () => {
            if (!chunksRef.current.length) return
            const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
            setAudioBlob(blob)
            setAudioUrl(URL.createObjectURL(blob))
          }
          recorder.start()
          recorderRef.current = recorder
        }
      }
    } catch (caught) {
      const name = caught instanceof DOMException ? caught.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('Microphone access was blocked. Enable it in your browser settings, or switch to text mode.')
      } else if (name === 'NotFoundError') {
        setError('No microphone was found on this device. Switch to text mode to continue.')
      } else {
        setError('We could not start the microphone. You can continue by typing your answer.')
      }
    }

    if (Recognition) {
      try {
        const recognition = new Recognition()
        recognition.lang = 'en-US'
        recognition.continuous = true
        recognition.interimResults = true
        recognition.onresult = (event) => {
          let finalText = ''
          let interimText = ''
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i]!
            if (result.isFinal) finalText += `${result[0].transcript} `
            else interimText += result[0].transcript
          }
          if (finalText) {
            transcriptRef.current = `${transcriptRef.current}${finalText}`
            setTranscript(transcriptRef.current.trim())
          }
          setInterim(interimText)
          options.onTranscript?.(`${transcriptRef.current}${interimText}`.trim())
        }
        recognition.onerror = (event) => {
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setError('Speech recognition was blocked. Type your answer instead — it is graded the same way.')
          } else if (event.error === 'no-speech') {
            setError('We did not catch any speech. Try again or type your answer.')
          } else if (event.error !== 'aborted') {
            setError('Speech recognition stopped unexpectedly. Type your answer to continue.')
          }
        }
        recognition.onend = () => setInterim('')
        recognition.start()
        recognitionRef.current = recognition
      } catch {
        setError('Speech recognition could not start. You can type your answer instead.')
      }
    }

    setDurationSeconds(0)
    setRecording(true)
    timerRef.current = window.setInterval(() => {
      setDurationSeconds((current) => {
        const next = current + 1
        if (next >= maxSeconds) stop()
        return next
      })
    }, 1000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, maxSeconds, options])

  const stop = useCallback(() => {
    cleanup()
    setInterim('')
    setTranscript(transcriptRef.current.trim())
  }, [cleanup])

  const reset = useCallback(() => {
    cleanup()
    transcriptRef.current = ''
    setTranscript('')
    setInterim('')
    setDurationSeconds(0)
    setError(null)
    setAudioBlob(null)
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
  }, [audioUrl, cleanup])

  return useMemo(
    () => ({
      supported: speechRecognitionSupported || mediaRecorderSupported,
      recording,
      transcript,
      interim,
      durationSeconds,
      error,
      audioBlob,
      audioUrl,
      start,
      stop,
      reset,
    }),
    [recording, transcript, interim, durationSeconds, error, audioBlob, audioUrl, start, stop, reset],
  )
}

/** Small mic button + live level meter used by voice mode. */
export function VoiceRecorder({
  recorder,
  onUseTranscript,
  disabled,
}: {
  recorder: VoiceRecorderState
  onUseTranscript?: () => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type={recorder.recording ? 'button' : 'button'}
          variant={recorder.recording ? 'danger' : 'secondary'}
          icon={recorder.recording ? <Square className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
          onClick={() => void (recorder.recording ? recorder.stop() : recorder.start())}
          disabled={disabled}
        >
          {recorder.recording ? 'Stop recording' : 'Record answer'}
        </Button>
        {recorder.recording ? (
          <Badge tone="danger">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-danger/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
            </span>
            Listening · {formatDuration(recorder.durationSeconds)}
          </Badge>
        ) : null}
        {recorder.audioUrl ? (
          <audio controls src={recorder.audioUrl} className="h-9 max-w-full">
            <track kind="captions" />
          </audio>
        ) : null}
        {recorder.audioUrl ? (
          <Button variant="ghost" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />} onClick={recorder.reset}>
            Record again
          </Button>
        ) : null}
        {onUseTranscript ? (
          <Button variant="ghost" size="sm" onClick={onUseTranscript}>
            Use transcript
          </Button>
        ) : null}
      </div>

      {recorder.error ? (
        <p className="rounded-2xl border border-warning/30 bg-warning/[0.07] px-3 py-2 text-xs text-warning" role="status">
          {recorder.error}
        </p>
      ) : null}

      {recorder.recording || recorder.transcript || recorder.interim ? (
        <div className="rounded-2xl border border-white/10 bg-ink-900/60 p-3">
          <p className="section-title mb-1">Live transcript</p>
          <p className="text-sm leading-relaxed text-ink-200">
            {recorder.transcript || <span className="text-ink-500">Start speaking — your words appear here.</span>}
            {recorder.interim ? <span className="text-ink-500"> {recorder.interim}</span> : null}
          </p>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Video stage                                                            */
/* ------------------------------------------------------------------ */

export interface CameraState {
  ready: boolean
  error: string | null
  stream: MediaStream | null
  videoEnabled: boolean
  audioEnabled: boolean
  start: () => Promise<void>
  stop: () => void
  toggleVideo: () => void
  toggleAudio: () => void
}

export function useCamera(): CameraState {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [audioEnabled, setAudioEnabled] = useState(true)

  const stop = useCallback(() => {
    setStream((current) => {
      current?.getTracks().forEach((track) => track.stop())
      return null
    })
  }, [])

  const start = useCallback(async () => {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not expose camera access. Continue in voice or text mode — the interview works the same.')
      return
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true })
      setStream(media)
      setVideoEnabled(media.getVideoTracks().some((track) => track.enabled))
      setAudioEnabled(media.getAudioTracks().some((track) => track.enabled))
    } catch (caught) {
      const name = caught instanceof DOMException ? caught.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('Camera and microphone permissions were declined. You can continue in text mode, or allow access and retry.')
      } else if (name === 'NotFoundError') {
        setError('No camera was detected on this device. Continue in voice or text mode.')
      } else {
        setError('The camera could not be started. Continue in voice or text mode.')
      }
    }
  }, [])

  const toggleVideo = useCallback(() => {
    setStream((current) => {
      current?.getVideoTracks().forEach((track) => (track.enabled = !track.enabled))
      setVideoEnabled((enabled) => !enabled)
      return current
    })
  }, [])

  const toggleAudio = useCallback(() => {
    setStream((current) => {
      current?.getAudioTracks().forEach((track) => (track.enabled = !track.enabled))
      setAudioEnabled((enabled) => !enabled)
      return current
    })
  }, [])

  useEffect(() => () => stop(), [stop])

  return useMemo(
    () => ({ ready: Boolean(stream), error, stream, videoEnabled, audioEnabled, start, stop, toggleVideo, toggleAudio }),
    [stream, error, videoEnabled, audioEnabled, start, stop, toggleVideo, toggleAudio],
  )
}

/**
 * Camera preview. Optional delivery observations (engagement / posture / movement) are computed
 * from frame brightness and motion only, and are presented as practice signals — never as claims
 * about personality, honesty or mental state.
 */
export interface DeliveryObservations {
  camera_engagement: number
  posture_consistency: number
  movement_level: number
}

/**
 * On-device delivery observations: average frame brightness and inter-frame motion, sampled from the
 * candidate's own camera. Nothing is uploaded as video, and nothing here is used to judge personality,
 * honesty or suitability — the numbers are shown to the candidate as practice signals.
 */
export function useDeliveryObservations(
  camera: CameraState,
  onObservations?: (observations: DeliveryObservations) => void,
): DeliveryObservations {
  const [observations, setObservations] = useState<DeliveryObservations>({ camera_engagement: 0, posture_consistency: 0, movement_level: 0 })
  const lastFrameRef = useRef<Uint8ClampedArray | null>(null)
  const samplesRef = useRef<{ engagement: number[]; movement: number[] }>({ engagement: [], movement: [] })
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Sampling happens against a private, unattached video element so the hook never depends on where
  // (or whether) a preview is rendered on screen.
  const probeRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (!camera.stream) return
    const probe = probeRef.current ?? document.createElement('video')
    probeRef.current = probe
    probe.muted = true
    probe.playsInline = true
    probe.srcObject = camera.stream
    void probe.play().catch(() => undefined)
  }, [camera.stream])

  useEffect(() => {
    if (!camera.stream) return
    const interval = window.setInterval(() => {
      const video = probeRef.current
      if (!video || video.videoWidth === 0) return
      const canvas = canvasRef.current ?? document.createElement('canvas')
      canvasRef.current = canvas
      canvas.width = 64
      canvas.height = 48
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const frame = context.getImageData(0, 0, canvas.width, canvas.height)
      const data = frame.data

      let brightness = 0
      for (let i = 0; i < data.length; i += 4) brightness += (data[i]! + data[i + 1]! + data[i + 2]!) / 3
      const averageBrightness = brightness / (data.length / 4)
      const engagement = Math.max(0, Math.min(100, (averageBrightness / 190) * 100))

      let movement = 0
      const previous = lastFrameRef.current
      if (previous && previous.length === data.length) {
        let diff = 0
        for (let i = 0; i < data.length; i += 16) diff += Math.abs(data[i]! - previous[i]!)
        movement = Math.min(100, (diff / (data.length / 16)) * 1.6)
      }
      lastFrameRef.current = new Uint8ClampedArray(data)

      samplesRef.current.engagement.push(engagement)
      samplesRef.current.movement.push(movement)
      if (samplesRef.current.engagement.length > 240) {
        samplesRef.current.engagement.shift()
        samplesRef.current.movement.shift()
      }

      const engagementAvg = samplesRef.current.engagement.reduce((a, b) => a + b, 0) / (samplesRef.current.engagement.length || 1)
      const movementAvg = samplesRef.current.movement.reduce((a, b) => a + b, 0) / (samplesRef.current.movement.length || 1)
      const variance =
        samplesRef.current.movement.reduce((sum, value) => sum + (value - movementAvg) ** 2, 0) / (samplesRef.current.movement.length || 1)
      const posture = Math.max(0, Math.min(100, 100 - Math.sqrt(variance) * 3.2))

      const next = {
        camera_engagement: Math.round(engagementAvg),
        posture_consistency: Math.round(posture),
        movement_level: Math.round(Math.min(100, movementAvg * 2.4)),
      }
      setObservations(next)
      onObservations?.(next)
    }, 1500)

    return () => window.clearInterval(interval)
  }, [camera.stream, onObservations])

  return observations
}

export function VideoStage({
  camera,
  onObservations,
  interviewerSpeaking,
}: {
  camera: CameraState
  onObservations?: (observations: DeliveryObservations) => void
  interviewerSpeaking?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const observations = useDeliveryObservations(camera, onObservations)

  useEffect(() => {
    const element = videoRef.current
    if (!element) return
    element.srcObject = camera.stream
    if (camera.stream) void element.play().catch(() => undefined)
  }, [camera.stream])

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-ink-900/80">
        <div className="aspect-video w-full">
          {camera.stream ? (
            <video
              ref={videoRef}
              muted
              playsInline
              className={`h-full w-full object-cover ${camera.videoEnabled ? '' : 'opacity-0'}`}
              aria-label="Your camera preview"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
              <Camera className="h-7 w-7 text-ink-500" aria-hidden />
              <p className="text-sm text-ink-300">
                {camera.error ? 'Camera unavailable — you can continue without video.' : 'Turn on your camera to practise a video interview.'}
              </p>
              <Button variant="secondary" size="sm" onClick={() => void camera.start()}>
                Enable camera & microphone
              </Button>
            </div>
          )}
        </div>

        {camera.stream ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-ink-950/90 to-transparent p-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={camera.toggleAudio}
                className="rounded-xl border border-white/15 bg-ink-950/70 p-2 text-ink-100 hover:border-white/35"
                aria-label={camera.audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
                aria-pressed={!camera.audioEnabled}
              >
                {camera.audioEnabled ? <Mic className="h-4 w-4" aria-hidden /> : <MicOff className="h-4 w-4 text-danger" aria-hidden />}
              </button>
              <button
                type="button"
                onClick={camera.toggleVideo}
                className="rounded-xl border border-white/15 bg-ink-950/70 p-2 text-ink-100 hover:border-white/35"
                aria-label={camera.videoEnabled ? 'Turn camera off' : 'Turn camera on'}
                aria-pressed={!camera.videoEnabled}
              >
                {camera.videoEnabled ? <Camera className="h-4 w-4" aria-hidden /> : <CameraOff className="h-4 w-4 text-danger" aria-hidden />}
              </button>
              <button
                type="button"
                onClick={camera.stop}
                className="rounded-xl border border-white/15 bg-ink-950/70 p-2 text-ink-300 hover:border-white/35"
                aria-label="Stop camera"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {interviewerSpeaking ? (
              <span className="chip border-accent/40 bg-accent/15 text-accent-soft">
                <Play className="h-3 w-3" aria-hidden /> Interviewer speaking
              </span>
            ) : (
              <span className="chip">
                <Pause className="h-3 w-3" aria-hidden /> Your turn
              </span>
            )}
          </div>
        ) : null}
      </div>

      {camera.stream ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            { label: 'Camera engagement', value: observations.camera_engagement },
            { label: 'Posture consistency', value: observations.posture_consistency },
            { label: 'Visible movement', value: observations.movement_level, invert: true },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-2xs text-ink-400">{item.label}</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-ink-100">{item.value}%</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${item.invert ? 'bg-warning' : 'bg-accent'}`}
                  style={{ width: `${Math.max(4, Math.min(100, item.invert ? 100 - item.value : item.value))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <p className="text-2xs leading-relaxed text-ink-500">
        Video signals are rough, on-device observations of brightness and motion, offered as practice feedback only. They say nothing about
        your personality, honesty, mood or suitability for a role.
      </p>
    </div>
  )
}

/** Session timer with pause support. */
export function useSessionTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!running) return
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(interval)
  }, [running])
  return { seconds, reset: () => setSeconds(0) }
}
