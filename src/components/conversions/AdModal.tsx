import { useEffect, useState, useMemo } from 'react'
import { X } from 'lucide-react'
import type { AdMetrics } from '../../utils/computeMetrics'
import type { CeaConfig, CeaStatus } from '../../utils/cea'
import { computeCEAStatus, ceaBadgeLabel } from '../../utils/cea'
import { fetchWindsorData, type WindsorRow } from '../../api/windsor'
import {
  applyWindsorFilters,
  computeQualityMetrics,
  computeDelta,
  type QualityMetrics,
} from '../../utils/qualityMetrics'

// ── Helpers ──

function fmtBRL(n: number | null): string {
  if (n === null || n === 0) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function fmtN(n: number | null): string {
  if (n === null || n === 0) return '—'
  return Math.round(n).toLocaleString('pt-BR')
}

function fmtPct(n: number | null): string {
  if (n === null) return '—'
  return n.toFixed(1) + '%'
}

function ratio(invest: number, count: number): string {
  if (count === 0 || invest === 0) return '—'
  return (invest / count).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function getPrevPeriodDates(dateFrom: string, dateTo: string) {
  const from = new Date(dateFrom + 'T12:00:00')
  const to = new Date(dateTo + 'T12:00:00')
  const durationDays = Math.round((to.getTime() - from.getTime()) / 86_400_000)
  const prevTo = new Date(from.getTime() - 86_400_000)
  const prevFrom = new Date(prevTo.getTime() - durationDays * 86_400_000)
  return {
    prevFrom: prevFrom.toISOString().split('T')[0]!,
    prevTo: prevTo.toISOString().split('T')[0]!,
  }
}

// ── Badge components ──

type BadgeType = 'green' | 'yellow' | 'orange' | 'red' | 'gray'

function CeaBadge({ badge, type }: { badge: string; type: BadgeType }) {
  const cls =
    type === 'green' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    type === 'yellow' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
    type === 'orange' ? 'bg-orange-50 text-orange-700 border-orange-200' :
    type === 'red' ? 'bg-red-50 text-red-700 border-red-200' :
    'bg-gray-50 text-gray-500 border-gray-200'
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border ${cls}`}>
      {ceaBadgeLabel(badge)}
    </span>
  )
}

function DeltaBadge({ delta, inverted = false }: { delta: number | null; inverted?: boolean }) {
  if (delta === null) return <span className="text-[11px] text-gray-300">—</span>
  const good = inverted ? delta < 0 : delta > 0
  const color = delta === 0 ? 'text-gray-400' : good ? 'text-emerald-600' : 'text-red-500'
  const arrow = delta > 0 ? '▲' : '▼'
  return (
    <span className={`text-[11px] font-medium ${color}`}>
      {arrow} {Math.abs(delta).toFixed(1)}%
    </span>
  )
}

// ── Quality card ──

function QCard({
  label,
  value,
  delta,
  inverted = false,
}: {
  label: string
  value: string
  delta: number | null
  inverted?: boolean
}) {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 px-3 py-2.5 flex flex-col gap-0.5">
      <span className="text-[11px] text-gray-400">{label}</span>
      <span className="text-base font-bold text-gray-800">{value}</span>
      <DeltaBadge delta={delta} inverted={inverted} />
    </div>
  )
}

// ── CEA interpretation table ──

function CeaTable({ config, cea }: { config: CeaConfig; cea: number | null }) {
  const rows = [
    { range: `≤ ${config.cea_excelente}×`, label: '🛡️ PROTEGIDA', desc: 'Custo excelente. Não tocar.', type: 'green' as BadgeType },
    { range: `≤ ${config.cea_teto}×`, label: '✅ ESCALAR', desc: 'Custo aceitável. Escalar orçamento.', type: 'green' as BadgeType },
    { range: `> ${config.cea_teto}× com MQL→SQL ≥ ${config.mql_sql_excelente}%`, label: '⚠️ NÃO PAUSAR', desc: 'Funil top qualificado. Revisar vendas.', type: 'orange' as BadgeType },
    { range: `> ${config.cea_teto}×`, label: '⚡ REVISAR', desc: 'CEA alto. Avaliar otimizações.', type: 'yellow' as BadgeType },
    { range: `> ${config.cea_teto}× + RR→Ganho < ${config.rr_ganho_piso}%`, label: '🚫 PAUSAR', desc: 'Custo alto e baixa conversão. Pausar.', type: 'red' as BadgeType },
  ]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wide">
            <th className="py-2 px-3 text-left font-medium">CEA</th>
            <th className="py-2 px-3 text-left font-medium">Status</th>
            <th className="py-2 px-3 text-left font-medium">Recomendação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r) => {
            const isCurrent = (() => {
              if (cea === null) return false
              if (r.label.includes('PROTEGIDA')) return cea <= config.cea_excelente
              if (r.label.includes('ESCALAR')) return cea > config.cea_excelente && cea <= config.cea_teto
              if (r.label.includes('NAO PAUSAR') || r.label.includes('NÃO PAUSAR')) return cea > config.cea_teto
              return false
            })()
            return (
              <tr key={r.label} className={isCurrent ? 'bg-blue-50' : ''}>
                <td className="py-2 px-3 font-mono text-gray-600">{r.range}</td>
                <td className="py-2 px-3">
                  <CeaBadge badge={r.label.replace(/[^\w\s→<>≤≥%×]/g, '').trim()} type={r.type} />
                </td>
                <td className="py-2 px-3 text-gray-500">{r.desc}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── CEA Flowchart ──

function FlowStep({ check, label, result, ok }: { check: string; label: string; result: string; ok: boolean | null }) {
  const icon = ok === null ? '—' : ok ? '✅' : '❌'
  const color = ok === null ? 'text-gray-400' : ok ? 'text-emerald-600' : 'text-red-500'
  return (
    <div className="flex items-start gap-3 text-xs">
      <span className={`text-base leading-none shrink-0 ${color}`}>{icon}</span>
      <div>
        <span className="text-gray-500">{check}: </span>
        <span className="font-medium text-gray-700">{label}</span>
        {result && <span className="text-gray-400 ml-1">→ {result}</span>}
      </div>
    </div>
  )
}

function CeaFlowchart({ ad, config, status }: { ad: AdMetrics; config: CeaConfig; status: CeaStatus }) {
  const isEscala = status.stage === 'ESCALA'

  if (!isEscala) {
    // VALIDACAO flowchart
    const hasMqls = ad.mqls > 0
    const cpaMqlOk = status.cpaMql !== null ? status.cpaMql <= config.cpa_mql_teto : null
    const mqlSqlExc = status.mqlSqlPct !== null ? status.mqlSqlPct >= config.mql_sql_excelente : null
    const mqlSqlPiso = status.mqlSqlPct !== null ? status.mqlSqlPct >= config.mql_sql_piso : null
    const mqlSqlCrit = status.mqlSqlPct !== null ? status.mqlSqlPct >= config.mql_sql_critico : null

    return (
      <div className="flex flex-col gap-2.5">
        <FlowStep
          check="Fase"
          label="VALIDAÇÃO (< 20 reuniões)"
          result=""
          ok={null}
        />
        <FlowStep
          check="MQLs"
          label={hasMqls ? `${ad.mqls} MQLs gerados` : 'Sem MQLs'}
          result={!hasMqls ? 'SEM MQLs' : ''}
          ok={hasMqls}
        />
        {hasMqls && (
          <>
            <FlowStep
              check={`MQL→SQL ≥ ${config.mql_sql_critico}%`}
              label={`${fmtPct(status.mqlSqlPct)} de qualificação`}
              result={mqlSqlCrit === false ? 'PAUSAR' : ''}
              ok={mqlSqlCrit}
            />
            <FlowStep
              check={`CPA MQL ≤ R$ ${config.cpa_mql_teto}`}
              label={fmtBRL(status.cpaMql)}
              result={cpaMqlOk === false ? 'CPA ALTO' : ''}
              ok={cpaMqlOk}
            />
            <FlowStep
              check={`MQL→SQL ≥ ${config.mql_sql_excelente}%`}
              label={`${fmtPct(status.mqlSqlPct)}`}
              result={mqlSqlExc ? 'APROVAR' : mqlSqlPiso ? 'VALIDANDO' : 'ATENÇÃO'}
              ok={mqlSqlExc}
            />
          </>
        )}
        <div className="mt-1 pt-2 border-t border-gray-100">
          <CeaBadge badge={status.badge} type={status.type} />
        </div>
      </div>
    )
  }

  // ESCALA flowchart
  const hasWins = ad.won > 0
  const ceaOkExc = status.cea !== null ? status.cea <= config.cea_excelente : null
  const ceaOkTeto = status.cea !== null ? status.cea <= config.cea_teto : null
  const mqlSqlAntiErr = status.mqlSqlPct !== null ? status.mqlSqlPct >= config.mql_sql_excelente : null
  const rrGanhoOk = status.rrGanhoPct !== null ? status.rrGanhoPct >= config.rr_ganho_piso : null

  return (
    <div className="flex flex-col gap-2.5">
      <FlowStep
        check="Fase"
        label={`ESCALA (${ad.meetings} reuniões)`}
        result=""
        ok={null}
      />
      <FlowStep
        check="Vendas"
        label={hasWins ? `${ad.won} venda(s)` : 'Sem vendas ainda'}
        result={!hasWins ? 'avaliar qualificação' : ''}
        ok={hasWins}
      />
      {hasWins && (
        <>
          <FlowStep
            check={`CEA ≤ ${config.cea_excelente}×`}
            label={status.cea !== null ? `CEA = ${status.cea.toFixed(2)}×` : '—'}
            result={ceaOkExc ? 'PROTEGIDA' : ''}
            ok={ceaOkExc}
          />
          <FlowStep
            check={`CEA ≤ ${config.cea_teto}×`}
            label={status.cea !== null ? `CEA = ${status.cea.toFixed(2)}×` : '—'}
            result={ceaOkTeto && !ceaOkExc ? 'ESCALAR' : ''}
            ok={ceaOkTeto}
          />
          {ceaOkTeto === false && (
            <>
              <FlowStep
                check={`MQL→SQL ≥ ${config.mql_sql_excelente}% (anti-erro)`}
                label={fmtPct(status.mqlSqlPct)}
                result={mqlSqlAntiErr ? 'NÃO PAUSAR' : ''}
                ok={mqlSqlAntiErr}
              />
              <FlowStep
                check={`RR→GANHO ≥ ${config.rr_ganho_piso}%`}
                label={fmtPct(status.rrGanhoPct)}
                result={rrGanhoOk === false ? 'PAUSAR' : 'REVISAR'}
                ok={rrGanhoOk}
              />
            </>
          )}
        </>
      )}
      <div className="mt-1 pt-2 border-t border-gray-100">
        <CeaBadge badge={status.badge} type={status.type} />
      </div>
    </div>
  )
}

// ── Props ──

interface Props {
  ad: AdMetrics
  config: CeaConfig
  rawWindsorRows: WindsorRow[]
  dateFrom: string
  dateTo: string
  channels: string[]
  campaigns: string[]
  adSets: string[]
  onlyActive: boolean
  onClose: () => void
}

// ── Main Modal ──

export default function AdModal({
  ad,
  config,
  rawWindsorRows,
  dateFrom,
  dateTo,
  channels,
  campaigns,
  adSets,
  onlyActive,
  onClose,
}: Props) {
  const [prevMetrics, setPrevMetrics] = useState<QualityMetrics | null>(null)

  const status = useMemo(() => computeCEAStatus(ad, config), [ad, config])

  const adFilters = useMemo(
    () => ({ channels, campaigns, adSets, ads: [ad.ad], onlyActive }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify({ channels, campaigns, adSets, ad: ad.ad, onlyActive })],
  )

  const qualityMetrics = useMemo(
    () => computeQualityMetrics(applyWindsorFilters(rawWindsorRows, adFilters)),
    [rawWindsorRows, adFilters],
  )

  useEffect(() => {
    const { prevFrom, prevTo } = getPrevPeriodDates(dateFrom, dateTo)
    let cancelled = false
    fetchWindsorData(prevFrom, prevTo)
      .then((rows) => {
        if (cancelled) return
        setPrevMetrics(computeQualityMetrics(applyWindsorFilters(rows, adFilters)))
      })
      .catch(() => { /* silent */ })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, JSON.stringify(adFilters)])

  // Close on ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const p = prevMetrics

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-start justify-center overflow-y-auto py-8"
        onClick={onClose}
      >
        {/* Modal panel */}
        <div
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-gray-800 leading-snug break-words">
                {ad.adFullName ?? ad.ad}
              </h2>
              {ad.adFullName && (
                <p className="text-[11px] text-gray-400 font-mono mt-0.5">{ad.ad}</p>
              )}
              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                {ad.status && (
                  <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                    ad.status === 'ENABLED' || ad.status === 'ACTIVE'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      ad.status === 'ENABLED' || ad.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-gray-400'
                    }`} />
                    {ad.status === 'ENABLED' || ad.status === 'ACTIVE' ? 'Ativo' : 'Pausado'}
                  </span>
                )}
                {status && <CeaBadge badge={status.badge} type={status.type} />}
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Período: {dateFrom.split('-').reverse().join('/')} – {dateTo.split('-').reverse().join('/')}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          </div>

          <div className="px-6 py-5 flex flex-col gap-6 overflow-y-auto max-h-[75vh]">
            {/* ── Bloco 1: CEA Decision ── */}
            {status && (
              <section>
                <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Análise CEA — {status.stage === 'VALIDACAO' ? 'Fase Validação' : 'Fase Escala'}
                </h3>
                <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-4">
                  <CeaFlowchart ad={ad} config={config} status={status} />
                </div>
              </section>
            )}

            {/* ── Bloco 2: Funnel metrics ── */}
            <section>
              <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Funil Completo</h3>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr className="text-gray-400 uppercase tracking-wide">
                      <th className="py-2 px-3 text-left font-medium">Métrica</th>
                      <th className="py-2 px-3 text-right font-medium">Valor</th>
                      <th className="py-2 px-3 text-right font-medium">Custo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    <tr>
                      <td className="py-2 px-3 text-gray-600">Investimento</td>
                      <td className="py-2 px-3 text-right font-medium text-gray-800">{fmtBRL(ad.spend)}</td>
                      <td className="py-2 px-3 text-right text-gray-400">—</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-gray-600">MQLs</td>
                      <td className="py-2 px-3 text-right font-medium text-gray-800">{fmtN(ad.mqls)}</td>
                      <td className="py-2 px-3 text-right text-gray-500">{ratio(ad.spend, ad.mqls)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-gray-600">SQLs</td>
                      <td className="py-2 px-3 text-right font-medium text-gray-800">{fmtN(ad.sqls)}</td>
                      <td className="py-2 px-3 text-right text-gray-500">{ratio(ad.spend, ad.sqls)}</td>
                    </tr>
                    <tr className={ad.sqls > 0 ? '' : 'opacity-50'}>
                      <td className="py-2 px-3 text-gray-600">
                        MQL→SQL
                      </td>
                      <td className="py-2 px-3 text-right font-medium text-gray-800">
                        {ad.mqls > 0 ? fmtPct((ad.sqls / ad.mqls) * 100) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-400">—</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-gray-600">Oportunidades</td>
                      <td className="py-2 px-3 text-right font-medium text-gray-800">{fmtN(ad.opportunities)}</td>
                      <td className="py-2 px-3 text-right text-gray-400">—</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-gray-600">Reuniões</td>
                      <td className="py-2 px-3 text-right font-medium text-gray-800">{fmtN(ad.meetings)}</td>
                      <td className="py-2 px-3 text-right text-gray-400">—</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-gray-600">Vendas</td>
                      <td className="py-2 px-3 text-right font-medium text-gray-800">{fmtN(ad.won)}</td>
                      <td className="py-2 px-3 text-right text-gray-500">{ratio(ad.spend, ad.won)}</td>
                    </tr>
                    {ad.meetings > 0 && (
                      <tr>
                        <td className="py-2 px-3 text-gray-600">RR→Ganho</td>
                        <td className="py-2 px-3 text-right font-medium text-gray-800">
                          {fmtPct((ad.won / ad.meetings) * 100)}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-400">—</td>
                      </tr>
                    )}
                    {ad.won > 0 && (
                      <>
                        <tr>
                          <td className="py-2 px-3 text-gray-600">MRR Gerado</td>
                          <td className="py-2 px-3 text-right font-medium text-gray-800">{fmtBRL(ad.mrr)}</td>
                          <td className="py-2 px-3 text-right text-gray-400">—</td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 text-gray-600">Ticket Médio</td>
                          <td className="py-2 px-3 text-right font-medium text-gray-800">
                            {ad.mrr > 0 ? fmtBRL(ad.mrr / ad.won) : '—'}
                          </td>
                          <td className="py-2 px-3 text-right text-gray-400">—</td>
                        </tr>
                        {status && status.cea !== null && (
                          <tr className="bg-blue-50">
                            <td className="py-2 px-3 font-medium text-[#0D2F9F]">CEA</td>
                            <td className="py-2 px-3 text-right font-bold text-[#0D2F9F]">
                              {status.cea.toFixed(2)}×
                            </td>
                            <td className="py-2 px-3 text-right text-[#0D2F9F] text-[10px]">
                              CPA ÷ Ticket
                            </td>
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Bloco 3: Quality metrics ── */}
            {!qualityMetrics.allEmpty && (
              <section>
                <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Métricas de Qualidade
                </h3>
                <div className="flex flex-col gap-4">
                  {/* Alcance */}
                  {qualityMetrics.impressions !== null && (
                    <div>
                      <h4 className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider mb-2">Alcance</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <QCard
                          label="Impressões"
                          value={fmtN(qualityMetrics.impressions)}
                          delta={computeDelta(qualityMetrics.impressions, p?.impressions ?? null)}
                        />
                        {qualityMetrics.frequency !== null && (
                          <QCard
                            label="Frequência"
                            value={qualityMetrics.frequency.toFixed(2)}
                            delta={computeDelta(qualityMetrics.frequency, p?.frequency ?? null)}
                            inverted
                          />
                        )}
                        {qualityMetrics.cpm !== null && (
                          <QCard
                            label="CPM"
                            value={fmtBRL(qualityMetrics.cpm)}
                            delta={computeDelta(qualityMetrics.cpm, p?.cpm ?? null)}
                            inverted
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Engajamento */}
                  {(qualityMetrics.ctr !== null || qualityMetrics.linkClicks !== null) && (
                    <div>
                      <h4 className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider mb-2">Engajamento</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {qualityMetrics.ctr !== null && (
                          <QCard
                            label="CTR"
                            value={qualityMetrics.ctr.toFixed(2) + '%'}
                            delta={computeDelta(qualityMetrics.ctr, p?.ctr ?? null)}
                          />
                        )}
                        {qualityMetrics.linkClicks !== null && (
                          <QCard
                            label="Cliques no Link"
                            value={fmtN(qualityMetrics.linkClicks)}
                            delta={computeDelta(qualityMetrics.linkClicks, p?.linkClicks ?? null)}
                          />
                        )}
                        {qualityMetrics.cpc !== null && (
                          <QCard
                            label="CPC"
                            value={fmtBRL(qualityMetrics.cpc)}
                            delta={computeDelta(qualityMetrics.cpc, p?.cpc ?? null)}
                            inverted
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Landing Page */}
                  {qualityMetrics.landingPageViews !== null && (
                    <div>
                      <h4 className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider mb-2">Landing Page</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <QCard
                          label="LP Views"
                          value={fmtN(qualityMetrics.landingPageViews)}
                          delta={computeDelta(qualityMetrics.landingPageViews, p?.landingPageViews ?? null)}
                        />
                        {qualityMetrics.costPerLpView !== null && (
                          <QCard
                            label="Custo por LP View"
                            value={fmtBRL(qualityMetrics.costPerLpView)}
                            delta={computeDelta(qualityMetrics.costPerLpView, p?.costPerLpView ?? null)}
                            inverted
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Video */}
                  {qualityMetrics.hasVideoData && (
                    <div>
                      <h4 className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider mb-2">Vídeo</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {qualityMetrics.hookRate !== null && (
                          <QCard
                            label="Hook Rate (25%)"
                            value={qualityMetrics.hookRate.toFixed(1) + '%'}
                            delta={computeDelta(qualityMetrics.hookRate, p?.hookRate ?? null)}
                          />
                        )}
                        {qualityMetrics.holdRate75 !== null && (
                          <QCard
                            label="Hold Rate (75%)"
                            value={qualityMetrics.holdRate75.toFixed(1) + '%'}
                            delta={computeDelta(qualityMetrics.holdRate75, p?.holdRate75 ?? null)}
                          />
                        )}
                        {qualityMetrics.thruplay !== null && (
                          <QCard
                            label="ThruPlay"
                            value={fmtN(qualityMetrics.thruplay)}
                            delta={computeDelta(qualityMetrics.thruplay, p?.thruplay ?? null)}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── Bloco 4: CEA interpretation ── */}
            {status && status.stage === 'ESCALA' && (
              <section>
                <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Tabela de Referência CEA
                </h3>
                <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                  <CeaTable config={config} cea={status.cea} />
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
