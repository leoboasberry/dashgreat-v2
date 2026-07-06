import { useMemo, useState } from 'react'
import { currentMonthBRT, getDatePresets } from '../../utils/dateBRT'
import { Users, TrendingUp } from 'lucide-react'
import type { PageData } from '../../hooks/useDashboard'
import {
  parseAllLeads,
  filterLeads,
  isSmallRevenue,
  allUniqueSources,
  allUniqueCampaignCodes,
  allUniqueAdSets,
  allUniqueAds,
  allUniquePages,
  allFaturamentoRanges,
  normalizeFaturamento,
} from '../../utils/parseLeads'
import MetricCard from '../MetricCard'
import LeadsTimelineChart from './LeadsTimelineChart'
import LeadsByFaturamentoChart from './LeadsByFaturamentoChart'
import CampaignTable from './CampaignTable'
import PositioningTable from './PositioningTable'
import LeadsHeatmapChart from './LeadsHeatmapChart'

const SELECT_CLS = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#0D2F9F]'

interface Props {
  pages: PageData[]
}

export default function CampaignsSection({ pages }: Props) {
  // Parse all leads once
  const allLeads = useMemo(() => parseAllLeads(pages), [pages])

  // Derive filter options from the full dataset
  const sources = useMemo(() => allUniqueSources(allLeads), [allLeads])
  const campaignCodes = useMemo(() => allUniqueCampaignCodes(allLeads), [allLeads])
  const pageOptions = useMemo(() => allUniquePages(allLeads), [allLeads])
  const faturamentoOptions = useMemo(() => allFaturamentoRanges(allLeads), [allLeads])

  // Filter state — default to current month (BRT)
  const [dateFrom, setDateFrom] = useState(() => currentMonthBRT().from)
  const [dateTo, setDateTo] = useState(() => currentMonthBRT().to)
  const [sourceFilter, setSourceFilter] = useState('')
  const [campaignCodeFilter, setCampaignCodeFilter] = useState('')
  const [adSetFilter, setAdSetFilter] = useState('')
  const [adFilter, setAdFilter] = useState('')
  const [pageFilter, setPageFilter] = useState('')
  const [faturamentoFilter, setFaturamentoFilter] = useState('')
  const [stackBySource, setStackBySource] = useState(false)

  // Cascading options
  const adSetOptions = useMemo(
    () => allUniqueAdSets(allLeads, campaignCodeFilter || undefined),
    [allLeads, campaignCodeFilter],
  )
  const adOptions = useMemo(
    () => allUniqueAds(allLeads, adSetFilter || undefined),
    [allLeads, adSetFilter],
  )

  function handleCampaignChange(v: string) {
    setCampaignCodeFilter(v)
    setAdSetFilter('')
    setAdFilter('')
  }
  function handleAdSetChange(v: string) {
    setAdSetFilter(v)
    setAdFilter('')
  }

  // Filtered leads
  const filtered = useMemo(
    () => filterLeads(allLeads, {
      dateFrom, dateTo,
      utmSource: sourceFilter,
      campaignCode: campaignCodeFilter,
      adSetCode: adSetFilter,
      adCode: adFilter,
      pageName: pageFilter,
      faturamento: faturamentoFilter,
    }),
    [allLeads, dateFrom, dateTo, sourceFilter, campaignCodeFilter, adSetFilter, adFilter, pageFilter, faturamentoFilter],
  )

  const smallRevenueCount = filtered.filter(isSmallRevenue).length
  const smallRevenuePct =
    filtered.length > 0 ? ((smallRevenueCount / filtered.length) * 100).toFixed(1) : '0.0'

  const faturamentoBreakdown = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of filtered) {
      const key = normalizeFaturamento(l.faturamento) || '(não informado)'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([range, count]) => ({
        range,
        count,
        pct: filtered.length > 0 ? ((count / filtered.length) * 100).toFixed(1) : '0.0',
      }))
  }, [filtered])

  const hasDateData = allLeads.some((l) => l.date)

  return (
    <div className="flex flex-col gap-6">
      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Filtros</h3>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {getDatePresets().map(({ label, from, to }) => (
            <button
              key={label}
              onClick={() => { setDateFrom(from); setDateTo(to) }}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
                dateFrom === from && dateTo === to
                  ? 'border-[#0D2F9F] bg-blue-50 text-[#0D2F9F] font-medium'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FilterField label="Data inicial">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={SELECT_CLS}
            />
          </FilterField>
          <FilterField label="Data final">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={SELECT_CLS}
            />
          </FilterField>
          <FilterField label="Origem">
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className={SELECT_CLS}>
              <option value="">Todas as origens</option>
              {sources.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Página">
            <select value={pageFilter} onChange={(e) => setPageFilter(e.target.value)} className={SELECT_CLS}>
              <option value="">Todas as páginas</option>
              {pageOptions.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </FilterField>
          {faturamentoOptions.length > 0 && (
            <FilterField label="Faturamento">
              <select value={faturamentoFilter} onChange={(e) => setFaturamentoFilter(e.target.value)} className={SELECT_CLS}>
                <option value="">Todas as faixas</option>
                {faturamentoOptions.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </FilterField>
          )}
        </div>

        {/* Campaign hierarchy row */}
        <div className="mt-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Campanha</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FilterField label="Campanha">
              <select value={campaignCodeFilter} onChange={(e) => handleCampaignChange(e.target.value)} className={SELECT_CLS}>
                <option value="">Todas</option>
                {campaignCodes.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Conjunto">
              <select
                value={adSetFilter}
                onChange={(e) => handleAdSetChange(e.target.value)}
                disabled={adSetOptions.length === 0}
                className={SELECT_CLS + (adSetOptions.length === 0 ? ' opacity-40 cursor-not-allowed' : '')}
              >
                <option value="">Todos</option>
                {adSetOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Anúncio">
              <select
                value={adFilter}
                onChange={(e) => setAdFilter(e.target.value)}
                disabled={adOptions.length === 0}
                className={SELECT_CLS + (adOptions.length === 0 ? ' opacity-40 cursor-not-allowed' : '')}
              >
                <option value="">Todos</option>
                {adOptions.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </FilterField>
          </div>
        </div>

        {(dateFrom || dateTo || sourceFilter || campaignCodeFilter || adSetFilter || adFilter || pageFilter || faturamentoFilter) && (
          <button
            onClick={() => {
              setDateFrom(''); setDateTo(''); setSourceFilter('')
              setCampaignCodeFilter(''); setAdSetFilter(''); setAdFilter(''); setPageFilter('')
              setFaturamentoFilter('')
            }}
            className="mt-3 text-xs text-[#0D2F9F] hover:underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className={`grid gap-4 ${faturamentoBreakdown.some(r => r.range !== '(não informado)') ? 'grid-cols-2 xl:grid-cols-3' : 'grid-cols-2'}`}>
        <MetricCard
          label="Total de leads (período)"
          value={filtered.length.toLocaleString('pt-BR')}
          sub={allLeads.length !== filtered.length ? `de ${allLeads.length} no total` : 'todos os leads'}
          color="text-[#0D2F9F]"
          icon={<Users size={18} />}
        />
        <MetricCard
          label="Leads Até R$ 40 mil"
          value={`${smallRevenuePct}%`}
          sub={`${smallRevenueCount} leads nesta faixa`}
          color="text-emerald-600"
          icon={<TrendingUp size={18} />}
        />
        {faturamentoBreakdown.some(r => r.range !== '(não informado)') && (
          <div className="col-span-2 xl:col-span-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Leads por Faturamento</span>
            <div className="flex flex-col gap-1.5">
              {faturamentoBreakdown.map(({ range, count, pct }) => (
                <div key={range} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 flex-1 truncate">{range}</span>
                  <span className="text-xs font-semibold text-gray-800 shrink-0">{count.toLocaleString('pt-BR')}</span>
                  <span className="text-[11px] text-gray-400 shrink-0 w-10 text-right">{pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Timeline chart — only if date data exists */}
      {hasDateData ? (
        <LeadsTimelineChart
          leads={filtered}
          stackBySource={stackBySource}
          onToggleStack={() => setStackBySource((v) => !v)}
        />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Leads por Dia
          </h3>
          <p className="text-sm text-gray-400 py-6 text-center">
            Campo de data de conversão não encontrado nos leads. Verifique se o formulário captura um campo de data.
          </p>
        </div>
      )}

      {/* Leads por faturamento — below the source chart */}
      {hasDateData && <LeadsByFaturamentoChart leads={filtered} />}

      {/* Heatmap — hora do dia */}
      <LeadsHeatmapChart leads={filtered} />

      {/* Campaign table */}
      <CampaignTable leads={filtered} totalLeads={filtered.length} />

      {/* Positioning table */}
      <PositioningTable leads={filtered} />
    </div>
  )
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  )
}
