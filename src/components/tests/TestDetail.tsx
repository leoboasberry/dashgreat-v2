import { useState, useEffect, useMemo } from 'react'
import {
  ChevronUp, Flag, Bell, CheckCircle, Pause, Play, Trophy,
  Loader2, BarChart2, AlertCircle, Edit2, Trash2, RefreshCw, Plus, X,
} from 'lucide-react'
import type { Test, TestFlag, TestActivity } from '../../api/tests'
import {
  fetchActivity, fetchFlagLinks, fetchFlags,
  approveTest, pauseTest, reactivateTest, concludeTest, setReminder,
  changeTestStatus, deleteTest, updateTest,
} from '../../api/tests'
import { useTestMetrics } from '../../hooks/useTestMetrics'
import type { WindsorAccount } from '../../api/windsorAccounts'
import { fetchWindsorForAccount } from '../../api/windsorAccounts'
import TestMetricsChart from './TestMetricsChart'
import TestActivityFeed from './TestActivityFeed'
import TestFlagModal from './TestFlagModal'
import TestCreateModal from './TestCreateModal'

const STATUS_COLORS: Record<Test['status'], string> = {
  verde: 'bg-green-100 text-green-700',
  amarelo: 'bg-yellow-100 text-yellow-700',
  laranja: 'bg-orange-100 text-orange-700',
  vermelho: 'bg-red-100 text-red-700',
}

const APPROVAL_COLORS: Record<Test['approval_status'], string> = {
  proposto: 'bg-gray-100 text-gray-600',
  aprovado: 'bg-blue-100 text-blue-700',
  pausado: 'bg-orange-100 text-orange-600',
  concluido: 'bg-purple-100 text-purple-700',
}

const METRIC_OPTIONS = [
  { value: 'cpmql', label: 'CPMql' },
  { value: 'cpc', label: 'CPC' },
  { value: 'ctr', label: 'CTR' },
  { value: 'cpm', label: 'CPM' },
] as const

type MetricKey = typeof METRIC_OPTIONS[number]['value']

const RESULT_OPTIONS: Array<{ value: NonNullable<Test['result']>; label: string }> = [
  { value: 'vitoria', label: '🏆 Vitória' },
  { value: 'derrota', label: '❌ Derrota' },
  { value: 'inconclusivo', label: '⚖️ Inconclusivo' },
]

const STATUS_OPTIONS: Array<{ value: Test['status']; label: string }> = [
  { value: 'verde', label: '🟢 Verde' },
  { value: 'amarelo', label: '🟡 Amarelo' },
  { value: 'laranja', label: '🟠 Laranja' },
  { value: 'vermelho', label: '🔴 Vermelho' },
]

