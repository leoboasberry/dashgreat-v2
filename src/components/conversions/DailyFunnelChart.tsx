import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import {
  ComposedChart,
  Line,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { DailyFunnelPoint } from '../../utils/computeMetrics'
import type { ParsedLead } from '../../utils/parseLeads'

interface ChartPoint {
  date: string
  leads: number | null
  mqls: number | null
  cpmql: number | null
}

interface Props {
  dailyFunnel: DailyFunnelPoint[]
  filteredLeads: ParsedLead[]
}

function fmtDate(d: string) {
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}

function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2.5 text-xs">
      <p className="text-gray-500 font-medium mb-1.5">{fmtDate(label)}</p>
      {payload.map((p: { name: string; value: number | null; color: string }) => (
        p.value != null && (
          <div key={p.name} className="flex items-center gap-2 mb-0.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-gray-600">{p.name}:</span>
            <span className="font-semibold text-gray-800">
              {p.name === 'CPMQL' ? fmtBRL(p.value) : p.value}
            </span>
          </div>
        )
      ))}
    </div>
  )
}

const METRICS = [
  { key: 'mqls',  label: 'MQLs',  color: '#0C2F9F', bg: 'bg-blue-50',   text: 'text-[#0C2F9F]' },
  { key: 'cpmql', label: 'CPMQL', color: '#f59e0b', bg: 'bg-amber-50',  text: 'text-amber-700' },
  { key: 'leads', label: 'Leads', color: '#6366f1', bg: 'bg-indigo-50', text: 'text-indigo-700' },
] as const

type MetricKey = 'mqls' | 'cpmql' | 'leads'

