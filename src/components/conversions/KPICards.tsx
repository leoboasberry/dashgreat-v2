import { useState, Fragment } from 'react'
import { ArrowRight, Target } from 'lucide-react'
import type { FunnelCounts } from '../../hooks/useConversionsData'
import type { ChannelMetrics } from '../../utils/computeMetrics'
import type { GoalsConfig } from '../../utils/goals'
import { todayBRT } from '../../utils/dateBRT'

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

function pacingColor(ritmo: number): string {
  if (ritmo === 0) return 'text-gray-400'
  return ritmo >= 97 && ritmo <= 102 ? 'text-emerald-600' : 'text-red-500'
}

function pacingBg(ritmo: number): string {
  if (ritmo === 0) return 'bg-gray-50'
  return ritmo >= 97 && ritmo <= 102 ? 'bg-emerald-50' : 'bg-red-50'
}

function Skeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div className={`h-8 ${wide ? 'w-32' : 'w-20'} bg-gray-100 rounded-lg animate-pulse`} />
  )
}

function GoalBadge({ value, goal, pacingFactor }: { value: number; goal: number; pacingFactor: number }) {
  if (goal <= 0) return null
  const accGoal = goal * pacingFactor
  const ratio = accGoal > 0 ? value / accGoal : 0
  const pctStr = (ratio * 100).toFixed(0) + '%'
  const color =
    ratio >= 1 ? 'text-emerald-600' :
    ratio >= 0.7 ? 'text-amber-500' :
    'text-red-500'
  const bg =
    ratio >= 1 ? 'bg-emerald-50' :
    ratio >= 0.7 ? 'bg-amber-50' :
    'bg-red-50'
  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap ${color} ${bg}`}
      title={`Meta mensal: ${fmt(goal)}`}
    >
      {fmt(value)}/{fmt(Math.round(accGoal))} ({pctStr})
    </span>
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
  byChannel?: ChannelMetrics[]
  goals?: GoalsConfig
  loading?: boolean
  loadingLeads?: boolean
  onOpenGoals?: () => void
}

export default function KPICards({
  totalSpend, totalLeads, funnel, totalMRR, cpl, cpa,
  pacingDeveria, pacingBudget, byChannel = [],
  goals, loading = false, loadingLeads = false,
  onOpenGoals,
}: Props) {
  const [metaTooltip, setMetaTooltip] = useState(false)
  const ticketMedio = funnel.won > 0 ? totalMRR / funnel.won : null
  const ritmo = pacingDeveria && pacingDeveria > 0 ? (totalSpend / pacingDeveria) * 100 : null

  const goalPacingFactor = (() => {
    const today = todayBRT()
    const parts = today.split('-').map(Number)
    const year = parts[0]!, month = parts[1]!, day = parts[2]!
    const totalDays = new Date(year, month, 0).getDate()
    return Math.min(day / totalDays, 1)
  })()

  const stages = [
    { label: 'Leads',         value: totalLeads,         loadingState: loadingLeads, goalKey: null as keyof GoalsConfig | null },
    { label: 'MQLs',          value: funnel.mql,         loadingState: loading,      goalKey: 'mqls' as keyof GoalsConfig },
    { label: 'SQLs',          value: funnel.sql,         loadingState: loading,      goalKey: 'sqls' as keyof GoalsConfig },
    { label: 'Oportunidades', value: funnel.opportunity, loadingState: loading,      goalKey: 'opportunities' as keyof GoalsConfig },
    { label: 'Reuniões',      value: funnel.meeting,     loadingState: loading,      goalKey: 'meetings' as keyof GoalsConfig },
    { label: 'Ganhos',        value: funnel.won,         loadingState: loading,      goalKey: 'won' as keyof GoalsConfig },
  ]

  const cpmqlGoal = goals?.cpmql ?? 0
  const cpmqlOk = cpmqlGoal > 0 && cpl !== null ? cpl <= cpmqlGoal : null
  const cpmqlDelta = cpmqlGoal > 0 && cpl !== null
    ? ((cpl / cpmqlGoal - 1) * 100)
    : null

  const metaCh = byChannel.find((c) => c.channel === 'Meta')
  const googleCh = byChannel.find((c) => c.channel === 'Google')
  const metaSpend = metaCh?.spend ?? 0
  const googleSpend = googleCh?.spend ?? 0
  const metaTax = metaSpend * 0.14
  const metaMQLs = metaCh?.mqls ?? 0
  const googleMQLs = googleCh?.mqls ?? 0
  const cplComImposto = cpl !== null && funnel.mql > 0
    ? (totalSpend + metaTax) / funnel.mql
    : null
  const metaCPMQL = metaMQLs > 0 && metaSpend > 0 ? (metaSpend + metaTax) / metaMQLs : null
  const googleCPMQL = googleMQLs > 0 && googleSpend > 0 ? googleSpend / googleMQLs : null

  return (
    <div className="flex flex-col gap-3">

      {/* Row 1: Two grouped sections */}
      <div className="flex gap-3 items-stretch">

        {/* ── CUSTO ── */}
        <div className="flex flex-col gap-2 shrink-0">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-1">Custo</span>
          <div className="flex gap-3 flex-1">

            {/* Investimento Total */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-2 min-w-[220px]">
              <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Investimento Total</span>

              {/* Value + Ritmo badge side by side */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col">
                  {loading ? <Skeleton wide /> : (
                    <span className="text-2xl font-bold text-[#1a1a1a] leading-tight">{fmtBRL(totalSpend)}</span>
                  )}
                  {!loading && pacingBudget && pacingBudget > 0 && pacingDeveria != null && (
                    <span className="text-xs text-gray-400 mt-1">
                      Deveríamos: <span className="font-medium text-gray-600">{fmtBRL(pacingDeveria)}</span>
                    </span>
                  )}
                  {!loading && !(pacingBudget && pacingBudget > 0) && (
                    <span className="text-xs text-gray-300 mt-1">Configure verba no Pacing ↓</span>
                  )}
                </div>
                {!loading && ritmo !== null && (
                  <div className="flex flex-col items-end shrink-0">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${pacingColor(ritmo)} ${pacingBg(ritmo)}`}>
                      Ritmo: {ritmo.toFixed(1)}%
                    </span>
                    <span className="text-[10px] text-gray-400 italic mt-0.5">sem imposto</span>
                  </div>
                )}
              </div>

              {/* Channel breakdown */}
              {!loading && (googleSpend > 0 || metaSpend > 0) && (
                <>
                  <hr className="border-gray-100" />
                  <div className="flex flex-col gap-1">
                    {metaSpend > 0 && (
                      <div className="relative">
                        <div
                          className="flex items-center justify-between gap-2 cursor-help"
                          onMouseEnter={() => setMetaTooltip(true)}
                          onMouseLeave={() => setMetaTooltip(false)}
                        >
                          <span className="text-xs text-gray-400 underline decoration-dotted decoration-gray-300">Meta Ads</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-700">{fmtBRL(metaSpend)}</span>
                            <span className="text-[11px] font-semibold text-[#0D2F9F] w-9 text-right">{pct(metaSpend, totalSpend)}</span>
                          </div>
                        </div>
                        {metaTooltip && (
                          <div className="absolute bottom-full left-0 mb-1.5 z-20 bg-gray-800 text-white text-xs rounded-lg px-2.5 py-2 shadow-lg whitespace-nowrap">
                            <p className="font-medium mb-0.5">Imposto estimado (14%)</p>
                            <p className="text-gray-300">{fmtBRL(metaTax)} sobre {fmtBRL(metaSpend)}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {googleSpend > 0 && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-400">Google Ads</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-700">{fmtBRL(googleSpend)}</span>
                          <span className="text-[11px] font-semibold text-[#0D2F9F] w-9 text-right">{pct(googleSpend, totalSpend)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* CPMQL */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-2 min-w-[200px]">
              {/* Title */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">CPMQL</span>
                <span className="text-[10px] text-gray-400 italic">sem imposto</span>
              </div>

              {/* Value + badge */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col">
                  {loading ? <Skeleton /> : (
                    <span className="text-2xl font-bold text-[#1a1a1a] leading-tight">{cpl !== null ? fmtBRL(cpl) : '—'}</span>
                  )}
                  {!loading && cplComImposto !== null && (
                    <span className="text-xs text-gray-400 mt-1">
                      com imposto: <span className="font-medium text-gray-600">{fmtBRL(cplComImposto)}</span>
                    </span>
                  )}
                </div>
                {!loading && cpmqlGoal > 0 && cpl !== null && cpmqlDelta !== null && (
                  <span
                    title={`Alvo: ${fmtBRL(cpmqlGoal)}`}
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 mt-0.5 ${
                      cpmqlOk ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                    }`}
                  >
                    {cpmqlDelta > 0 ? '▲' : '▼'} {Math.abs(cpmqlDelta).toFixed(1)}% do alvo
                  </span>
                )}
              </div>

              {/* Per-channel CPMQL */}
              {!loading && (metaCPMQL !== null || googleCPMQL !== null) && (
                <>
                  <hr className="border-gray-100" />
                  <div className="flex flex-col gap-1">
                    {metaCPMQL !== null && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-400">Meta Ads</span>
                        <span className="text-xs font-medium text-gray-700">{fmtBRL(metaCPMQL)}</span>
                      </div>
                    )}
                    {googleCPMQL !== null && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-400">Google Ads</span>
                        <span className="text-xs font-medium text-gray-700">{fmtBRL(googleCPMQL)}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

          </div>
        </div>

        {/* Vertical divider */}
        <div className="w-px bg-gray-200 mt-5 self-stretch" />

        {/* ── RESULTADO ── */}
        <div className="flex flex-col gap-2 flex-1">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-1">Resultado</span>
          <div className="flex gap-3 flex-1">

            {/* MRR */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-1 flex-1">
              <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">MRR Total</span>
              {loading ? <Skeleton /> : <span className="text-2xl font-bold text-[#1a1a1a]">{fmtBRL(totalMRR)}</span>}
              <span className="text-xs text-gray-400">Receita recorrente mensal</span>
            </div>

            {/* Ticket Médio */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-1 flex-1">
              <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Ticket Médio</span>
              {loading ? <Skeleton /> : <span className="text-2xl font-bold text-[#1a1a1a]">{ticketMedio !== null ? fmtBRL(ticketMedio) : '—'}</span>}
              <span className="text-xs text-gray-400">MRR ÷ Vendas</span>
            </div>

            {/* CPA */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-1 flex-1">
              <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">CPA</span>
              {loading ? <Skeleton /> : <span className="text-2xl font-bold text-[#1a1a1a]">{cpa !== null ? fmtBRL(cpa) : '—'}</span>}
              <span className="text-xs text-gray-400">Invest. ÷ Vendas</span>
              {!loading && cpa !== null && ticketMedio !== null && ticketMedio > 0 && (
                <span className="text-[10px] text-gray-500 font-medium mt-0.5">
                  {(cpa / ticketMedio).toFixed(2)}× Ticket Médio
                </span>
              )}
            </div>

          </div>
        </div>

      </div>

      {/* Row 2: Funnel pipeline */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Funil de Conversão</span>
          {onOpenGoals && (
            <button
              onClick={onOpenGoals}
              className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-[#0D2F9F] hover:bg-blue-50 px-2.5 py-1 rounded-lg transition-colors border border-transparent hover:border-blue-100"
              title="Configurar metas"
            >
              <Target size={11} />
              <span>Metas</span>
            </button>
          )}
        </div>

        <div className="flex items-center w-full py-2">
          {stages.map((stage, i) => {
            const maxValue = Math.max(...stages.map((s) => s.value), 1)
            const ratio = maxValue > 0 ? Math.sqrt(stage.value / maxValue) : 0
            const size = Math.round(36 + ratio * (88 - 36))
            const fontSize = Math.max(12, Math.round(size * 0.22))
            const goal = stage.goalKey && goals ? (goals[stage.goalKey] as number) : 0
            return (
              <Fragment key={stage.label}>
                {i > 0 && (
                  <div className="flex flex-col items-center shrink-0 px-1">
                    <ArrowRight size={14} className="text-gray-300" />
                    <span className="text-[10px] text-gray-400 whitespace-nowrap mt-0.5">
                      {!(loading || stages[i - 1].loadingState || stage.loadingState)
                        ? pct(stage.value, stages[i - 1].value)
                        : ''}
                    </span>
                  </div>
                )}
                <div className="flex flex-col items-center flex-1 gap-1.5">
                  <span className="text-[11px] text-gray-500 font-medium whitespace-nowrap">{stage.label}</span>
                  <div
                    className="bg-[#0D2F9F] rounded-2xl flex items-center justify-center"
                    style={{ width: size, height: size }}
                  >
                    {stage.loadingState
                      ? <div className="w-8 h-4 bg-white/20 rounded animate-pulse" />
                      : <span className="text-white font-bold leading-none text-center px-1" style={{ fontSize }}>{fmt(stage.value)}</span>
                    }
                  </div>
                  {!stage.loadingState && goal > 0 && (
                    <GoalBadge value={stage.value} goal={goal} pacingFactor={goalPacingFactor} />
                  )}
                </div>
              </Fragment>
            )
          })}
        </div>
      </div>

    </div>
  )
}
