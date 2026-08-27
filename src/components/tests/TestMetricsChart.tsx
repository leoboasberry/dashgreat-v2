import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { TestDayMetrics } from '../../hooks/useTestMetrics'
import type { TestActivity } from '../../api/tests'

interface Props {
  days: TestDayMetrics[]
  activity: TestActivity[]
  metric: 'cpmql' | 'cpc' | 'ctr' | 'cpm'
}

const METRIC_LABELS: Record<Props['metric'], string> = {
  cpmql: 'CPMql (R$)',
  cpc: 'CPC (R$)',
  ctr: 'CTR (%)',
  cpm: 'CPM (R$)',
}

const SIGNIFICANT_TYPES = new Set([
  'approval', 'paused', 'reactivated', 'status_change', 'concluded',
])

const ACTIVITY_ICONS: Record<string, string> = {
  approval: '✅',
  paused: '⏸',
  reactivated: '▶️',
  status_change: '🔄',
  concluded: '🏁',
}

export default function TestMetricsChart({ days, activity, metric }: Props) {
  if (days.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        Sem dados para o período configurado
      </div>
    )
  }

  // Build set of significant activity dates for scatter markers
  const activityByDate = new Map<string, string>()
  for (const a of activity) {
    if (!SIGNIFICANT_TYPES.has(a.activity_type)) continue
    const date = a.created_at.slice(0, 10)
    if (!activityByDate.has(date)) {
      activityByDate.set(date, ACTIVITY_ICONS[a.activity_type] ?? '●')
    }
  }

  const chartData = days.map((d) => {
    const rawMetric = d[metric]
    const metricValue =
      rawMetric === null ? null : metric === 'ctr' ? +(rawMetric * 100).toFixed(2) : +rawMetric.toFixed(2)

    const marker = activityByDate.has(d.date) ? (metricValue ?? 0) : null

    return {
      date: d.date.slice(5), // MM-DD
      spend: +d.spend.toFixed(2),
      [metric]: metricValue,
      marker,
      markerLabel: activityByDate.get(d.date),
    }
  })

  const metricLabel = METRIC_LABELS[metric]

  return (
    <div>
      <div className="flex gap-4 mb-2 justify-end text-xs text-gray-400">
        {(['cpmql', 'cpc', 'ctr', 'cpm'] as const).map((m) => (
          <span
            key={m}
            className={m === metric ? 'text-blue-600 font-semibold' : ''}
          >
            {METRIC_LABELS[m]}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            yAxisId="spend"
            orientation="left"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v: number) => `R$${v}`}
          />
          <YAxis
            yAxisId="metric"
            orientation="right"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
            formatter={(value: number, name: string) => {
              if (name === 'Investimento') return [`R$${value.toFixed(2)}`, name]
              if (name === metricLabel && metric === 'ctr') return [`${value}%`, name]
              return [`R$${value?.toFixed(2)}`, name]
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            yAxisId="spend"
            type="monotone"
            dataKey="spend"
            name="Investimento"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            yAxisId="metric"
            type="monotone"
            dataKey={metric}
            name={metricLabel}
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />
          <Scatter
            yAxisId="metric"
            dataKey="marker"
            name="Atividade"
            fill="#ef4444"
            shape={(props: { cx?: number; cy?: number; payload?: { markerLabel?: string } }) => {
              const { cx = 0, cy = 0, payload } = props
              if (payload?.marker === null || payload?.marker === undefined) return <g />
              return (
                <text x={cx} y={cy - 6} textAnchor="middle" fontSize={14}>
                  {payload?.markerLabel ?? '●'}
                </text>
              )
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
