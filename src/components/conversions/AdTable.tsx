import { useState } from 'react'
import { ChevronUp, ChevronDown, Settings } from 'lucide-react'
import type { AdMetrics } from '../../utils/computeMetrics'
import type { WindsorRow } from '../../api/windsor'
import type { CeaConfig } from '../../utils/cea'
import { computeCEAStatus, ceaBadgeLabel, type CeaStatus } from '../../utils/cea'
import AdModal from './AdModal'
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

type SortKey = 'spend' | 'mqls' | 'cpmql' | 'sqls' | 'cpsql' | 'opportunities' | 'meetings' | 'won' | 'cpa' | 'mrr' | 'ticket'

function sortVal(r: AdMetrics, key: SortKey): number {
  switch (key) {
    case 'spend': return r.spend
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

const COL_KEYS: { label: string; key: SortKey | null }[] = [
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

interface Props {
  byAd: AdMetrics[]
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
  const [sortKey, setSortKey] = useState<SortKey>('spend')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedAd, setSelectedAd] = useState<AdMetrics | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  if (byAd.length === 0) return null

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const rows = [...byAd].sort((a, b) => {
    const diff = sortVal(a, sortKey) - sortVal(b, sortKey)
    return sortDir === 'asc' ? diff : -diff
  })

  const total: AdMetrics = byAd.reduce(
    (acc, r) => ({
      ad: 'Total',
      spend: acc.spend + r.spend,
      mqls: acc.mqls + r.mqls,
      sqls: acc.sqls + r.sqls,
      opportunities: acc.opportunities + r.opportunities,
      meetings: acc.meetings + r.meetings,
      won: acc.won + r.won,
      mrr: acc.mrr + r.mrr,
    }),
    { ad: 'Total', spend: 0, mqls: 0, sqls: 0, opportunities: 0, meetings: 0, won: 0, mrr: 0 },
  )

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Performance por Anúncio</h3>
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                {COL_KEYS.map(({ label, key }) => (
                  <th
                    key={label}
                    className={`px-3 py-2 font-medium select-none ${
                      label === 'Anúncio' ? 'text-left' :
                      label === 'Status' || label === 'Status CEA' ? 'text-center' :
                      'text-right'
                    } ${key ? 'cursor-pointer hover:text-gray-600' : ''}`}
                    onClick={key ? () => handleSort(key) : undefined}
                  >
                    <span className="inline-flex items-center gap-0.5 justify-end w-full">
                      {label !== 'Anúncio' && key && sortKey === key && (
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
              {rows.map((r) => {
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
                        <span className="block truncate text-gray-700">
                          {truncated}
                        </span>
                        {/* Styled tooltip */}
                        <div className="pointer-events-none absolute left-0 top-full mt-1 z-[200] hidden group-hover/adname:block">
                          <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-xs break-words leading-snug">
                            {r.adFullName ?? r.ad}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(r.spend)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(r.mqls)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(r.spend, r.mqls)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(r.sqls)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(r.spend, r.sqls)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(r.opportunities)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(r.meetings)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(r.won)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(r.spend, r.won)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(r.mrr)}</td>
                    <td className="px-3 py-2.5 text-right text-[#1a1a1a] font-medium text-xs">{ticketMedio(r.mrr, r.won)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <CeaBadge status={ceaStatus} />
                    </td>
                  </tr>
                )
              })}
              {/* Total row */}
              <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                <td className="px-3 py-2.5 max-w-[220px]">
                  <span className="block truncate text-gray-800">Total</span>
                </td>
                <td className="px-3 py-2.5 text-center" />
                <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(total.spend)}</td>
                <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(total.mqls)}</td>
                <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(total.spend, total.mqls)}</td>
                <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(total.sqls)}</td>
                <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(total.spend, total.sqls)}</td>
                <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(total.opportunities)}</td>
                <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(total.meetings)}</td>
                <td className="px-3 py-2.5 text-right text-gray-700">{fmtN(total.won)}</td>
                <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{ratio(total.spend, total.won)}</td>
                <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(total.mrr)}</td>
                <td className="px-3 py-2.5 text-right text-[#1a1a1a] font-medium text-xs">{ticketMedio(total.mrr, total.won)}</td>
                <td className="px-3 py-2.5 text-center" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Ad Modal */}
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

      {/* CEA Config Drawer */}
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
