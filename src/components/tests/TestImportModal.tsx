import { useState } from 'react'
import { X, Copy, Check, AlertCircle, Loader2, FileJson, ChevronDown, ChevronUp } from 'lucide-react'
import {
  createTest, fetchFlags, createFlag, addFlagLink, insertActivityWithDate,
} from '../../api/tests'
import type { Test, TestActivity } from '../../api/tests'

// ── JSON template shown to the user ───────────────────────────────────────────

const TEMPLATE = [
  {
    // ── Identificação ──────────────────────────────────
    title: 'Nome do teste (obrigatório)',
    category: 'Criativo',                    // texto livre: 'Criativo' | 'Oferta' | 'Público' | etc
    hypothesis: 'Se mudarmos X, então Y acontece porque Z.',

    // ── Conta & campanhas ──────────────────────────────
    account: 'principal',                    // 'principal' | 'lab' | 'google' | 'bing' | 'linkedin' | 'tiktok' | 'openai'
    linked_codes: ['F177', 'F175'],          // códigos de campanha/adset

    // ── Como medir ─────────────────────────────────────
    decision_metric: 'CPMql',               // métrica de decisão: 'CPMql' | 'CPC' | 'CTR' | 'CPM' | ...
    budget_max: 20000,                       // orçamento máximo (número) ou null

    // ── Período & responsável ──────────────────────────
    mode: 'finito',                          // 'finito' | 'continuo'
    start_date: '2026-08-01',               // YYYY-MM-DD ou null
    target_end_date: '2026-09-01',          // YYYY-MM-DD ou null
    owner: 'Leo',                            // responsável (texto livre) ou null

    // ── Status ─────────────────────────────────────────
    status: 'verde',                         // 'verde' | 'amarelo' | 'laranja' | 'vermelho'
    approval_status: 'aprovado',             // 'proposto' | 'aprovado' | 'pausado' | 'concluido'
    result: null,                            // null | 'vitoria' | 'derrota' | 'inconclusivo'

    // ── Outros ─────────────────────────────────────────
    parent_test_id: null,                    // UUID de teste pai ou null
    next_reminder_at: null,                  // ISO datetime ou null (ex: '2026-09-01T09:00:00Z')

    // ── Sinalizadores ──────────────────────────────────
    // Labels de flags; criadas automaticamente se não existirem
    flags: ['Precisa de revisão', 'Bloqueado'],

    // ── Histórico de atividade ─────────────────────────
    // Importado em ordem cronológica; created_at é opcional (usa agora se omitido)
    activity: [
      {
        activity_type: 'approval',           // tipo — ver lista abaixo
        author: 'Leo',
        text: null,
        metadata: null,
        created_at: '2026-08-01T09:00:00Z', // opcional — preserva data original
      },
      {
        activity_type: 'comment',
        author: 'Leo',
        text: 'F177 com CPMql R$28, dentro da meta. Seguindo.',
        metadata: null,
        created_at: '2026-08-10T14:30:00Z',
      },
      {
        activity_type: 'status_change',
        author: 'Leo',
        text: null,
        metadata: { from: 'amarelo', to: 'verde' },
        created_at: '2026-08-15T10:00:00Z',
      },
      {
        activity_type: 'concluded',
        author: 'Leo',
        text: null,
        metadata: { result: 'vitoria' },
        created_at: '2026-09-01T08:00:00Z',
      },
    ],
    // Tipos de activity_type aceitos:
    // 'comment' | 'attachment' | 'approval' | 'flag_added' | 'flag_removed'
    // 'reminder_set' | 'paused' | 'reactivated' | 'status_change' | 'concluded'
  },
]

// ── Validation ────────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = ['title', 'account', 'linked_codes', 'mode', 'status', 'approval_status'] as const
const VALID_ACCOUNT = ['principal', 'lab', 'google', 'bing', 'linkedin', 'tiktok', 'openai']
const VALID_MODE = ['finito', 'continuo']
const VALID_STATUS = ['verde', 'amarelo', 'laranja', 'vermelho']
const VALID_APPROVAL = ['proposto', 'aprovado', 'pausado', 'concluido']
const VALID_RESULT = ['vitoria', 'derrota', 'inconclusivo', null]
const VALID_ACTIVITY_TYPES = [
  'comment', 'attachment', 'approval', 'flag_added', 'flag_removed',
  'reminder_set', 'paused', 'reactivated', 'status_change', 'concluded',
]

type RawRecord = Record<string, unknown>
type RawActivity = { activity_type?: string; author?: string; text?: string | null; metadata?: RawRecord | null; created_at?: string }

interface ValidationError { field: string; message: string }

