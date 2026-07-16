import { useState, useMemo, useEffect, useRef } from 'react'
import { RefreshCw, Loader2, AlertCircle, Search, ChevronUp, ChevronDown } from 'lucide-react'
import { useConversionsData } from '../../hooks/useConversionsData'
import { useExcludedCampaigns } from '../../hooks/useExcludedCampaigns'
import { parseDealLeads, computeLeadCounts, STAGE_LABELS, STAGE_ORDER, fmtEventDateTime } from '../../utils/parseLeadDetail'
import type { LeadSummary } from '../../utils/parseLeadDetail'
import { extractFilterOptions } from '../../utils/computeMetrics'
import { parseAllLeads, filterLeads } from '../../utils/parseLeads'
import { normalizeCrmChannel } from '../../utils/channelNorm'
import type { PageData } from '../../hooks/useDashboard'
import MultiSelect from '../conversions/MultiSelect'
import ExcludedCampaignsFilter from '../conversions/ExcludedCampaignsFilter'
import LeadModal from './LeadModal'
import { todayBRT, getDatePresets } from '../../utils/dateBRT'

// ── Stage badge ──

const STAGE_COLORS: Record<string, string> = {
  not_mql: 'bg-gray-100 text-gray-600',
  mql: 'bg-blue-50 text-blue-700',
  sql: 'bg-indigo-50 text-indigo-700',
  opportunity: 'bg-purple-50 text-purple-700',
  meeting_completed: 'bg-orange-50 text-orange-700',
  deal_won: 'bg-emerald-50 text-emerald-700',
  deal_lost: 'bg-red-50 text-red-700',
}

function StageBadge({ stage }: { stage: string }) {
  const cls = STAGE_COLORS[stage] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {STAGE_LABELS[stage] ?? stage}
    </span>
  )
}

// ── KPI summary card ──

function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex flex-col gap-0.5">
      <span className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">{label}</span>
      <span className={`text-2xl font-bold ${color ?? 'text-gray-800'}`}>{value}</span>
      {sub && <span className="text-[11px] text-gray-400">{sub}</span>}
    </div>
  )
}

// ── Sort types ──

type SortKey = 'name' | 'company' | 'channel' | 'campaign' | 'stage' | 'revenue' | 'segment' | 'ts'

function sortVal(lead: LeadSummary, key: SortKey): string | number {
  switch (key) {
    case 'name': return lead.name.toLowerCase()
    case 'company': return lead.company.toLowerCase()
    case 'channel': return lead.channel.toLowerCase()
    case 'campaign': return lead.campaign.toLowerCase()
    case 'stage': return STAGE_ORDER[lead.stage] ?? 0
    case 'revenue': return lead.revenue.toLowerCase()
    case 'segment': return lead.segment.toLowerCase()
    case 'ts': return lead.lastEventTs ?? ''
  }
}

// ── Column headers ──

const COLS: { label: string; key: SortKey }[] = [
  { label: 'Nome', key: 'name' },
  { label: 'Empresa', key: 'company' },
  { label: 'Canal', key: 'channel' },
  { label: 'Campanha', key: 'campaign' },
  { label: 'Estágio', key: 'stage' },
  { label: 'Faturamento', key: 'revenue' },
  { label: 'Segmento', key: 'segment' },
  { label: 'Horário', key: 'ts' },
]

// ── Main component ──

interface Props {
  pages: PageData[]
}

