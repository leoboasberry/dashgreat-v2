import type { WindsorRow } from '../api/windsor'
import type { SupabaseEvent } from '../api/supabase'
import { parseCampaign } from './parseLeads'
import { normalizeWindsorChannel, normalizeCrmChannel, CHANNELS, type Channel } from './channelNorm'

// ── Re-exported types (components import these from useConversionsData which re-exports) ──

export interface FunnelCounts {
  mql: number
  sql: number
  opportunity: number
  meeting: number
  won: number
}

export interface ChannelMetrics {
  channel: Channel
  spend: number
  mqls: number
  sqls: number
  opportunities: number
  meetings: number
  won: number
  mrr: number
}

export interface AdMetrics {
  ad: string
  adFullName?: string  // full Windsor ad_name (e.g. "F177C1AD6 - Vídeo Dashboard 2025")
  spend: number
  mqls: number
  sqls: number
  opportunities: number
  meetings: number
  won: number
  mrr: number
  status?: string
}

export interface DailySpend {
  date: string
  [channel: string]: string | number
}

export interface DailyFunnelPoint {
  date: string
  mqls: number
  spend: number // total spend that day (for computing CPMQL = spend/mqls)
}

// ── Filter types ──

export interface ConversionFilters {
  channels?: string[]   // canonical Channel names
  campaigns?: string[]  // e.g. ["F186", "G85"]
  adSets?: string[]     // e.g. ["F186C2"]
  ads?: string[]        // e.g. ["F186C2AD5"]
  pages?: string[]      // landing page IDs
  revenue?: string[]    // faturamento values
  segments?: string[]   // segment values
  onlyActive?: boolean  // when true, filter Windsor to ACTIVE campaign_status + status only
}

export interface FilterOptions {
  campaigns: string[]
  adSets: string[]   // only those belonging to selected campaigns (cascade)
  ads: string[]      // only those belonging to selected adSets (cascade)
  pages: string[]
  revenue: string[]
  segments: string[]
}

export interface MetricsResult {
  totalSpend: number
  funnelCounts: FunnelCounts
  totalMRR: number
  byChannel: ChannelMetrics[]
  byAd: AdMetrics[]
  dailySpend: DailySpend[]
  dailyFunnel: DailyFunnelPoint[]
  /** True when LP/Revenue/Segment filters are active without a campaign filter — Windsor spend is NOT narrowed */
  investmentPartial: boolean
  /** Most recent campaign_status per campaign code (from all rows, pre-filter) */
  campaignStatuses: Record<string, string>
  /** Most recent status per ad key (from all rows, pre-filter) */
  adStatuses: Record<string, string>
}

// ── Helpers ──

function evtPagina(ev: SupabaseEvent): string {
  return ev.payload?.deal?.pagina ?? ev.payload?.pagina ?? ''
}

function evtRevenue(ev: SupabaseEvent): string {
  return (
    ev.payload?.deal?.revenueNormalization?.normalizedValue ??
    ev.payload?.deal?.revenue ??
    ev.payload?.revenue ??
    ''
  )
}

function evtSegment(ev: SupabaseEvent): string {
  return ev.payload?.deal?.segment ?? ev.payload?.segment ?? ''
}

function evtCodes(ev: SupabaseEvent) {
  const utmCampaign = ev.payload?.deal?.utmCampaign ?? ''
  return parseCampaign(utmCampaign)
}

/** Extract campaign code (e.g. "F186") from a Windsor name field which may contain it embedded */
function extractCampaignCode(name: string): string {
  if (!name) return ''
  const m = name.match(/\b([A-Za-z]+\d+)\b/)
  return m ? m[1]! : ''
}

/** Extract adset code (e.g. "F186C2") from a Windsor adset name */
function extractAdSetCode(name: string): string {
  if (!name) return ''
  const m = name.match(/([A-Za-z]+\d+C\d+)/i)
  return m ? m[1]! : extractCampaignCode(name)
}

/** Extract ad code (e.g. "F186C2AD5") from a Windsor ad name */
function extractAdCode(name: string): string {
  if (!name) return ''
  const m = name.match(/([A-Za-z]+\d+C\d+AD\d+)/i)
  return m ? m[1]! : extractAdSetCode(name)
}

