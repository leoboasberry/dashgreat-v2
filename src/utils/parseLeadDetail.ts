import type { SupabaseEvent } from '../api/supabase'
import { normalizeCrmChannel } from './channelNorm'
import { parseCampaign } from './parseLeads'

// ── Stage definitions ──

export const STAGE_ORDER: Record<string, number> = {
  not_mql: 1,
  mql: 2,
  sql: 3,
  opportunity: 4,
  meeting_completed: 5,
  deal_won: 6,
  deal_lost: 99,
}

export const STAGE_LABELS: Record<string, string> = {
  not_mql: 'Não Qualificado',
  mql: 'MQL',
  sql: 'SQL',
  opportunity: 'Oportunidade',
  meeting_completed: 'Reunião',
  deal_won: 'Venda',
  deal_lost: 'Perdido',
}

export type Stage =
  | 'not_mql' | 'mql' | 'sql' | 'opportunity'
  | 'meeting_completed' | 'deal_won' | 'deal_lost' | 'unknown'

// ── Types ──

export interface LeadSummary {
  dealId: string
  name: string
  email: string
  company: string
  channel: string
  campaign: string
  adSet: string
  ad: string
  stage: Stage
  stageLabel: string
  revenue: string
  segment: string
  landingPage: string
  lastEventTs: string | null
  events: SupabaseEvent[]
}

// ── Safe payload accessors ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function p(ev: SupabaseEvent): any { return ev.payload ?? {} }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function d(ev: SupabaseEvent): any { return (ev.payload as any)?.deal ?? {} }

export function getLeadName(ev: SupabaseEvent): string {
  const deal = d(ev); const pay = p(ev)
  const names = deal.contactNames
  return (
    (Array.isArray(names) && names.length > 0 ? names[0] : undefined) ??
    deal.contactName ?? pay.name ?? deal.name ?? '—'
  )
}

export function getLeadEmail(ev: SupabaseEvent): string {
  const deal = d(ev); const pay = p(ev)
  return deal.contactEmail ?? pay.email ?? deal.email ?? '—'
}

export function getLeadPhone(ev: SupabaseEvent): string {
  const deal = d(ev); const pay = p(ev)
  return deal.contactPhone ?? pay.phone ?? deal.phone ?? '—'
}

export function getLeadCompany(ev: SupabaseEvent): string {
  const deal = d(ev); const pay = p(ev)
  return deal.organizationTradeName ?? pay.company ?? deal.company ?? '—'
}

// ── Main parse function ──

export function parseDealLeads(events: SupabaseEvent[]): LeadSummary[] {
  // Group by deal_id
  const byDeal = new Map<string, SupabaseEvent[]>()
  for (const ev of events) {
    if (!ev.deal_id) continue
    if (!byDeal.has(ev.deal_id)) byDeal.set(ev.deal_id, [])
    byDeal.get(ev.deal_id)!.push(ev)
  }

  const leads: LeadSummary[] = []

  for (const [dealId, dealEvents] of byDeal) {
    // Sort chronologically
    const sorted = [...dealEvents].sort((a, b) => {
      const ta = a.event_ts ?? a.event_date ?? ''
      const tb = b.event_ts ?? b.event_date ?? ''
      return ta.localeCompare(tb)
    })

    // Most advanced stage — deal_lost overrides all
    let stage: Stage = 'unknown'
    let maxOrder = 0
    for (const ev of sorted) {
      if (ev.event_type === 'deal_lost') { stage = 'deal_lost'; break }
      const order = STAGE_ORDER[ev.event_type] ?? 0
      if (order > maxOrder) { maxOrder = order; stage = ev.event_type as Stage }
    }

    // Best source event for identification (prefer mql/not_mql which carry full payload)
    const srcEv =
      sorted.find((e) => e.event_type === 'mql' || e.event_type === 'not_mql') ??
      sorted[0]!

    const pay = p(srcEv)
    const deal = d(srcEv)

    // Channel
    const platform = deal.platform ?? ''
    const utmSource = pay.utmSource ?? deal.utmSource ?? ''
    const channel = normalizeCrmChannel(platform, utmSource)

    // Campaign breakdown
    const utmCampaign = deal.utmCampaign ?? pay.utmCampaign ?? ''
    const codes = utmCampaign
      ? parseCampaign(utmCampaign)
      : { campaign: '', adSet: '', ad: '' }

    // Other fields
    const revenue =
      deal.revenueNormalization?.normalizedValue ?? deal.revenue ?? pay.revenue ?? ''
    const segment = deal.segment ?? pay.segment ?? ''
    const landingPage = deal.pagina ?? pay.pagina ?? deal.landingPage ?? pay.url ?? ''

    const lastEv = sorted[sorted.length - 1]!
    const lastEventTs = lastEv.event_ts ?? lastEv.event_date ?? null

    leads.push({
      dealId,
      name: getLeadName(srcEv),
      email: getLeadEmail(srcEv),
      company: getLeadCompany(srcEv),
      channel,
      campaign: codes.campaign,
      adSet: codes.adSet !== codes.campaign ? codes.adSet : '',
      ad: codes.ad !== codes.adSet ? codes.ad : '',
      stage,
      stageLabel: STAGE_LABELS[stage] ?? stage,
      revenue,
      segment,
      landingPage,
      lastEventTs,
      events: sorted,
    })
  }

  // Most recent first
  return leads.sort((a, b) => {
    const ta = a.lastEventTs ?? ''
    const tb = b.lastEventTs ?? ''
    return tb.localeCompare(ta)
  })
}

// ── Summary counts from leads ──

export interface LeadCounts {
  total: number  // unique deals
  mqls: number
  sqls: number
  notMql: number
  opportunities: number
  meetings: number
  won: number
  mqlSqlPct: number | null
}

export function computeLeadCounts(leads: LeadSummary[]): LeadCounts {
  // Count by max stage (each deal counted once at its highest stage)
  const total = leads.length
  const stageCounts: Record<Stage, number> = {
    not_mql: 0, mql: 0, sql: 0, opportunity: 0,
    meeting_completed: 0, deal_won: 0, deal_lost: 0, unknown: 0,
  }
  for (const l of leads) stageCounts[l.stage] = (stageCounts[l.stage] ?? 0) + 1

  // Cumulative counts: SQL means it also passed MQL, etc.
  // But the spec wants "total per stage reached", not "final stage only"
  // So count all leads that have *at least* that stage event
  const stageReached = (s: string) =>
    leads.filter((l) => STAGE_ORDER[l.stage] >= (STAGE_ORDER[s] ?? 0)).length

  const mqls = stageReached('mql')
  const sqls = stageReached('sql')
  const opportunities = stageReached('opportunity')
  const meetings = stageReached('meeting_completed')
  const won = stageReached('deal_won')
  const notMql = stageCounts.not_mql

  const mqlSqlPct = mqls > 0 ? (sqls / mqls) * 100 : null

  return { total, mqls, sqls, notMql, opportunities, meetings, won, mqlSqlPct }
}

// ── Timestamp formatting ──

export function fmtEventTime(ts: string | null): string {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch { return ts.slice(11, 16) || '—' }
}

export function fmtEventDateTime(ts: string | null): string {
  if (!ts) return '—'
  try {
    const d = new Date(ts)
    return (
      d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
      ' ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    )
  } catch { return ts.slice(0, 16) || '—' }
}
