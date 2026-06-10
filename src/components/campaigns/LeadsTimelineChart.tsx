import { useState, useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { ParsedLead } from '../../utils/parseLeads'
import { buildDailySeries, allUniqueSources } from '../../utils/parseLeads'
import { PALETTE, fmtDate, CustomTooltip, SeriesToggle } from './ChartUtils'

interface Props {
  leads: ParsedLead[]
  stackBySource: boolean
  onToggleStack: () => void
}

export default function LeadsTimelineChart({ leads, stackBySource, onToggleStack }: Props) {
  const sources = useMemo(() => allUniqueSources(leads), [leads])
  const [active, setActive] = useState<Set<string>>(() => new Set(sources))

  // Sync active set when sources change
  useMemo(() => {
    setActive(new Set(sources))
  }, [sources])

  const series = buildDailySeries(leads, stackBySource)
  const visibleSources = sources.filter((s) => active.has(s))

  function toggle(key: string) {
    setActive((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  if (series.length === 0) {
    return (
      <ChartShell title="Leads por Dia" stackBySource={stackBySource} onToggleStack={onToggleStack}>
        <p className="text-sm text-gray-400 text-center py-10">
          Nenhum lead com data de conversão no período selecionado.
        </p>
      </ChartShell>
    )
  }

  return (
    <ChartShell title="Leads por Dia" stackBySource={stackBySource} onToggleStack={onToggleStack}>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={series} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
          <defs>
            {stackBySource && sources.length > 1
              ? sources.map((src, i) => (
                  <linearGradient key={src} id={`grad-src-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.5} />
                    <stop offset="95%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.05} />
                  </linearGradient>
                ))
              : (
                <linearGradient id="grad-total" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                </linearGradient>
              )}
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            dy={6}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
          />
          {stackBySource && sources.length > 1 ? (
            visibleSources.map((src) => (
              <Area
                key={src}
                type="monotone"
                dataKey={src}
                stackId="1"
                stroke={PALETTE[sources.indexOf(src) % PALETTE.length]}
                fill={`url(#grad-src-${sources.indexOf(src)})`}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))
          ) : (
            <Area
              type="monotone"
              dataKey="total"
              stroke="#3b82f6"
              fill="url(#grad-total)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 0, fill: '#3b82f6' }}
              name="Leads"
              label={<DayLabel />}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>

      {stackBySource && sources.length > 1 && (
        <SeriesToggle keys={sources} colors={PALETTE} active={active} onToggle={toggle} />
      )}
    </ChartShell>
  )
}

function DayLabel(props: { x?: number; y?: number; value?: number }) {
  const { x = 0, y = 0, value } = props
  if (!value) return null
  return (
    <text x={x} y={y - 6} textAnchor="middle" fontSize={10} fill="#64748b" fontWeight={500}>
      {value}
    </text>
  )
}

function ChartShell({
  title,
  stackBySource,
  onToggleStack,
  children,
}: {
  title: string
  stackBySource: boolean
  onToggleStack: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <button
          onClick={onToggleStack}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-all font-medium ${
            stackBySource
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
              : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
          }`}
        >
          Empilhar por Origem
        </button>
      </div>
      {children}
    </div>
  )
}
