import { useState, useRef, KeyboardEvent } from 'react'
import { X, Plus, Loader2 } from 'lucide-react'
import type { Test } from '../../api/tests'
import { createTest, updateTest } from '../../api/tests'
import type { WindsorAccount } from '../../api/windsorAccounts'

const CATEGORIES = [
  'Otimização de campanha',
  'Landing page',
  'Público',
  'Segmentação',
  'Copy / criativo',
  'Canal novo',
  'Evento (meteórico)',
]

const METRICS = [
  { value: 'CPMql', label: 'CPMql', desc: 'custo por MQL' },
  { value: 'CPC', label: 'CPC', desc: 'custo por clique' },
  { value: 'CTR', label: 'CTR', desc: 'taxa de clique' },
  { value: 'CPM', label: 'CPM', desc: 'custo por mil imp.' },
  { value: 'Taxa de conversão visitante→lead', label: 'Conv. visitante→lead', desc: 'taxa de conversão LP' },
  { value: 'Volume de MQLs', label: 'Volume MQLs', desc: 'quantidade absoluta' },
]

const OWNERS = ['Guilherme', 'Leonardo', 'Endrio', 'Lucas', 'Kleber', 'Time de Pré-Vendas', 'Time de Closer', 'Time de Tech']

const ACCOUNTS: Array<{ value: WindsorAccount; label: string; color: string; prefix: string }> = [
  { value: 'principal', label: 'Meta Principal',   color: 'bg-blue-500',   prefix: 'F' },
  { value: 'lab',       label: 'Meta Lab',         color: 'bg-purple-500', prefix: 'F' },
  { value: 'google',    label: 'Google Ads',        color: 'bg-red-500',    prefix: 'G' },
  { value: 'bing',      label: 'Bing Ads',          color: 'bg-teal-500',   prefix: 'B' },
  { value: 'linkedin',  label: 'LinkedIn Ads',      color: 'bg-indigo-600', prefix: 'L' },
  { value: 'tiktok',    label: 'TikTok Ads',        color: 'bg-gray-900',   prefix: 'T' },
  { value: 'openai',    label: 'OpenAI Ads',        color: 'bg-emerald-600',prefix: 'C' },
]

const SUGGESTIONS: Record<WindsorAccount, string[]> = {
  principal: ['F177', 'F175', 'F143', 'F186', 'F113', 'F211', 'financial-c'],
  lab:       ['F001C1', 'F002C1', 'F003C1', 'F004C1'],
  google:    ['G67', 'G86', 'G85', 'G77', 'G35'],
  bing:      ['B01', 'B02'],
  linkedin:  ['L01', 'L02'],
  tiktok:    ['T01', 'T02'],
  openai:    ['C01', 'C02'],
}

const STATUS_OPTS: Array<{ value: Test['status']; color: string; label: string }> = [
  { value: 'verde', color: 'bg-green-400', label: 'Verde' },
  { value: 'amarelo', color: 'bg-yellow-400', label: 'Amarelo' },
  { value: 'laranja', color: 'bg-orange-400', label: 'Laranja' },
  { value: 'vermelho', color: 'bg-red-400', label: 'Vermelho' },
]

interface Props {
  onClose: () => void
  onCreate: (t: Test) => void
  editTest?: Test
}