/** Extract campaign/adSet/ad codes from a Windsor row */
function wCodes(row: WindsorRow) {
  return {
    campaign: extractCampaignCode(row.campaign ?? ''),
    adSet: extractAdSetCode(row.adset_name ?? ''),
    ad: extractAdCode(row.ad_name ?? ''),
  }
}

/**
 * Resolve the best ad key for grouping Windsor spend.
 * Priority: structured code from ad_name → adset_name → campaign
 * then raw ad_name → raw adset_name → raw campaign.
 * This handles PMAX/Google campaigns where ad_name is empty but
 * the campaign/adset name contains the structured code (e.g. "[G67]...").
 */
function resolveAdKey(row: WindsorRow): string {
  const codes = wCodes(row)
  // codes.ad already cascades through adset/campaign codes within ad_name only.
  // Also try extracting from adset_name and campaign independently.
  const structuredCode =
    codes.ad ||
    extractAdSetCode(row.adset_name ?? '') ||
    extractCampaignCode(row.campaign ?? '')

  return (
    structuredCode ||
    (row.ad_name ?? '').trim() ||
    (row.adset_name ?? '').trim() ||
    (row.campaign ?? '').trim() ||
    '(sem identificação)'
  )
}

// ── Filter options extraction ──

export function extractFilterOptions(
  events: SupabaseEvent[],
  selectedCampaigns: string[] = [],
  selectedAdSets: string[] = [],
): FilterOptions {
  const campaigns = new Set<string>()
  const adSets = new Set<string>()
  const ads = new Set<string>()
  const pages = new Set<string>()
  const revenue = new Set<string>()
  const segments = new Set<string>()

  for (const ev of events) {
    const { campaign, adSet, ad } = evtCodes(ev)

    // Only add campaign codes that look structured (contain letter+digit pattern)
    if (/[A-Za-z]\d/.test(campaign)) {
      campaigns.add(campaign)

      // Cascade: adsets only if campaign is selected (or no campaign selected)
      if (selectedCampaigns.length === 0 || selectedCampaigns.includes(campaign)) {
        if (adSet !== campaign) adSets.add(adSet)

        // Cascade: ads only if adset is selected (or no adset selected)
        if (selectedAdSets.length === 0 || selectedAdSets.includes(adSet)) {
          if (ad !== adSet) ads.add(ad)
        }
      }
    }

    const p = evtPagina(ev)
    if (p) pages.add(p)

    const r = evtRevenue(ev)
    if (r) revenue.add(r)

    const s = evtSegment(ev)
    if (s) segments.add(s)
  }

  return {
    campaigns: [...campaigns].sort(),
    adSets: [...adSets].sort(),
    ads: [...ads].sort(),
    pages: [...pages].sort(),
    revenue: [...revenue].sort(),
    segments: [...segments].sort(),
  }
}

// ── Main computation ──

