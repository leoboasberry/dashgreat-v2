import { useState } from 'react'
import { yesterdayBRT } from '../../utils/dateBRT'
import { ChevronDown, ChevronUp } from 'lucide-react'
import {
  BarChart,
  Bar,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { DailySpend } from '../../hooks/useConversionsData'
import { CHANNELS, CHANNEL_COLORS, type Channel } from '../../utils/channelNorm'

function fmtDate(date: string) {
  const [, m, d] = date.split('-')
  return `${d}/${m}`
}

function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

interface TooltipProps {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((a, b) => a + (b.value || 0), 0)
  const sorted = [...payload].filter((p) => p.value > 0).sort((a, b) => b.value - a.value)
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs min-w-40">
      <p className="font-semibold text-gray-700 mb-2">{label && fmtDate(label)}</p>
      {sorted.map((p) => (
        <div key={p.name} className="flex justify-between gap-4 mb-0.5">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-medium text-gray-700">{fmtBRL(p.value)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-4 mt-1.5 pt-1.5 border-t border-gray-100 font-semibold text-gray-700">
        <span>Total</span>
        <span>{fmtBRL(total)}</span>
      </div>
    </div>
  )
}

interface Props {
  data: DailySpend[]
  activeChannels: string[]
  dateFrom: string
  dateTo: string
}

export default function InvestmentChart({ data, activeChannels, dateFrom, dateTo }: Props) {
  const [collapsed, setCollapsed] = useState(false)

  const visibleChannels = (activeChannels.length > 0 ? activeChannels : CHANNELS) as Channel[]
  const activeData = visibleChannels.filter((ch) => data.some((d) => (d[ch] as number) > 0))

  // ── Footer stats ──
  const last7 = data.slice(-7)
  const avg7dTotal = last7.length > 0
    ? last7.reduce((s, d) => s + activeData.reduce((cs, ch) => cs + (Number(d[ch]) || 0), 0), 0) / last7.length
    : 0

  // Days in the month of dateTo
  const toDate = new Date(dateTo + 'T12:00:00')
  const daysInMonth = new Date(toDate.getFullYear(), toDate.getMonth() + 1, 0).getDate()
  const projection = avg7dTotal * daysInMonth

  // Days elapsed in period (for context)
  const fromDate = new Date(dateFrom + 'T12:00:00')
  const today = new Date(yesterdayBRT() + 'T12:00:00')
  const effectiveTo = toDate < today ? toDate : today
  const elapsed = Math.max(1, Math.round((effectiveTo.getTime() - fromDate.getTime()) / 86_400_000) + 1)
  const avgAllPeriod = elapsed > 0
    ? data.reduce((s, d) => s + activeData.reduce((cs, ch) => cs + (Number(d[ch]) || 0), 0), 0) / elapsed
    : 0

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer select-none hover:bg-gray-50 transition-colors"
        onClick={() => setCollapsed((v) => !v)}
      >
        <h3 className="text-sm font-semibold text-gray-700">Investimento Diário por Canal</h3>
        <button className="text-gray-400 hover:text-gray-600 transition-colors shrink-0">
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {!collapsed && (
        <>
          {data.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10 px-5">Sem dados de investimento no período.</p>
          ) : (
            <div className="px-2 pb-2">
              {/* Enrich data with daily total for label */}
              {(() => {
                const enriched = data.map((d) => ({
                  ...d,
                  _total: activeData.reduce((s, ch) => s + (Number(d[ch]) || 0), 0),
                }))
                return (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={enriched} margin={{ top: 20, right: 16, left: 0, bottom: 0 }} maxBarSize={32}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={fmtDate}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        width={48}
                      />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 6, color: '#94a3b8' }} />
                      {activeData.map((ch, idx) => (
                        <Bar
                          key={ch}
                          dataKey={ch}
                          stackId="invest"
                          fill={CHANNEL_COLORS[ch]}
                          name={ch}
                          radius={idx === activeData.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                        >
                          {/* Label only on the topmost bar */}
                          {idx === activeData.length - 1 && (
                            <LabelList
                              dataKey="_total"
                              position="top"
                              formatter={(v: number) => v > 0 ? `R$${(v / 1000).toFixed(0)}k` : ''}
                              style={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                            />
                          )}
                        </Bar>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )
              })()}
            </div>
          )}

          {/* Footer stats */}
          <div className="flex items-center border-t border-gray-100 divide-x divide-gray-100">
            <div className="flex flex-col px-5 py-3 flex-1">
              <span className="text-xs text-gray-400 mb-0.5">Média diária — últimos 7 dias</span>
              <span className="text-lg font-bold text-[#1a1a1a]">{fmtBRL(avg7dTotal)}<span className="text-xs font-normal text-gray-400">/dia</span></span>
            </div>
            <div className="flex flex-col px-5 py-3 flex-1">
              <span className="text-xs text-gray-400 mb-0.5">Média diária — período completo</span>
              <span className="text-lg font-bold text-[#1a1a1a]">{fmtBRL(avgAllPeriod)}<span className="text-xs font-normal text-gray-400">/dia</span></span>
            </div>
            <div className="flex flex-col px-5 py-3 flex-1">
              <span className="text-xs text-gray-400 mb-0.5">Projeção mensal (base 7d)</span>
              <span className="text-lg font-bold text-[#0D2F9F]">{fmtBRL(projection)}</span>
              <span className="text-xs text-gray-400">{daysInMonth} dias no mês</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