export default function LeadsSection({ pages }: Props) {
  const today = todayBRT()
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)

  // Filters
  const [selChannels, setSelChannels] = useState<string[]>([])
  const [selCampaigns, setSelCampaigns] = useState<string[]>([])
  const [selAdSets, setSelAdSets] = useState<string[]>([])
  const [selAds, setSelAds] = useState<string[]>([])
  const [selPages, setSelPages] = useState<string[]>([])
  const [selRevenue, setSelRevenue] = useState<string[]>([])
  const [selSegments, setSelSegments] = useState<string[]>([])
  const pagesInitializedRef = useRef(false)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('ts')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedLead, setSelectedLead] = useState<LeadSummary | null>(null)

  const { excluded: excludedCampaigns, updateExcluded: setExcludedCampaigns } = useExcludedCampaigns()

  const { loading, error, rawWindsorRows, rawEvents, reload } = useConversionsData(dateFrom, dateTo)

  // Excluded campaign codes
  const excludedCodes = useMemo(() => {
    const codes = new Set<string>()
    for (const name of excludedCampaigns) {
      const m = name.match(/\b([A-Za-z]+\d+)\b/)
      if (m) codes.add(m[1]!)
    }
    return [...codes]
  }, [excludedCampaigns])

  // Filter events by excluded campaigns
  const filteredEvents = useMemo(
    () =>
      excludedCodes.length > 0
        ? rawEvents.filter((ev) => {
            const rawCampaign = (ev.payload as Record<string, unknown> & { deal?: Record<string, unknown> })?.deal?.utmCampaign
            const utmCampaign = typeof rawCampaign === 'string' ? rawCampaign : ''
            const m = utmCampaign.match(/\b([A-Za-z]+\d+)\b/)
            const code = m ? m[1]! : ''
            return !code || !excludedCodes.includes(code)
          })
        : rawEvents,
    [rawEvents, excludedCodes],
  )

  // All Windsor campaigns for exclusion filter
  const allWindsorCampaigns = useMemo(() => {
    const names = new Set<string>()
    for (const r of rawWindsorRows) {
      if (r.campaign?.trim()) names.add(r.campaign.trim())
    }
    return [...names].sort()
  }, [rawWindsorRows])

  // Parse leads from Supabase events — only deals that ENTERED the funnel in this date range
  const allLeads = useMemo(() => {
    const leads = parseDealLeads(filteredEvents)
    // Keep only deals where an mql or not_mql event exists in the fetched events
    // (excludes old deals that merely had a stage update — meeting, sale — in this period)
    return leads.filter((l) =>
      l.events.some((ev) => ev.event_type === 'mql' || ev.event_type === 'not_mql'),
    )
  }, [filteredEvents])

  // Filter options from events
  const filterOptions = useMemo(
    () => extractFilterOptions(filteredEvents, selCampaigns, selAdSets),
    [filteredEvents, selCampaigns, selAdSets],
  )

  // Page name map from GreatPages data
  const pageNameMap = useMemo(
    () => new Map(pages.map((p) => [p.summary.id, p.summary.titulo])),
    [pages],
  )

  // Page options with names resolved
  const pageOptions = useMemo(
    () =>
      filterOptions.pages.map((id) => ({
        id,
        label: pageNameMap.get(id) ?? id,
      })),
    [filterOptions.pages, pageNameMap],
  )

  // Auto-initialize LP filter: pre-select [ADS] pages
  useEffect(() => {
    if (pagesInitializedRef.current || pageOptions.length === 0) return
    const adsPages = pageOptions.filter((p) => p.label.startsWith('[ADS]')).map((p) => p.id)
    if (adsPages.length > 0) {
      pagesInitializedRef.current = true
      setSelPages(adsPages)
    }
  }, [pageOptions])

  // GreatPages total leads (same filters as Conversões)
  const gpLeadsCount = useMemo(() => {
    let leads = filterLeads(parseAllLeads(pages), { dateFrom, dateTo })
    if (selChannels.length > 0) {
      leads = leads.filter((l) => selChannels.includes(normalizeCrmChannel(undefined, l.utmSource)))
    }
    if (selCampaigns.length > 0) {
      leads = leads.filter((l) => selCampaigns.includes(l.campaign))
    }
    if (selAdSets.length > 0) {
      leads = leads.filter((l) => selAdSets.includes(l.adSet))
    }
    if (selAds.length > 0) {
      leads = leads.filter((l) => selAds.includes(l.ad))
    }
    if (selPages.length > 0) {
      const selectedTitles = new Set(selPages.map((id) => pageNameMap.get(id) ?? id))
      leads = leads.filter((l) => selectedTitles.has(l.pageName))
    }
    return leads.length
  }, [pages, dateFrom, dateTo, selChannels, selCampaigns, selAdSets, selAds, selPages, pageNameMap])

  // All channels from leads
  const allChannels = useMemo(() => {
    const s = new Set<string>()
    for (const l of allLeads) if (l.channel) s.add(l.channel)
    return [...s].sort()
  }, [allLeads])

  // Apply filters to leads
  const filteredLeads = useMemo(() => {
    let leads = allLeads

    if (selChannels.length > 0) {
      leads = leads.filter((l) => selChannels.includes(l.channel))
    }
    if (selCampaigns.length > 0) {
      leads = leads.filter((l) => selCampaigns.includes(l.campaign))
    }
    if (selAdSets.length > 0) {
      leads = leads.filter((l) => selAdSets.includes(l.adSet))
    }
    if (selAds.length > 0) {
      leads = leads.filter((l) => selAds.includes(l.ad))
    }
    if (selPages.length > 0) {
      leads = leads.filter((l) => selPages.includes(l.landingPage))
    }
    if (selRevenue.length > 0) {
      leads = leads.filter((l) => selRevenue.includes(l.revenue))
    }
    if (selSegments.length > 0) {
      leads = leads.filter((l) => selSegments.includes(l.segment))
    }

    return leads
  }, [allLeads, selChannels, selCampaigns, selAdSets, selAds, selPages, selRevenue, selSegments])

  // Text search
  const searchedLeads = useMemo(() => {
    if (!search.trim()) return filteredLeads
    const q = search.toLowerCase()
    return filteredLeads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.company.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        l.campaign.toLowerCase().includes(q) ||
        l.channel.toLowerCase().includes(q),
    )
  }, [filteredLeads, search])

  // Sort
  const sortedLeads = useMemo(() => {
    return [...searchedLeads].sort((a, b) => {
      const va = sortVal(a, sortKey)
      const vb = sortVal(b, sortKey)
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [searchedLeads, sortKey, sortDir])

  // KPI counts
  const counts = useMemo(() => computeLeadCounts(filteredLeads), [filteredLeads])

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'ts' ? 'desc' : 'asc')
    }
  }

  function setQuickDate(from: string, to: string) {
    setDateFrom(from)
    setDateTo(to)
  }

  const mqlSqlPct = counts.mqlSqlPct !== null ? `${counts.mqlSqlPct.toFixed(0)}%` : '—'

  return (
    <div className="flex flex-col gap-5">
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 flex flex-col gap-2.5">
        {/* Row 1: Período */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400 font-medium shrink-0">Período</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0D2F9F] focus:border-transparent"
          />
          <span className="text-xs text-gray-400">até</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0D2F9F] focus:border-transparent"
          />
          <div className="w-px h-4 bg-gray-200 hidden sm:block" />
          {getDatePresets().map(({ label, from, to }) => (
            <button
              key={label}
              onClick={() => setQuickDate(from, to)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
                dateFrom === from && dateTo === to
                  ? 'border-[#0D2F9F] bg-blue-50 text-[#0D2F9F] font-medium'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
          <div className="ml-auto shrink-0">
            <button
              onClick={reload}
              disabled={loading}
              className="flex items-center gap-1.5 text-sm text-[#0D2F9F] hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
          </div>
        </div>

        {/* Row 2: Segmentação */}
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelect
            label="Canal"
            options={allChannels}
            selected={selChannels}
            onChange={setSelChannels}
          />
          <div className="w-px h-4 bg-gray-200 hidden sm:block" />
          <MultiSelect
            label="Campanha"
            options={filterOptions.campaigns}
            selected={selCampaigns}
            onChange={(v) => { setSelCampaigns(v); setSelAdSets([]); setSelAds([]) }}
          />
          <MultiSelect
            label="Conjunto"
            options={filterOptions.adSets}
            selected={selAdSets}
            onChange={(v) => { setSelAdSets(v); setSelAds([]) }}
            disabled={selCampaigns.length === 0}
          />
          <MultiSelect
            label="Anúncio"
            options={filterOptions.ads}
            selected={selAds}
            onChange={setSelAds}
            disabled={selAdSets.length === 0}
          />
          <MultiSelect
            label="Landing Page"
            options={pageOptions.map((p) => p.label)}
            selected={selPages.map((id) => pageNameMap.get(id) ?? id)}
            onChange={(labels) =>
              setSelPages(labels.map((l) => pageOptions.find((p) => p.label === l)?.id ?? l))
            }
            disabled={pageOptions.length === 0}
          />
          <MultiSelect
            label="Faturamento"
            options={filterOptions.revenue}
            selected={selRevenue}
            onChange={setSelRevenue}
          />
          <MultiSelect
            label="Segmento"
            options={filterOptions.segments}
            selected={selSegments}
            onChange={setSelSegments}
          />
          <div className="w-px h-4 bg-gray-200 hidden sm:block" />
          <ExcludedCampaignsFilter
            allCampaigns={allWindsorCampaigns}
            excluded={excludedCampaigns}
            onChange={setExcludedCampaigns}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-10 gap-2 text-gray-400 text-sm">
          <Loader2 size={20} className="animate-spin text-blue-400" />
          Carregando leads...
        </div>
      )}

      {!loading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <KpiCard label="Total Leads" value={gpLeadsCount} color="text-gray-800" />
            <KpiCard label="MQLs" value={counts.mqls} color="text-blue-700" />
            <KpiCard label="SQLs" value={counts.sqls} color="text-indigo-700" />
            <KpiCard label="Não Qual." value={counts.notMql} color="text-gray-500" />
            <KpiCard label="Oport." value={counts.opportunities} color="text-purple-700" />
            <KpiCard label="Reuniões" value={counts.meetings} color="text-orange-600" />
            <KpiCard label="Vendas" value={counts.won} color="text-emerald-700" />
            <KpiCard label="MQL→SQL" value={mqlSqlPct} color="text-[#0D2F9F]" sub={counts.mqls > 0 ? `${counts.sqls}/${counts.mqls}` : undefined} />
          </div>

          {/* Lead table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Leads{' '}
                <span className="text-gray-400 font-normal">({sortedLeads.length})</span>
              </h3>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar nome, empresa, e-mail..."
                  className="text-xs pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg w-56 focus:outline-none focus:border-[#0D2F9F] text-gray-700 placeholder:text-gray-400"
                />
              </div>
            </div>

            {sortedLeads.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">
                Nenhum lead encontrado para os filtros selecionados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                      {COLS.map(({ label, key }) => (
                        <th
                          key={key}
                          className={`px-3 py-2 font-medium cursor-pointer select-none hover:text-gray-600 ${
                            key === 'name' || key === 'company' ? 'text-left' : 'text-left'
                          }`}
                          onClick={() => handleSort(key)}
                        >
                          <span className="inline-flex items-center gap-0.5">
                            {sortKey === key && (
                              sortDir === 'asc'
                                ? <ChevronUp size={11} className="text-[#0D2F9F] shrink-0" />
                                : <ChevronDown size={11} className="text-[#0D2F9F] shrink-0" />
                            )}
                            <span className={sortKey === key ? 'text-[#0D2F9F]' : ''}>{label}</span>
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sortedLeads.map((lead) => (
                      <tr
                        key={lead.dealId}
                        className="hover:bg-blue-50 cursor-pointer transition-colors"
                        onClick={() => setSelectedLead(lead)}
                      >
                        <td className="px-3 py-2.5 max-w-[180px]">
                          <span className="block truncate text-gray-800 font-medium text-xs">{lead.name}</span>
                          <span className="block truncate text-gray-400 text-[11px]">{lead.email}</span>
                        </td>
                        <td className="px-3 py-2.5 max-w-[140px]">
                          <span className="block truncate text-gray-700 text-xs">{lead.company || '—'}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          {lead.channel
                            ? <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full whitespace-nowrap">{lead.channel}</span>
                            : <span className="text-gray-300 text-xs">—</span>
                          }
                        </td>
                        <td className="px-3 py-2.5 max-w-[120px]">
                          <span className="block truncate text-gray-600 text-xs font-mono">{lead.campaign || '—'}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <StageBadge stage={lead.stage} />
                        </td>
                        <td className="px-3 py-2.5 max-w-[120px]">
                          <span className="block truncate text-gray-600 text-xs">{lead.revenue || '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 max-w-[120px]">
                          <span className="block truncate text-gray-600 text-xs">{lead.segment || '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-400">
                          {fmtEventDateTime(lead.lastEventTs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Lead detail modal */}
      {selectedLead && (
        <LeadModal lead={selectedLead} onClose={() => setSelectedLead(null)} />
      )}
    </div>
  )
}