export default function DailyFunnelChart({ dailyFunnel, filteredLeads }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [active, setActive] = useState<Set<MetricKey>>(new Set(['mqls', 'cpmql']))

  function toggle(key: MetricKey) {
    setActive((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Group filtered leads by date
  const leadsByDate: Record<string, number> = {}
  for (const l of filteredLeads) {
    if (l.date) leadsByDate[l.date] = (leadsByDate[l.date] ?? 0) + 1
  }

  const allDates = new Set([
    ...dailyFunnel.map((p) => p.date),
    ...Object.keys(leadsByDate),
  ])

  const data: ChartPoint[] = [...allDates].sort().map((date) => {
    const fp = dailyFunnel.find((p) => p.date === date)
    const mqls = fp?.mqls ?? 0
    const spend = fp?.spend ?? 0
    const leads = leadsByDate[date] ?? 0
    return {
      date,
      leads: leads > 0 ? leads : null,
      mqls: mqls > 0 ? mqls : null,
      cpmql: mqls > 0 && spend > 0 ? Math.round(spend / mqls) : null,
    }
  })

  const totalMQLs = dailyFunnel.reduce((s, p) => s + p.mqls, 0)
  const totalSpend = dailyFunnel.reduce((s, p) => s + p.spend, 0)
  const avgCPMQL = totalMQLs > 0 ? totalSpend / totalMQLs : null

  // ── Trend: last 7 days vs previous 7 days ──
  const trend = useMemo(() => {
    const sortedDates = [...allDates].sort()
    const last7 = sortedDates.slice(-7)
    const prev7 = sortedDates.slice(-14, -7)

    function periodStats(dates: string[]) {
      let mqls = 0, spend = 0, leads = 0
      for (const d of dates) {
        const fp = dailyFunnel.find((p) => p.date === d)
        mqls += fp?.mqls ?? 0
        spend += fp?.spend ?? 0
        leads += leadsByDate[d] ?? 0
      }
      return {
        mqls,
        cpmql: mqls > 0 ? spend / mqls : 0,
        leadToMql: leads > 0 ? (mqls / leads) * 100 : 0,
      }
    }

    const cur = periodStats(last7)
    const prv = periodStats(prev7)

    function pct(c: number, p: number) {
      if (p === 0) return null
      return ((c - p) / p) * 100
    }

    return {
      mqls: pct(cur.mqls, prv.mqls),
      cpmql: pct(cur.cpmql, prv.cpmql),
      leadToMql: pct(cur.leadToMql, prv.leadToMql),
    }
  }, [allDates, dailyFunnel, leadsByDate])

  const showRightAxis = active.has('cpmql')
  const showLeftAxis = active.has('mqls') || active.has('leads')

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 select-none">
        <div
          className="flex items-center gap-3 flex-wrap cursor-pointer"
          onClick={() => setCollapsed((v) => !v)}
        >
          <h3 className="text-sm font-semibold text-gray-700">MQLs e CPMQL por dia</h3>
          {collapsed && avgCPMQL != null && (
            <span className="text-xs bg-amber-50 text-amber-700 font-medium px-2 py-0.5 rounded-full">
              CPMQL {fmtBRL(avgCPMQL)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 ml-auto mr-2">
          {METRICS.map(({ key, label, color }) => {
            const on = active.has(key)
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-all ${
                  on
                    ? 'border-transparent text-white'
                    : 'border-gray-200 text-gray-400 bg-white'
                }`}
                style={on ? { background: color, borderColor: color } : {}}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: on ? 'rgba(255,255,255,0.7)' : color }}
                />
                {label}
              </button>
            )
          })}
        </div>

        <button
          className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {/* Chart body */}
      {!collapsed && (
        <div className="px-2 pb-2">
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={data} margin={{ top: 8, right: showRightAxis ? 16 : 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              {showLeftAxis && (
                <YAxis
                  yAxisId="count"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
              )}
              {showRightAxis && (
                <YAxis
                  yAxisId="cost"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
              )}
              <Tooltip content={<CustomTooltip />} />

              {active.has('leads') && (
                <Line
                  yAxisId="count"
                  type="linear"
                  dataKey="leads"
                  name="Leads"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: '#6366f1', strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                >
                  <LabelList dataKey="leads" position="top" style={{ fontSize: 9, fill: '#a5b4fc' }} />
                </Line>
              )}

              {active.has('mqls') && (
                <Line
                  yAxisId="count"
                  type="linear"
                  dataKey="mqls"
                  name="MQLs"
                  stroke="#0C2F9F"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: '#0C2F9F', strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                >
                  <LabelList dataKey="mqls" position="bottom" style={{ fontSize: 9, fill: '#93c5fd' }} />
                </Line>
              )}

              {active.has('cpmql') && (
                <Line
                  yAxisId="cost"
                  type="linear"
                  dataKey="cpmql"
                  name="CPMQL"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={{ r: 2, fill: '#f59e0b', strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                >
                  <LabelList
                    dataKey="cpmql"
                    position="top"
                    formatter={(v: number) => `${Math.round(v / 1000)}k`}
                    style={{ fontSize: 9, fill: '#fcd34d' }}
                  />
                </Line>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Trend row — always visible */}
      {(() => {
        const items = [
          { label: 'MQLs', value: trend.mqls, positiveGood: true },
          { label: 'CPMQL', value: trend.cpmql, positiveGood: false },
          { label: 'Lead → MQL', value: trend.leadToMql, positiveGood: true },
        ]
        return (
          <div className="flex items-center border-t border-gray-100 divide-x divide-gray-100">
            <span className="px-5 py-4 text-xs text-gray-400 font-medium shrink-0 whitespace-nowrap">
              Tendência 7d
            </span>
            {items.map(({ label, value, positiveGood }) => {
              const hasData = value !== null
              const isUp = hasData && value! > 0
              const isDown = hasData && value! < 0
              const isGood = positiveGood ? isUp : isDown
              const isBad = positiveGood ? isDown : isUp

              const colorClass = !hasData
                ? 'text-gray-400'
                : isGood
                ? 'text-emerald-600'
                : isBad
                ? 'text-red-500'
                : 'text-gray-400'

              const bgClass = !hasData
                ? 'bg-gray-50'
                : isGood
                ? 'bg-emerald-50'
                : isBad
                ? 'bg-red-50'
                : 'bg-gray-50'

              const Icon = !hasData ? Minus : isUp ? TrendingUp : isDown ? TrendingDown : Minus

              return (
                <div key={label} className="flex items-center gap-3 px-5 py-4 flex-1 min-w-0">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${bgClass}`}>
                      <Icon size={15} className={`${colorClass} shrink-0`} />
                      <span className={`text-base font-bold ${colorClass}`}>
                        {hasData
                          ? `${value! > 0 ? '+' : ''}${value!.toFixed(1)}%`
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}
    </div>
  )
}
