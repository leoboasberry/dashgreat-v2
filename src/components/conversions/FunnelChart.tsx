import type { FunnelCounts } from '../../hooks/useConversionsData'

interface Stage {
  key: keyof FunnelCounts
  label: string
}

const STAGES: Stage[] = [
  { key: 'mql',         label: 'MQL' },
  { key: 'sql',         label: 'SQL' },
  { key: 'opportunity', label: 'Oportunidade' },
  { key: 'meeting',     label: 'Reunião' },
  { key: 'won',         label: 'Venda' },
]

const TRANSITION_LABELS = [
  'MQL → SQL',
  'SQL → Oportunidade',
  'Oportunidade → Reunião',
  'Reunião → Venda',
]

function pct(a: number, b: number): string {
  if (b === 0) return '—'
  return ((a / b) * 100).toFixed(1) + '%'
}

// Width ratios for the funnel shape (desktop horizontal bar widths)
const MOBILE_WIDTHS = [100, 82, 64, 46, 32]

interface Props {
  funnel: FunnelCounts
}

export default function FunnelChart({ funnel }: Props) {
  const max = funnel.mql || 1
  const values: Record<keyof FunnelCounts, number> = {
    mql: funnel.mql,
    sql: funnel.sql,
    opportunity: funnel.opportunity,
    meeting: funnel.meeting,
    won: funnel.won,
  }

  const mqlToVenda =
    funnel.mql > 0 ? ((funnel.won / funnel.mql) * 100).toFixed(1) + '%' : '—'

  const prevKeys: (keyof FunnelCounts | null)[] = [null, 'mql', 'sql', 'opportunity', 'meeting']

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-gray-700">Funil de Conversão</h3>
        <span className="text-xs bg-gray-100 text-[#1a1a1a] font-semibold px-3 py-1 rounded-full border border-gray-200">
          MQL → Venda: {mqlToVenda}
        </span>
      </div>

      {/* ── Mobile: funil vertical centralizado ── */}
      <div className="flex flex-col items-center gap-0 sm:hidden">
        {STAGES.map((stage, i) => {
          const val = values[stage.key]
          const prevKey = prevKeys[i]
          const prevVal = prevKey ? values[prevKey] : null
          const w = MOBILE_WIDTHS[i]

          return (
            <div key={stage.key} className="w-full flex flex-col items-center">
              {prevVal !== null && (
                <div className="flex flex-col items-center py-1.5">
                  <div className="w-px h-4 bg-gray-200" />
                  <span className="text-[10px] text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                    {pct(val, prevVal)} de {TRANSITION_LABELS[i - 1]}
                  </span>
                  <div className="w-px h-4 bg-gray-200" />
                </div>
              )}
              <div
                className="flex flex-col items-center justify-center bg-[#0D2F9F] rounded-xl py-3 transition-all duration-500"
                style={{ width: `${w}%`, minWidth: 120 }}
              >
                <span className="text-white text-[11px] font-medium opacity-80">{stage.label}</span>
                <span className="text-white text-xl font-bold leading-tight">
                  {val.toLocaleString('pt-BR')}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Desktop: barras horizontais ── */}
      <div className="hidden sm:flex flex-col gap-1.5">
        {STAGES.map((stage, i) => {
          const val = values[stage.key]
          const width = max > 0 ? Math.max((val / max) * 100, 2) : 2
          const prevKey = prevKeys[i]
          const prevVal = prevKey ? values[prevKey] : null

          return (
            <div key={stage.key}>
              {prevVal !== null && (
                <div className="text-center text-xs text-gray-400 my-0.5">
                  {pct(val, prevVal)} de {TRANSITION_LABELS[i - 1]}
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-24 text-right shrink-0">{stage.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-8 relative overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#0D2F9F] transition-all duration-500 flex items-center justify-end pr-3"
                    style={{ width: `${width}%` }}
                  >
                    <span className="text-white text-xs font-bold whitespace-nowrap">
                      {val.toLocaleString('pt-BR')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
