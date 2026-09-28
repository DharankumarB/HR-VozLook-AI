import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useCallback, useEffect, useState } from 'react'
import { AdminError, AdminPageHeader, AdminTable, ScoreCell } from '../../components/admin/AdminBits'
import { Card, LoadingState, SectionHeader, SegmentedControl, Stat } from '../../components/ui/primitives'
import { TrendChart } from '../../components/charts/TrendChart'
import { api } from '../../lib/api'
import { titleCase } from '../../lib/format'
import type { AdminAnalytics as AnalyticsData } from '../../lib/types'

const MODE_COLORS = ['#7C5CFF', '#22D3EE', '#34D399', '#FBBF24']

export default function AdminAnalytics() {
  const [range, setRange] = useState(30)
  const [granularity, setGranularity] = useState<'daily' | 'monthly'>('daily')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api.admin
      .analytics(range)
      .then(setData)
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false))
  }, [range])

  useEffect(() => {
    load()
  }, [load])

  const growth =
    granularity === 'daily'
      ? data?.user_growth.map((row) => ({ label: row.date.slice(5), new_users: row.users, total: row.cumulative })) ?? []
      : data?.monthly_growth.map((row) => ({ label: row.month, new_users: row.users })) ?? []

  const activity = data?.interview_activity.map((row) => ({ label: row.date.slice(5), started: row.started, completed: row.completed })) ?? []
  const performance = data?.performance.map((row) => ({ label: row.date.slice(5), average: row.average_score ?? 0, interviews: row.interviews })) ?? []

  return (
    <div>
      <AdminPageHeader
        title="Analytics"
        subtitle="User growth, interview activity, performance trends, popular roles and mode/type usage — every series is queried live from the database."
        action={
          <div className="flex items-center gap-3">
            <SegmentedControl
              label="Date range"
              value={range}
              onChange={(value) => setRange(Number(value))}
              options={[
                { value: 7, label: '7 days' },
                { value: 30, label: '30 days' },
                { value: 90, label: '90 days' },
                { value: 365, label: '1 year' },
              ]}
            />
          </div>
        }
      />

      {error ? <AdminError message={error} onRetry={load} /> : null}
      {loading && !data ? <LoadingState label="Crunching analytics…" rows={4} /> : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="New accounts" value={data.user_growth.reduce((sum, row) => sum + row.users, 0)} hint={`Last ${data.range_days} days`} />
            <Stat label="Interviews started" value={data.interview_activity.reduce((sum, row) => sum + row.started, 0)} hint={`Last ${data.range_days} days`} />
            <Stat label="Interviews completed" value={data.interview_activity.reduce((sum, row) => sum + row.completed, 0)} />
            <Stat
              label="Completion rate"
              value={data.completion.rate == null ? '—' : `${Math.round(data.completion.rate)}%`}
              hint={`${data.completion.started} started · ${data.completion.abandoned} abandoned`}
            />
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <Card>
              <SectionHeader
                title="User growth"
                subtitle="New registrations and cumulative accounts"
                action={
                  <SegmentedControl
                    label="Grouping"
                    value={granularity}
                    onChange={(value) => setGranularity(value as 'daily' | 'monthly')}
                    options={[
                      { value: 'daily', label: 'Daily' },
                      { value: 'monthly', label: 'Monthly' },
                    ]}
                  />
                }
              />
              <TrendChart
                data={growth}
                series={[
                  { key: 'new_users', label: 'New accounts', color: '#7C5CFF' },
                  ...(granularity === 'daily' ? [{ key: 'total', label: 'Total accounts', color: '#22D3EE' }] : []),
                ]}
                variant="area"
                ariaLabel="User growth over time"
              />
              <p className="mt-2 text-2xs text-ink-500">Counts are per {granularity === 'daily' ? 'day' : 'month'} of registration.</p>
            </Card>

            <Card>
              <SectionHeader title="Interview activity" subtitle="Sessions started versus completed" />
              <TrendChart
                data={activity}
                series={[
                  { key: 'started', label: 'Started', color: '#7C5CFF' },
                  { key: 'completed', label: 'Completed', color: '#34D399' },
                ]}
                ariaLabel="Interview activity over time"
              />
            </Card>

            <Card>
              <SectionHeader title="Average performance over time" subtitle="Mean overall score of interviews completed each day" />
              <TrendChart data={performance} series={[{ key: 'average', label: 'Average score', color: '#FBBF24' }]} ariaLabel="Average performance over time" />
              {!performance.some((row) => row.average) ? (
                <p className="mt-2 text-2xs text-ink-500">No completed interviews in this window yet.</p>
              ) : null}
            </Card>

            <Card>
              <SectionHeader title="Mode and type usage" subtitle="How candidates practise, and what they practise" />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.mode_usage.map((row) => ({ name: titleCase(row.mode), value: row.count }))}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={3}
                        stroke="rgba(0,0,0,0.35)"
                      >
                        {data.mode_usage.map((row, index) => (
                          <Cell key={row.mode} fill={MODE_COLORS[index % MODE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: 11, color: '#A2A8BC' }} />
                      <Tooltip
                        contentStyle={{ background: 'rgba(16,19,25,0.96)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.type_usage.map((row) => ({ name: titleCase(row.type), value: row.count }))}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="name" stroke="#7C849C" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#7C849C" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: 'rgba(16,19,25,0.96)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, fontSize: 12 }}
                      />
                      <Bar dataKey="value" name="Interviews" fill="#22D3EE" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>
          </div>

          <div className="mt-6">
            <SectionHeader title="Popular job roles" subtitle="Roles with the most practice sessions in this window" />
            <AdminTable head={['Job role', 'Interviews', 'Average score']} caption="Popular job roles">
              {data.popular_roles.map((row) => (
                <tr key={row.role} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-ink-100">{row.role}</td>
                  <td className="px-4 py-3 tabular-nums text-ink-300">{row.count}</td>
                  <td className="px-4 py-3">
                    <ScoreCell value={row.average_score} />
                  </td>
                </tr>
              ))}
            </AdminTable>
          </div>
        </>
      ) : null}
    </div>
  )
}
