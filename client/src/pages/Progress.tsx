import { BarChart3, Bot, LineChart, Minus, TrendingDown, TrendingUp, Target } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendChart, type ChartPoint } from '../components/charts/TrendChart'
import { AppShell } from '../components/layout/AppShell'
import { Badge, Card, EmptyState, ErrorState, LoadingState, ProgressBar, SectionHeader, Stat } from '../components/ui/primitives'
import { ApiError, api } from '../lib/api'
import { METRIC_LABELS } from '../lib/constants'
import { formatDate, scoreTone } from '../lib/format'
import type { ProgressResponse } from '../lib/types'

const METRIC_SERIES: { key: string; label: string; color: string }[] = [
  { key: 'overall_score', label: 'Overall', color: '#7C5CFF' },
  { key: 'technical_score', label: 'Technical', color: '#22D3EE' },
  { key: 'communication_score', label: 'Communication', color: '#34D399' },
  { key: 'problem_solving_score', label: 'Problem solving', color: '#FBBF24' },
  { key: 'relevance_score', label: 'Relevance', color: '#F472B6' },
]

export default function Progress() {
  const [data, setData] = useState<ProgressResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeMetrics, setActiveMetrics] = useState<string[]>(['overall_score', 'technical_score', 'communication_score'])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await api.progress())
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'We could not load your progress data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const chart = useMemo(() => {
    if (!data?.series?.length) return []
    return data.series.map((point, index) => {
      const record: ChartPoint = { label: `#${index + 1}` }
      for (const series of METRIC_SERIES) record[series.key] = (point as unknown as Record<string, number | null>)[series.key] ?? null
      return record
    })
  }, [data])

  const activeSeries = METRIC_SERIES.filter((series) => activeMetrics.includes(series.key))

  const summary = useMemo(() => {
    if (!data?.trends?.length) return []
    return data.trends
  }, [data])

  return (
    <AppShell title="Progress" subtitle="Every number here comes from your own completed interviews">
      <div className="space-y-6">
        {error ? <ErrorState title="Could not load progress" message={error} onRetry={() => void load()} /> : null}

        {loading ? (
          <Card>
            <LoadingState label="Crunching your scores…" rows={4} />
          </Card>
        ) : !data || data.scored_interviews === 0 ? (
          <EmptyState
            icon={<BarChart3 className="h-5 w-5" aria-hidden />}
            title="No progress data yet."
            description="Complete a mock interview with at least one answered question and your score trends will appear here — including how each skill dimension moves over time."
            action={
              <Link to="/interview/setup" className="btn-primary">
                Start an interview
              </Link>
            }
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Scored interviews" value={data.scored_interviews} hint="Sessions with at least one evaluated answer" icon={<LineChart className="h-4 w-4" aria-hidden />} />
              {summary.slice(0, 3).map((trend) => (
                <Stat
                  key={trend.metric}
                  label={METRIC_LABELS[trend.metric] ?? trend.metric}
                  value={trend.last != null ? `${Math.round(trend.last)}%` : '—'}
                  hint={
                    trend.change != null
                      ? `${trend.change > 0 ? '+' : ''}${Math.round(trend.change)} points since your first session`
                      : 'Only one session so far'
                  }
                  icon={
                    trend.change == null ? (
                      <Minus className="h-4 w-4" aria-hidden />
                    ) : trend.change >= 0 ? (
                      <TrendingUp className="h-4 w-4" aria-hidden />
                    ) : (
                      <TrendingDown className="h-4 w-4" aria-hidden />
                    )
                  }
                  tone={scoreTone(trend.last)}
                />
              ))}
            </div>

            <Card>
              <SectionHeader
                title="Score trend across interviews"
                subtitle="Each point is one completed interview, in chronological order."
                icon={<LineChart className="h-4 w-4 text-accent" aria-hidden />}
                action={
                  <Badge tone="neutral">
                    {data.scored_interviews} session{data.scored_interviews === 1 ? '' : 's'}
                  </Badge>
                }
              />

              <div className="mb-4 flex flex-wrap gap-2">
                {METRIC_SERIES.map((series) => {
                  const active = activeMetrics.includes(series.key)
                  return (
                    <button
                      key={series.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setActiveMetrics((current) =>
                          current.includes(series.key)
                            ? current.length > 1
                              ? current.filter((key) => key !== series.key)
                              : current
                            : [...current, series.key],
                        )
                      }
                      className={`chip transition-colors ${active ? 'border-white/30 text-white' : 'text-ink-400'}`}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: series.color }} aria-hidden />
                      {series.label}
                    </button>
                  )
                })}
              </div>

              <TrendChart
                ariaLabel="Scores per interview over time"
                data={chart}
                series={activeSeries}
                variant="line"
                height={300}
              />

              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead>
                    <tr className="text-2xs uppercase tracking-wider text-ink-500">
                      <th className="pb-2 pr-4">Session</th>
                      {METRIC_SERIES.map((series) => (
                        <th key={series.key} className="pb-2 pr-4">
                          {series.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.series.map((point, index) => (
                      <tr key={point.interview_id} className="border-t border-white/[0.06]">
                        <td className="py-2 pr-4 text-ink-300">
                          #{index + 1} · {formatDate(point.completed_at ?? point.created_at)}
                        </td>
                        {METRIC_SERIES.map((series) => {
                          const value = (point as unknown as Record<string, number | null>)[series.key]
                          return (
                            <td key={series.key} className="py-2 pr-4 tabular-nums text-ink-100">
                              {value != null ? `${Math.round(Number(value))}%` : '—'}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <SectionHeader title="Average by interview type" subtitle="Where you perform strongest" icon={<BarChart3 className="h-4 w-4 text-neon" aria-hidden />} />
                {data.averages_by_type.length ? (
                  <div className="space-y-4">
                    {data.averages_by_type.map((entry) => (
                      <ProgressBar
                        key={entry.interview_type}
                        value={entry.average ?? 0}
                        label={`${entry.interview_type} (${entry.sessions} session${entry.sessions === 1 ? '' : 's'})`}
                        showValue
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-500">Not enough data yet.</p>
                )}
              </Card>

              <Card>
                <SectionHeader
                  title="Recurring weak topics"
                  subtitle="Topics missed repeatedly across sessions"
                  icon={<Target className="h-4 w-4 text-warning" aria-hidden />}
                />
                {data.weak_topics.length ? (
                  <ul className="space-y-3">
                    {data.weak_topics.map((topic) => (
                      <li key={topic.topic} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-ink-100">{topic.topic}</p>
                          <Badge tone="warning">{topic.sessions} session{topic.sessions > 1 ? 's' : ''}</Badge>
                        </div>
                        <p className="mt-1 text-2xs text-ink-500">
                          Missed {topic.misses} time{topic.misses > 1 ? 's' : ''}
                          {topic.lastSeen ? ` · last seen ${formatDate(topic.lastSeen)}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-500">No recurring gaps detected — your answers cover the expected topics well.</p>
                )}
                <div className="mt-4">
                  <Link to="/coach" className="btn-secondary !py-2 text-xs">
                    <Bot className="h-3.5 w-3.5" aria-hidden /> Build a study plan with the coach
                  </Link>
                </div>
              </Card>
            </div>

            <Card>
              <SectionHeader title="How these numbers are produced" subtitle="Transparency by design" />
              <ul className="space-y-2.5 text-xs leading-relaxed text-ink-300">
                <li>Every point is the weighted score of a completed interview, computed from the stored evaluations of your own answers.</li>
                <li>No score is estimated, seeded or back-filled — sessions without evaluated answers are excluded.</li>
                <li>Trends compare your first and most recent session for the same metric.</li>
                <li>These are practice signals for self-improvement, not a hiring decision or prediction.</li>
              </ul>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  )
}
