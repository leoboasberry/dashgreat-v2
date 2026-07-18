import { useState, useMemo, useEffect } from 'react'
import { Plus, Zap, ZapOff, Pencil, Trash2, Play, RefreshCw, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react'
import type { PageData } from '../../hooks/useDashboard'
import type { PixelConfig, DispatchLogEntry } from '../../types/capi'
import type { LeadEnrichment } from '../../types/capi'
import { useCapiConfig } from '../../hooks/useCapiConfig'
import { extractContactFields, extractFbParams } from '../../utils/audienceExport'
import PixelConfigModal from './PixelConfigModal'

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const FN_URL = `${SB_URL}/functions/v1/capi-dispatch`

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayBRT(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}
function subtractDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// ── GreatPages lead enrichment map ────────────────────────────────────────────

function buildEnrichMap(pages: PageData[]): Record<string, LeadEnrichment> {
  const map: Record<string, LeadEnrichment> = {}
  const normStr = (s: string) =>
    s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, '')

  for (const page of pages) {
    const rows = page.leads?.retorno?.paginas?.leads ?? []
    for (const entry of rows) {
      const raw: Record<string, string> = {}
      let leadTs: number | undefined

      for (const field of entry) {
        raw[field.titulo] = String(field.valor ?? '').trim()
        if (!leadTs) {
          const k = normStr(field.titulo)
          if (k.includes('data') || k.includes('date')) {
            const m = String(field.valor ?? '').match(/(\d{4}-\d{2}-\d{2})/)
            if (m) {
              const ts = new Date(m[1]! + 'T12:00:00').getTime()
              if (!isNaN(ts)) leadTs = Math.floor(ts / 1000)
            }
          }
        }
      }

      const contact = extractContactFields(raw)
      if (!contact.email || map[contact.email]) continue

      const fb = extractFbParams(raw)
      map[contact.email] = {
        phone: contact.phone, fn: contact.fn, ln: contact.ln,
        city: contact.city, state: contact.state, zip: contact.zip,
        fbp: fb.fbp, fbc: fb.fbc, fbclid: fb.fbclid, leadTs,
      }
    }
  }
  return map
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { pages: PageData[] }

export default function CapiSection({ pages }: Props) {
  const { configs, log, loading, reload, addConfig, updateConfig, removeConfig, clearSent } =
    useCapiConfig()

  const [modal, setModal] = useState<'new' | PixelConfig | null>(null)
  const [dispatching, setDispatching] = useState<Set<string>>(new Set())
  const today = todayBRT()
  const [dateFrom, setDateFrom] = useState(() => subtractDays(todayBRT(), 30))
  const [dateTo, setDateTo] = useState(todayBRT)

  const enrichMap = useMemo(() => buildEnrichMap(pages), [pages])

  // ── Dispatch via Edge Function ────────────────────────────────────────────

  async function runDispatch(cfg: PixelConfig, from: string, to: string) {
    if (dispatching.has(cfg.id)) return
    setDispatching(prev => new Set([...prev, cfg.id]))

    try {
      await fetch(FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SB_KEY}`,
        },
        body: JSON.stringify({
          pixelId: cfg.id,
          dateFrom: from,
          dateTo: to,
          enrichData: enrichMap,
        }),
      })
    } catch {
      // Error will show in the log refreshed below
    }

    await reload()
    setDispatching(prev => { const s = new Set(prev); s.delete(cfg.id); return s })
  }

  async function dispatchAll() {
    for (const cfg of configs.filter(c => c.enabled)) {
      await runDispatch(cfg, dateFrom, dateTo)
    }
  }

  // ── Status strip ─────────────────────────────────────────────────────────

  const sbMissing = !SB_URL || !SB_KEY

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-gray-800">CAPI Meta — Eventos CRM</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Disparo contínuo de eventos offline do CRM para a Meta Conversions API.
          O pg_cron executa automaticamente a cada 30 min, mesmo com o dashboard fechado.
        </p>
      </div>

      {sbMissing && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-3 rounded-xl">
          Supabase não configurado — configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 bg-white border border-gray-100 rounded-2xl px-5 py-4">
        <div className="flex gap-3 items-end flex-wrap flex-1">
          <div>
            <label className="block text-xs text-gray-400 mb-1">De</label>
            <input
              type="date" value={dateFrom} max={dateTo}
              onChange={e => setDateFrom(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Até</label>
            <input
              type="date" value={dateTo} max={today}
              onChange={e => setDateTo(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>
        <button
          onClick={dispatchAll}
          disabled={configs.filter(c => c.enabled).length === 0 || dispatching.size > 0}
          className="flex items-center gap-2 px-4 py-2 bg-[#0D2F9F] text-white text-sm font-medium rounded-xl hover:bg-blue-800 disabled:opacity-40 transition-colors"
        >
          <Play size={14} />
          Disparar todos
        </button>
        <button
          onClick={reload}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="Atualizar"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Pixel list */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-600">
            Pixels configurados
            {loading && <Loader2 size={13} className="inline ml-2 animate-spin text-gray-400" />}
          </h3>
          <button
            onClick={() => setModal('new')}
            className="flex items-center gap-1.5 text-sm text-[#0D2F9F] hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={14} />
            Adicionar pixel
          </button>
        </div>

        {!loading && configs.length === 0 && (
          <div className="bg-white border border-dashed border-gray-200 rounded-2xl px-6 py-10 text-center text-gray-400 text-sm">
            Nenhum pixel configurado. Clique em "Adicionar pixel" para começar.
          </div>
        )}

        {configs.map(cfg => (
          <PixelCard
            key={cfg.id}
            cfg={cfg}
            dispatching={dispatching.has(cfg.id)}
            onToggle={enabled => updateConfig(cfg.id, { enabled })}
            onEdit={() => setModal(cfg)}
            onDelete={() => { if (confirm(`Remover pixel "${cfg.name}"?`)) removeConfig(cfg.id) }}
            onDispatch={() => runDispatch(cfg, dateFrom, dateTo)}
            onClearSent={() => {
              if (confirm('Limpar histórico de envios para este pixel?\nIsso permite re-enviar eventos já enviados.'))
                clearSent(cfg.pixelId)
            }}
          />
        ))}
      </div>

      {/* Dispatch log */}
      {log.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-600 mb-3">Log de disparos</h3>
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            {log.slice(0, 50).map(entry => <LogRow key={entry.id} entry={entry} />)}
          </div>
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <PixelConfigModal
          initial={modal === 'new' ? undefined : modal}
          onSave={async cfg => {
            if (modal === 'new') await addConfig(cfg)
            else await updateConfig(cfg.id, cfg)
            setModal(null)
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ── Pixel card ────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  mql: 'MQL', not_mql: 'Não MQL', sql: 'SQL', opportunity: 'Oportunidade',
  meeting_completed: 'Reunião', deal_won: 'Deal Ganho', deal_lost: 'Deal Perdido',
}

function PixelCard({
  cfg, dispatching, onToggle, onEdit, onDelete, onDispatch, onClearSent,
}: {
  cfg: PixelConfig; dispatching: boolean
  onToggle: (v: boolean) => void; onEdit: () => void; onDelete: () => void
  onDispatch: () => void; onClearSent: () => void
}) {
  const activeStages = (Object.entries(cfg.eventMapping) as [string, string][]).filter(([, n]) => n)
  const f = cfg.filters

  const filterTags: string[] = []
  if (f.minMrr !== undefined || f.maxMrr !== undefined) {
    const lo = f.minMrr !== undefined ? `R$${f.minMrr.toLocaleString('pt-BR')}` : '0'
    const hi = f.maxMrr !== undefined ? `R$${f.maxMrr.toLocaleString('pt-BR')}` : '∞'
    filterTags.push(`MRR ${lo}–${hi}`)
  }
  if (f.campaigns?.length)    filterTags.push(`Campanha: ${f.campaigns.slice(0, 2).join(', ')}`)
  if (f.segments?.length)     filterTags.push(`Segmento: ${f.segments.slice(0, 2).join(', ')}`)
  if (f.faturamentos?.length) filterTags.push(`Fat.: ${f.faturamentos.slice(0, 2).join(', ')}`)

  return (
    <div className={`bg-white border rounded-2xl px-5 py-4 ${cfg.enabled ? 'border-gray-100' : 'border-gray-100 opacity-60'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => onToggle(!cfg.enabled)}
            className={`shrink-0 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
              cfg.enabled
                ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
            }`}
          >
            {cfg.enabled ? <Zap size={11} /> : <ZapOff size={11} />}
            {cfg.enabled ? 'Ativo' : 'Inativo'}
          </button>
          <div className="min-w-0">
            <div className="font-medium text-gray-800 text-sm">{cfg.name}</div>
            <div className="text-xs text-gray-400 font-mono truncate">
              ID: {cfg.pixelId.slice(0, 6)}…{cfg.pixelId.slice(-4)}
              {cfg.testEventCode && <span className="ml-2 text-amber-500">TEST</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onDispatch} disabled={dispatching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-[#0D2F9F] hover:bg-blue-100 rounded-lg disabled:opacity-50 transition-colors"
          >
            {dispatching ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
            Disparar
          </button>
          <button onClick={onClearSent} title="Limpar histórico de envios" className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors">
            <RefreshCw size={14} />
          </button>
          <button onClick={onEdit} title="Editar" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
            <Pencil size={14} />
          </button>
          <button onClick={onDelete} title="Remover" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {activeStages.map(([key, name]) => (
          <Tag key={key} color="blue">{STAGE_LABELS[key] ?? key} → {name}</Tag>
        ))}
        {filterTags.map((t, i) => <Tag key={i} color="gray">{t}</Tag>)}
        {cfg.autoDispatch && (
          <Tag color="purple">
            pg_cron: {cfg.intervalMinutes >= 60 ? `${cfg.intervalMinutes / 60}h` : `${cfg.intervalMinutes}min`}
          </Tag>
        )}
      </div>
    </div>
  )
}

function Tag({ children, color }: { children: React.ReactNode; color: 'blue' | 'gray' | 'purple' }) {
  const cls = { blue: 'bg-blue-50 text-blue-700', gray: 'bg-gray-100 text-gray-500', purple: 'bg-purple-50 text-purple-700' }[color]
  return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{children}</span>
}

// ── Log row ───────────────────────────────────────────────────────────────────

function LogRow({ entry }: { entry: DispatchLogEntry }) {
  const ok = entry.errors.length === 0
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-none text-sm">
      {ok ? <CheckCircle size={14} className="text-emerald-500 shrink-0" />
           : <XCircle    size={14} className="text-red-400 shrink-0" />}
      <span className="text-gray-400 text-xs w-36 shrink-0">
        {new Date(entry.startedAt).toLocaleString('pt-BR')}
      </span>
      <span className="font-medium text-gray-700 truncate flex-1">{entry.pixelName}</span>
      <span className="text-gray-500 shrink-0">{entry.eventsSent}/{entry.eventsAttempted} enviados</span>
      {entry.errors.length > 0 && (
        <span className="text-red-400 text-xs truncate max-w-xs" title={entry.errors.join('; ')}>
          {entry.errors[0]}
        </span>
      )}
    </div>
  )
}