function validateItem(raw: RawRecord, index: number): ValidationError[] {
  const errs: ValidationError[] = []
  for (const f of REQUIRED_FIELDS) {
    const v = raw[f]
    if (v === undefined || v === null || v === '') errs.push({ field: f, message: `campo obrigatório ausente: "${f}"` })
  }
  if (raw.account && !VALID_ACCOUNT.includes(raw.account as string))
    errs.push({ field: 'account', message: `"account" deve ser: principal | lab | google | bing | linkedin | tiktok | openai` })
  if (raw.mode && !VALID_MODE.includes(raw.mode as string))
    errs.push({ field: 'mode', message: `"mode" deve ser 'finito' ou 'continuo'` })
  if (raw.status && !VALID_STATUS.includes(raw.status as string))
    errs.push({ field: 'status', message: `"status" deve ser verde | amarelo | laranja | vermelho` })
  if (raw.approval_status && !VALID_APPROVAL.includes(raw.approval_status as string))
    errs.push({ field: 'approval_status', message: `"approval_status" deve ser proposto | aprovado | pausado | concluido` })
  if ('result' in raw && !VALID_RESULT.includes(raw.result as string | null))
    errs.push({ field: 'result', message: `"result" deve ser vitoria | derrota | inconclusivo | null` })
  if ('linked_codes' in raw && !Array.isArray(raw.linked_codes))
    errs.push({ field: 'linked_codes', message: `"linked_codes" deve ser array de strings` })
  if ('budget_max' in raw && raw.budget_max !== null && typeof raw.budget_max !== 'number')
    errs.push({ field: 'budget_max', message: `"budget_max" deve ser número ou null` })
  if ('flags' in raw && raw.flags !== undefined && !Array.isArray(raw.flags))
    errs.push({ field: 'flags', message: `"flags" deve ser array de strings` })
  if ('activity' in raw && raw.activity !== undefined && !Array.isArray(raw.activity))
    errs.push({ field: 'activity', message: `"activity" deve ser array de objetos` })
  if (Array.isArray(raw.activity)) {
    ;(raw.activity as RawActivity[]).forEach((a, ai) => {
      if (a.activity_type && !VALID_ACTIVITY_TYPES.includes(a.activity_type))
        errs.push({ field: `activity[${ai}].activity_type`, message: `tipo inválido: "${a.activity_type}"` })
    })
  }
  void index
  return errs
}

