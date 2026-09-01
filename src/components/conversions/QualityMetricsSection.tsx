import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { fetchWindsorData, type WindsorRow } from '../../api/windsor'
import {
  applyWindsorFilters,
  computeQualityMetrics,
  computeDelta,
  type QualityMetrics,
  type WindsorAdFilters,
} from '../../utils/qualityMetrics'

// ── Prev period date calculation ──

function getPrevPeriodDates(dateFrom: string, dateTo: string) {
  const from = new Date(dateFrom + 'T12:00:00')
  const to = new Date(dateTo + 'T12:00:00')
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to) return null
  const durationDays = Math.round((to.getTime() - from.getTime()) / 86_400_000)
  const prevTo = new Date(from.getTime() - 86_400_000)
  const prevFrom = new Date(prevTo.getTime() - durationDays * 86_400_000)
  return {
    prevFrom: prevFrom.toISOString().split('T')[0]!,
    prevTo: prevTo.toISOString().split('T')[0]!,
  }
}

// ── Formatters ──

function fmtN(n: number | null): string {
  if (n === null) return '—'
  return Math.round(n).toLocaleString('pt-BR')
}

function fmtBRL(n: number | null): string {
  if (n === null) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
}

function fmtPct(n: number | null): string {
  if (n === null) return '—'
  return n.toFixed(2) + '%'
}

// ── Delta badge ──

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

// ── Alert badge ──

type AlertType = 'green' | 'yellow' | 'orange' | 'red'