export function computeMetrics(
  windsorRows: WindsorRow[],
  events: SupabaseEvent[],
  filters: ConversionFilters = {},
): MetricsResult {
  const {
    channels = [],
    campaigns = [],
    adSets = [],
    ads = [],
    pages = [],
    revenue = [],
    segments = [],
    onlyActive = false,
  } = filters

  const hasCampaignFilters = campaigns.length > 0 || adSets.length > 0 || ads.length > 0
  const hasNonWindsorFilters = pages.length > 0 || revenue.length > 0 || segments.length > 0
  const investmentPartial = hasNonWindsorFilters && !hasCampaignFilters

  // ── Compute status maps from ALL rows (pre-filter), using most recent date ──
  const campaignStatusDate: Record<string, string> = {}
  const campaignStatuses: Record<string, string> = {}
  const adStatusDate: Record<string, string> = {}
  const adStatuses: Record<string, string> = {}

  for (const row of windsorRows) {
    if (!row.date) continue
    const cc = extractCampaignCode(row.campaign ?? '')
    if (cc && row.campaign_status) {
      if (!campaignStatusDate[cc] || row.date > campaignStatusDate[cc]) {
        campaignStatusDate[cc] = row.date
        campaignStatuses[cc] = row.campaign_status
      }
    }
    const adKey = resolveAdKey(row)
    if (adKey && row.status) {
      if (!adStatusDate[adKey] || row.date > adStatusDate[adKey]) {
        adStatusDate[adKey] = row.date
        adStatuses[adKey] = row.status
      }
    }
  }

  // ── Filter Windsor rows ──
  let filteredWindsor = windsorRows

  // "Apenas ativos" — restrict to active campaigns AND active creatives
  // Windsor uses 'ENABLED' for active status
  if (onlyActive) {
    const isActive = (s?: string) => s === 'ENABLED' || s === 'ACTIVE'
    filteredWindsor = filteredWindsor.filter(
      (r) => isActive(r.campaign_status) && isActive(r.status),
    )
  }

  if (!investmentPartial) {
    if (campaigns.length > 0) {
      filteredWindsor = filteredWindsor.filter((r) => campaigns.includes(wCodes(r).campaign))
    }
    if (adSets.length > 0) {
      filteredWindsor = filteredWindsor.filter((r) => adSets.includes(wCodes(r).adSet))
    }
    if (ads.length > 0) {
      filteredWindsor = filteredWindsor.filter((r) => ads.includes(wCodes(r).ad))
    }
  }
  if (channels.length > 0) {
    filteredWindsor = filteredWindsor.filter((r) =>
      channels.includes(normalizeWindsorChannel(r.datasource, r.source)),
    )
  }

  // ── Filter Supabase events ──
  let filteredEvents = events

  if (hasCampaignFilters) {
    filteredEvents = filteredEvents.filter((ev) => {
      const { campaign, adSet, ad } = evtCodes(ev)
      if (campaigns.length > 0 && !campaigns.includes(campaign)) return false
      if (adSets.length > 0 && !adSets.includes(adSet)) return false
      if (ads.length > 0 && !ads.includes(ad)) return false
      return true
    })
  }
  if (pages.length > 0) {
    filteredEvents = filteredEvents.filter((ev) => pages.includes(evtPagina(ev)))
  }
  if (revenue.length > 0) {
    filteredEvents = filteredEvents.filter((ev) => {
      const r = evtRevenue(ev)
      return !r || revenue.includes(r) // events with no revenue data pass through
    })
  }
  if (segments.length > 0) {
    filteredEvents = filteredEvents.filter((ev) => segments.includes(evtSegment(ev)))
  }

  // ── Compute spend ──
  const spendByChannel: Record<Channel, number> = Object.fromEntries(
    CHANNELS.map((c) => [c, 0]),
  ) as Record<Channel, number>
  const spendByDateChannel: Record<string, Record<Channel, number>> = {}

  for (const row of filteredWindsor) {
    if (!row.date) continue
    const ch = normalizeWindsorChannel(row.datasource, row.source)
    const spend = Number(row.spend) || 0
    spendByChannel[ch] += spend
    if (!spendByDateChannel[row.date]) {
      spendByDateChannel[row.date] = Object.fromEntries(
        CHANNELS.map((c) => [c, 0]),
      ) as Record<Channel, number>
    }
    spendByDateChannel[row.date][ch] += spend
  }

  const totalSpend = Object.values(spendByChannel).reduce((a, b) => a + b, 0)
  const dailySpend: DailySpend[] = Object.entries(spendByDateChannel)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, chs]) => ({ date, ...chs }))

  // ── Compute funnel from events ──
  // First pass: build deal→channel map from all filtered events
  const dealChannels = new Map<string, Channel>()
  for (const ev of filteredEvents) {
    const dealId = ev.deal_id
    if (!dealId) continue
    if (!dealChannels.has(dealId)) {
      const platform = ev.payload?.deal?.platform
      const utmSource = ev.payload?.utmSource
      dealChannels.set(dealId, normalizeCrmChannel(platform, utmSource))
    }
  }

  // Apply channel filter to events using the deal→channel map
  const channelFilteredEvents =
    channels.length > 0
      ? filteredEvents.filter((ev) => {
          if (!ev.deal_id) return false
          const ch = dealChannels.get(ev.deal_id) ?? 'Outras Origens'
          return channels.includes(ch)
        })
      : filteredEvents

  const dealMRR = new Map<string, number>()
  for (const ev of channelFilteredEvents) {
    const dealId = ev.deal_id
    if (!dealId) continue
    if (ev.event_type === 'deal_won') {
      const mrr = Number(ev.payload?.deal?.potentialNewMRR) || 0
      if (mrr > 0 && !dealMRR.has(dealId)) dealMRR.set(dealId, mrr)
    }
  }

  const stageDeals: Record<string, Set<string>> = {
    mql: new Set(),
    sql: new Set(),
    opportunity: new Set(),
    meeting_completed: new Set(),
    deal_won: new Set(),
  }
  for (const ev of channelFilteredEvents) {
    if (ev.deal_id && stageDeals[ev.event_type]) {
      stageDeals[ev.event_type].add(ev.deal_id)
    }
  }

  const funnelCounts: FunnelCounts = {
    mql: stageDeals.mql.size,
    sql: stageDeals.sql.size,
    opportunity: stageDeals.opportunity.size,
    meeting: stageDeals.meeting_completed.size,
    won: stageDeals.deal_won.size,
  }

  const totalMRR = Array.from(dealMRR.values()).reduce((a, b) => a + b, 0)

  // ── By-channel breakdown ──
  const stageDealsByChannel: Record<string, Record<Channel, Set<string>>> = {
    mql: {} as Record<Channel, Set<string>>,
    sql: {} as Record<Channel, Set<string>>,
    opportunity: {} as Record<Channel, Set<string>>,
    meeting_completed: {} as Record<Channel, Set<string>>,
    deal_won: {} as Record<Channel, Set<string>>,
  }
  for (const stage of Object.keys(stageDealsByChannel)) {
    for (const ch of CHANNELS) stageDealsByChannel[stage][ch] = new Set()
  }
  const mrrByChannel: Record<Channel, number> = Object.fromEntries(
    CHANNELS.map((c) => [c, 0]),
  ) as Record<Channel, number>

  for (const ev of channelFilteredEvents) {
    if (!ev.deal_id) continue
    const ch = dealChannels.get(ev.deal_id) ?? 'Outras Origens'
    if (stageDealsByChannel[ev.event_type]) {
      stageDealsByChannel[ev.event_type][ch as Channel].add(ev.deal_id)
    }
    if (ev.event_type === 'deal_won') {
      mrrByChannel[ch as Channel] += dealMRR.get(ev.deal_id) ?? 0
    }
  }

  const byChannel: ChannelMetrics[] = CHANNELS.map((ch) => ({
    channel: ch,
    spend: spendByChannel[ch],
    mqls: stageDealsByChannel.mql[ch].size,
    sqls: stageDealsByChannel.sql[ch].size,
    opportunities: stageDealsByChannel.opportunity[ch].size,
    meetings: stageDealsByChannel.meeting_completed[ch].size,
    won: stageDealsByChannel.deal_won[ch].size,
    mrr: mrrByChannel[ch],
  }))

  // Apply channel filter to byChannel
  const byChannelFiltered =
    channels.length > 0 ? byChannel.filter((r) => channels.includes(r.channel)) : byChannel

  // ── Daily funnel (MQLs + spend per day) ──
  const mqlsByDate: Record<string, Set<string>> = {}
  for (const ev of channelFilteredEvents) {
    if (ev.event_type === 'mql' && ev.deal_id && ev.event_date) {
      if (!mqlsByDate[ev.event_date]) mqlsByDate[ev.event_date] = new Set()
      mqlsByDate[ev.event_date].add(ev.deal_id)
    }
  }

  const allDates = new Set([
    ...Object.keys(spendByDateChannel),
    ...Object.keys(mqlsByDate),
  ])

  const dailyFunnel: DailyFunnelPoint[] = [...allDates].sort().map((date) => ({
    date,
    mqls: mqlsByDate[date]?.size ?? 0,
    spend: CHANNELS.reduce((s, ch) => s + (spendByDateChannel[date]?.[ch] ?? 0), 0),
  }))

  // ── By-ad breakdown ──

  // Step 1: Compute spend by ad (needed to resolve deal → spend key mapping)
  const spendByAd: Record<string, number> = {}
  const adFullNames: Record<string, string> = {}
  for (const row of filteredWindsor) {
    const adKey = resolveAdKey(row)
    spendByAd[adKey] = (spendByAd[adKey] ?? 0) + (Number(row.spend) || 0)
    // Store the longest raw ad_name seen for this key (prefers more descriptive names)
    const rawName = (row.ad_name ?? '').trim()
    if (rawName && (!adFullNames[adKey] || rawName.length > adFullNames[adKey].length)) {
      adFullNames[adKey] = rawName
    }
  }
  const spendKeys = new Set(Object.keys(spendByAd))

  // Step 2: Build deal → resolved spend key map.
  // A deal's UTM ad code (e.g. "G67C1AD2") is resolved to the most specific
  // matching spend key: full ad → adset code → campaign code → full ad (fallback).
  // This handles PMAX campaigns where Windsor groups spend at campaign level (G67)
  // while UTMs carry granular codes (G67C1AD2).
  const dealAd = new Map<string, string>()
  for (const ev of channelFilteredEvents) {
    if (!ev.deal_id || dealAd.has(ev.deal_id)) continue
    const { campaign, adSet, ad } = evtCodes(ev)
    // Prefer most specific key that exists in Windsor spend data
    const resolved =
      (ad && spendKeys.has(ad) ? ad : null) ??
      (adSet && spendKeys.has(adSet) ? adSet : null) ??
      (campaign && spendKeys.has(campaign) ? campaign : null) ??
      (ad || null)
    if (resolved) dealAd.set(ev.deal_id, resolved)
  }

  // Step 3: Funnel stages by ad
  const stageDealsByAd: Record<string, Record<string, Set<string>>> = {
    mql: {},
    sql: {},
    opportunity: {},
    meeting_completed: {},
    deal_won: {},
  }
  const mrrByAd: Record<string, number> = {}

  for (const ev of channelFilteredEvents) {
    if (!ev.deal_id) continue
    const ad = dealAd.get(ev.deal_id)
    if (!ad) continue
    if (stageDealsByAd[ev.event_type]) {
      if (!stageDealsByAd[ev.event_type][ad]) stageDealsByAd[ev.event_type][ad] = new Set()
      stageDealsByAd[ev.event_type][ad].add(ev.deal_id)
    }
    if (ev.event_type === 'deal_won') {
      mrrByAd[ad] = (mrrByAd[ad] ?? 0) + (dealMRR.get(ev.deal_id) ?? 0)
    }
  }

  const allAds = new Set([
    ...Object.keys(spendByAd),
    ...Object.keys(stageDealsByAd.mql),
    ...Object.keys(stageDealsByAd.sql),
    ...Object.keys(stageDealsByAd.opportunity),
    ...Object.keys(stageDealsByAd.meeting_completed),
    ...Object.keys(stageDealsByAd.deal_won),
  ])

  const byAd: AdMetrics[] = [...allAds].sort().map((ad) => ({
    ad,
    adFullName: adFullNames[ad],
    spend: spendByAd[ad] ?? 0,
    mqls: stageDealsByAd.mql[ad]?.size ?? 0,
    sqls: stageDealsByAd.sql[ad]?.size ?? 0,
    opportunities: stageDealsByAd.opportunity[ad]?.size ?? 0,
    meetings: stageDealsByAd.meeting_completed[ad]?.size ?? 0,
    won: stageDealsByAd.deal_won[ad]?.size ?? 0,
    mrr: mrrByAd[ad] ?? 0,
    status: adStatuses[ad],
  }))

  return {
    totalSpend,
    funnelCounts,
    totalMRR,
    byChannel: byChannelFiltered,
    byAd,
    dailySpend,
    dailyFunnel,
    investmentPartial,
    campaignStatuses,
    adStatuses,
  }
}
