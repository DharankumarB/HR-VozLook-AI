import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface SeriesDefinition {
  key: string
  label: string
  color: string
}

export interface ChartPoint {
  label: string
  [key: string]: string | number | null
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-2xl border border-white/10 bg-surface-raised/95 px-3 py-2 text-xs shadow-card backdrop-blur">
      <p className="mb-1 font-semibold text-ink-100">{label}</p>
      {payload
        .filter((entry: any) => entry.value != null)
        .map((entry: any) => (
          <p key={entry.dataKey} className="flex items-center gap-2 text-ink-300">
            <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} aria-hidden />
            {entry.name}: <span className="font-semibold text-ink-100">{Math.round(entry.value)}%</span>
          </p>
        ))}
    </div>
  )
}

/** Multi-series trend chart used by the Progress page and the dashboard. */
export function TrendChart({
  data,
  series,
  height = 260,
  variant = 'line',
  ariaLabel,
}: {
  data: ChartPoint[]
  series: SeriesDefinition[]
  height?: number
  variant?: 'line' | 'area'
  ariaLabel: string
}) {
  const common = (
    <>
      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
      <XAxis
        dataKey="label"
        stroke="#7C849C"
        tick={{ fontSize: 11, fill: '#A2A8BC' }}
        tickLine={false}
        axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
        minTickGap={12}
      />
      <YAxis
        domain={[0, 100]}
        stroke="#7C849C"
        tick={{ fontSize: 11, fill: '#A2A8BC' }}
        tickLine={false}
        axisLine={false}
        width={34}
      />
      <Tooltip content={<ChartTooltip />} />
      <Legend wrapperStyle={{ fontSize: 11, color: '#A2A8BC' }} iconType="circle" />
    </>
  )

  return (
    <div style={{ width: '100%', height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        {variant === 'area' ? (
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              {series.map((definition) => (
                <linearGradient key={definition.key} id={`fill-${definition.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={definition.color} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={definition.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            {common}
            {series.map((definition) => (
              <Area
                key={definition.key}
                type="monotone"
                dataKey={definition.key}
                name={definition.label}
                stroke={definition.color}
                strokeWidth={2}
                fill={`url(#fill-${definition.key})`}
                connectNulls
                dot={{ r: 3, strokeWidth: 0, fill: definition.color }}
                activeDot={{ r: 5 }}
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            {common}
            {series.map((definition) => (
              <Line
                key={definition.key}
                type="monotone"
                dataKey={definition.key}
                name={definition.label}
                stroke={definition.color}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 0, fill: definition.color }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
