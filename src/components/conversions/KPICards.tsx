import { ArrowRight } from 'lucide-react'
import type { FunnelCounts } from '../../hooks/useConversionsData'

function fmt(n: number) {
  return n.toLocaleString('pt-BR')
}

function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function pct(a: number, b: number): string {
  if (b === 0) return '—'
  return ((a / b) * 100).toFixed(1) + '%'
}


function pacingColor(_ritmo: number): string {
  return 'text-[#1a1a1a]'
}

function Skeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div className={`h-8 ${wide ? 'w-32' : 'w-20'} bg-gray-100 rounded-lg animate-pulse`} />
  )
}

interface Props {
  totalSpend: number
  totalLeads: number
  funnel: FunnelCounts
  totalMRR: number
  cpl: number | null
  cpa: number | null
  pacingDeveria?: number | null
  pacingBudget?: number
  /** Windsor + Supabase still loading */
  loading?: boolean
  /** GreatPages leads still loading */
  loadingLeads?: boolean
}

export default function KPICards({
  totalSpend, totalLeads, funnel, totalMRR, cpl, cpa,
  pacingDeveria, pacingBudget,
  loading = false, loadingLeads = false,
}: Props) {
  const ticketMedio = funnel.won > 0 ? totalMRR / funnel.won : null
  const ritmo = pacingDeveria && pacingDeveria > 0 ? (totalSpend / pacingDeveria) * 100 : null

  const stages = [
    { label: 'Leads',        value: totalLeads,        loadingState: loadingLeads },
    { label: 'MQLs',         value: funnel.mql,        loadingState: loading },
    { label: 'SQLs',         value: funnel.sql,        loadingState: loading },
    { label: 'Oportunidades',value: funnel.opportunity, loadingState: loading },
    { label: 'Reuniões',     value: funnel.meeting,    loadingState: loading },
    { label: 'Ganhos',       value: funnel.won,        loadingState: loading },
  ]

  return (
    <div className="flex flex-col gap-3">
      {/* Row 1: Financial KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Investimento with pacing */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-1">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Investimento Total</span>
          {loading ? <Skeleton wide /> : (
            <span className="text-2xl font-bold text-[#1a1a1a]">{fmtBRL(totalSpend)}</span>
          )}
          {!loading && (pacingBudget && pacingBudget > 0 && pacingDeveria != null ? (
            <div className="flex flex-col gap-0.5 mt-0.5">
              <span className="text-xs text-gray-400">
                Deveríamos: <span className="font-medium text-gray-600">{fmtBRL(pacingDeveria)}</span>
              </span>
              {ritmo !== null && (
                <span className={`text-xs font-semibold ${pacingColor(ritmo)}`}>
                  Ritmo: {ritmo.toFixed(1)}%
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-gray-300">Configure verba no Pacing ↓</span>
          ))}
        </div>

        {/* CPA */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-1">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">CPA</span>
          {loading ? <Skeleton /> : <span className="text-2xl font-bold text-[#1a1a1a]">{cpa !== null ? fmtBRL(cpa) : '—'}</span>}
          <span className="text-xs text-gray-400">Invest. ÷ Vendas</span>
        </div>

        {/* MRR */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-1">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">MRR Total</span>
          {loading ? <Skeleton /> : <span className="text-2xl font-bold text-[#1a1a1a]">{fmtBRL(totalMRR)}</span>}
        </div>

        {/* Ticket Médio */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-1">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Ticket Médio</span>
          {loading ? <Skeleton /> : <span className="text-2xl font-bold text-[#1a1a1a]">{ticketMedio !== null ? fmtBRL(ticketMedio) : '—'}</span>}
          <span className="text-xs text-gray-400">MRR ÷ Vendas</span>
        </div>

        {/* CPMQL */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-1">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">CPMQL Geral</span>
          {loading ? <Skeleton /> : <span className="text-2xl font-bold text-[#1a1a1a]">{cpl !== null ? fmtBRL(cpl) : '—'}</span>}
          <span className="text-xs text-gray-400">Invest. ÷ MQLs</span>
        </div>
      </div>

      {/* Row 2: Funnel pipeline */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center w-full">
          {stages.map((stage, i) => (
            <div key={stage.label} className="flex items-center flex-1">
              {i > 0 && (
                <div className="flex flex-col items-center shrink-0 px-1">
                  <span className="text-xs font-semibold text-gray-400 whitespace-nowrap">
                    {(loading || stages[i - 1].loadingState || stage.loadingState) ? '...' : pct(stage.value, stages[i - 1].value)}
                  </span>
                  <ArrowRight size={14} className="text-gray-300 mt-0.5" />
                </div>
              )}
              <div className="flex flex-col items-center text-center flex-1 min-w-0">
                <span className="text-xs text-gray-400 font-medium uppercase tracking-wide whitespace-nowrap mb-1">
                  {stage.label}
                </span>
                {stage.loadingState
                  ? <div className="h-8 w-10 bg-gray-100 rounded-lg animate-pulse" />
                  : <span className="text-2xl font-bold text-[#1a1a1a]">{fmt(stage.value)}</span>
                }
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
