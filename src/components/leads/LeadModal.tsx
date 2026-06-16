import { useEffect } from 'react'
import { X, CheckCircle, XCircle } from 'lucide-react'
import type { LeadSummary } from '../../utils/parseLeadDetail'
import {
  getLeadName, getLeadEmail, getLeadPhone, getLeadCompany,
  STAGE_LABELS, fmtEventDateTime,
} from '../../utils/parseLeadDetail'
import { parseCampaign } from '../../utils/parseLeads'
import type { SupabaseEvent } from '../../api/supabase'

// ── Helpers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pay(ev: SupabaseEvent): any { return ev.payload ?? {} }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deal(ev: SupabaseEvent): any { return (ev.payload as any)?.deal ?? {} }

function str(v: unknown): string {
  if (v == null || v === '') return '—'
  if (typeof v === 'number') return v.toLocaleString('pt-BR')
  return String(v)
}

function fmtBRL(v: unknown): string {
  const n = Number(v)
  if (!v || isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

// ── Section heading ──

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </section>
  )
}

// ── Key-value row ──

function KV({ label, value }: { label: string; value: string }) {
  if (value === '—') return null
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gray-400 shrink-0 w-36">{label}</span>
      <span className="text-gray-800 break-words">{value}</span>
    </div>
  )
}

// ── Stage badge ──

const STAGE_COLORS: Record<string, string> = {
  not_mql: 'bg-gray-100 text-gray-600',
  mql: 'bg-blue-50 text-blue-700',
  sql: 'bg-indigo-50 text-indigo-700',
  opportunity: 'bg-purple-50 text-purple-700',
  meeting_completed: 'bg-orange-50 text-orange-700',
  deal_won: 'bg-emerald-50 text-emerald-700',
  deal_lost: 'bg-red-50 text-red-700',
}

function StageBadge({ stage }: { stage: string }) {
  const cls = STAGE_COLORS[stage] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {STAGE_LABELS[stage] ?? stage}
    </span>
  )
}

// ── Timeline event row ──