export default function TestCreateModal({ onClose, onCreate, editTest }: Props) {
  const isEdit = !!editTest
  const [title, setTitle] = useState(editTest?.title ?? '')
  const [hypothesis, setHypothesis] = useState(editTest?.hypothesis ?? '')
  const [category, setCategory] = useState(editTest?.category ?? '')
  const [account, setAccount] = useState<WindsorAccount>((editTest?.account as WindsorAccount) ?? 'principal')
  const [linkedCodes, setLinkedCodes] = useState<string[]>(editTest?.linked_codes ?? [])
  const [codeInput, setCodeInput] = useState('')
  const [decisionMetric, setDecisionMetric] = useState(editTest?.decision_metric ?? 'CPMql')
  const [mode, setMode] = useState<'finito' | 'continuo'>(editTest?.mode ?? 'finito')
  const [startDate, setStartDate] = useState(editTest?.start_date ?? '')
  const [targetEndDate, setTargetEndDate] = useState(editTest?.target_end_date ?? '')
  const [owner, setOwner] = useState(editTest?.owner ?? 'Léo')
  const [status, setStatus] = useState<Test['status']>(editTest?.status ?? 'verde')
  const [budgetMax, setBudgetMax] = useState(editTest?.budget_max ? String(editTest.budget_max) : '')
  const [saving, setSaving] = useState(false)
  const [titleError, setTitleError] = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)

  function addCode(code: string) {
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9_\-]/g, '')
    if (!c || linkedCodes.includes(c)) return
    setLinkedCodes((prev) => [...prev, c])
    setCodeInput('')
  }

  function removeCode(code: string) {
    setLinkedCodes((prev) => prev.filter((c) => c !== code))
  }

  function handleCodeKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault()
      addCode(codeInput)
    } else if (e.key === 'Backspace' && !codeInput && linkedCodes.length) {
      setLinkedCodes((prev) => prev.slice(0, -1))
    }
  }

  async function handleSubmit() {
    if (!title.trim()) { setTitleError(true); return }
    setSaving(true)
    const payload = {
      title: title.trim(),
      hypothesis: hypothesis.trim() || null,
      decision_metric: decisionMetric,
      account,
      linked_codes: linkedCodes,
      category: category || null,
      mode,
      status,
      owner: owner || null,
      start_date: startDate || null,
      target_end_date: targetEndDate || null,
      budget_max: budgetMax ? parseFloat(budgetMax.replace(',', '.')) : null,
    }
    try {
      if (isEdit && editTest) {
        const t = await updateTest(editTest.id, payload)
        onCreate(t)
      } else {
        const t = await createTest({
          ...payload,
          approval_status: 'proposto',
          result: null,
          next_reminder_at: null,
          parent_test_id: null,
        })
        onCreate(t)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const suggestions = SUGGESTIONS[account].filter((s) => !linkedCodes.includes(s))

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-gray-200 w-full max-w-[580px] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">{isEdit ? 'Editar teste' : 'Novo teste'}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-5">

          {/* ── Identificação ── */}
          <section>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Identificação</p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  Título <span className="text-red-400">*</span>
                </label>
                <input
                  autoFocus
                  type="text"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setTitleError(false) }}
                  placeholder="ex.: Evento MQL como otimização vs. Lead Acelerador"
                  className={`w-full text-sm border rounded-xl px-3 py-2 outline-none transition-colors ${
                    titleError ? 'border-red-300 bg-red-50' : 'border-gray-200 focus:border-blue-400'
                  }`}
                />
                {titleError && <p className="text-[11px] text-red-500 mt-1">Informe um título para o teste.</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Categoria</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-blue-400 bg-white"
                  >
                    <option value="">Sem categoria</option>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Hipótese (resumo)</label>
                  <input
                    type="text"
                    value={hypothesis}
                    onChange={(e) => setHypothesis(e.target.value)}
                    placeholder="ex.: MQL como evento reduz CPMql"
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-blue-400"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ── Conta e campanhas ── */}
          <section>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Conta e campanhas vinculadas</p>

            {/* Account selector */}
            <div className="flex flex-wrap gap-2 mb-3">
              {ACCOUNTS.map((a) => (
                <button
                  key={a.value}
                  onClick={() => { setAccount(a.value); setLinkedCodes([]) }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                    account === a.value
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${a.color}`} />
                  {a.label}
                </button>
              ))}
            </div>

            {/* Tags input */}
            <div
              className="flex flex-wrap gap-1.5 px-2.5 py-2 border border-gray-200 rounded-xl min-h-[38px] cursor-text focus-within:border-blue-400 transition-colors"
              onClick={() => codeInputRef.current?.focus()}
            >
              {linkedCodes.map((c) => (
                <span
                  key={c}
                  onClick={(e) => { e.stopPropagation(); removeCode(c) }}
                  className="flex items-center gap-1 font-mono text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md cursor-pointer hover:bg-red-50 hover:text-red-600 transition-colors"
                  title="Clique para remover"
                >
                  {c} ×
                </span>
              ))}
              <input
                ref={codeInputRef}
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                onKeyDown={handleCodeKey}
                onBlur={() => codeInput && addCode(codeInput)}
                placeholder={linkedCodes.length ? '' : 'Código de campanha (Enter para adicionar)...'}
                className="flex-1 text-xs outline-none bg-transparent min-w-24 placeholder-gray-400"
              />
            </div>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                <span className="text-[11px] text-gray-400">Sugestões:</span>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => addCode(s)}
                    className="font-mono text-[11px] px-2 py-0.5 rounded-md border border-gray-200 bg-white text-gray-500 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition-colors flex items-center gap-1"
                  >
                    <Plus size={9} /> {s}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ── Métrica de sucesso ── */}
          <section>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Como medir o sucesso</p>
            <div className="grid grid-cols-3 gap-2">
              {METRICS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setDecisionMetric(m.value)}
                  className={`py-2.5 px-3 rounded-xl border text-center transition-colors ${
                    decisionMetric === m.value
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className={`text-xs font-semibold ${decisionMetric === m.value ? 'text-blue-700' : 'text-gray-700'}`}>
                    {m.label}
                  </div>
                  <div className={`text-[10px] mt-0.5 ${decisionMetric === m.value ? 'text-blue-500' : 'text-gray-400'}`}>
                    {m.desc}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* ── Período e responsável ── */}
          <section>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Período e responsável</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {/* Finito / Contínuo */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Tipo</label>
                <div className="flex bg-gray-100 rounded-xl p-0.5">
                  {(['finito', 'continuo'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`flex-1 text-xs py-1.5 rounded-lg transition-colors font-medium ${
                        mode === m ? 'bg-white shadow-sm text-gray-700' : 'text-gray-500'
                      }`}
                    >
                      {m === 'finito' ? 'Finito (com prazo)' : 'Contínuo'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Owner */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Responsável</label>
                <select
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-blue-400 bg-white"
                >
                  {OWNERS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>

            {/* Orçamento máximo */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                Orçamento máximo do teste <span className="text-gray-400">(opcional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value.replace(/[^0-9,.]/g, ''))}
                  placeholder="ex.: 20000"
                  className="w-full text-sm border border-gray-200 rounded-xl pl-9 pr-3 py-2 outline-none focus:border-blue-400"
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Define o limite de gasto para acompanhar o pacing no detalhe do teste.</p>
            </div>

            {/* Datas — só se finito */}
            {mode === 'finito' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Início</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Término previsto</label>
                  <input
                    type="date"
                    value={targetEndDate}
                    onChange={(e) => setTargetEndDate(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-blue-400"
                  />
                </div>
              </div>
            )}
          </section>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100">
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-gray-400">Status inicial:</span>
            {STATUS_OPTS.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatus(s.value)}
                title={s.label}
                className={`w-6 h-6 rounded-full transition-all ${s.color} ${
                  status === s.value ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : 'opacity-60 hover:opacity-100'
                }`}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-sm px-4 py-1.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              {isEdit ? 'Salvar alterações' : 'Criar teste'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