function fmt(n: number | null, prefix = 'R$', decimals = 0): string {
  if (n === null || !isFinite(n)) return '—'
  return `${prefix}${n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

function fmtPct(n: number | null): string {
  if (n === null || !isFinite(n)) return '—'
  return `${n.toFixed(1)}%`
}

function extractCode(name: string): string {
  // Prefixes: F=Meta, G=Google, L=LinkedIn, B=Bing, T=TikTok, C=OpenAI
  const m = name.match(/\b([FGLBTC]\d+[A-Z]?\d*)\b/i)
  return m ? m[1].toUpperCase() : name.slice(0, 18)
}

interface Props {
  test: Test
  onClose: () => void
  onTestChange: (t: Test) => void
  onDelete: () => void
}

export default function TestDetail({ test, onClose, onTestChange, onDelete }: Props) {
  const [activity, setActivity] = useState<TestActivity[]>([])
  const [allFlags, setAllFlags] = useState<TestFlag[]>([])
  const [activeFlags, setActiveFlags] = useState<TestFlag[]>([])
  const [showFlagModal, setShowFlagModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showConcludeMenu, setShowConcludeMenu] = useState(false)
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showReminderInput, setShowReminderInput] = useState(false)
  const [reminderDate, setReminderDate] = useState('')
  const [acting, setActing] = useState(false)
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('cpmql')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Campaign selector
  const [campSuggestions, setCampSuggestions] = useState<Array<{ code: string; spend: number }>>([])
  const [fetchingCamps, setFetchingCamps] = useState(false)
  const [showCampSection, setShowCampSection] = useState(false)
  const [savingCodes, setSavingCodes] = useState(false)

  // Metrics
  const today = new Date().toISOString().slice(0, 10)
  const dateFrom = test.start_date ?? today
  const dateTo = test.target_end_date ?? today

  const { days, loading: metricsLoading, error: metricsError } = useTestMetrics({
    account: test.account as WindsorAccount,
    linkedCodes: test.linked_codes,
    dateFrom,
    dateTo,
  })

  const summary = useMemo(() => {
    if (!days.length) return null
    const spend = days.reduce((s, d) => s + d.spend, 0)
    const mqls = days.reduce((s, d) => s + d.mqls, 0)
    const clicks = days.reduce((s, d) => s + d.clicks, 0)
    const impr = days.reduce((s, d) => s + (d.impressions ?? 0), 0)
    return {
      spend,
      mqls,
      cpmql: mqls > 0 ? spend / mqls : null,
      cpc: clicks > 0 ? spend / clicks : null,
      ctr: impr > 0 ? (clicks / impr) * 100 : null,
      cpm: impr > 0 ? (spend / impr) * 1000 : null,
    }
  }, [days])

  const pacing = useMemo(() => {
    if (!test.budget_max || !summary || !test.start_date) return null
    const start = new Date(test.start_date).getTime()
    const end = test.target_end_date ? new Date(test.target_end_date).getTime() : Date.now()
    const now = Math.min(Date.now(), end)
    const totalDays = Math.max((end - start) / 86400000, 1)
    const elapsed = Math.max((now - start) / 86400000, 0)
    const idealSpend = test.budget_max * (elapsed / totalDays)
    const ratio = idealSpend > 0 ? summary.spend / idealSpend : 1
    const pct = (summary.spend / test.budget_max) * 100
    const daysLeft = Math.max(Math.ceil((end - Date.now()) / 86400000), 0)
    return { ratio, pct, idealSpend, daysLeft, totalDays: Math.round(totalDays) }
  }, [test, summary])

  useEffect(() => {
    async function loadDetail() {
      const [acts, flags, links] = await Promise.all([
        fetchActivity(test.id),
        fetchFlags(),
        fetchFlagLinks(test.id),
      ])
      setActivity(acts)
      setAllFlags(flags)
      const linkIds = new Set(links.map((l) => l.flag_id))
      setActiveFlags(flags.filter((f) => linkIds.has(f.id)))
    }
    loadDetail()
  }, [test.id])

  // Auto-dismiss delete confirmation after 4s
  useEffect(() => {
    if (!confirmDelete) return
    const t = setTimeout(() => setConfirmDelete(false), 4000)
    return () => clearTimeout(t)
  }, [confirmDelete])

  async function withActing(fn: () => Promise<void>) {
    setActing(true)
    try { await fn() } finally { setActing(false) }
  }

  async function handleApprove() {
    await withActing(async () => {
      await approveTest(test.id, 'Você')
      setActivity(await fetchActivity(test.id))
      onTestChange({ ...test, approval_status: 'aprovado' })
    })
  }

  async function handlePause() {
    await withActing(async () => {
      await pauseTest(test.id, 'Você')
      setActivity(await fetchActivity(test.id))
      onTestChange({ ...test, approval_status: 'pausado' })
    })
  }

  async function handleReactivate() {
    await withActing(async () => {
      await reactivateTest(test.id, 'Você')
      setActivity(await fetchActivity(test.id))
      onTestChange({ ...test, approval_status: 'aprovado' })
    })
  }

  async function handleConclude(result: NonNullable<Test['result']>) {
    setShowConcludeMenu(false)
    await withActing(async () => {
      await concludeTest(test.id, result, 'Você')
      setActivity(await fetchActivity(test.id))
      onTestChange({ ...test, approval_status: 'concluido', result })
    })
  }

  async function handleStatusChange(to: Test['status']) {
    setShowStatusMenu(false)
    if (to === test.status) return
    await withActing(async () => {
      await changeTestStatus(test.id, test.status, to, 'Você')
      setActivity(await fetchActivity(test.id))
      onTestChange({ ...test, status: to })
    })
  }

  async function handleReminder() {
    if (!reminderDate) return
    const at = new Date(reminderDate).toISOString()
    await withActing(async () => {
      await setReminder(test.id, at, 'Você')
      setActivity(await fetchActivity(test.id))
      onTestChange({ ...test, next_reminder_at: at })
    })
    setShowReminderInput(false)
    setReminderDate('')
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      await deleteTest(test.id)
      onDelete()
    } finally {
      setDeleting(false)
    }
  }

  async function fetchCampaigns() {
    setFetchingCamps(true)
    setShowCampSection(true)
    try {
      const end = today
      const start = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
      const rows = await fetchWindsorForAccount(start, end, test.account as WindsorAccount)
      const spendByCode = new Map<string, number>()
      for (const row of rows) {
        const code = extractCode(row.campaign ?? '')
        spendByCode.set(code, (spendByCode.get(code) ?? 0) + (row.spend ?? 0))
      }
      const sorted = [...spendByCode.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([code, spend]) => ({ code, spend }))
      setCampSuggestions(sorted)
    } finally {
      setFetchingCamps(false)
    }
  }

  async function toggleCode(code: string) {
    const next = test.linked_codes.includes(code)
      ? test.linked_codes.filter((c) => c !== code)
      : [...test.linked_codes, code]
    setSavingCodes(true)
    try {
      const updated = await updateTest(test.id, { linked_codes: next })
      onTestChange(updated)
    } finally {
      setSavingCodes(false)
    }
  }

  return (
    <div className="mt-2 border border-gray-100 rounded-2xl bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowStatusMenu((s) => !s)}
              className={`relative text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer ${STATUS_COLORS[test.status]}`}
            >
              {test.status}
              {showStatusMenu && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 min-w-32 py-1">
                  {STATUS_OPTIONS.map((o) => (
                    <button key={o.value} onClick={(e) => { e.stopPropagation(); handleStatusChange(o.value) }}
                      className="w-full text-left text-xs px-3 py-1.5 hover:bg-gray-50">{o.label}</button>
                  ))}
                </div>
              )}
            </button>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${APPROVAL_COLORS[test.approval_status]}`}>
              {test.approval_status}
            </span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{test.account}</span>
            {test.category && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{test.category}</span>}
          </div>
          <h3 className="text-sm font-semibold text-gray-800">{test.title}</h3>
          {test.linked_codes.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {test.linked_codes.map((c) => (
                <code key={c} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono">{c}</code>
              ))}
            </div>
          )}
          {test.hypothesis && <p className="text-xs text-gray-500 italic">{test.hypothesis}</p>}
          {activeFlags.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {activeFlags.map((f) => (
                <span key={f.id} className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">{f.label}</span>
              ))}
            </div>
          )}
        </div>
        <button onClick={onClose} className="ml-3 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg shrink-0">
          <ChevronUp size={16} />
        </button>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 px-5 py-3 bg-gray-50 border-b border-gray-100 flex-wrap">
        {acting && <Loader2 size={14} className="animate-spin text-gray-400" />}

        {test.approval_status === 'proposto' && (
          <button onClick={handleApprove} disabled={acting} className="action-btn text-green-700 bg-green-50 hover:bg-green-100">
            <CheckCircle size={13} /> Aprovar
          </button>
        )}
        {test.approval_status === 'aprovado' && (
          <button onClick={handlePause} disabled={acting} className="action-btn text-orange-700 bg-orange-50 hover:bg-orange-100">
            <Pause size={13} /> Pausar
          </button>
        )}
        {test.approval_status === 'pausado' && (
          <button onClick={handleReactivate} disabled={acting} className="action-btn text-blue-700 bg-blue-50 hover:bg-blue-100">
            <Play size={13} /> Reativar
          </button>
        )}
        {test.approval_status !== 'concluido' && (
          <div className="relative">
            <button onClick={() => setShowConcludeMenu((s) => !s)} disabled={acting}
              className="action-btn text-purple-700 bg-purple-50 hover:bg-purple-100">
              <Trophy size={13} /> Concluir
            </button>
            {showConcludeMenu && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 min-w-40 py-1">
                {RESULT_OPTIONS.map((o) => (
                  <button key={o.value} onClick={() => handleConclude(o.value)}
                    className="w-full text-left text-xs px-3 py-2 hover:bg-gray-50">{o.label}</button>
                ))}
              </div>
            )}
          </div>
        )}

        <button onClick={() => setShowFlagModal(true)} className="action-btn text-gray-600 bg-gray-100 hover:bg-gray-200">
          <Flag size={13} /> Sinalizar
        </button>

        <div className="relative">
          <button onClick={() => setShowReminderInput((s) => !s)} className="action-btn text-gray-600 bg-gray-100 hover:bg-gray-200">
            <Bell size={13} /> Lembrete
          </button>
          {showReminderInput && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 p-3 flex gap-2 items-center min-w-60">
              <input type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none" />
              <button onClick={handleReminder} disabled={!reminderDate}
                className="text-xs bg-blue-600 text-white px-2 py-1.5 rounded-lg disabled:opacity-40">OK</button>
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Edit */}
        <button onClick={() => setShowEditModal(true)}
          className="action-btn text-blue-700 bg-blue-50 hover:bg-blue-100">
          <Edit2 size={13} /> Editar
        </button>

        {/* Delete com confirmação inline */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className={`action-btn ${confirmDelete ? 'text-white bg-red-600 hover:bg-red-700' : 'text-red-600 bg-red-50 hover:bg-red-100'}`}
        >
          {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          {confirmDelete ? 'Confirmar exclusão' : 'Excluir'}
        </button>
      </div>

      {/* ── Metric summary cards ── */}
      {!metricsLoading && summary && (
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Métricas do período</p>
          <div className="grid grid-cols-6 gap-2">
            {[
              { label: 'Gasto', value: fmt(summary.spend, 'R$', 0), highlight: true },
              { label: 'MQLs', value: summary.mqls > 0 ? String(summary.mqls) : '—', highlight: true },
              { label: test.decision_metric ?? 'CPMql', value: fmt(summary.cpmql, 'R$', 0), highlight: true },
              { label: 'CPC', value: fmt(summary.cpc, 'R$', 2) },
              { label: 'CTR', value: fmtPct(summary.ctr) },
              { label: 'CPM', value: fmt(summary.cpm, 'R$', 0) },
            ].map((c) => (
              <div key={c.label} className={`rounded-xl border px-3 py-2.5 ${c.highlight ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className={`text-[10px] mb-1 ${c.highlight ? 'text-blue-500' : 'text-gray-400'}`}>{c.label}</div>
                <div className={`text-sm font-semibold ${c.highlight ? 'text-blue-700' : 'text-gray-700'}`}>{c.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Budget pacing ── */}
      {pacing && test.budget_max && summary && (
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Orçamento do teste</p>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
              pacing.ratio > 1.1 ? 'bg-red-100 text-red-700' :
              pacing.ratio < 0.9 ? 'bg-yellow-100 text-yellow-700' :
              'bg-green-100 text-green-700'
            }`}>
              {pacing.ratio > 1.1 ? 'Acima do pacing' : pacing.ratio < 0.9 ? 'Abaixo do pacing' : 'No pacing'}
            </span>
          </div>
          <div className="flex items-baseline justify-between text-xs mb-1.5">
            <span className="font-medium text-gray-700">{fmt(summary.spend, 'R$', 0)} gastos</span>
            <span className="text-gray-400">de {fmt(test.budget_max, 'R$', 0)} · {pacing.daysLeft}d restantes</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pacing.pct > 110 ? 'bg-red-400' : pacing.ratio < 0.9 ? 'bg-yellow-400' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(pacing.pct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>{pacing.pct.toFixed(0)}% do orçamento</span>
            <span>Ideal agora: {fmt(pacing.idealSpend, 'R$', 0)}</span>
          </div>
        </div>
      )}

      {/* ── Campaign selector ── */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Campanhas observadas</p>
          <button
            onClick={fetchCampaigns}
            disabled={fetchingCamps}
            className="flex items-center gap-1 text-[11px] text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
          >
            {fetchingCamps ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            Buscar campanhas ativas
          </button>
        </div>

        {/* Active codes */}
        <div className="flex flex-wrap gap-1.5">
          {test.linked_codes.length === 0 && campSuggestions.length === 0 && (
            <span className="text-xs text-gray-400">Nenhuma campanha vinculada. Clique em "Buscar campanhas ativas" para ver as campanhas da conta.</span>
          )}
          {test.linked_codes.map((c) => (
            <button
              key={c}
              onClick={() => toggleCode(c)}
              disabled={savingCodes}
              className="flex items-center gap-1 font-mono text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md hover:bg-red-50 hover:text-red-600 transition-colors border border-blue-200"
              title="Clique para remover"
            >
              {c} <X size={9} />
            </button>
          ))}

          {/* Suggestions from Windsor */}
          {showCampSection && campSuggestions
            .filter((s) => !test.linked_codes.includes(s.code))
            .map((s) => (
              <button
                key={s.code}
                onClick={() => toggleCode(s.code)}
                disabled={savingCodes}
                className="flex items-center gap-1 font-mono text-[11px] bg-gray-50 text-gray-500 px-2 py-0.5 rounded-md border border-gray-200 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                <Plus size={9} /> {s.code}
                <span className="text-[10px] opacity-60">· {fmt(s.spend, 'R$', 0)}</span>
              </button>
            ))}
        </div>
      </div>

      {/* ── Metrics chart ── */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
            <BarChart2 size={14} /> Evolução diária
          </div>
          <div className="flex gap-1">
            {METRIC_OPTIONS.map((m) => (
              <button key={m.value} onClick={() => setSelectedMetric(m.value)}
                className={`text-xs px-2 py-0.5 rounded-full transition-colors ${selectedMetric === m.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {metricsLoading ? (
          <div className="flex items-center justify-center h-40 gap-2 text-gray-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Carregando métricas...
          </div>
        ) : metricsError ? (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">
            <AlertCircle size={14} /> {metricsError}
          </div>
        ) : (
          <TestMetricsChart days={days} activity={activity} metric={selectedMetric} />
        )}
      </div>

      {/* ── Activity feed ── */}
      <div className="px-5 py-4">
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Atividade</h4>
        <TestActivityFeed
          testId={test.id}
          activity={activity}
          onNewActivity={(a) => setActivity((prev) => [a, ...prev])}
        />
      </div>

      {showFlagModal && (
        <TestFlagModal
          testId={test.id}
          allFlags={allFlags}
          activeFlags={activeFlags}
          onClose={() => setShowFlagModal(false)}
          onUpdate={(active, all) => { setActiveFlags(active); setAllFlags(all) }}
        />
      )}

      {showEditModal && (
        <TestCreateModal
          editTest={test}
          onClose={() => setShowEditModal(false)}
          onCreate={(updated) => onTestChange(updated)}
        />
      )}

      <style>{`
        .action-btn {
          display: flex; align-items: center; gap: 4px;
          font-size: 12px; padding: 4px 10px; border-radius: 8px;
          transition-property: background-color, color; transition-duration: 150ms;
          cursor: pointer; font-weight: 500;
        }
        .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  )
}
