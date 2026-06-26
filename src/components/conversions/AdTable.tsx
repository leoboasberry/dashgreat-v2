import { useState, type ReactNode } from 'react'
import { ChevronUp, ChevronDown, Settings } from 'lucide-react'
import type { AdMetrics, AdSetMetrics, CampaignMetrics } from '../../utils/computeMetrics'
import type { WindsorRow } from '../../api/windsor'
import type { CeaConfig } from '../../utils/cea'
import { computeCEAStatus, ceaBadgeLabel, type CeaStatus } from '../../utils/cea'
import AdModal from './AdModal'
import AdSetModal from './AdSetModal'
import CampaignModal from './CampaignModal'
import CeaConfigDrawer from './CeaConfigDrawer'

function fmtBRL(n: number) {
  if (n === 0) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function fmtN(n: number) {
  if (n === 0) return '—'
  return n.toLocaleString('pt-BR')
}

function ratio(invest: number, count: number): string {
  if (count === 0 || invest === 0) return '—'
  return (invest / count).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function ticketMedio(mrr: number, won: number): string {
  if (won === 0 || mrr === 0) return '—'
  return (mrr / won).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

type SortKey = 'spend' | 'dailyBudget' | 'mqls' | 'cpmql' | 'sqls' | 'cpsql' | 'opportunities' | 'meetings' | 'won' | 'cpa' | 'mrr' | 'ticket'

function sortValAd(r: AdMetrics, key: SortKey): number {
  switch (key) {
    case 'spend': return r.spend
    case 'dailyBudget': return 0
    case 'mqls': return r.mqls
    case 'cpmql': return r.mqls > 0 ? r.spend / r.mqls : 0
    case 'sqls': return r.sqls
    case 'cpsql': return r.sqls > 0 ? r.spend / r.sqls : 0
    case 'opportunities': return r.opportunities
    case 'meetings': return r.meetings
    case 'won': return r.won
    case 'cpa': return r.won > 0 ? r.spend / r.won : 0
    case 'mrr': return r.mrr
    case 'ticket': return r.won > 0 ? r.mrr / r.won : 0
  }
}

function sortValCampaign(r: CampaignMetrics, key: SortKey): number {
  switch (key) {
    case 'spend': return r.spend
    case 'dailyBudget': return r.dailyBudget
    case 'mqls': return r.mqls
    case 'cpmql': return r.mqls > 0 ? r.spend / r.mqls : 0
    case 'sqls': return r.sqls
    case 'cpsql': return r.sqls > 0 ? r.spend / r.sqls : 0
    case 'opportunities': return r.opportunities
    case 'meetings': return r.meetings
    case 'won': return r.won
    case 'cpa': return r.won > 0 ? r.spend / r.won : 0
    case 'mrr': return r.mrr
    case 'ticket': return r.won > 0 ? r.mrr / r.won : 0
  }
}

function sortValAdSet(r: AdSetMetrics, key: SortKey): number {
  switch (key) {
    case 'spend': return r.spend
    case 'dailyBudget': return r.dailyBudget
    case 'mqls': return r.mqls
    case 'cpmql': return r.mqls > 0 ? r.spend / r.mqls : 0
    case 'sqls': return r.sqls
    case 'cpsql': return r.sqls > 0 ? r.spend / r.sqls : 0
    case 'opportunities': return r.opportunities
    case 'meetings': return r.meetings
    case 'won': return r.won
    case 'cpa': return r.won > 0 ? r.spend / r.won : 0
    case 'mrr': return r.mrr
    case 'ticket': return r.won > 0 ? r.mrr / r.won : 0
  }
}

const COL_KEYS_AD: { label: string; key: SortKey | null }[] = [
  { label: 'Anúncio', key: null },
  { label: 'Status', key: null },
  { label: 'Investimento', key: 'spend' },
  { label: 'MQLs', key: 'mqls' },
  { label: 'CPMQL', key: 'cpmql' },
  { label: 'SQLs', key: 'sqls' },
  { label: 'CPSQL', key: 'cpsql' },
  { label: 'Oport.', key: 'opportunities' },
  { label: 'Reuniões', key: 'meetings' },
  { label: 'Vendas', key: 'won' },
  { label: 'CPA', key: 'cpa' },
  { label: 'MRR', key: 'mrr' },
  { label: 'Ticket Médio', key: 'ticket' },
  { label: 'Status CEA', key: null },
]

const COL_KEYS_CAMPAIGN: { label: string; key: SortKey | null }[] = [
  { label: 'Campanha', key: null },
  { label: 'Status', key: null },
  { label: 'Investimento', key: 'spend' },
  { label: 'Orç./dia', key: 'dailyBudget' },
  { label: 'MQLs', key: 'mqls' },
  { label: 'CPMQL', key: 'cpmql' },
  { label: 'SQLs', key: 'sqls' },
  { label: 'CPSQL', key: 'cpsql' },
  { label: 'Oport.', key: 'opportunities' },
  { label: 'Reuniões', key: 'meetings' },
  { label: 'Vendas', key: 'won' },
  { label: 'CPA', key: 'cpa' },
  { label: 'MRR', key: 'mrr' },
  { label: 'Ticket Médio', key: 'ticket' },
  { label: 'Status CEA', key: null },
]

const COL_KEYS_ADSET: { label: string; key: SortKey | null }[] = [
  { label: 'Conjunto', key: null },
  { label: 'Status', key: null },
  { label: 'Investimento', key: 'spend' },
  { label: 'Orç./dia', key: 'dailyBudget' },
  { label: 'MQLs', key: 'mqls' },
  { label: 'CPMQL', key: 'cpmql' },
  { label: 'SQLs', key: 'sqls' },
  { label: 'CPSQL', key: 'cpsql' },
  { label: 'Oport.', key: 'opportunities' },
  { label: 'Reuniões', key: 'meetings' },
  { label: 'Vendas', key: 'won' },
  { label: 'CPA', key: 'cpa' },
  { label: 'MRR', key: 'mrr' },
  { label: 'Ticket Médio', key: 'ticket' },
  { label: 'Status CEA', key: null },
]

type BadgeType = 'green' | 'yellow' | 'orange' | 'red' | 'gray'

function CeaBadge({ status }: { status: CeaStatus | null }) {
  if (!status) return <span className="text-gray-300 text-xs">—</span>
  const cls: Record<BadgeType, string> = {
    green: 'bg-emerald-50 text-emerald-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    orange: 'bg-orange-50 text-orange-700',
    red: 'bg-red-50 text-red-700',
    gray: 'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${cls[status.type]}`}>
      {ceaBadgeLabel(status.badge)}
    </span>
  )
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-gray-300 text-xs">—</span>
  const isActive = status === 'ENABLED' || status === 'ACTIVE'
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${
      isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
      {isActive ? 'Ativo' : (status === 'PAUSED' || status === 'DISABLED') ? 'Pausado' : status}
    </span>
  )
}

function Tip({ label, children }: { label: string; children: ReactNode }) {
  if (!label) return <>{children}</>
  return (
    <span className="relative group/tip cursor-default">
      {children}
      <span className="pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-[200] hidden group-hover/tip:block">
        <span className="bg-gray-900 text-white text-[10px] rounded-lg px-2 py-1 shadow-lg whitespace-nowrap">
          {label}
        </span>
      </span>
    </span>
  )
}

function tipPct(num: number, den: number, label: string): string {
  if (den === 0) return ''
  return `${((num / den) * 100).toFixed(1)}% de ${label}`
}

function tipCea(spend: number, won: number, mrr: number): string {
  if (won === 0 || mrr === 0) return ''
  return `${(spend / mrr).toFixed(2)}× do Ticket Médio`
}

function SortIcon({ active, sortDir }: { active: boolean; sortDir: 'asc' | 'desc' }) {
  if (!active) return null
  return sortDir === 'asc'
    ? <ChevronUp size={11} className="text-[#0D2F9F] shrink-0" />
    : <ChevronDown size={11} className="text-[#0D2F9F] shrink-0" />
}

interface Props {
  byAd: AdMetrics[]
  byAdSet: AdSetMetrics[]
  byCampaign: CampaignMetrics[]
  ceaConfig: CeaConfig
  syncing: boolean
  onSaveCeaConfig: (c: CeaConfig) => void
  rawWindsorRows: WindsorRow[]
  dateFrom: string
  dateTo: string
  channels: string[]
  campaigns: string[]
  adSets: string[]
  onlyActive: boolean
}

export default function AdTable({
  byAd,
  byAdSet,
  byCampaign,
  ceaConfig,
  syncing,
  onSaveCeaConfig,
  rawWindsorRows,
  dateFrom,
  dateTo,
  channels,
  campaigns,
  adSets,
  onlyActive,
}: Props) {
  const [activeTab, setActiveTab] = useState<'ads' | 'adsets' | 'campaigns'>('ads')
  const [adSortKey, setAdSortKey] = useState<SortKey>('spend')
  const [adSortDir, setAdSortDir] = useState<'asc' | 'desc'>('desc')
  const [adSetSortKey, setAdSetSortKey] = useState<SortKey>('spend')
  const [adSetSortDir, setAdSetSortDir] = useState<'asc' | 'desc'>('desc')
  const [campaignSortKey, setCampaignSortKey] = useState<SortKey>('spend')
  const [campaignSortDir, setCampaignSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedAd, setSelectedAd] = useState<AdMetrics | null>(null)
  const [selectedAdSet, setSelectedAdSet] = useState<AdSetMetrics | null>(null)
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignMetrics | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  if (byAd.length === 0 && byAdSet.length === 0 && byCampaign.length === 0) return null

  function handleAdSort(key: SortKey) {
    if (key === adSortKey) setAdSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setAdSortKey(key); setAdSortDir('desc') }
  }

  function handleAdSetSort(key: SortKey) {
    if (key === adSetSortKey) setAdSetSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setAdSetSortKey(key); setAdSetSortDir('desc') }
  }

  function handleCampaignSort(key: SortKey) {
    if (key === campaignSortKey) setCampaignSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setCampaignSortKey(key); setCampaignSortDir('desc') }
  }

  const adRows = [...byAd].sort((a, b) => {
    const diff = sortValAd(a, adSortKey) - sortValAd(b, adSortKey)
    return adSortDir === 'asc' ? diff : -diff
  })

  const adSetRows = [...byAdSet].sort((a, b) => {
    const diff = sortValAdSet(a, adSetSortKey) - sortValAdSet(b, adSetSortKey)
    return adSetSortDir === 'asc' ? diff : -diff
  })

  const campaignRows = [...byCampaign].sort((a, b) => {
    const diff = sortValCampaign(a, campaignSortKey) - sortValCampaign(b, campaignSortKey)
    return campaignSortDir === 'asc' ? diff : -diff
  })

  const adTotal = byAd.reduce(
    (acc, r) => ({
      ad: 'Total', spend: acc.spend + r.spend, mqls: acc.mqls + r.mqls,
      sqls: acc.sqls + r.sqls, opportunities: acc.opportunities + r.opportunities,
      meetings: acc.meetings + r.meetings, won: acc.won + r.won, mrr: acc.mrr + r.mrr,
    }),
    { ad: 'Total', spend: 0, mqls: 0, sqls: 0, opportunities: 0, meetings: 0, won: 0, mrr: 0 },
  )

  const campaignTotal = byCampaign.reduce(
    (acc, r) => ({
      campaign: 'Total', spend: acc.spend + r.spend, dailyBudget: acc.dailyBudget + r.dailyBudget,
      mqls: acc.mqls + r.mqls, sqls: acc.sqls + r.sqls, opportunities: acc.opportunities + r.opportunities,
      meetings: acc.meetings + r.meetings, won: acc.won + r.won, mrr: acc.mrr + r.mrr,
    }),
    { campaign: 'Total', spend: 0, dailyBudget: 0, mqls: 0, sqls: 0, opportunities: 0, meetings: 0, won: 0, mrr: 0 },
  )

  const adSetTotal = byAdSet.reduce(
    (acc, r) => ({
      adSet: 'Total', spend: acc.spend + r.spend, dailyBudget: acc.dailyBudget + r.dailyBudget,
      mqls: acc.mqls + r.mqls, sqls: acc.sqls + r.sqls, opportunities: acc.opportunities + r.opportunities,
      meetings: acc.meetings + r.meetings, won: acc.won + r.won, mrr: acc.mrr + r.mrr,
    }),
    { adSet: 'Total', spend: 0, dailyBudget: 0, mqls: 0, sqls: 0, opportunities: 0, meetings: 0, won: 0, mrr: 0 },
  )

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header with tabs */}
        <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-gray-700 mr-2">Performance por</h3>
            <button
              onClick={() => setActiveTab('ads')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'ads'
                  ? 'bg-[#0D2F9F] text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              Anúncio{' '}
              <span className={activeTab === 'ads' ? 'text-blue-200' : 'text-gray-400'}>
                ({byAd.length})
              </span>
            </button>
            <button
              onClick={() => setActiveTab('adsets')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'adsets'
                  ? 'bg-[#0D2F9F] text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              Conjunto{' '}
              <span className={activeTab === 'adsets' ? 'text-blue-200' : 'text-gray-400'}>
                ({byAdSet.length})
              </span>
            </button>
            <button
              onClick={() => setActiveTab('campaigns')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'campaigns'
                  ? 'bg-[#0D2F9F] text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              Campanha{' '}
              <span className={activeTab === 'campaigns' ? 'text-blue-200' : 'text-gray-400'}>
                ({byCampaign.length})
              </span>
            </button>
          </div>
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#0D2F9F] hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition-colors"
            title="Configurar parâmetros CEA"
          >
            <Settings size={13} />
            <span className="hidden sm:inline">Config. CEA</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          {/* ── Anúncios ── */}
          {activeTab === 'ads' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                  {COL_KEYS_AD.map(({ label, key }) => (
                    <th
                      key={label}
                      className={`px-3 py-2 font-medium select-none ${
                        label === 'Anúncio' ? 'text-left' :
                        label === 'Status' || label === 'Status CEA' ? 'text-center' : 'text-right'
                      } ${key ? 'cursor-pointer hover:text-gray-600' : ''}`}
                      onClick={key ? () => handleAdSort(key) : undefined}
                    >
                      <span className="inline-flex items-center gap-0.5 justify-end w-full">
                        <SortIcon active={adSortKey === key} sortDir={adSortDir} />
                        <span className={adSortKey === key ? 'text-[#0D2F9F]' : ''}>{label}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {adRows.map((r) => {
                  const ceaStatus = computeCEAStatus(r, ceaConfig)
                  const MAX_LEN = 40
                  const truncated = r.ad.length > MAX_LEN ? r.ad.slice(0, MAX_LEN) + '…' : r.ad
                  return (
                    <tr
                      key={r.ad}
                      className="hover:bg-blue-50 cursor-pointer transition-colors"
                      onClick={() => setSelectedAd(r)}
                    >
                      <td className="px-3 py-2.5 max-w-[220px]">
                        <div className="relative group/adname inline-block w-full">
                          <span className="block truncate text-gray-700">{truncated}</span>
                          <div className="pointer-events-none absolute left-0 top-full mt-1 z-[200] hidden group-hover/adname:block">
                            <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-xs break-words leading-snug">
                              {r.adFullName ?? r.ad}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(r.spend)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(r.mqls)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(r.spend, r.mqls)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700"><Tip label={tipPct(r.sqls, r.mqls, 'MQL→SQL')}>{fmtN(r.sqls)}</Tip></td>
                      <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(r.spend, r.sqls)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700"><Tip label={tipPct(r.opportunities, r.sqls, 'SQL→Oport.')}>{fmtN(r.opportunities)}</Tip></td>
                      <td className="px-3 py-2.5 text-right text-gray-700"><Tip label={tipPct(r.meetings, r.opportunities, 'Oport.→Reunião')}>{fmtN(r.meetings)}</Tip></td>
                      <td className="px-3 py-2.5 text-right text-gray-700"><Tip label={tipPct(r.won, r.meetings, 'RR→Venda')}>{fmtN(r.won)}</Tip></td>
                      <td className="px-3 py-2.5 text-right text-gray-500 text-xs"><Tip label={tipCea(r.spend, r.won, r.mrr)}>{ratio(r.spend, r.won)}</Tip></td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(r.mrr)}</td>
                      <td className="px-3 py-2.5 text-right text-[#1a1a1a] font-medium text-xs">{ticketMedio(r.mrr, r.won)}</td>
                      <td className="px-3 py-2.5 text-center"><CeaBadge status={ceaStatus} /></td>
                    </tr>
                  )
                })}
                <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                  <td className="px-3 py-2.5 max-w-[220px]"><span className="block truncate text-gray-800">Total</span></td>
                  <td className="px-3 py-2.5 text-center" />
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(adTotal.spend)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(adTotal.mqls)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(adTotal.spend, adTotal.mqls)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(adTotal.sqls)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(adTotal.spend, adTotal.sqls)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(adTotal.opportunities)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(adTotal.meetings)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(adTotal.won)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(adTotal.spend, adTotal.won)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(adTotal.mrr)}</td>
                  <td className="px-3 py-2.5 text-right text-[#1a1a1a] font-medium text-xs">{ticketMedio(adTotal.mrr, adTotal.won)}</td>
                  <td className="px-3 py-2.5 text-center" />
                </tr>
              </tbody>
            </table>
          )}

          {/* ── Conjuntos (Meta only) ── */}
          {activeTab === 'adsets' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                  {COL_KEYS_ADSET.map(({ label, key }) => (
                    <th
                      key={label}
                      className={`px-3 py-2 font-medium select-none ${
                        label === 'Conjunto' ? 'text-left' :
                        label === 'Status' ? 'text-center' : 'text-right'
                      } ${key ? 'cursor-pointer hover:text-gray-600' : ''}`}
                      onClick={key ? () => handleAdSetSort(key) : undefined}
                    >
                      <span className="inline-flex items-center gap-0.5 justify-end w-full">
                        <SortIcon active={adSetSortKey === key} sortDir={adSetSortDir} />
                        <span className={adSetSortKey === key ? 'text-[#0D2F9F]' : ''}>{label}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {adSetRows.map((r) => {
                  const ceaStatus = computeCEAStatus(r, ceaConfig)
                  const MAX_LEN = 50
                  const display = r.adSetFullName ?? r.adSet
                  const truncated = display.length > MAX_LEN ? display.slice(0, MAX_LEN) + '…' : display
                  return (
                    <tr key={r.adSet} className="hover:bg-blue-50 cursor-pointer transition-colors" onClick={() => setSelectedAdSet(r)}>
                      <td className="px-3 py-2.5 max-w-[260px]">
                        <div className="relative group/adsetname inline-block w-full">
                          <span className="block truncate text-gray-700">{truncated}</span>
                          {display.length > MAX_LEN && (
                            <div className="pointer-events-none absolute left-0 top-full mt-1 z-[200] hidden group-hover/adsetname:block">
                              <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-xs break-words leading-snug">
                                {display}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(r.spend)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(r.dailyBudget)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(r.mqls)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(r.spend, r.mqls)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700"><Tip label={tipPct(r.sqls, r.mqls, 'MQL→SQL')}>{fmtN(r.sqls)}</Tip></td>
                      <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(r.spend, r.sqls)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700"><Tip label={tipPct(r.opportunities, r.sqls, 'SQL→Oport.')}>{fmtN(r.opportunities)}</Tip></td>
                      <td className="px-3 py-2.5 text-right text-gray-700"><Tip label={tipPct(r.meetings, r.opportunities, 'Oport.→Reunião')}>{fmtN(r.meetings)}</Tip></td>
                      <td className="px-3 py-2.5 text-right text-gray-700"><Tip label={tipPct(r.won, r.meetings, 'RR→Venda')}>{fmtN(r.won)}</Tip></td>
                      <td className="px-3 py-2.5 text-right text-gray-500 text-xs"><Tip label={tipCea(r.spend, r.won, r.mrr)}>{ratio(r.spend, r.won)}</Tip></td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(r.mrr)}</td>
                      <td className="px-3 py-2.5 text-right text-[#1a1a1a] font-medium text-xs">{ticketMedio(r.mrr, r.won)}</td>
                      <td className="px-3 py-2.5 text-center"><CeaBadge status={ceaStatus} /></td>
                    </tr>
                  )
                })}
                <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                  <td className="px-3 py-2.5 max-w-[260px]"><span className="block truncate text-gray-800">Total</span></td>
                  <td className="px-3 py-2.5 text-center" />
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(adSetTotal.spend)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(adSetTotal.dailyBudget)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(adSetTotal.mqls)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(adSetTotal.spend, adSetTotal.mqls)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(adSetTotal.sqls)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(adSetTotal.spend, adSetTotal.sqls)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(adSetTotal.opportunities)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(adSetTotal.meetings)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(adSetTotal.won)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(adSetTotal.spend, adSetTotal.won)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(adSetTotal.mrr)}</td>
                  <td className="px-3 py-2.5 text-right text-[#1a1a1a] font-medium text-xs">{ticketMedio(adSetTotal.mrr, adSetTotal.won)}</td>
                  <td className="px-3 py-2.5 text-center" />
                </tr>
              </tbody>
            </table>
          )}

          {/* ── Campanhas ── */}
          {activeTab === 'campaigns' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                  {COL_KEYS_CAMPAIGN.map(({ label, key }) => (
                    <th
                      key={label}
                      className={`px-3 py-2 font-medium select-none ${
                        label === 'Campanha' ? 'text-left' :
                        label === 'Status' || label === 'Status CEA' ? 'text-center' : 'text-right'
                      } ${key ? 'cursor-pointer hover:text-gray-600' : ''}`}
                      onClick={key ? () => handleCampaignSort(key) : undefined}
                    >
                      <span className="inline-flex items-center gap-0.5 justify-end w-full">
                        <SortIcon active={campaignSortKey === key} sortDir={campaignSortDir} />
                        <span className={campaignSortKey === key ? 'text-[#0D2F9F]' : ''}>{label}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {campaignRows.map((r) => {
                  const ceaStatus = computeCEAStatus(r, ceaConfig)
                  const MAX_LEN = 50
                  const display = r.campaignFullName ?? r.campaign
                  const truncated = display.length > MAX_LEN ? display.slice(0, MAX_LEN) + '…' : display
                  return (
                    <tr key={r.campaign} className="hover:bg-blue-50 cursor-pointer transition-colors" onClick={() => setSelectedCampaign(r)}>
                      <td className="px-3 py-2.5 max-w-[260px]">
                        <div className="relative group/campaignname inline-block w-full">
                          <span className="block truncate text-gray-700">{truncated}</span>
                          {display.length > MAX_LEN && (
                            <div className="pointer-events-none absolute left-0 top-full mt-1 z-[200] hidden group-hover/campaignname:block">
                              <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-xs break-words leading-snug">
                                {display}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(r.spend)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(r.dailyBudget)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(r.mqls)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(r.spend, r.mqls)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700"><Tip label={tipPct(r.sqls, r.mqls, 'MQL→SQL')}>{fmtN(r.sqls)}</Tip></td>
                      <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(r.spend, r.sqls)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700"><Tip label={tipPct(r.opportunities, r.sqls, 'SQL→Oport.')}>{fmtN(r.opportunities)}</Tip></td>
                      <td className="px-3 py-2.5 text-right text-gray-700"><Tip label={tipPct(r.meetings, r.opportunities, 'Oport.→Reunião')}>{fmtN(r.meetings)}</Tip></td>
                      <td className="px-3 py-2.5 text-right text-gray-700"><Tip label={tipPct(r.won, r.meetings, 'RR→Venda')}>{fmtN(r.won)}</Tip></td>
                      <td className="px-3 py-2.5 text-right text-gray-500 text-xs"><Tip label={tipCea(r.spend, r.won, r.mrr)}>{ratio(r.spend, r.won)}</Tip></td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(r.mrr)}</td>
                      <td className="px-3 py-2.5 text-right text-[#1a1a1a] font-medium text-xs">{ticketMedio(r.mrr, r.won)}</td>
                      <td className="px-3 py-2.5 text-center"><CeaBadge status={ceaStatus} /></td>
                    </tr>
                  )
                })}
                <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                  <td className="px-3 py-2.5 max-w-[260px]"><span className="block truncate text-gray-800">Total</span></td>
                  <td className="px-3 py-2.5 text-center" />
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(campaignTotal.spend)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(campaignTotal.dailyBudget)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(campaignTotal.mqls)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(campaignTotal.spend, campaignTotal.mqls)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(campaignTotal.sqls)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(campaignTotal.spend, campaignTotal.sqls)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(campaignTotal.opportunities)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(campaignTotal.meetings)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(campaignTotal.won)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(campaignTotal.spend, campaignTotal.won)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(campaignTotal.mrr)}</td>
                  <td className="px-3 py-2.5 text-right text-[#1a1a1a] font-medium text-xs">{ticketMedio(campaignTotal.mrr, campaignTotal.won)}</td>
                  <td className="px-3 py-2.5 text-center" />
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedAd && (
        <AdModal
          ad={selectedAd}
          config={ceaConfig}
          rawWindsorRows={rawWindsorRows}
          dateFrom={dateFrom}
          dateTo={dateTo}
          channels={channels}
          campaigns={campaigns}
          adSets={adSets}
          onlyActive={onlyActive}
          onClose={() => setSelectedAd(null)}
        />
      )}

      {selectedAdSet && (
        <AdSetModal
          adSet={selectedAdSet}
          config={ceaConfig}
          rawWindsorRows={rawWindsorRows}
          dateFrom={dateFrom}
          dateTo={dateTo}
          channels={channels}
          campaigns={campaigns}
          onlyActive={onlyActive}
          onClose={() => setSelectedAdSet(null)}
        />
      )}

      {selectedCampaign && (
        <CampaignModal
          campaign={selectedCampaign}
          config={ceaConfig}
          rawWindsorRows={rawWindsorRows}
          dateFrom={dateFrom}
          dateTo={dateTo}
          channels={channels}
          onlyActive={onlyActive}
          onClose={() => setSelectedCampaign(null)}
        />
      )}

      {drawerOpen && (
        <CeaConfigDrawer
          config={ceaConfig}
          syncing={syncing}
          onSave={(c) => { onSaveCeaConfig(c); setDrawerOpen(false) }}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  )
}
