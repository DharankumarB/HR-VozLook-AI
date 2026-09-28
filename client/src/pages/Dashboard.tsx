import { motion } from 'framer-motion'
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  Briefcase,
  FileText,
  Gauge,
  Mic,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendChart } from '../components/charts/TrendChart'
import { AppShell } from '../components/layout/AppShell'
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, ProgressBar, SectionHeader, Stat } from '../components/ui/primitives'
import { ApiError, api } from '../lib/api'
import { METRIC_LABELS, STATUS_LABELS } from '../lib/constants'
import { formatDate, greeting, scoreTone, toneClasses } from '../lib/format'
import type { DashboardResponse } from '../lib/types'
import { useAuth } from '../state/AuthContext'

export default function Dashboard() {
  const { profile, user } = useAuth()
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await api.dashboard())
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'We could not load your dashboard.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const name = profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'

  const chart = useMemo(() => {
    if (!data?.series?.length) return []
    return data.series.map((point, index) => ({
      label: `#${index + 1}`,
      overall: point.overall_score,
      technical: point.technical_score,
      communication: point.communication_score,
    }))
  }, [data])

  return (
    <AppShell title={`${greeting()}, ${name}`} subtitle="Your interview practice cockpit">
      <div className="space-y-6">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 -z-10 bg-grid-fade" aria-hidden />
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="max-w-xl">
                <Badge tone="accent">
                  <Sparkles className="h-3 w-3" aria-hidden /> Ready for your next interview?
                </Badge>
                <h2 className="mt-4 text-xl font-semibold leading-snug text-ink-50 sm:text-2xl">
                  {data?.stats.interviews_completed
                    ? `You have completed ${data.stats.interviews_completed} interview${data.stats.interviews_completed > 1 ? 's' : ''}. Let’s raise the bar.`
                    : 'Run your first AI mock interview in a few minutes.'}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-300">
                  {data?.has_resume
                    ? 'Your résumé is on file, so questions will be anchored to your own projects.'
                    : 'Upload your résumé to personalise every question to your projects and skills.'}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link to="/interview/setup" className="btn-primary">
                    <Mic className="h-4 w-4" aria-hidden />
                    Start Interview
                  </Link>
                  {!data?.has_resume ? (
                    <Link to="/resume" className="btn-secondary">
                      <FileText className="h-4 w-4" aria-hidden />
                      Upload résumé
                    </Link>
                  ) : !data?.has_job ? (
                    <Link to="/job" className="btn-secondary">
                      <Briefcase className="h-4 w-4" aria-hidden />
                      Add job description
                    </Link>
                  ) : (
                    <Link to="/progress" className="btn-secondary">
                      <BarChart3 className="h-4 w-4" aria-hidden />
                      View progress
                    </Link>
                  )}
                </div>
              </div>
              <div className="w-full max-w-xs space-y-3">
                <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <p className="section-title">Target role</p>
                  <p className="mt-1 text-sm font-medium text-ink-100">{profile?.target_role || 'Not set yet'}</p>
                  <Link to="/profile" className="mt-2 inline-flex items-center gap-1 text-2xs text-accent-soft hover:underline">
                    Update profile <ArrowUpRight className="h-3 w-3" aria-hidden />
                  </Link>
                </div>
                {data?.stats.last_score != null ? (
                  <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-4">
                    <p className="section-title">Last interview</p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className={`text-2xl font-semibold tabular-nums ${toneClasses[scoreTone(data.stats.last_score)].text}`}>
                        {Math.round(data.stats.last_score)}%
                      </span>
                      {data.stats.delta != null ? (
                        <span className={`inline-flex items-center gap-1 text-2xs ${data.stats.delta >= 0 ? 'text-success' : 'text-danger'}`}>
                          {data.stats.delta >= 0 ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}
                          {data.stats.delta > 0 ? '+' : ''}
                          {data.stats.delta} vs previous
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        </motion.div>

        {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Interviews completed"
            value={data?.stats.interviews_completed ?? 0}
            hint={data?.stats.interviews_in_progress ? `${data.stats.interviews_in_progress} in progress` : 'Practice sessions finished'}
            icon={<Mic className="h-4 w-4" aria-hidden />}
            loading={loading}
          />
          <Stat
            label="Average score"
            value={data?.stats.average_overall != null ? `${Math.round(data.stats.average_overall)}%` : '—'}
            hint="Across all completed interviews"
            icon={<Gauge className="h-4 w-4" aria-hidden />}
            tone={scoreTone(data?.stats.average_overall)}
            loading={loading}
          />
          <Stat
            label="Technical"
            value={data?.stats.average_technical != null ? `${Math.round(data.stats.average_technical)}%` : '—'}
            hint="Average technical accuracy"
            icon={<Target className="h-4 w-4" aria-hidden />}
            tone={scoreTone(data?.stats.average_technical)}
            loading={loading}
          />
          <Stat
            label="Communication"
            value={data?.stats.average_communication != null ? `${Math.round(data.stats.average_communication)}%` : '—'}
            hint="Clarity and structure"
            icon={<Bot className="h-4 w-4" aria-hidden />}
            tone={scoreTone(data?.stats.average_communication)}
            loading={loading}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* Trend */}
          <Card>
            <SectionHeader
              title="Score trend"
              subtitle="Real results from your completed interviews."
              icon={<BarChart3 className="h-4 w-4 text-accent" aria-hidden />}
              action={
                chart.length > 1 ? (
                  <Link to="/progress" className="btn-ghost !px-3 !py-2 text-xs">
                    Details <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                ) : null
              }
            />
            {loading ? (
              <LoadingState label="Loading your progress…" rows={2} />
            ) : chart.length ? (
              <TrendChart
                ariaLabel="Overall, technical and communication scores across interviews"
                data={chart}
                variant="area"
                series={[
                  { key: 'overall', label: METRIC_LABELS.overall_score!, color: '#7C5CFF' },
                  { key: 'technical', label: METRIC_LABELS.technical_score!, color: '#22D3EE' },
                  { key: 'communication', label: METRIC_LABELS.communication_score!, color: '#34D399' },
                ]}
              />
            ) : (
              <EmptyState
                icon={<BarChart3 className="h-5 w-5" aria-hidden />}
                title="Your interview journey starts here."
                description="Complete your first mock interview and this chart will show how your scores change over time."
                action={
                  <Link to="/interview/setup" className="btn-primary">
                    Start Your First Interview
                  </Link>
                }
              />
            )}
          </Card>

          {/* Recent interviews */}
          <Card>
            <SectionHeader
              title="Recent interviews"
              icon={<Mic className="h-4 w-4 text-neon" aria-hidden />}
              action={
                <Link to="/history" className="btn-ghost !px-3 !py-2 text-xs">
                  All <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              }
            />
            {loading ? (
              <LoadingState label="Loading interviews…" rows={3} />
            ) : data?.recent?.length ? (
              <ul className="space-y-3">
                {data.recent.map((interview) => (
                  <li key={interview.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-100">{interview.job_role}</p>
                        <p className="mt-0.5 text-2xs text-ink-500">
                          {interview.interview_type} · {formatDate(interview.completed_at ?? interview.created_at)}
                        </p>
                      </div>
                      <Badge tone={interview.status === 'completed' ? 'success' : interview.status === 'in_progress' ? 'warning' : 'neutral'}>
                        {STATUS_LABELS[interview.status] ?? interview.status}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      {interview.overall_score != null ? (
                        <div className="min-w-0 flex-1">
                          <ProgressBar value={Number(interview.overall_score)} showValue />
                        </div>
                      ) : (
                        <span className="text-2xs text-ink-500">Not scored yet</span>
                      )}
                      <Link
                        to={interview.has_report ? `/interview/${interview.id}/report` : `/interview/${interview.id}`}
                        className="btn-ghost !px-3 !py-1.5 text-2xs"
                      >
                        {interview.has_report ? 'View report' : 'Continue'}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<Mic className="h-5 w-5" aria-hidden />}
                title="You haven’t completed an interview yet."
                description="Set up an interview and the AI interviewer will take it from there."
                action={
                  <Link to="/interview/setup" className="btn-primary">
                    Start Your First Interview
                  </Link>
                }
              />
            )}
          </Card>
        </div>

        {/* Weak topics */}
        {data?.weak_topics?.length ? (
          <Card>
            <SectionHeader
              title="Recurring improvement areas"
              subtitle="Topics your answers repeatedly miss — measured across your sessions."
              icon={<Target className="h-4 w-4 text-warning" aria-hidden />}
            />
            <div className="flex flex-wrap gap-2">
              {data.weak_topics.map((topic) => (
                <span key={topic.topic} className="chip border-warning/25 bg-warning/[0.06] text-warning">
                  {topic.topic} · missed in {topic.sessions} session{topic.sessions > 1 ? 's' : ''}
                </span>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link to="/coach" className="btn-secondary !py-2 text-xs">
                <Bot className="h-3.5 w-3.5" aria-hidden />
                Ask the AI coach
              </Link>
              <Link to="/interview/setup" className="btn-primary !py-2 text-xs">
                Retake an interview
              </Link>
            </div>
          </Card>
        ) : null}

        <p className="pb-2 text-center text-2xs leading-relaxed text-ink-600">
          Score metrics shown here are practice signals computed from your own answers — not a hiring decision.
        </p>
      </div>
    </AppShell>
  )
}
