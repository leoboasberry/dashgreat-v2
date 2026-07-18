import { useState, useRef, useCallback } from 'react'
import { Upload, CheckCircle2, XCircle, AlertCircle, Loader2, Search, Database } from 'lucide-react'
import type { PageData } from '../../hooks/useDashboard'
import type { CrmRow, CrmEventType } from '../../utils/parseCrmCsv'
import { parseCrmCsvText, EVENT_TYPE_LABELS } from '../../utils/parseCrmCsv'
import { fetchExistingIndex, upsertCrmRows } from '../../api/supabaseInsert'

interface Props {
  pages: PageData[]
}

type Step = 'upload' | 'preview' | 'checking' | 'ready' | 'importing' | 'done'

const EVENT_TYPES: CrmEventType[] = [
  'mql', 'sql', 'opportunity', 'meeting_completed', 'deal_won', 'deal_lost',
]

/** Build email → {pagina (page ID), pageTitle, utmCampaign, utmSource} from GreatPages leads */
function buildEmailMap(pages: PageData[]) {
  const map = new Map<string, { pagina: string; pageTitle: string; utmCampaign: string | null; utmSource: string | null }>()
  for (const page of pages) {
    const leads = page.leads?.retorno?.paginas?.leads ?? []
    for (const row of leads) {
      let email = ''
      let utmCampaign: string | null = null
      let utmSource: string | null = null
      for (const field of row) {
        const key = field.titulo
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .toLowerCase()
          .replace(/[\s_\-.]/g, '')
        if ((key === 'email' || key.startsWith('email') || key.endsWith('email')) && field.valor.includes('@')) {
          email = field.valor.toLowerCase().trim()
        }
        if (key === 'utmcampaign') utmCampaign = field.valor || null
        if (key === 'utmsource') utmSource = field.valor?.toLowerCase() || null
      }
      if (email && !map.has(email)) {
        map.set(email, {
          pagina: page.summary.id,
          pageTitle: page.summary.titulo,
          utmCampaign,
          utmSource,
        })
      }
    }
  }
  return map
}

function enrichRows(rows: CrmRow[], emailMap: ReturnType<typeof buildEmailMap>): CrmRow[] {
  return rows.map((r) => {
    const match = r.emailNorm ? emailMap.get(r.emailNorm) : undefined
    if (!match) return r
    return {
      ...r,
      pagina: match.pagina,
      pageId: match.pagina,
      // Use GreatPages UTMs if CSV doesn't have them
      utmCampaign: r.utmCampaign || match.utmCampaign,
      utmSource: r.utmSource || match.utmSource,
      enriched: true,
    }
  })
}

