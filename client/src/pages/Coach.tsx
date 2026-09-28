import { motion } from 'framer-motion'
import { Bot, Lightbulb, Send, Sparkles, Target, User } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, SectionHeader } from '../components/ui/primitives'
import { ApiError, api } from '../lib/api'
import { formatDate } from '../lib/format'
import type { CoachResponse } from '../lib/types'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'

interface Message {
  role: 'user' | 'assistant'
  content: string
  response?: CoachResponse
}

export default function Coach() {
  const { profile } = useAuth()
  const toast = useToast()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [weakTopics, setWeakTopics] = useState<string[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(true)
  const [contextSummary, setContextSummary] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoadingSuggestions(true)
      try {
        const response = await api.coachSuggestions()
        if (cancelled) return
        setSuggestions(response.suggestions ?? [])
        setWeakTopics(response.weak_topics ?? [])
        setContextSummary(
          [
            response.target_role ? `Target role: ${response.target_role}` : null,
            response.weak_topics?.length ? `Recurring gaps: ${response.weak_topics.slice(0, 5).join(', ')}` : null,
          ]
            .filter(Boolean)
            .join(' · ') || null,
        )
      } catch {
        if (!cancelled) setSuggestions([])
      } finally {
        if (!cancelled) setLoadingSuggestions(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, sending])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || sending) return
      setError(null)
      const nextMessages: Message[] = [...messages, { role: 'user', content: trimmed }]
      setMessages(nextMessages)
      setInput('')
      setSending(true)
      try {
        const response = await api.coach(
          nextMessages.map((message) => ({ role: message.role, content: message.content })),
        )
        setMessages((current) => [...current, { role: 'assistant', content: response.reply, response }])
      } catch (caught) {
        const message = caught instanceof ApiError ? caught.message : 'The coach could not answer right now.'
        setError(message)
        toast.error('Coach unavailable', message)
      } finally {
        setSending(false)
      }
    },
    [messages, sending, toast],
  )

  return (
    <AppShell title="AI Improvement Coach" subtitle={contextSummary ?? 'Grounded in your résumé, reports and weak areas'}>
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex min-h-[60vh] flex-col gap-4">
          <Card className="flex-1 !p-4 sm:!p-5">
            {!messages.length ? (
              <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-3xl bg-accent-sheen shadow-glow">
                  <Bot className="h-6 w-6 text-white" aria-hidden />
                </span>
                <h2 className="mt-4 text-lg font-semibold text-ink-50">What should we work on?</h2>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-400">
                  I know your résumé, your recent interview scores and the topics you keep missing{profile?.target_role ? ` for ${profile.target_role}` : ''}.
                  Ask me anything — how to answer a specific question, what to study first, or how to explain a project.
                </p>
                {loadingSuggestions ? (
                  <div className="mt-6 w-full max-w-md">
                    <LoadingState label="Reading your reports…" rows={2} />
                  </div>
                ) : suggestions.length ? (
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {suggestions.slice(0, 6).map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => void send(suggestion)}
                        className="chip max-w-full whitespace-normal text-left transition-colors hover:border-accent/40 hover:text-white"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-5 text-xs text-ink-500">Complete an interview to unlock personalised suggestions.</p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <motion.div
                    key={`${message.role}-${index}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex items-start gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}
                  >
                    {message.role === 'assistant' ? (
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-accent-sheen">
                        <Bot className="h-4 w-4 text-white" aria-hidden />
                      </span>
                    ) : null}
                    <div
                      className={`min-w-0 max-w-[85%] rounded-3xl border p-3.5 ${
                        message.role === 'user'
                          ? 'border-white/10 bg-white/[0.05] text-ink-100'
                          : 'border-accent/25 bg-accent/[0.07] text-ink-200'
                      }`}
                    >
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>

                      {message.response?.practice_questions?.length ? (
                        <div className="mt-3 space-y-2">
                          {message.response.practice_questions.map((question) => (
                            <div key={question.question} className="rounded-2xl border border-white/[0.08] bg-ink-900/50 p-3">
                              <p className="text-xs font-medium text-ink-100">{question.question}</p>
                              <p className="mt-1 text-2xs leading-relaxed text-ink-400">
                                Strong answers cover: {question.what_a_strong_answer_covers.join(', ')}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {message.response?.follow_ups?.length ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {message.response.follow_ups.map((followUp) => (
                            <button
                              key={followUp}
                              type="button"
                              onClick={() => void send(followUp)}
                              className="chip transition-colors hover:border-accent/40 hover:text-white"
                            >
                              {followUp}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {message.response?.engine ? (
                        <p className="mt-2 text-2xs text-ink-600">Answered by {message.response.engine}</p>
                      ) : null}
                    </div>
                    {message.role === 'user' ? (
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
                        <User className="h-4 w-4 text-ink-300" aria-hidden />
                      </span>
                    ) : null}
                  </motion.div>
                ))}
                {sending ? (
                  <div className="flex items-center gap-3 text-xs text-ink-400">
                    <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-accent-sheen">
                      <Sparkles className="h-4 w-4 animate-pulse text-white" aria-hidden />
                    </span>
                    Thinking through your data…
                  </div>
                ) : null}
                <div ref={endRef} />
              </div>
            )}
          </Card>

          {error ? <ErrorState title="Coach error" message={error} /> : null}

          <Card className="!p-3 sm:!p-4">
            <form
              className="flex items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                void send(input)
              }}
            >
              <label className="sr-only" htmlFor="coach-input">
                Ask the coach
              </label>
              <textarea
                id="coach-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void send(input)
                  }
                }}
                rows={2}
                placeholder="e.g. How do I answer 'explain the bias-variance trade-off' in 90 seconds?"
                className="input-base min-h-[3rem] flex-1 resize-none text-sm"
                disabled={sending}
              />
              <Button type="submit" loading={sending} disabled={!input.trim()} icon={<Send className="h-4 w-4" aria-hidden />}>
                Send
              </Button>
            </form>
            <p className="mt-2 text-2xs text-ink-600">
              The coach uses your stored résumé, reports and weak topics. It gives guidance for practice — it never predicts hiring outcomes.
            </p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <SectionHeader title="What the coach knows" icon={<Target className="h-4 w-4 text-accent" aria-hidden />} />
            <ul className="space-y-2 text-xs leading-relaxed text-ink-300">
              <li className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                {profile?.target_role ? `Target role: ${profile.target_role}` : 'No target role set yet — add one in your profile'}
              </li>
              <li className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                Your résumé skills, projects and experience
              </li>
              <li className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                Every stored evaluation from your completed interviews
              </li>
            </ul>
            {contextSummary ? <p className="mt-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 text-2xs text-ink-400">{contextSummary}</p> : null}
          </Card>

          {weakTopics.length ? (
            <Card>
              <SectionHeader title="Weak topics to attack" icon={<Lightbulb className="h-4 w-4 text-warning" aria-hidden />} />
              <div className="flex flex-wrap gap-1.5">
                {weakTopics.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => void send(`Explain what a strong interview answer about ${topic} should include, at my level.`)}
                    className="chip border-warning/25 bg-warning/[0.06] text-warning transition-colors hover:border-warning/50 hover:text-warning"
                  >
                    {topic}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-2xs text-ink-500">Tap a topic to get a targeted drill response.</p>
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon={<Lightbulb className="h-5 w-5" aria-hidden />}
                title="No weak topics detected yet"
                description="Finish an interview and the coach will highlight the exact topics your answers missed."
                action={
                  <Link to="/interview/setup" className="btn-secondary !py-2 text-xs">
                    Start an interview
                  </Link>
                }
              />
            </Card>
          )}

          <Card>
            <SectionHeader title="Session context" />
            <p className="text-xs text-ink-400">
              {messages.length ? `${messages.length} messages in this session` : 'New conversation'}
              {profile?.experience_level ? ` · ${profile.experience_level}` : ''}
            </p>
            <p className="mt-2 text-2xs text-ink-600">
              Conversations are not stored on the server. Your coach answers are generated from your saved data at the time you ask.
              {messages.length ? ` Last activity ${formatDate(new Date().toISOString())}.` : ''}
            </p>
            {messages.length ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setMessages([])
                  setError(null)
                }}
              >
                Clear conversation
              </Button>
            ) : null}
            <Badge tone="neutral" className="mt-3">
              Practice guidance only
            </Badge>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