function AlertBadge({ text, type }: { text: string; type: AlertType }) {
  const cls =
    type === 'green' ? 'bg-emerald-50 text-emerald-700' :
    type === 'yellow' ? 'bg-yellow-50 text-yellow-700' :
    type === 'orange' ? 'bg-orange-50 text-orange-700' :
    'bg-red-50 text-red-600'
  return (
    <span className={`self-start text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {text}
    </span>
  )
}

// ── Single metric card ──

interface QCardProps {
  label: string
  value: string
  delta: number | null
  inverted?: boolean
  alert?: { text: string; type: AlertType } | null
}

function QCard({ label, value, delta, inverted = false, alert }: QCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex flex-col gap-1 shadow-sm">
      <span className="text-[11px] text-gray-400 leading-tight">{label}</span>
      <span className="text-xl font-bold text-gray-800 leading-tight">{value}</span>
      {alert && <AlertBadge text={alert.text} type={alert.type} />}
      <DeltaBadge delta={delta} inverted={inverted} />
    </div>
  )
}

// ── Group heading ──

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {children}
      </div>
    </div>
  )
}

// ── Props ──

interface Props {
  rawWindsorRows: WindsorRow[]
  dateFrom: string
  dateTo: string
  channels: string[]
  campaigns: string[]
  adSets: string[]
  ads: string[]
  onlyActive: boolean
}

// ── Main component ──

export default function QualityMetricsSection({
  rawWindsorRows,
  dateFrom,
  dateTo,
  channels,
  campaigns,
  adSets,
  ads,
  onlyActive,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [prevMetrics, setPrevMetrics] = useState<QualityMetrics | null>(null)

  const filters: WindsorAdFilters = useMemo(
    () => ({ channels, campaigns, adSets, ads, onlyActive }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify({ channels, campaigns, adSets, ads, onlyActive })],
  )

  const metrics = useMemo(
    () => computeQualityMetrics(applyWindsorFilters(rawWindsorRows, filters)),
    [rawWindsorRows, filters],
  )

  // Fetch prev period in background
  useEffect(() => {
    setPrevMetrics(null)
    const prev = getPrevPeriodDates(dateFrom, dateTo)
    if (!prev) return
    const { prevFrom, prevTo } = prev
    let cancelled = false
    fetchWindsorData(prevFrom, prevTo)
      .then((rows) => {
        if (cancelled) return
        setPrevMetrics(computeQualityMetrics(applyWindsorFilters(rows, filters)))
      })
      .catch(() => { /* silent — no delta shown */ })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, JSON.stringify(filters)])

  // ── Alert helpers ──

  function freqAlert(f: number | null): { text: string; type: AlertType } | null {
    if (f === null) return null
    if (f > 4.5) return { text: `${f.toFixed(1)} — Alto`, type: 'red' }
    if (f > 3.0) return { text: `${f.toFixed(1)} — Atenção`, type: 'orange' }
    return null
  }

  function ctrAlert(ctr: number | null): { text: string; type: AlertType } | null {
    if (ctr === null) return null
    const threshold = metrics.hasGoogleData && !metrics.hasMetaData ? 3 : 1
    if (ctr < threshold) return { text: `Abaixo de ${threshold}%`, type: 'red' }
    return null
  }

  function hookRateAlert(hr: number | null): { text: string; type: AlertType } | null {
    if (hr === null) return null
    if (hr > 15) return { text: 'Bom', type: 'green' }
    if (hr >= 8) return { text: 'Regular', type: 'yellow' }
    return { text: 'Baixo', type: 'red' }
  }

  // ── Deltas ──

  const d = (curr: number | null, prev: number | null) => computeDelta(curr, prevMetrics ? prev : null)

  const p = prevMetrics

  const allEmpty = metrics.allEmpty && metrics.impressions === null

  // If no Windsor data at all (still loading or empty), don't render
  if (rawWindsorRows.length === 0) return null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer select-none hover:bg-gray-50 transition-colors"
        onClick={() => setCollapsed((v) => !v)}
      >
        <h3 className="text-sm font-semibold text-gray-700">Métricas de Qualidade</h3>
        <button className="text-gray-400 hover:text-gray-600 transition-colors shrink-0">
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {!collapsed && (
        <div className="px-5 pb-5 flex flex-col gap-5 border-t border-gray-100 pt-4">
          {/* TikTok / no data message */}
          {allEmpty ? (
            <p className="text-sm text-gray-400 text-center py-4">
              Métricas detalhadas não disponíveis para este canal ou seleção.
            </p>
          ) : (
            <>
              {/* Group 1 — Alcance e Distribuição */}
              <Group title="Alcance e Distribuição">
                <QCard
                  label="Impressões"
                  value={fmtN(metrics.impressions)}
                  delta={d(metrics.impressions, p?.impressions ?? null)}
                />
                <QCard
                  label="Frequência"
                  value={metrics.frequency !== null ? metrics.frequency.toFixed(2) : '—'}
                  delta={d(metrics.frequency, p?.frequency ?? null)}
                  inverted
                  alert={freqAlert(metrics.frequency)}
                />
                <QCard
                  label="CPM"
                  value={fmtBRL(metrics.cpm)}
                  delta={d(metrics.cpm, p?.cpm ?? null)}
                  inverted
                />
              </Group>

              {/* Group 2 — Engajamento e Cliques */}
              <Group title="Engajamento e Cliques">
                <QCard
                  label="CTR"
                  value={fmtPct(metrics.ctr)}
                  delta={d(metrics.ctr, p?.ctr ?? null)}
                  alert={ctrAlert(metrics.ctr)}
                />
                <QCard
                  label="Cliques no Link"
                  value={fmtN(metrics.linkClicks)}
                  delta={d(metrics.linkClicks, p?.linkClicks ?? null)}
                />
                <QCard
                  label="CPC"
                  value={fmtBRL(metrics.cpc)}
                  delta={d(metrics.cpc, p?.cpc ?? null)}
                  inverted
                />
              </Group>

              {/* Group 3 — Landing Page (show only when data exists) */}
              {(metrics.landingPageViews !== null || metrics.costPerLpView !== null) && (
                <Group title="Landing Page">
                  <QCard
                    label="Views de Landing Page"
                    value={fmtN(metrics.landingPageViews)}
                    delta={d(metrics.landingPageViews, p?.landingPageViews ?? null)}
                  />
                  <QCard
                    label="Custo por LP View"
                    value={fmtBRL(metrics.costPerLpView)}
                    delta={d(metrics.costPerLpView, p?.costPerLpView ?? null)}
                    inverted
                  />
                </Group>
              )}

              {/* Group 4 — Retenção de Vídeo (hide when no video data) */}
              {metrics.hasVideoData && (
                <Group title="Retenção de Vídeo">
                  <QCard
                    label="ThruPlay"
                    value={fmtN(metrics.thruplay)}
                    delta={d(metrics.thruplay, p?.thruplay ?? null)}
                  />
                  <QCard
                    label="Hook Rate (25%)"
                    value={fmtPct(metrics.hookRate)}
                    delta={d(metrics.hookRate, p?.hookRate ?? null)}
                    alert={hookRateAlert(metrics.hookRate)}
                  />
                  <QCard
                    label="Hold Rate (75%)"
                    value={fmtPct(metrics.holdRate75)}
                    delta={d(metrics.holdRate75, p?.holdRate75 ?? null)}
                  />
                  <QCard
                    label="Conclusão de Vídeo (100%)"
                    value={fmtN(metrics.videoP100)}
                    delta={d(metrics.videoP100, p?.videoP100 ?? null)}
                  />
                </Group>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