export default function BackfillSection({ pages }: Props) {
  const [eventType, setEventType] = useState<CrmEventType>('mql')
  const [step, setStep] = useState<Step>('upload')
  const [rows, setRows] = useState<CrmRow[]>([])
  const [skipped, setSkipped] = useState(0)
  const [progress, setProgress] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)
  const [importResult, setImportResult] = useState<{ ok: number; err: number; errors: string[] } | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const leadsLoaded = pages.some((p) => p.leads)
  const missingSupabase = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY

  const processFile = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        if (!text) return
        const { rows: parsed, skipped: sk } = parseCrmCsvText(text, eventType)
        const emailMap = buildEmailMap(pages)
        const enriched = enrichRows(parsed, emailMap)
        setRows(enriched)
        setSkipped(sk)
        setStep('preview')
        setImportResult(null)
      }
      reader.readAsText(file, 'utf-8')
    },
    [eventType, pages],
  )

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.csv')) processFile(file)
  }

  async function handleCheck() {
    setStep('checking')
    setCheckError(null)
    const { index, error } = await fetchExistingIndex(rows, eventType)
    if (error) {
      setCheckError(error)
      setStep('preview')
      return
    }
    const updated = rows.map((r) => {
      const byDeal = index.byDealId.has(r.dealId)
      const emailCampaignKey = r.emailNorm && r.utmCampaign ? `${r.emailNorm}|${r.utmCampaign}` : null
      const byEmailCampaign = !!emailCampaignKey && index.byEmailCampaign.has(emailCampaignKey)
      return {
        ...r,
        existsInSupabase: byDeal || byEmailCampaign,
        dupeReason: byDeal ? 'deal_id' as const : byEmailCampaign ? 'email+utm' as const : null,
      }
    })
    setRows(updated)
    setStep('ready')
  }

  async function handleImport() {
    setStep('importing')
    setProgress(0)
    setProgressTotal(rows.filter((r) => !r.existsInSupabase).length)
    const result = await upsertCrmRows(rows, (done, total) => {
      setProgress(done)
      setProgressTotal(total)
    })
    setImportResult(result)
    setStep('done')
  }

  function reset() {
    setRows([])
    setSkipped(0)
    setStep('upload')
    setImportResult(null)
    setProgress(0)
    setCheckError(null)
  }

  const newRows = rows.filter((r) => !r.existsInSupabase)
  const existingRows = rows.filter((r) => r.existsInSupabase)
  const enrichedCount = rows.filter((r) => r.enriched).length

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Backfill CRM → Supabase</h2>
        <p className="text-sm text-gray-500">
          Importe listas do CRM para complementar eventos que não foram registrados no banco de dados.
          Os eventos já existentes não são alterados.
        </p>
      </div>

      {missingSupabase && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={15} className="shrink-0" />
          Supabase não configurado — adicione <code className="bg-amber-100 px-1 rounded">VITE_SUPABASE_URL</code> e{' '}
          <code className="bg-amber-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> nas variáveis de ambiente.
        </div>
      )}

      {!leadsLoaded && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-600 px-4 py-3 rounded-xl text-sm">
          <Loader2 size={14} className="animate-spin shrink-0" />
          Carregando leads do GreatPages para enriquecimento... aguarde ou importe sem enriquecimento.
        </div>
      )}

      {/* Step 1: event type + upload */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4">
        {/* Event type */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Tipo de evento</p>
          <div className="flex flex-wrap gap-2">
            {EVENT_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => { setEventType(t); reset() }}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  eventType === t
                    ? 'bg-[#0D2F9F] text-white border-[#0D2F9F]'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {EVENT_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Drop zone */}
        {step === 'upload' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
              dragging ? 'border-[#0D2F9F] bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <Upload size={28} className="text-gray-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">Arraste o CSV do CRM ou clique para selecionar</p>
              <p className="text-xs text-gray-400 mt-0.5">Mesmo formato exportado pelo CRM • Tipo: {EVENT_TYPE_LABELS[eventType]}</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          </div>
        )}
      </div>

      {/* Step 2+: Preview & actions */}
      {rows.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <StatChip label="No CSV" value={rows.length} color="gray" />
              <StatChip label="Pulados" value={skipped} color="gray" />
              <StatChip label="Enriquecidos" value={enrichedCount} color="blue" />
              {step === 'ready' || step === 'done' ? (
                <>
                  <StatChip label="Novos" value={newRows.length} color="green" />
                  <StatChip label="Já existem" value={existingRows.length} color="amber" />
                </>
              ) : (
                <span className="text-xs text-gray-400 italic">
                  Verifique no Supabase para ver novos vs. duplicados
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {/* Change file */}
              <button
                onClick={() => { reset(); setTimeout(() => fileRef.current?.click(), 50) }}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Trocar arquivo
              </button>

              {/* Check Supabase */}
              {(step === 'preview' || step === 'ready') && (
                <button
                  onClick={handleCheck}
                  disabled={missingSupabase}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Search size={12} />
                  Verificar Supabase
                </button>
              )}

              {/* Import button */}
              {(step === 'ready' || step === 'preview') && (
                <button
                  onClick={handleImport}
                  disabled={missingSupabase || (step === 'ready' && newRows.length === 0)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-lg bg-[#0D2F9F] text-white hover:bg-[#0a2480] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Database size={12} />
                  {step === 'ready'
                    ? `Importar ${newRows.length} novos`
                    : `Importar todos (${rows.length})`}
                </button>
              )}

              {step === 'done' && (
                <button
                  onClick={reset}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Nova importação
                </button>
              )}
            </div>
          </div>

          {/* Check error */}
          {checkError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              <XCircle size={15} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Erro ao verificar Supabase</p>
                <p className="text-xs mt-0.5 font-mono">{checkError}</p>
              </div>
            </div>
          )}

          {/* Import progress */}
          {step === 'importing' && progressTotal > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-3">
              <Loader2 size={16} className="animate-spin text-[#0D2F9F] shrink-0" />
              <div className="flex-1">
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#0D2F9F] transition-all duration-300"
                    style={{ width: `${(progress / progressTotal) * 100}%` }}
                  />
                </div>
              </div>
              <span className="text-xs text-gray-500 shrink-0">{progress}/{progressTotal}</span>
            </div>
          )}

          {/* Import result */}
          {step === 'done' && importResult && (
            <div className={`flex flex-col gap-2 px-4 py-3 rounded-xl border text-sm ${
              importResult.err === 0
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}>
              <div className="flex items-center gap-2 font-medium">
                {importResult.err === 0 ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                {importResult.ok} evento(s) importado(s)
                {importResult.err > 0 && `, ${importResult.err} com erro`}
              </div>
              {importResult.errors.map((e, i) => (
                <p key={i} className="text-xs">{e}</p>
              ))}
            </div>
          )}

          {/* Preview table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Preview — primeiros {Math.min(rows.length, 50)} de {rows.length}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 whitespace-nowrap">Deal</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 whitespace-nowrap">Email</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 whitespace-nowrap">Data</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 whitespace-nowrap">UTM Campaign</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 whitespace-nowrap">Página (GP)</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r) => (
                    <tr key={r.eventId} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2 text-gray-700 max-w-[160px] truncate" title={r.dealName}>
                        {r.dealName || r.dealId}
                      </td>
                      <td className="px-4 py-2 text-gray-500 max-w-[180px] truncate" title={r.emailNorm}>
                        {r.emailNorm || '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                        {r.eventDate.split('-').reverse().join('/')}
                      </td>
                      <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                        {r.utmCampaign || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {r.enriched ? (
                          <span className="text-emerald-600 font-medium">{r.pagina}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <RowStatus row={r} step={step} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function StatChip({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: 'gray' | 'blue' | 'green' | 'amber'
}) {
  const cls = {
    gray: 'bg-gray-100 text-gray-600',
    blue: 'bg-blue-50 text-[#0D2F9F]',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
  }[color]
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${cls}`}>
      <span>{value}</span>
      <span className="opacity-70">{label}</span>
    </div>
  )
}

function RowStatus({ row, step }: { row: CrmRow; step: Step }) {
  const dupeLabel =
    row.dupeReason === 'deal_id' ? 'deal_id' :
    row.dupeReason === 'email+utm' ? 'email+utm' : null

  if (step === 'done') {
    if (row.existsInSupabase) {
      return (
        <span className="flex items-center gap-1 text-amber-600" title={`Duplicata por ${dupeLabel}`}>
          <AlertCircle size={11} /> Já existe
          {dupeLabel && <span className="text-[10px] opacity-70">({dupeLabel})</span>}
        </span>
      )
    }
    return (
      <span className="flex items-center gap-1 text-emerald-600">
        <CheckCircle2 size={11} /> Importado
      </span>
    )
  }
  if (step === 'ready' || step === 'checking') {
    if (row.existsInSupabase) {
      return (
        <span className="flex items-center gap-1 text-amber-600" title={`Duplicata por ${dupeLabel}`}>
          <AlertCircle size={11} /> Já existe
          {dupeLabel && <span className="text-[10px] opacity-70">({dupeLabel})</span>}
        </span>
      )
    }
    return (
      <span className="flex items-center gap-1 text-emerald-600">
        <CheckCircle2 size={11} /> Novo
      </span>
    )
  }
  return <span className="text-gray-300">—</span>
}
