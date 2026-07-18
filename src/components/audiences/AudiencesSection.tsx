import { useState, useMemo, useCallback } from 'react'
import { Download, Users, Phone, Mail, User, Loader2, AlertCircle, Search, X } from 'lucide-react'
import type { PageData } from '../../hooks/useDashboard'
import { yesterdayBRT, daysAgoBRT, getDatePresets, currentMonthBRT } from '../../utils/dateBRT'
import {
  extractContactFields,
  buildMetaCsv,
  highestStage,
  STAGE_ORDER_AUDIENCE,
  STAGE_LABEL_AUDIENCE,
  type AudienceRow,
} from '../../utils/audienceExport'
import { fetchCrmByEmail } from '../../api/supabaseAudience'

interface Props {
  pages: PageData[]
}

const ALL_STAGES = STAGE_ORDER_AUDIENCE.filter((s) => s !== 'not_mql')

function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[\s_\-.]/g, '')
}

export default function AudiencesSection({ pages }: Props) {
  // Lead date range (GreatPages)
  const [dateFrom, setDateFrom] = useState(() => currentMonthBRT().from)
  const [dateTo, setDateTo] = useState(() => yesterdayBRT())

  // CRM date range (Supabase events)
  const [crmDateFrom, setCrmDateFrom] = useState(() => daysAgoBRT(89))
  const [crmDateTo, setCrmDateTo] = useState(() => yesterdayBRT())

  // Filters
  const [selPages, setSelPages] = useState<string[]>([])
  const [selUtmCampaigns, setSelUtmCampaigns] = useState<string[]>([])
  const [selUtmSources, setSelUtmSources] = useState<string[]>([])
  const [selFaturamento, setSelFaturamento] = useState<string[]>([])
  const [selSegmentos, setSelSegmentos] = useState<string[]>([])
  const [selStages, setSelStages] = useState<string[]>([])
  const [requireAllStages, setRequireAllStages] = useState(false)

  // CRM enrichment state
  const [crmMap, setCrmMap] = useState<Map<string, { stages: Set<string>; segment: string | null; revenue: string | null }> | null>(null)
  const [crmLoading, setCrmLoading] = useState(false)
  const [crmError, setCrmError] = useState<string | null>(null)

  const leadsLoaded = pages.some((p) => p.leads)

  // ── Parse all GreatPages leads ──────────────────────────────────────────────
  const allLeads = useMemo(() => {
    const result: AudienceRow[] = []
    for (const page of pages) {
      const rows = page.leads?.retorno?.paginas?.leads ?? []
      for (const row of rows) {
        if (row.length === 0) continue
        // Build raw map from form fields
        const raw: Record<string, string> = {}
        let date = ''
        let utmCampaign = ''
        let utmSource = ''
        let faturamento = ''
        let segmento = ''

        for (const field of row) {
          raw[field.titulo] = field.valor
          const k = norm(field.titulo)
          if (!date && (k === 'data' || k === 'datacadastro' || k === 'datacriacao' || k === 'dataconversao')) {
            // Try extracting YYYY-MM-DD
            const m = field.valor.match(/(\d{4}-\d{2}-\d{2})/) ?? field.valor.match(/(\d{2})\/(\d{2})\/(\d{4})/)
            if (m) date = m[0]!.includes('-') ? m[0]! : `${m[3]}-${m[2]}-${m[1]}`
          }
          if (k === 'utmcampaign' || k === 'utm_campaign') utmCampaign = field.valor || ''
          if (k === 'utmsource' || k === 'utm_source') utmSource = field.valor?.toLowerCase() || ''
          if ((k.includes('faturamento') || k.includes('receita') || k.includes('revenue')) && !faturamento) faturamento = field.valor
          if ((k.includes('segmento') || k.includes('nicho') || k.includes('setor')) && !segmento) segmento = field.valor
        }

        const contact = extractContactFields(raw)
        if (!contact.email) continue // Skip leads without email

        result.push({
          email: contact.email,
          phone: contact.phone,
          fn: contact.fn,
          ln: contact.ln,
          company: contact.company,
          country: 'BR',
          zip: contact.zip,
          city: contact.city,
          state: contact.state,
          utmCampaign,
          utmSource,
          pageName: page.summary.titulo,
          leadDate: date,
          highestStage: null,
          segment: segmento || null,
          faturamento: faturamento || null,
        })
      }
    }
    return result
  }, [pages])

  // ── Dedup by email (keep first occurrence per email) ───────────────────────
  const dedupedLeads = useMemo(() => {
    const seen = new Set<string>()
    return allLeads.filter((r) => {
      if (seen.has(r.email)) return false
      seen.add(r.email)
      return true
    })
  }, [allLeads])

  // ── Filter options ──────────────────────────────────────────────────────────
  const filterOptions = useMemo(() => {
    const pageNames = new Set<string>()
    const campaigns = new Set<string>()
    const sources = new Set<string>()
    const faturamentos = new Set<string>()
    const segmentos = new Set<string>()
    for (const r of dedupedLeads) {
      if (r.pageName) pageNames.add(r.pageName)
      if (r.utmCampaign) campaigns.add(r.utmCampaign)
      if (r.utmSource) sources.add(r.utmSource)
      if (r.faturamento) faturamentos.add(r.faturamento)
      if (r.segment) segmentos.add(r.segment)
    }
    return {
      pages: [...pageNames].sort(),
      campaigns: [...campaigns].sort(),
      sources: [...sources].sort(),
      faturamentos: [...faturamentos].sort(),
      segmentos: [...segmentos].sort(),
    }
  }, [dedupedLeads])

  // ── Enrich with CRM data if available ──────────────────────────────────────
  const enrichedLeads = useMemo(() => {
    if (!crmMap) return dedupedLeads
    return dedupedLeads.map((r) => {
      const crm = crmMap.get(r.email)
      if (!crm) return r
      return {
        ...r,
        highestStage: highestStage(crm.stages),
        segment: r.segment || crm.segment,
        faturamento: r.faturamento || crm.revenue,
      }
    })
  }, [dedupedLeads, crmMap])

  // ── Apply filters ───────────────────────────────────────────────────────────
  const filteredLeads = useMemo(() => {
    return enrichedLeads.filter((r) => {
      if (dateFrom && r.leadDate && r.leadDate < dateFrom) return false
      if (dateTo && r.leadDate && r.leadDate > dateTo) return false
      if (selPages.length > 0 && !selPages.includes(r.pageName)) return false
      if (selUtmCampaigns.length > 0 && !selUtmCampaigns.includes(r.utmCampaign)) return false
      if (selUtmSources.length > 0 && !selUtmSources.includes(r.utmSource)) return false
      if (selFaturamento.length > 0 && !selFaturamento.includes(r.faturamento ?? '')) return false
      if (selSegmentos.length > 0 && !selSegmentos.includes(r.segment ?? '')) return false

      if (selStages.length > 0) {
        const crm = crmMap?.get(r.email)
        if (!crm) return false
        if (requireAllStages) {
          if (!selStages.every((s) => crm.stages.has(s))) return false
        } else {
          if (!selStages.some((s) => crm.stages.has(s))) return false
        }
      }

      return true
    })
  }, [enrichedLeads, dateFrom, dateTo, selPages, selUtmCampaigns, selUtmSources, selFaturamento, selSegmentos, selStages, requireAllStages, crmMap])

  // ── Stats ───────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: filteredLeads.length,
    withPhone: filteredLeads.filter((r) => r.phone).length,
    withName: filteredLeads.filter((r) => r.fn).length,
    withCrm: filteredLeads.filter((r) => r.highestStage).length,
  }), [filteredLeads])

  // ── Fetch CRM data ──────────────────────────────────────────────────────────
  const handleFetchCrm = useCallback(async () => {
    setCrmLoading(true)
    setCrmError(null)
    const stages = ALL_STAGES as unknown as string[]
    const { map, error } = await fetchCrmByEmail(stages, crmDateFrom, crmDateTo)
    if (error) {
      setCrmError(error)
    } else {
      setCrmMap(map)
    }
    setCrmLoading(false)
  }, [crmDateFrom, crmDateTo])

  // ── Export ──────────────────────────────────────────────────────────────────
  function handleExport() {
    const csv = buildMetaCsv(filteredLeads)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audiencia_meta_${dateTo || yesterdayBRT()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const presets = getDatePresets()

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Audiências para Meta Ads</h2>
        <p className="text-sm text-gray-500">
          Combine segmentações de formulários e estágios CRM para gerar listas enriquecidas prontas para upload no Meta Ads.
        </p>
      </div>

      {!leadsLoaded && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-600 px-4 py-3 rounded-xl text-sm">
          <Loader2 size={14} className="animate-spin shrink-0" />
          Carregando leads do GreatPages...
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Filtros de Lead (GreatPages)</p>

        {/* Lead date range */}
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-500 font-medium">Período de captação</p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
            <span className="text-gray-400 text-xs">até</span>
            <input type="date" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
            <div className="flex flex-wrap gap-1">
              {presets.map(({ label, from, to }) => (
                <button key={label} onClick={() => { setDateFrom(from); setDateTo(to) }}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
                    dateFrom === from && dateTo === to
                      ? 'bg-[#0D2F9F] border-[#0D2F9F] text-white'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Multi-select filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <FilterSelect label="Páginas" options={filterOptions.pages} selected={selPages} onChange={setSelPages} />
          <FilterSelect label="UTM Campaign" options={filterOptions.campaigns} selected={selUtmCampaigns} onChange={setSelUtmCampaigns} />
          <FilterSelect label="UTM Source" options={filterOptions.sources} selected={selUtmSources} onChange={setSelUtmSources} />
          <FilterSelect label="Faturamento" options={filterOptions.faturamentos} selected={selFaturamento} onChange={setSelFaturamento} />
          <FilterSelect label="Segmento / Nicho" options={filterOptions.segmentos} selected={selSegmentos} onChange={setSelSegmentos} />
        </div>
      </div>

      {/* CRM enrichment */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Enriquecimento CRM (Supabase)</p>
          {crmMap && (
            <span className="text-[11px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
              {crmMap.size.toLocaleString('pt-BR')} leads com dados CRM
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={crmDateFrom} onChange={(e) => setCrmDateFrom(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <span className="text-gray-400 text-xs">até</span>
          <input type="date" value={crmDateTo} min={crmDateFrom} onChange={(e) => setCrmDateTo(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <button
            onClick={handleFetchCrm}
            disabled={crmLoading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            {crmLoading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            {crmMap ? 'Atualizar dados CRM' : 'Buscar dados CRM'}
          </button>
        </div>

        {crmError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-xl text-xs">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <span className="font-mono">{crmError}</span>
          </div>
        )}

        {/* Stage filter (only shown after CRM data is loaded) */}
        {crmMap && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-gray-500 font-medium">Filtrar por estágio CRM atingido</p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_STAGES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSelStages((prev) =>
                    prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                  )}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                    selStages.includes(s)
                      ? 'bg-[#0D2F9F] border-[#0D2F9F] text-white'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {STAGE_LABEL_AUDIENCE[s]}
                </button>
              ))}
            </div>
            {selStages.length > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRequireAllStages((v) => !v)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
                    requireAllStages
                      ? 'border-[#0D2F9F] bg-blue-50 text-[#0D2F9F]'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {requireAllStages ? 'Todos os estágios (E)' : 'Qualquer estágio (OU)'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats + export */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <StatChip icon={<Users size={13} />} label="Leads" value={stats.total} color="blue" />
          <StatChip icon={<Mail size={13} />} label="Com email" value={stats.total} color="green" />
          <StatChip icon={<Phone size={13} />} label="Com telefone" value={stats.withPhone} color="green" />
          <StatChip icon={<User size={13} />} label="Com nome" value={stats.withName} color="green" />
          {crmMap && (
            <StatChip icon={<Search size={13} />} label="Com CRM" value={stats.withCrm} color="amber" />
          )}
        </div>

        <button
          onClick={handleExport}
          disabled={filteredLeads.length === 0}
          className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl bg-[#0D2F9F] text-white hover:bg-[#0a2480] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Download size={15} />
          Exportar {filteredLeads.length.toLocaleString('pt-BR')} leads para Meta Ads
        </button>

        <p className="text-[11px] text-gray-400 mt-2">
          CSV formato Meta Ads: email, telefone (E.164), nome, sobrenome, país, CEP, cidade, estado
        </p>
      </div>

      {/* Preview table */}
      {filteredLeads.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Preview — primeiros {Math.min(filteredLeads.length, 50)} de {filteredLeads.length}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 whitespace-nowrap">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 whitespace-nowrap">Nome</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 whitespace-nowrap">Telefone</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 whitespace-nowrap">Página</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 whitespace-nowrap">UTM Campaign</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 whitespace-nowrap">Faturamento</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 whitespace-nowrap">Segmento</th>
                  {crmMap && <th className="text-left px-4 py-2.5 font-medium text-gray-500 whitespace-nowrap">Estágio CRM</th>}
                </tr>
              </thead>
              <tbody>
                {filteredLeads.slice(0, 50).map((r, i) => (
                  <tr key={`${r.email}-${i}`} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2 text-gray-700 max-w-[160px] truncate" title={r.email}>{r.email}</td>
                    <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                      {r.fn ? `${r.fn}${r.ln ? ' ' + r.ln : ''}` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {r.phone
                        ? <span className="text-emerald-600 font-mono">{r.phone}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2 text-gray-500 max-w-[120px] truncate" title={r.pageName}>{r.pageName}</td>
                    <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{r.utmCampaign || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2 text-gray-600 max-w-[140px] truncate">{r.faturamento || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2 text-gray-600 max-w-[120px] truncate">{r.segment || <span className="text-gray-300">—</span>}</td>
                    {crmMap && (
                      <td className="px-4 py-2 whitespace-nowrap">
                        {r.highestStage
                          ? <StageBadge stage={r.highestStage} />
                          : <span className="text-gray-300">—</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatChip({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: 'blue' | 'green' | 'amber' }) {
  const cls = { blue: 'bg-blue-50 text-[#0D2F9F]', green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700' }[color]
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${cls}`}>
      {icon}
      <span className="font-bold">{value.toLocaleString('pt-BR')}</span>
      <span className="opacity-70">{label}</span>
    </div>
  )
}

const STAGE_COLORS: Record<string, string> = {
  deal_won: 'bg-emerald-100 text-emerald-700',
  deal_lost: 'bg-red-100 text-red-600',
  meeting_completed: 'bg-purple-100 text-purple-700',
  opportunity: 'bg-blue-100 text-blue-700',
  sql: 'bg-indigo-100 text-indigo-700',
  mql: 'bg-sky-100 text-sky-700',
}

function StageBadge({ stage }: { stage: string }) {
  const cls = STAGE_COLORS[stage] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>
      {STAGE_LABEL_AUDIENCE[stage] ?? stage}
    </span>
  )
}

function FilterSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)

  if (options.length === 0) return null

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-2 text-xs border rounded-lg px-2.5 py-1.5 transition-colors ${
          selected.length > 0
            ? 'border-[#0D2F9F] bg-blue-50 text-[#0D2F9F]'
            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
        }`}
      >
        <span className="truncate">
          {selected.length === 0
            ? label
            : `${label}: ${selected.length} selecionado${selected.length > 1 ? 's' : ''}`}
        </span>
        {selected.length > 0 && (
          <X size={11} className="shrink-0 hover:text-red-500" onClick={(e) => { e.stopPropagation(); onChange([]) }} />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-[100] w-64 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="max-h-48 overflow-y-auto py-1">
            {options.map((opt) => (
              <label key={opt} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="accent-blue-600 shrink-0"
                />
                <span className={`text-xs truncate ${selected.includes(opt) ? 'text-[#0D2F9F] font-medium' : 'text-gray-700'}`} title={opt}>
                  {opt}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
