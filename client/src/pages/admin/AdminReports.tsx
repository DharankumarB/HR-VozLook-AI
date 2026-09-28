import { useCallback, useEffect, useState } from 'react'
import { AdminError, AdminPageHeader, AdminTable, ScoreCell } from '../../components/admin/AdminBits'
import { Badge, Card, LoadingState, ProgressBar, SectionHeader, Stat } from '../../components/ui/primitives'
import { api } from '../../lib/api'
import type { AdminReportInsights } from '../../lib/types'

export default function AdminReports() {
  const [data, setData] = useState<AdminReportInsights | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api.admin
      .reports()
      .then(setData)
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const maxArea = Math.max(1, ...(data?.improvement_areas ?? []).map((entry) => entry.count))

  return (
    <div>
      <AdminPageHeader
        title="Reports"
        subtitle="Aggregated insight computed from stored evaluation data: the improvement areas candidates are actually losing marks on, and the technical topics that come up most often."
      />

      {error ? <AdminError message={error} onRetry={load} /> : null}
      {loading && !data ? <LoadingState label="Aggregating report data…" rows={3} /> : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Reports generated" value={data.totals.reports} hint={`${data.totals.completed_interviews} completed interviews`} />
            <Stat
              label="Average performance"
              value={data.totals.average_score == null ? '—' : `${Math.round(data.totals.average_score)}%`}
              hint="Across every stored report"
            />
            <Stat label="Interviews scored" value={data.totals.scored_interviews} hint="Sessions with an overall score" />
            <Stat label="Distinct roles" value={data.top_roles.length} hint="Roles with at least one interview" />
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <Card>
              <SectionHeader title="Most common improvement areas" subtitle="What the AI flagged most often across all reports" />
              <ul className="space-y-3">
                {data.improvement_areas.map((entry) => (
                  <li key={entry.area}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-ink-200">{entry.area}</span>
                      <span className="tabular-nums text-ink-400">
                        {entry.count} · {Math.round(entry.share)}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                      <div className="h-full rounded-full bg-warning" style={{ width: `${Math.round((entry.count / maxArea) * 100)}%` }} />
                    </div>
                  </li>
                ))}
                {!data.improvement_areas.length ? <li className="text-xs text-ink-500">No reports have been generated yet.</li> : null}
              </ul>
            </Card>

            <Card>
              <SectionHeader title="Most common technical weaknesses" subtitle="Expected topics that candidates did not cover" />
              <div className="flex flex-wrap gap-2">
                {data.technical_weaknesses.map((entry) => (
                  <Badge key={entry.topic} tone="warning">
                    {entry.topic} · {entry.count}
                  </Badge>
                ))}
                {!data.technical_weaknesses.length ? <p className="text-xs text-ink-500">No uncovered topics recorded yet.</p> : null}
              </div>
            </Card>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <div>
              <SectionHeader title="Most common roles" subtitle="Where candidates are aiming" />
              <AdminTable head={['Job role', 'Interviews', 'Average score']} caption="Most common roles">
                {data.top_roles.map((row) => (
                  <tr key={row.role} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-ink-100">{row.role}</td>
                    <td className="px-4 py-3 tabular-nums text-ink-300">{row.interviews}</td>
                    <td className="px-4 py-3">
                      <ScoreCell value={row.average_score} />
                    </td>
                  </tr>
                ))}
              </AdminTable>
            </div>

            <div className="space-y-4">
              <Card>
                <SectionHeader title="Score distribution" subtitle="Completed interviews by overall band" />
                <div className="grid gap-2 sm:grid-cols-2">
                  {data.score_distribution.map((band) => (
                    <ProgressBar
                      key={band.band}
                      label={band.band}
                      value={band.count}
                      max={Math.max(1, ...data.score_distribution.map((entry) => entry.count))}
                      showValue={false}
                    />
                  ))}
                </div>
                <p className="mt-2 text-2xs text-ink-500">
                  Bands: {data.score_distribution.map((band) => `${band.band}: ${band.count}`).join(' · ')}
                </p>
              </Card>

              <Card>
                <SectionHeader title="Dimension averages" subtitle="Where the whole candidate pool is strongest and weakest" />
                <div className="grid gap-2 sm:grid-cols-2">
                  {data.dimension_averages.map((dimension) => (
                    <ProgressBar
                      key={dimension.dimension}
                      label={dimension.label}
                      value={dimension.average ?? 0}
                      showValue={dimension.average != null}
                    />
                  ))}
                </div>
              </Card>
            </div>
          </div>

          <p className="mt-4 text-2xs text-ink-500">
            All figures on this page are computed from stored <code className="text-ink-300">answer_evaluations</code> and{' '}
            <code className="text-ink-300">interview_reports</code> rows — nothing is estimated or hardcoded.
          </p>
        </>
      ) : null}
    </div>
  )
}
