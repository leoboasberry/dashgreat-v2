import { useState } from 'react'
import { X, Eye, EyeOff } from 'lucide-react'
import type { PixelConfig, PixelFilters } from '../../types/capi'
import { defaultPixelConfig } from '../../types/capi'

const CRM_STAGES = [
  { key: 'mql', label: 'MQL' },
  { key: 'not_mql', label: 'Não MQL' },
  { key: 'sql', label: 'SQL' },
  { key: 'opportunity', label: 'Oportunidade' },
  { key: 'meeting_completed', label: 'Reunião Realizada' },
  { key: 'deal_won', label: 'Deal Ganho' },
  { key: 'deal_lost', label: 'Deal Perdido' },
] as const

const INTERVAL_OPTIONS = [
  { value: 15, label: '15 minutos' },
  { value: 30, label: '30 minutos' },
  { value: 60, label: '1 hora' },
  { value: 240, label: '4 horas' },
  { value: 1440, label: '24 horas (1 vez/dia)' },
]

interface Props {
  initial?: PixelConfig
  onSave: (cfg: PixelConfig) => void
  onClose: () => void
}

export default function PixelConfigModal({ initial, onSave, onClose }: Props) {
  const [cfg, setCfg] = useState<PixelConfig>(() => initial ?? defaultPixelConfig())
  const [showToken, setShowToken] = useState(false)

  function set<K extends keyof PixelConfig>(k: K, v: PixelConfig[K]) {
    setCfg((prev) => ({ ...prev, [k]: v }))
  }

  function setFilter<K extends keyof PixelFilters>(k: K, v: PixelFilters[K]) {
    setCfg((prev) => ({ ...prev, filters: { ...prev.filters, [k]: v } }))
  }

  function setMapping(stage: string, eventName: string) {
    setCfg((prev) => ({
      ...prev,
      eventMapping: { ...prev.eventMapping, [stage]: eventName },
    }))
  }

  function handleSave() {
    if (!cfg.name.trim() || !cfg.pixelId.trim() || !cfg.accessToken.trim()) return
    onSave(cfg)
  }

  function parseTagInput(raw: string): string[] {
    return raw.split(',').map((s) => s.trim()).filter(Boolean)
  }

  const valid = cfg.name.trim() && cfg.pixelId.trim() && cfg.accessToken.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-10 pb-6 overflow-y-auto px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 text-base">
            {initial ? 'Editar Pixel' : 'Adicionar Pixel'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-6">
          {/* ── Identificação ── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Identificação</h3>
            <div className="flex flex-col gap-3">
              <Field label="Nome do Pixel">
                <input
                  className="input-base"
                  placeholder="Ex: Berry Principal"
                  value={cfg.name}
                  onChange={(e) => set('name', e.target.value)}
                />
              </Field>
              <Field label="Pixel ID">
                <input
                  className="input-base font-mono text-sm"
                  placeholder="123456789012345"
                  value={cfg.pixelId}
                  onChange={(e) => set('pixelId', e.target.value.trim())}
                />
              </Field>
              <Field label="Access Token (CAPI)">
                <div className="relative">
                  <input
                    className="input-base font-mono text-sm pr-10"
                    type={showToken ? 'text' : 'password'}
                    placeholder="EAAxxxxxxxx..."
                    value={cfg.accessToken}
                    onChange={(e) => set('accessToken', e.target.value.trim())}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </Field>
              <Field label="Test Event Code (opcional — para testes no Events Manager)">
                <input
                  className="input-base font-mono text-sm"
                  placeholder="TEST12345"
                  value={cfg.testEventCode ?? ''}
                  onChange={(e) => set('testEventCode', e.target.value.trim() || undefined)}
                />
              </Field>
            </div>
          </section>

          {/* ── Mapeamento de eventos ── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Mapeamento de Eventos CRM → Meta
            </h3>
            <p className="text-xs text-gray-400 mb-3">Deixe em branco para não enviar o estágio.</p>
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              {CRM_STAGES.map(({ key, label }, i) => (
                <div
                  key={key}
                  className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-gray-50' : ''}`}
                >
                  <span className="text-sm text-gray-600 w-36 shrink-0">{label}</span>
                  <span className="text-gray-300 text-sm">→</span>
                  <input
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                    placeholder={key === 'deal_won' ? 'Purchase' : key === 'mql' ? 'Lead' : '(não enviar)'}
                    value={cfg.eventMapping[key] ?? ''}
                    onChange={(e) => setMapping(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* ── Filtros ── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Filtros (deixe vazio = sem restrição)
            </h3>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="MRR mínimo (R$)">
                  <input
                    className="input-base"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={cfg.filters.minMrr ?? ''}
                    onChange={(e) => setFilter('minMrr', e.target.value ? Number(e.target.value) : undefined)}
                  />
                </Field>
                <Field label="MRR máximo (R$)">
                  <input
                    className="input-base"
                    type="number"
                    min={0}
                    placeholder="sem limite"
                    value={cfg.filters.maxMrr ?? ''}
                    onChange={(e) => setFilter('maxMrr', e.target.value ? Number(e.target.value) : undefined)}
                  />
                </Field>
              </div>
              <Field label="Campanhas (utm_campaign separados por vírgula)">
                <input
                  className="input-base"
                  placeholder="F177, BerryCamp, ..."
                  value={cfg.filters.campaigns.join(', ')}
                  onChange={(e) => setFilter('campaigns', parseTagInput(e.target.value))}
                />
              </Field>
              <Field label="UTM Source (separados por vírgula)">
                <input
                  className="input-base"
                  placeholder="facebook, google, ..."
                  value={cfg.filters.utmSources.join(', ')}
                  onChange={(e) => setFilter('utmSources', parseTagInput(e.target.value))}
                />
              </Field>
              <Field label="Segmentos (separados por vírgula)">
                <input
                  className="input-base"
                  placeholder="b2b, b2c, ..."
                  value={cfg.filters.segments.join(', ')}
                  onChange={(e) => setFilter('segments', parseTagInput(e.target.value))}
                />
              </Field>
              <Field label="Faturamento (separados por vírgula)">
                <input
                  className="input-base"
                  placeholder="500k-1M, 1M-5M, ..."
                  value={cfg.filters.faturamentos.join(', ')}
                  onChange={(e) => setFilter('faturamentos', parseTagInput(e.target.value))}
                />
              </Field>
            </div>
          </section>

          {/* ── Agendamento ── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Agendamento</h3>
            <div className="flex flex-col gap-3">
              <Field label="Janela de busca (dias anteriores a hoje)">
                <input
                  className="input-base"
                  type="number"
                  min={1}
                  max={365}
                  value={cfg.lookbackDays}
                  onChange={(e) => set('lookbackDays', Math.max(1, Number(e.target.value)))}
                />
              </Field>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfg.autoDispatch}
                    onChange={(e) => set('autoDispatch', e.target.checked)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-sm text-gray-700">Disparo automático enquanto a aba estiver aberta</span>
                </label>
              </div>
              {cfg.autoDispatch && (
                <Field label="Intervalo de disparo">
                  <select
                    className="input-base"
                    value={cfg.intervalMinutes}
                    onChange={(e) => set('intervalMinutes', Number(e.target.value))}
                  >
                    {INTERVAL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!valid}
            className="px-5 py-2 text-sm font-medium bg-[#0D2F9F] text-white rounded-lg hover:bg-blue-800 disabled:opacity-40 transition-colors"
          >
            {initial ? 'Salvar alterações' : 'Adicionar pixel'}
          </button>
        </div>
      </div>

      <style>{`
        .input-base {
          width: 100%;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          padding: 0.375rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .input-base:focus {
          border-color: #93c5fd;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