function buildPayload(raw: RawRecord): Omit<Test, 'id' | 'created_at' | 'updated_at'> {
  return {
    title: String(raw.title),
    account: raw.account as Test['account'],
    linked_codes: (raw.linked_codes as string[]) ?? [],
    mode: (raw.mode as Test['mode']) ?? 'finito',
    status: (raw.status as Test['status']) ?? 'verde',
    approval_status: (raw.approval_status as Test['approval_status']) ?? 'proposto',
    category: (raw.category as string | null) ?? null,
    hypothesis: (raw.hypothesis as string | null) ?? null,
    decision_metric: (raw.decision_metric as string | null) ?? null,
    owner: (raw.owner as string | null) ?? null,
    start_date: (raw.start_date as string | null) ?? null,
    target_end_date: (raw.target_end_date as string | null) ?? null,
    budget_max: typeof raw.budget_max === 'number' ? raw.budget_max : null,
    result: (raw.result as Test['result']) ?? null,
    parent_test_id: (raw.parent_test_id as string | null) ?? null,
    next_reminder_at: (raw.next_reminder_at as string | null) ?? null,
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ParsedItem {
  raw: RawRecord
  errors: ValidationError[]
}

type ItemStatus = 'pending' | 'importing' | 'done' | 'error'

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
  onImported: (tests: Test[]) => void
}

export default function TestImportModal({ onClose, onImported }: Props) {
  const [json, setJson] = useState('')
  const [showTemplate, setShowTemplate] = useState(false)
  const [copied, setCopied] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [items, setItems] = useState<ParsedItem[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [statusMap, setStatusMap] = useState<Record<number, ItemStatus>>({})
  const [detailMap, setDetailMap] = useState<Record<number, string>>({})
  const [done, setDone] = useState(false)

  const templateJson = JSON.stringify(TEMPLATE, null, 2)

  function copyTemplate() {
    navigator.clipboard.writeText(templateJson).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function parse() {
    setParseError(null)
    setItems(null)
    setStatusMap({})
    setDetailMap({})
    setDone(false)
    let parsed: unknown
    try {
      parsed = JSON.parse(json.trim())
    } catch (e) {
      setParseError(`JSON inválido: ${(e as Error).message}`)
      return
    }
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    const result: ParsedItem[] = arr.map((raw, i) => {
      const obj = typeof raw === 'object' && raw !== null ? (raw as RawRecord) : {}
      return { raw: obj, errors: validateItem(obj, i) }
    })
    setItems(result)
  }

  async function runImport() {
    if (!items) return
    const valid = items.filter((it) => it.errors.length === 0)
    if (!valid.length) return

    setImporting(true)
    const created: Test[] = []

    // Pre-fetch existing flags once to avoid N+1 fetches per test
    let existingFlags = await fetchFlags()

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.errors.length > 0) continue

      setStatusMap((prev) => ({ ...prev, [i]: 'importing' }))
      setDetailMap((prev) => ({ ...prev, [i]: 'criando teste…' }))

      try {
        // 1. Create test
        const test = await createTest(buildPayload(item.raw))
        created.push(test)

        // 2. Import flags
        const flagLabels = Array.isArray(item.raw.flags) ? (item.raw.flags as string[]) : []
        if (flagLabels.length > 0) {
          setDetailMap((prev) => ({ ...prev, [i]: 'vinculando flags…' }))
          for (const label of flagLabels) {
            let flag = existingFlags.find((f) => f.label.toLowerCase() === label.toLowerCase())
            if (!flag) {
              flag = await createFlag(label)
              existingFlags = [...existingFlags, flag]
            }
            await addFlagLink(test.id, flag.id)
          }
        }

        // 3. Import activity — sorted by created_at ascending (oldest first)
        const rawActivity = Array.isArray(item.raw.activity) ? (item.raw.activity as RawActivity[]) : []
        if (rawActivity.length > 0) {
          setDetailMap((prev) => ({ ...prev, [i]: `importando ${rawActivity.length} atividade(s)…` }))
          const sorted = [...rawActivity].sort((a, b) => {
            const ta = a.created_at ? new Date(a.created_at).getTime() : 0
            const tb = b.created_at ? new Date(b.created_at).getTime() : 0
            return ta - tb
          })
          for (const act of sorted) {
            const payload: Omit<TestActivity, 'id'> = {
              test_id: test.id,
              activity_type: (act.activity_type ?? 'comment') as TestActivity['activity_type'],
              author: act.author ?? null,
              text: act.text ?? null,
              attachment_url: null,
              metadata: act.metadata ?? null,
              created_at: act.created_at ?? new Date().toISOString(),
            }
            await insertActivityWithDate(payload)
          }
        }

        setStatusMap((prev) => ({ ...prev, [i]: 'done' }))
        setDetailMap((prev) => ({ ...prev, [i]: '' }))
      } catch (e) {
        setStatusMap((prev) => ({ ...prev, [i]: 'error' }))
        setDetailMap((prev) => ({ ...prev, [i]: (e as Error).message }))
      }
    }

    setImporting(false)
    setDone(true)
    if (created.length > 0) onImported(created)
  }

  const validCount = items ? items.filter((it) => it.errors.length === 0).length : 0
  const invalidCount = items ? items.filter((it) => it.errors.length > 0).length : 0

  function activitySummary(raw: RawRecord): string {
    const acts = Array.isArray(raw.activity) ? raw.activity as RawActivity[] : []
    const flags = Array.isArray(raw.flags) ? raw.flags as string[] : []
    const parts: string[] = []
    if (acts.length) parts.push(`${acts.length} atividade${acts.length !== 1 ? 's' : ''}`)
    if (flags.length) parts.push(`${flags.length} flag${flags.length !== 1 ? 's' : ''}`)
    return parts.join(' · ')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <FileJson size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-800">Importar testes via JSON</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">

          {/* Template section */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowTemplate((s) => !s)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-xs font-medium text-gray-600"
            >
              <span>Ver modelo completo (todos os campos disponíveis)</span>
              {showTemplate ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showTemplate && (
              <div className="relative">
                <button
                  onClick={copyTemplate}
                  className="absolute top-2 right-2 flex items-center gap-1 text-[11px] bg-white border border-gray-200 px-2 py-1 rounded-lg text-gray-500 hover:text-gray-700 shadow-sm z-10"
                >
                  {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
                <pre className="bg-gray-950 text-green-300 text-[11px] leading-relaxed p-4 overflow-x-auto font-mono max-h-96">
                  {templateJson}
                </pre>
              </div>
            )}
          </div>

          {/* Field guide */}
          {!items && (
            <div className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 leading-relaxed">
              <p className="font-medium text-blue-700 mb-1.5">O JSON suporta importação completa de testes em andamento:</p>
              <ul className="flex flex-col gap-0.5 list-disc list-inside">
                <li><span className="font-mono text-gray-700">activity</span> — array com todo o histórico (comentários, aprovações, mudanças de status, conclusões…)</li>
                <li><span className="font-mono text-gray-700">flags</span> — array de labels de sinalizadores; criados automaticamente se não existirem</li>
                <li><span className="font-mono text-gray-700">created_at</span> em cada atividade — preserva a data original do evento</li>
                <li>Todos os outros campos são opcionais exceto <span className="font-mono text-gray-700">title</span>, <span className="font-mono text-gray-700">account</span>, <span className="font-mono text-gray-700">linked_codes</span>, <span className="font-mono text-gray-700">mode</span>, <span className="font-mono text-gray-700">status</span>, <span className="font-mono text-gray-700">approval_status</span></li>
              </ul>
            </div>
          )}

          {/* Paste area */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-gray-600">Cole o JSON aqui</label>
            <textarea
              value={json}
              onChange={(e) => { setJson(e.target.value); setItems(null); setParseError(null); setDone(false) }}
              placeholder={'[\n  {\n    "title": "...",\n    "account": "principal",\n    "activity": [...]\n  }\n]'}
              className="w-full h-44 text-xs font-mono border border-gray-200 rounded-xl p-3 outline-none focus:border-blue-400 resize-none bg-gray-50"
              spellCheck={false}
            />
            {parseError && (
              <div className="flex items-start gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                {parseError}
              </div>
            )}
          </div>

          {/* Parse button */}
          {!items && (
            <button
              onClick={parse}
              disabled={!json.trim()}
              className="self-start text-sm font-medium bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              Validar JSON
            </button>
          )}

          {/* Preview */}
          {items && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 text-xs">
                <span className="text-gray-500">{items.length} item{items.length !== 1 ? 's' : ''}</span>
                {validCount > 0 && <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded-full">{validCount} válido{validCount !== 1 ? 's' : ''}</span>}
                {invalidCount > 0 && <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded-full">{invalidCount} com erro</span>}
              </div>

              <div className="flex flex-col gap-2">
                {items.map((item, i) => {
                  const st = statusMap[i]
                  const hasErrors = item.errors.length > 0
                  const detail = detailMap[i]
                  const summary = activitySummary(item.raw)
                  return (
                    <div
                      key={i}
                      className={`rounded-xl border px-4 py-3 text-xs ${
                        st === 'done' ? 'bg-green-50 border-green-200' :
                        st === 'error' ? 'bg-red-50 border-red-200' :
                        hasErrors ? 'bg-red-50 border-red-200' :
                        'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {st === 'importing' && <Loader2 size={12} className="animate-spin text-blue-500 shrink-0" />}
                          {st === 'done' && <Check size={12} className="text-green-600 shrink-0" />}
                          {(st === 'error' || (!st && hasErrors)) && <AlertCircle size={12} className="text-red-500 shrink-0" />}
                          <span className="font-medium text-gray-700 truncate">
                            {(item.raw.title as string) || `Item ${i + 1}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                          {item.raw.account && (
                            <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                              {item.raw.account as string}
                            </span>
                          )}
                          {summary && <span className="text-gray-400">{summary}</span>}
                        </div>
                      </div>

                      {/* Importing detail */}
                      {st === 'importing' && detail && (
                        <p className="mt-1 text-blue-500">{detail}</p>
                      )}

                      {/* Validation errors */}
                      {hasErrors && (
                        <div className="mt-2 flex flex-col gap-0.5">
                          {item.errors.map((e, j) => (
                            <span key={j} className="text-red-600">{e.message}</span>
                          ))}
                        </div>
                      )}

                      {/* Runtime error */}
                      {st === 'error' && detail && (
                        <p className="mt-1 text-red-600">{detail}</p>
                      )}

                      {/* Activity preview (only when valid and not yet importing) */}
                      {!hasErrors && !st && Array.isArray(item.raw.activity) && (item.raw.activity as RawActivity[]).length > 0 && (
                        <div className="mt-2 flex flex-col gap-0.5 border-t border-gray-200 pt-2">
                          {(item.raw.activity as RawActivity[]).slice(0, 3).map((a, j) => (
                            <div key={j} className="flex items-baseline gap-1.5 text-[10px] text-gray-400">
                              <span className="font-medium text-gray-500">{a.activity_type}</span>
                              {a.text && <span className="truncate">{a.text}</span>}
                              {a.created_at && <span className="ml-auto shrink-0">{a.created_at.slice(0, 10)}</span>}
                            </div>
                          ))}
                          {(item.raw.activity as RawActivity[]).length > 3 && (
                            <span className="text-[10px] text-gray-400">
                              + {(item.raw.activity as RawActivity[]).length - 3} mais…
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {done ? (
                <div className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3 text-center font-medium">
                  {validCount} teste{validCount !== 1 ? 's' : ''} importado{validCount !== 1 ? 's' : ''} com sucesso!
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setItems(null); setParseError(null) }}
                    className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50"
                  >
                    Editar JSON
                  </button>
                  <button
                    onClick={runImport}
                    disabled={validCount === 0 || importing}
                    className="flex items-center gap-1.5 text-sm font-medium bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  >
                    {importing && <Loader2 size={13} className="animate-spin" />}
                    Importar {validCount} teste{validCount !== 1 ? 's' : ''}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
