import { useState, useMemo, useEffect, useRef } from 'react'
import { RefreshCw, Loader2, AlertCircle, ChevronDown, ChevronUp, Info, Clock } from 'lucide-react'
import { useLeadCentricData } from '../../hooks/useLeadCentricData'
import { computeMetrics } from '../../utils/computeMetrics'
import type { CampaignMetrics } from '../../utils/computeMetrics'
import { useExcludedCampaigns } from '../../hooks/useExcludedCampaigns'
import { useExcludedUtms } from '../../hooks/useExcludedUtms'
import { currentMonthBRT, yesterdayBRT, todayBRT, getDatePresets } from '../../utils/dateBRT'
import KPICards from './KPICards'
import FunnelChart from './FunnelChart'
import ChannelTable from './ChannelTable'
import type { PageData } from '../../hooks/useDashboard'

// ── Filter persistence ────────────────────────────────────────────────────────

const FILTERS_KEY = 'gp_cohort_filters_v1'

interface SavedFilters {
  dateFrom: string
  dateTo: string
}

function loadSaved(): Partial<SavedFilters> {
  try {
    const raw = localStorage.getItem(FILTERS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveTo(partial: Partial<SavedFilters>) {
  try {
    const existing = loadSaved()
    localStorage.setItem(FILTERS_KEY, JSON.stringify({ ...existing, ...partial }))
  } catch {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function fmtN(n: number) {
  if (n === 0) return '—'
  return n.toLocaleString('pt-BR')
}

function pct(a: number, b: number): string {
  if (b === 0 || a === 0) return '—'
  return ((a / b) * 100).toFixed(1) + '%'
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

// ── Campaign table ────────────────────────────────────────────────────────────

type SortKey = 'spend' | 'mqls' | 'sqls' | 'meetings' | 'won' | 'mrr' | 'cpmql'

function sortVal(r: CampaignMetrics, k: SortKey): number {
  switch (k) {
    case 'spend':    return r.spend
    case 'mqls':     return r.mqls
    case 'sqls':     return r.sqls
    case 'meetings': return r.meetings
    case 'won':      return r.won
    case 'mrr':      return r.mrr
    case 'cpmql':    return r.mqls > 0 ? r.spend / r.mqls : Infinity
    default:         return 0
  }
}

function CampaignTable({ rows, loading }: { rows: CampaignMetrics[]; loading: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'spend', asc: false })

  const sorted = useMemo(() => {
    const mult = sort.asc ? 1 : -1
    return [...rows].sort((a, b) => mult * (sortVal(a, sort.key) - sortVal(b, sort.key)))
  }, [rows, sort])

  function toggle(key: SortKey) {
    setSort((s) => s.key === key ? { key, asc: !s.asc } : { key, asc: false })
  }

  const thCls = (key: SortKey) =>
    `px-3 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 whitespace-nowrap select-none ${
      sort.key === key ? 'text-[#0D2F9F]' : ''
    }`

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700">Por Campanha</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Investimento no período · Resultados acumulados até hoje dos leads criados no período
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-blue-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-sm text-gray-400">
          Nenhuma campanha com dados no período
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Campanha</th>
                <th className={thCls('spend')} onClick={() => toggle('spend')}>Investimento</th>
                <th className={thCls('mqls')} onClick={() => toggle('mqls')}>MQL</th>
                <th className={thCls('cpmql')} onClick={() => toggle('cpmql')}>CPMQL</th>
                <th className={thCls('sqls')} onClick={() => toggle('sqls')}>SQL</th>
                <th className={thCls('meetings')} onClick={() => toggle('meetings')}>Reunião</th>
                <th className={thCls('won')} onClick={() => toggle('won')}>Ganho</th>
                <th className={thCls('mrr')} onClick={() => toggle('mrr')}>MRR</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">MQL→Ganho</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map((r) => {
                const cpmql = r.mqls > 0 ? r.spend / r.mqls : null
                return (
                  <tr key={r.campaign} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 text-xs font-mono text-gray-700 whitespace-nowrap">
                      <span className="font-semibold">{r.campaign}</span>
                      {r.campaignFullName && r.campaignFullName !== r.campaign && (
                        <span className="text-gray-400 ml-1 font-sans text-[11px]">
                          {r.campaignFullName.length > 40
                            ? r.campaignFullName.slice(0, 40) + '…'
                            : r.campaignFullName}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-medium text-gray-700 whitespace-nowrap">
                      {r.spend > 0 ? fmtBRL(r.spend) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-700 whitespace-nowrap">
                      {fmtN(r.mqls)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-600 whitespace-nowrap">
                      {cpmql !== null ? fmtBRL(cpmql) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-700 whitespace-nowrap">
                      {fmtN(r.sqls)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-700 whitespace-nowrap">
                      {fmtN(r.meetings)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-700 whitespace-nowrap">
                      {fmtN(r.won)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-medium text-gray-700 whitespace-nowrap">
                      {r.mrr > 0 ? fmtBRL(r.mrr) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-500 whitespace-nowrap">
                      {pct(r.won, r.mqls)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Maturity banner ───────────────────────────────────────────────────────────

function MaturityBanner({ dateTo }: { dateTo: string }) {
  const today = new Date().toISOString().slice(0, 10)
  const daysOld = daysBetween(dateTo, today)
  if (daysOld >= 30) return null

  return (
    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
      <Clock size={15} className="shrink-0 mt-0.5" />
      <span>
        <strong>Período ainda em maturação:</strong> o intervalo selecionado terminou há {daysOld} dias.
        Leads recentes continuam convertendo — os números de SQL, Reunião e Ganho tendem a crescer.
        Use períodos com pelo menos 30 dias de distância para tomar decisões.
      </span>
    </div>
  )
}

// ── Explanation banner ────────────────────────────────────────────────────────

function ExplanationBanner() {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-[#0D2F9F]/5 border border-[#0D2F9F]/20 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#0D2F9F]/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Info size={14} className="text-[#0D2F9F] shrink-0" />
          <span className="text-sm font-semibold text-[#0D2F9F]">Coorte de Leads — como funciona</span>
        </div>
        {open ? <ChevronUp size={14} className="text-[#0D2F9F] shrink-0" /> : <ChevronDown size={14} className="text-[#0D2F9F] shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 text-sm text-gray-600 flex flex-col gap-2 border-t border-[#0D2F9F]/10">
          <p className="mt-3">
            <strong>O filtro de data seleciona leads pela data de criação</strong> (evento MQL), não pela data da venda.
          </p>
          <p>
            Uma vez identificados os leads do período, <strong>todos os resultados deles entram</strong> — reuniões e vendas que aconteceram
            em qualquer data, até hoje. O investimento continua sendo o gasto real no mesmo período.
          </p>
          <p className="text-gray-500">
            Isso elimina a distorção temporal: o dinheiro gasto em agosto é comparado com o que os leads de
            agosto produziram (mesmo que fechem em outubro), não com o MRR que entrou em agosto (vindo de leads de julho).
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  pages: PageData[]
}

export default function LeadCentricSection({ pages: _pages }: Props) {
  const saved = useRef(loadSaved())

  const [dateFrom, setDateFrom] = useState(() => saved.current.dateFrom ?? currentMonthBRT().from)
  const [dateTo, setDateTo] = useState(() => {
    const from = saved.current.dateFrom ?? currentMonthBRT().from
    const to = saved.current.dateTo ?? yesterdayBRT()
    return to >= from ? to : todayBRT()
  })

  useEffect(() => {
    saveTo({ dateFrom, dateTo })
  }, [dateFrom, dateTo])

  const { excluded: excludedCampaigns } = useExcludedCampaigns()
  const { excluded: excludedUtms } = useExcludedUtms()

  const { loading, error, rawWindsorRows, rawEvents, cohortSize, reload } = useLeadCentricData(dateFrom, dateTo)

  const filteredWindsorRows = useMemo(
    () =>
      excludedCampaigns.length > 0
        ? rawWindsorRows.filter((r) => !excludedCampaigns.includes(r.campaign ?? ''))
        : rawWindsorRows,
    [rawWindsorRows, excludedCampaigns],
  )

  // Filter excluded UTMs from events
  const filteredEvents = useMemo(() => {
    if (excludedUtms.length === 0) return rawEvents
    return rawEvents.filter((ev) => {
      const raw = ev.payload?.deal?.utmCampaign
      const utm = typeof raw === 'string' ? raw : ''
      if (!utm) return true
      return !excludedUtms.some((excl) => utm.toLowerCase().includes(excl.toLowerCase()))
    })
  }, [rawEvents, excludedUtms])

  const metrics = useMemo(
    () => computeMetrics(filteredWindsorRows, filteredEvents, {}),
    [filteredWindsorRows, filteredEvents],
  )

  const { totalSpend, funnelCounts, totalMRR, byChannel, byCampaign } = metrics

  const cpl = funnelCounts.mql > 0 ? totalSpend / funnelCounts.mql : null
  const cpa = funnelCounts.won > 0 ? totalSpend / funnelCounts.won : null

  const presets = getDatePresets()

  const [presetsOpen, setPresetsOpen] = useState(false)

  return (
    <div className="flex flex-col gap-5">

      {/* Explanation */}
      <ExplanationBanner />

      {/* Filters header */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Date range */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-0.5">
              Período de criação dos leads
            </span>
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
              <input
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)}
                className="text-sm text-gray-700 bg-transparent outline-none"
              />
              <span className="text-gray-300">→</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                max={todayBRT()}
                onChange={(e) => setDateTo(e.target.value)}
                className="text-sm text-gray-700 bg-transparent outline-none"
              />
            </div>
          </div>

          {/* Presets */}
          <div className="relative mt-4">
            <button
              onClick={() => setPresetsOpen((v) => !v)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm transition-colors"
            >
              Atalhos
              {presetsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {presetsOpen && (
              <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-52">
                {presets.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => {
                      setDateFrom(p.from)
                      setDateTo(p.to)
                      setPresetsOpen(false)
                    }}
                    className="w-full text-left px-4 py-2 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1" />

        {/* Cohort badge */}
        {!loading && cohortSize > 0 && (
          <div className="flex items-center gap-1.5 text-xs bg-[#0D2F9F]/8 text-[#0D2F9F] px-3 py-2 rounded-xl border border-[#0D2F9F]/15 font-medium whitespace-nowrap">
            <span className="font-bold">{cohortSize.toLocaleString('pt-BR')}</span>
            <span>leads na coorte</span>
          </div>
        )}

        {/* Reload */}
        <button
          onClick={reload}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-[#0D2F9F] hover:bg-blue-50 px-3 py-2 rounded-xl border border-gray-200 bg-white shadow-sm transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">Recarregar</span>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Maturity warning */}
      <MaturityBanner dateTo={dateTo} />

      {/* KPIs */}
      <KPICards
        totalSpend={totalSpend}
        totalLeads={0}
        funnel={funnelCounts}
        totalMRR={totalMRR}
        cpl={cpl}
        cpa={cpa}
        byChannel={byChannel}
        loading={loading}
        dateTo={dateTo}
      />

      {/* Funnel */}
      {!loading && (funnelCounts.mql > 0 || funnelCounts.won > 0) && (
        <FunnelChart funnel={funnelCounts} />
      )}

      {/* Campaign table */}
      <CampaignTable rows={byCampaign} loading={loading} />

      {/* Channel table */}
      {!loading && byChannel.some((c) => c.spend > 0 || c.mqls > 0) && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-gray-700 px-1">Por Canal</h3>
          <ChannelTable byChannel={byChannel} activeChannels={[]} />
        </div>
      )}

    </div>
  )
}
