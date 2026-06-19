import { useState, useEffect } from 'react'
import { yesterdayBRT } from '../../utils/dateBRT'
import { Settings2, Loader2 } from 'lucide-react'
import { CHANNELS, type Channel } from '../../utils/channelNorm'
import type { ChannelMetrics } from '../../hooks/useConversionsData'
import { loadRemoteSetting, saveRemoteSetting } from '../../api/supabase'

const STORAGE_KEY = 'gp_budget_config'
const REMOTE_KEY = 'budget_config'

type BudgetMap = Record<Channel, number>

function emptyBudgets(): BudgetMap {
  return Object.fromEntries(CHANNELS.map((c) => [c, 0])) as BudgetMap
}

function loadLocalBudgets(): BudgetMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : emptyBudgets()
  } catch {
    return emptyBudgets()
  }
}

function fmtBRL(n: number) {
  if (n === 0) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function fmtPct(n: number) {
  return n.toFixed(1) + '%'
}

/** pct = (spend / deveria) * 100. Green: 97–102. Red: outside that range. */
function statusColor(pct: number): string {
  if (pct === 0) return 'text-gray-400 bg-gray-100'
  const ok = pct >= 97 && pct <= 102
  return ok ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'
}

function statusLabel(pct: number): string {
  if (pct === 0) return '—'
  if (pct > 102) return 'Acima do teto'
  if (pct >= 97) return 'No ritmo'
  return 'Abaixo do ritmo'
}

/** Days elapsed in the period (capped at yesterday — never uses partial today data), and total days in the month of dateFrom */
function pacingDays(dateFrom: string, dateTo: string): { elapsed: number; total: number } {
  const from = new Date(dateFrom + 'T12:00:00')
  const to = new Date(dateTo + 'T12:00:00')
  const yesterday = new Date(yesterdayBRT() + 'T12:00:00')

  const effectiveTo = to < yesterday ? to : yesterday
  const elapsed = Math.max(1, Math.round((effectiveTo.getTime() - from.getTime()) / 86_400_000) + 1)
  const total = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate()
  return { elapsed, total }
}

interface Props {
  byChannel: ChannelMetrics[]
  dateFrom: string
  dateTo: string
}

export default function PacingSection({ byChannel, dateFrom, dateTo }: Props) {
  const [budgets, setBudgets] = useState<BudgetMap>(loadLocalBudgets)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<BudgetMap>(loadLocalBudgets)
  const [syncing, setSyncing] = useState(false)

  // On mount: load from Supabase, fallback to localStorage
  useEffect(() => {
    loadRemoteSetting<BudgetMap>(REMOTE_KEY).then((remote) => {
      if (remote) {
        const merged = { ...emptyBudgets(), ...remote }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
        setBudgets(merged)
        setDraft(merged)
      } else {
        const local = loadLocalBudgets()
        setBudgets(local)
        setDraft(local)
      }
    })
  }, [])

  async function saveBudgets() {
    setSyncing(true)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
    setBudgets(draft)
    setEditing(false)
    await saveRemoteSetting(REMOTE_KEY, draft)
    setSyncing(false)
  }

  const { elapsed, total } = pacingDays(dateFrom, dateTo)
  const pacingRatio = elapsed / total

  const spendByChannel = Object.fromEntries(byChannel.map((r) => [r.channel, r.spend])) as Record<Channel, number>

  const totalBudget = CHANNELS.reduce((s, ch) => s + (budgets[ch] ?? 0), 0)
  const totalSpend = CHANNELS.reduce((s, ch) => s + (spendByChannel[ch] ?? 0), 0)
  const totalDeveria = totalBudget * pacingRatio

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Pacing de Investimento</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Dia {elapsed} de {total} do mês · ritmo ideal: {fmtPct(pacingRatio * 100)} da verba
          </p>
        </div>
        <button
          onClick={() => { setDraft({ ...budgets }); setEditing((v) => !v) }}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#0D2F9F] px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
        >
          <Settings2 size={13} />
          {editing ? 'Cancelar' : 'Editar verbas'}
        </button>
      </div>

      {/* Edit panel */}
      {editing && (
        <div className="mx-5 mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-xs text-gray-500 mb-3">Defina a verba mensal por canal (R$):</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {CHANNELS.map((ch) => (
              <div key={ch}>
                <label className="text-xs text-gray-500 block mb-1">{ch}</label>
                <input
                  type="number"
                  min={0}
                  value={draft[ch] || ''}
                  placeholder="0"
                  onChange={(e) => setDraft((d) => ({ ...d, [ch]: Number(e.target.value) || 0 }))}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0D2F9F]"
                />
              </div>
            ))}
          </div>
          <button
            onClick={saveBudgets}
            disabled={syncing}
            className="mt-3 flex items-center gap-1.5 px-4 py-1.5 bg-[#0D2F9F] text-white text-xs font-medium rounded-lg hover:bg-[#0A2580] disabled:opacity-60 transition-colors"
          >
            {syncing && <Loader2 size={11} className="animate-spin" />}
            {syncing ? 'Salvando...' : 'Salvar verbas'}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
              {['Canal', 'Verba do Mês', 'Investimento MTD', 'Deveria Estar', 'Como Estamos', 'Status'].map((h) => (
                <th key={h} className={`px-3 py-2 font-medium ${h === 'Canal' ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {CHANNELS.map((ch) => {
              const budget = budgets[ch] ?? 0
              const spend = spendByChannel[ch] ?? 0
              const deveria = budget * pacingRatio
              const como = deveria > 0 ? (spend / deveria) * 100 : 0
              const hasData = budget > 0 || spend > 0
              if (!hasData) return null
              return (
                <tr key={ch} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 text-gray-700">{ch}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(budget)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(spend)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{budget > 0 ? fmtBRL(deveria) : '—'}</td>
                  <td className="px-3 py-2.5 text-right">
                    {budget > 0 ? (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor(como)}`}>
                        {fmtPct(como)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {budget > 0 ? (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor(como)}`}>
                        {statusLabel(como)}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              )
            })}
            {/* Total row */}
            <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
              <td className="px-3 py-2.5 text-gray-800">Total</td>
              <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(totalBudget)}</td>
              <td className="px-3 py-2.5 text-right text-gray-700">{fmtBRL(totalSpend)}</td>
              <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{totalBudget > 0 ? fmtBRL(totalDeveria) : '—'}</td>
              {(() => {
                const totalComo = totalDeveria > 0 ? (totalSpend / totalDeveria) * 100 : 0
                return (
                  <>
                    <td className="px-3 py-2.5 text-right">
                      {totalBudget > 0 ? (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor(totalComo)}`}>
                          {fmtPct(totalComo)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {totalBudget > 0 ? (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor(totalComo)}`}>
                          {statusLabel(totalComo)}
                        </span>
                      ) : '—'}
                    </td>
                  </>
                )
              })()}
            </tr>
          </tbody>
        </table>
        {CHANNELS.every((ch) => !(budgets[ch] > 0) && !(spendByChannel[ch] > 0)) && (
          <p className="text-sm text-gray-400 text-center py-6">
            Configure as verbas mensais clicando em "Editar verbas".
          </p>
        )}
      </div>
    </div>
  )
}
