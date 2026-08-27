/**
 * useTestMetrics — série diária de métricas para um teste A/B.
 *
 * Busca dados do Windsor (pela conta do teste) e do Supabase events,
 * filtra pelas linked_codes do teste, e retorna pontos por dia.
 *
 * Não duplica computeMetrics(): para o contexto de teste (uma única
 * campanha/conjunto em uma única conta) a computação inline é mais
 * simples e direta do que passar um objeto ConversionFilters.
 */

import { useState, useEffect, useCallback } from 'react'
import { fetchWindsorForAccount, type WindsorRowTagged, type WindsorAccount } from '../api/windsorAccounts'
import { fetchEvents, type SupabaseEvent } from '../api/supabase'
import { parseCampaign } from '../utils/parseLeads'

export interface TestDayMetrics {
  date: string
  spend: number
  impressions: number
  clicks: number
  cpm: number | null        // R$/mil impressões
  cpc: number | null        // R$/clique
  ctr: number | null        // cliques / impressões (0–1)
  mqls: number
  cpmql: number | null      // R$/MQL
}

export interface UseTestMetricsResult {
  loading: boolean
  error: string | null
  days: TestDayMetrics[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Classifica um linked_code pelo nível estrutural
function classifyCode(code: string): 'ad' | 'adset' | 'campaign' {
  if (/[A-Za-z]+\d+C\d+AD\d+/i.test(code)) return 'ad'
  if (/[A-Za-z]+\d+C\d+/i.test(code)) return 'adset'
  return 'campaign'
}

// Extrai os três níveis de código de uma utmCampaign
function codesFromUtm(utmCampaign: string) {
  return parseCampaign(utmCampaign)
}

// Filtra linhas Windsor por linked_codes
function filterWindsor(rows: WindsorRowTagged[], linkedCodes: string[]): WindsorRowTagged[] {
  if (!linkedCodes.length) return rows
  const codes = new Set(linkedCodes.map((c) => c.toUpperCase()))

  return rows.filter((row) => {
    const campaign = row.campaign ?? ''
    const adset = row.adset_name ?? ''
    const ad = row.ad_name ?? ''

    // Extrai código estruturado de cada campo
    const cm = campaign.match(/\b([A-Za-z]+\d+)\b/)?.[1]?.toUpperCase()
    const am = adset.match(/([A-Za-z]+\d+C\d+)/i)?.[1]?.toUpperCase()
    const dm = ad.match(/([A-Za-z]+\d+C\d+AD\d+)/i)?.[1]?.toUpperCase()

    return (cm && codes.has(cm)) || (am && codes.has(am)) || (dm && codes.has(dm))
  })
}

// Filtra events Supabase por linked_codes
function filterEvents(events: SupabaseEvent[], linkedCodes: string[]): SupabaseEvent[] {
  if (!linkedCodes.length) return events
  const codes = new Set(linkedCodes.map((c) => c.toUpperCase()))

  return events.filter((ev) => {
    const raw = ev.payload?.deal?.utmCampaign ?? ev.payload?.utmCampaign ?? ''
    const utmCampaign = typeof raw === 'string' ? raw : ''
    const { campaign, adSet, ad } = codesFromUtm(utmCampaign)

    return (
      (campaign && codes.has(campaign.toUpperCase())) ||
      (adSet && codes.has(adSet.toUpperCase())) ||
      (ad && codes.has(ad.toUpperCase()))
    )
  })
}

// Devolve a data do evento em BRT (YYYY-MM-DD)
function eventDate(ev: SupabaseEvent): string | null {
  if (ev.event_date) return ev.event_date
  if (!ev.event_ts) return null
  try {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(
      new Date(ev.event_ts),
    )
  } catch {
    return null
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTestMetrics(params: {
  account: WindsorAccount | null
  linkedCodes: string[]
  dateFrom: string | null
  dateTo: string | null
}): UseTestMetricsResult {
  const { account, linkedCodes, dateFrom, dateTo } = params

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState<TestDayMetrics[]>([])

  const load = useCallback(async () => {
    if (!account || !dateFrom || !dateTo) {
      setDays([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [windsorRaw, eventsRaw] = await Promise.all([
        fetchWindsorForAccount(dateFrom, dateTo, account).catch((e: unknown) => {
          throw new Error(`Windsor: ${e instanceof Error ? e.message : String(e)}`)
        }),
        fetchEvents(dateFrom, dateTo).catch((e: unknown) => {
          throw new Error(`Supabase: ${e instanceof Error ? e.message : String(e)}`)
        }),
      ])

      const windsorRows = filterWindsor(windsorRaw, linkedCodes)
      const events = filterEvents(eventsRaw, linkedCodes)

      // Aggregate Windsor metrics by date
      const byDate = new Map<
        string,
        { spend: number; impressions: number; clicks: number }
      >()

      for (const row of windsorRows) {
        if (!row.date) continue
        const prev = byDate.get(row.date) ?? { spend: 0, impressions: 0, clicks: 0 }
        byDate.set(row.date, {
          spend: prev.spend + (Number(row.spend) || 0),
          impressions: prev.impressions + (Number(row.impressions) || 0),
          clicks: prev.clicks + (Number(row.clicks) || 0),
        })
      }

      // Count MQLs by date (deduplicated by deal_id per day)
      const mqlsByDate = new Map<string, Set<string>>()
      for (const ev of events) {
        if (ev.event_type !== 'mql' || !ev.deal_id) continue
        const d = eventDate(ev)
        if (!d) continue
        if (!mqlsByDate.has(d)) mqlsByDate.set(d, new Set())
        mqlsByDate.get(d)!.add(ev.deal_id)
      }

      // Merge all dates
      const allDates = new Set([...byDate.keys(), ...mqlsByDate.keys()])
      const result: TestDayMetrics[] = [...allDates]
        .sort()
        .map((date) => {
          const w = byDate.get(date) ?? { spend: 0, impressions: 0, clicks: 0 }
          const mqls = mqlsByDate.get(date)?.size ?? 0

          const cpm = w.impressions > 0 ? (w.spend / w.impressions) * 1000 : null
          const cpc = w.clicks > 0 ? w.spend / w.clicks : null
          const ctr = w.impressions > 0 ? w.clicks / w.impressions : null
          const cpmql = mqls > 0 ? w.spend / mqls : null

          return { date, ...w, cpm, cpc, ctr, mqls, cpmql }
        })

      setDays(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [account, linkedCodes.join(','), dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  return { loading, error, days }
}