function TimelineRow({ ev, isLast }: { ev: SupabaseEvent; isLast: boolean }) {
  const label = STAGE_LABELS[ev.event_type] ?? ev.event_type
  const ts = fmtEventDateTime(ev.event_ts ?? ev.event_date ?? null)
  const dot = STAGE_COLORS[ev.event_type] ?? 'bg-gray-300'
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${dot.split(' ')[0]}`} />
        {!isLast && <div className="w-px flex-1 bg-gray-100 mt-1" />}
      </div>
      <div className="pb-3">
        <p className="text-xs font-medium text-gray-800">{label}</p>
        <p className="text-[11px] text-gray-400">{ts}</p>
        {ev.event_type === 'deal_lost' && (() => {
          const d = deal(ev)
          const reason = d.lossReason ?? d.loss_reason
          const notes = d.lossReasonNotes
          return (
            <>
              {reason && <p className="text-[11px] text-red-600 mt-0.5">Motivo: {reason}</p>}
              {notes && <p className="text-[11px] text-red-400 mt-0.5">{notes}</p>}
            </>
          )
        })()}
      </div>
    </div>
  )
}

// ── Bloco 3: MQL Classification ──

function MqlBlock({ ev }: { ev: SupabaseEvent }) {
  const d = deal(ev)
  const mqlClass = d.mqlClassification
  if (!mqlClass) return <p className="text-xs text-gray-400">Dados de qualificação não disponíveis.</p>

  const result: string = mqlClass.mql ?? mqlClass.result ?? '—'
  const isYes = result.toUpperCase() === 'YES' || result === 'true'
  const signals: string[] = Array.isArray(mqlClass.signals) ? mqlClass.signals : []
  const services: string[] = Array.isArray(mqlClass.services) ? mqlClass.services : []

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {isYes
          ? <CheckCircle size={15} className="text-emerald-500 shrink-0" />
          : <XCircle size={15} className="text-red-400 shrink-0" />
        }
        <span className={`text-sm font-semibold ${isYes ? 'text-emerald-700' : 'text-red-600'}`}>
          {isYes ? 'Qualificado (MQL)' : 'Não Qualificado'}
        </span>
        {mqlClass.confidence && (
          <span className="text-[11px] text-gray-400 ml-auto">Confiança: {mqlClass.confidence}</span>
        )}
      </div>
      {mqlClass.reason && (
        <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{mqlClass.reason}</p>
      )}
      {signals.length > 0 && (
        <div>
          <p className="text-[11px] text-gray-400 mb-1.5">Sinais identificados</p>
          <div className="flex flex-wrap gap-1.5">
            {signals.map((s, i) => (
              <span key={i} className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{s}</span>
            ))}
          </div>
        </div>
      )}
      {services.length > 0 && (
        <div>
          <p className="text-[11px] text-gray-400 mb-1.5">Serviços identificados</p>
          <div className="flex flex-wrap gap-1.5">
            {services.map((s, i) => (
              <span key={i} className="text-[11px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Bloco 4: Lead Score breakdown ──

function ScoreRow({ label, value }: { label: string; value: unknown }) {
  if (value == null) return null
  return (
    <div className="flex justify-between text-xs py-1 border-b border-gray-50">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{String(value)}</span>
    </div>
  )
}

// ── Props ──

interface Props {
  lead: LeadSummary
  onClose: () => void
}

// ── Main Modal ──

export default function LeadModal({ lead, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Use the MQL/not_mql event as primary payload source
  const srcEv =
    lead.events.find((e) => e.event_type === 'mql' || e.event_type === 'not_mql') ??
    lead.events[0]!

  const d = deal(srcEv)
  const p = pay(srcEv)

  // Attribution
  const utmCampaign = d.utmCampaign ?? p.utmCampaign ?? ''
  const codes = utmCampaign ? parseCampaign(utmCampaign) : { campaign: '', adSet: '', ad: '' }
  const utmSource = p.utmSource ?? d.utmSource ?? ''
  const utmMedium = d.utmMedium ?? p.utmMedium ?? ''
  const utmContent = d.utmContent ?? p.utmContent ?? ''
  const utmTerm = d.utmTerm ?? p.utmTerm ?? ''
  const landingPage = d.pagina ?? p.pagina ?? d.landingPage ?? p.url ?? ''
  const hasGclid = !!(d.gclid ?? p.gclid)
  const hasFbclid = !!(d.fbclid ?? p.fbclid)

  // Commercial
  const revenue = d.revenueNormalization?.normalizedValue ?? d.revenue ?? p.revenue ?? ''
  const segment = d.segment ?? p.segment ?? ''
  const challenge = d.organizationChallenges ?? d.challenge ?? p.challenge ?? ''
  const product = d.product ?? p.product ?? ''
  const potentialMRR = d.potentialNewMRR ?? p.potentialNewMRR
  const leadScore = d.leadScore ?? p.leadScore
  const leadScoreV2 = d.leadScoreV2 ?? p.leadScoreV2
  const scoreBreakdown = d.leadScoreBreakdown ?? p.leadScoreBreakdown

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-start justify-center overflow-y-auto py-8"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-gray-800 leading-snug">{getLeadName(srcEv)}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StageBadge stage={lead.stage} />
              {lead.channel && (
                <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{lead.channel}</span>
              )}
              {lead.campaign && (
                <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-mono">{lead.campaign}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-6 overflow-y-auto max-h-[78vh]">

          {/* Bloco 1 — Identificação */}
          <Section title="Identificação">
            <div className="flex flex-col gap-1.5">
              <KV label="Nome" value={getLeadName(srcEv)} />
              <KV label="E-mail" value={getLeadEmail(srcEv)} />
              <KV label="Telefone" value={getLeadPhone(srcEv)} />
              <KV label="Empresa" value={getLeadCompany(srcEv)} />
              <KV label="Cidade / Estado" value={[str(d.city), str(d.state)].filter((v) => v !== '—').join(' / ') || '—'} />
              <KV label="Canal" value={lead.channel || '—'} />
              <KV label="Plataforma" value={str(d.platform)} />
              <KV label="Origem relatada" value={str(d.userReportedOrigin ?? p.userReportedOrigin)} />
            </div>
          </Section>

          {/* Bloco 2 — Jornada no funil */}
          <Section title="Jornada no Funil">
            <div className="mt-1">
              {lead.events.map((ev, i) => (
                <TimelineRow key={`${ev.event_type}-${i}`} ev={ev} isLast={i === lead.events.length - 1} />
              ))}
            </div>
          </Section>

          {/* Bloco 3 — Qualificação */}
          {(d.mqlClassification || lead.stage === 'mql' || lead.stage === 'not_mql') && (
            <Section title="Qualificação">
              <MqlBlock ev={srcEv} />
            </Section>
          )}

          {/* Bloco 4 — Dados comerciais */}
          <Section title="Dados Comerciais">
            <div className="flex flex-col gap-1.5">
              <KV label="Faixa de faturamento" value={str(revenue)} />
              <KV label="Segmento" value={str(segment)} />
              <KV label="Desafio" value={str(challenge)} />
              <KV label="Produto de interesse" value={str(product)} />
              <KV label="MRR potencial" value={fmtBRL(potentialMRR)} />
              {(leadScore != null || leadScoreV2 != null) && (
                <>
                  <KV label="Lead Score" value={str(leadScore)} />
                  <KV label="Lead Score v2" value={str(leadScoreV2)} />
                  {scoreBreakdown && typeof scoreBreakdown === 'object' && (
                    <div className="mt-1.5">
                      <p className="text-[11px] text-gray-400 mb-1">Breakdown do Score</p>
                      <div className="bg-gray-50 rounded-lg px-3 py-2">
                        {Object.entries(scoreBreakdown).map(([k, v]) => (
                          <ScoreRow key={k} label={k} value={v} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </Section>

          {/* Bloco 5 — Atribuição de marketing */}
          <Section title="Atribuição de Marketing">
            <div className="flex flex-col gap-1.5">
              <KV label="UTM Source" value={str(utmSource)} />
              <KV label="UTM Medium" value={str(utmMedium)} />
              <KV label="UTM Campaign" value={str(utmCampaign)} />
              <KV label="UTM Content" value={str(utmContent)} />
              <KV label="UTM Term" value={str(utmTerm)} />
              {codes.campaign && <KV label="Código Campanha" value={codes.campaign} />}
              {codes.adSet !== codes.campaign && codes.adSet && <KV label="Código Conjunto" value={codes.adSet} />}
              {codes.ad !== codes.adSet && codes.ad && <KV label="Código Anúncio" value={codes.ad} />}
              <KV label="Landing Page" value={str(landingPage)} />
              <div className="flex gap-4 mt-0.5">
                <div className="flex items-center gap-1.5 text-xs">
                  {hasGclid
                    ? <CheckCircle size={13} className="text-emerald-500" />
                    : <XCircle size={13} className="text-gray-300" />
                  }
                  <span className={hasGclid ? 'text-gray-700' : 'text-gray-400'}>gclid</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  {hasFbclid
                    ? <CheckCircle size={13} className="text-emerald-500" />
                    : <XCircle size={13} className="text-gray-300" />
                  }
                  <span className={hasFbclid ? 'text-gray-700' : 'text-gray-400'}>fbclid</span>
                </div>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
