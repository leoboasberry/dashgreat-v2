import { useState } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import type { CeaConfig } from '../../utils/cea'

interface Props {
  config: CeaConfig
  syncing: boolean
  onSave: (c: CeaConfig) => void
  onClose: () => void
}

function Field({
  label,
  hint,
  value,
  onChange,
  prefix,
  suffix,
}: {
  label: string
  hint: string
  value: number
  onChange: (v: number) => void
  prefix?: string
  suffix?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      <p className="text-[11px] text-gray-400 leading-tight">{hint}</p>
      <div className="flex items-center gap-1.5 mt-0.5">
        {prefix && <span className="text-xs text-gray-400">{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-28 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0D2F9F] focus:border-transparent"
        />
        {suffix && <span className="text-xs text-gray-400">{suffix}</span>}
      </div>
    </div>
  )
}

export default function CeaConfigDrawer({ config, syncing, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<CeaConfig>({ ...config })

  function set(key: keyof CeaConfig, value: number) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[340px] bg-white shadow-xl flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Config. CEA</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Parâmetros do sistema de decisão</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 px-5 py-5 flex flex-col gap-5">
          {/* Ticket */}
          <div>
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Ticket</h3>
            <Field
              label="Ticket Médio"
              hint="Valor médio do contrato. Usado para calcular CEA quando não há vendas."
              value={draft.ticket_medio}
              onChange={(v) => set('ticket_medio', v)}
              prefix="R$"
            />
          </div>

          <div className="h-px bg-gray-100" />

          {/* Fase Validação */}
          <div>
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Fase Validação (&lt; 20 reuniões)</h3>
            <div className="flex flex-col gap-4">
              <Field
                label="CPA MQL Teto"
                hint="Acima deste custo por MQL, o anúncio é considerado caro."
                value={draft.cpa_mql_teto}
                onChange={(v) => set('cpa_mql_teto', v)}
                prefix="R$"
              />
              <Field
                label="MQL→SQL Excelente"
                hint="Taxa excelente de qualificação. Acima disso: APROVAR."
                value={draft.mql_sql_excelente}
                onChange={(v) => set('mql_sql_excelente', v)}
                suffix="%"
              />
              <Field
                label="MQL→SQL Piso"
                hint="Taxa mínima aceitável. Abaixo disso: ATENÇÃO."
                value={draft.mql_sql_piso}
                onChange={(v) => set('mql_sql_piso', v)}
                suffix="%"
              />
              <Field
                label="MQL→SQL Crítico"
                hint="Taxa crítica de qualificação. Abaixo disso: PAUSAR."
                value={draft.mql_sql_critico}
                onChange={(v) => set('mql_sql_critico', v)}
                suffix="%"
              />
            </div>
          </div>

          <div className="h-px bg-gray-100" />

          {/* Fase Escala */}
          <div>
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Fase Escala (≥ 20 reuniões)</h3>
            <div className="flex flex-col gap-4">
              <Field
                label="CEA Excelente"
                hint="CEA ≤ este valor: PROTEGIDA (não tocar)."
                value={draft.cea_excelente}
                onChange={(v) => set('cea_excelente', v)}
                suffix="× ticket"
              />
              <Field
                label="CEA Teto"
                hint="CEA acima deste valor exige revisão ou pausa."
                value={draft.cea_teto}
                onChange={(v) => set('cea_teto', v)}
                suffix="× ticket"
              />
              <Field
                label="RR→GANHO Piso"
                hint="Taxa mínima de reuniões convertidas em vendas."
                value={draft.rr_ganho_piso}
                onChange={(v) => set('rr_ganho_piso', v)}
                suffix="%"
              />
              <Field
                label="MQL→SQL Excelente (Escala)"
                hint="Anti-erro: mesmo com CEA alto, não pausar se conversão for excelente."
                value={draft.mql_sql_excelente}
                onChange={(v) => set('mql_sql_excelente', v)}
                suffix="%"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100">
          <button
            onClick={() => onSave(draft)}
            disabled={syncing}
            className="w-full flex items-center justify-center gap-2 bg-[#0D2F9F] text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[#0a2580] transition-colors disabled:opacity-50"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {syncing ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </div>
      </div>
    </>
  )
}
