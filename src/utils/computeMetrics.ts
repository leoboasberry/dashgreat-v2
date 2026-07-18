import type { WindsorRow } from '../api/windsor'
import type { SupabaseEvent } from '../api/supabase'
export type { SupabaseEvent }
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
  activeSpend: number
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

export interface AdSetMetrics {
  adSet: string
  adSetFullName?: string  // full Windsor adset_name
  spend: number
  dailyBudget: number
  mqls: number
  sqls: number
  opportunities: number
  meetings: number
  won: number
  mrr: number
  status?: string
}

export interface CampaignMetrics {
  campaign: string
  campaignFullName?: string  // full Windsor campaign name
  spend: number
  dailyBudget: number
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
  byAdSet: AdSetMetrics[]
  byCampaign: CampaignMetrics[]
  dailySpend: DailySpend[]
  dailyFunnel: DailyFunnelPoint[]
  /** True when LP/Revenue/Segment filters are active without a campaign filter — Windsor spend is NOT narrowed */
  investmentPartial: boolean
  /** Most recent campaign_status per campaign code (from all rows, pre-filter) */
  campaignStatuses: Record<string, string>
  /** Most recent status per ad key (from all rows, pre-filter) */
  adStatuses: Record<string, string>
  /** Most recent status per adset key (Meta only) */
  adSetStatuses: Record<string, string>
  /** MQL events grouped by event_date, deduped by deal_id per day */
  mqlEventsByDate: Record<string, SupabaseEvent[]>
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
  const raw = ev.payload?.deal?.utmCampaign
  const utmCampaign = typeof raw === 'string' ? raw : ''
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
  const adSetStatusDate: Record<string, string> = {}
  const adSetStatuses: Record<string, string> = {}

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
    // adset status — Meta only
    if (normalizeWindsorChannel(row.datasource, row.source) === 'Meta') {
      const adSetKey = extractAdSetCode(row.adset_name ?? '')
      if (adSetKey && row.status) {
        if (!adSetStatusDate[adSetKey] || row.date > adSetStatusDate[adSetKey]) {
          adSetStatusDate[adSetKey] = row.date
          adSetStatuses[adSetKey] = row.status
        }
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
  const isActiveCampaign = (s?: string) => s === 'ENABLED' || s === 'ACTIVE'

  // Track latest row per campaign and adset for budget lookup
  const latestCampaignRow: Record<string, WindsorRow> = {}
  const latestAdsetRow: Record<string, WindsorRow> = {}

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

    const cc = extractCampaignCode(row.campaign ?? '')
    if (!latestCampaignRow[cc] || row.date > latestCampaignRow[cc].date) {
      latestCampaignRow[cc] = row
    }
    const adsetKey = wCodes(row).adSet
    if (adsetKey && (!latestAdsetRow[adsetKey] || row.date > latestAdsetRow[adsetKey].date)) {
      latestAdsetRow[adsetKey] = row
    }
  }

  // Daily budget per channel from platform fields (campaign or adset level)
  // Meta returns budgets in cents → divide by 100; Google returns in currency units
  const activeSpendByChannel: Record<Channel, number> = Object.fromEntries(
    CHANNELS.map((c) => [c, 0]),
  ) as Record<Channel, number>
  const isMetaDatasource = (ds: string) =>
    ds === 'facebook' || ds === 'meta' || ds === 'instagram'
  const parseBudget = (raw: number | null | undefined, datasource: string): number => {
    const n = Number(raw) || 0
    return isMetaDatasource(datasource) ? n / 100 : n
  }

  // Step 1: campaign-level budgets (Meta: campaign_daily_budget, Google: campaign_budget)
  const campaignsWithCampaignBudget = new Set<string>()
  for (const [cc, row] of Object.entries(latestCampaignRow)) {
    if (!isActiveCampaign(row.campaign_status)) continue
    const rawBudget = row.campaign_daily_budget ?? row.campaign_budget
    const budget = parseBudget(rawBudget, row.datasource)
    if (budget > 0) {
      const ch = normalizeWindsorChannel(row.datasource, row.source)
      activeSpendByChannel[ch] += budget
      campaignsWithCampaignBudget.add(cc)
    }
  }

  // Step 2: adset-level budgets (Meta: adset_daily_budget) for campaigns without campaign-level budget
  for (const [, row] of Object.entries(latestAdsetRow)) {
    if (!isActiveCampaign(row.campaign_status)) continue
    const cc = extractCampaignCode(row.campaign ?? '')
    if (campaignsWithCampaignBudget.has(cc)) continue
    const budget = parseBudget(row.adset_daily_budget, row.datasource)
    if (budget > 0) {
      const ch = normalizeWindsorChannel(row.datasource, row.source)
      activeSpendByChannel[ch] += budget
    }
  }

  // Daily budget per campaign (campaign-level first, then sum adset-level)
  const budgetByCampaign: Record<string, number> = {}
  for (const [cc, row] of Object.entries(latestCampaignRow)) {
    const rawBudget = row.campaign_daily_budget ?? row.campaign_budget
    const b = parseBudget(rawBudget, row.datasource)
    if (b > 0) budgetByCampaign[cc] = b
  }
  for (const [, row] of Object.entries(latestAdsetRow)) {
    const cc = extractCampaignCode(row.campaign ?? '')
    if (budgetByCampaign[cc] !== undefined) continue // campaign already has budget
    const b = parseBudget(row.adset_daily_budget, row.datasource)
    if (b > 0) budgetByCampaign[cc] = (budgetByCampaign[cc] ?? 0) + b
  }

  // Daily budget per adset (adset_daily_budget only — null when budget is at campaign level)
  const budgetByAdSet: Record<string, number> = {}
  for (const [adsetKey, row] of Object.entries(latestAdsetRow)) {
    budgetByAdSet[adsetKey] = parseBudget(row.adset_daily_budget, row.datasource)
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
    activeSpend: activeSpendByChannel[ch],
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

  // MQL events by date (deduped by deal_id per day, for the drill-down modal)
  const mqlEventsByDate: Record<string, SupabaseEvent[]> = {}
  const seenDayDeal = new Set<string>()
  for (const ev of channelFilteredEvents) {
    if (ev.event_type === 'mql' && ev.event_date) {
      const key = `${ev.event_date}::${ev.deal_id}`
      if (!seenDayDeal.has(key)) {
        seenDayDeal.add(key)
        if (!mqlEventsByDate[ev.event_date]) mqlEventsByDate[ev.event_date] = []
        mqlEventsByDate[ev.event_date].push(ev)
      }
    }
  }

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

  // ── By-adset breakdown (Meta only) ──
  const metaWindsor = filteredWindsor.filter(
    (r) => normalizeWindsorChannel(r.datasource, r.source) === 'Meta',
  )

  const spendByAdSet: Record<string, number> = {}
  const adSetFullNames: Record<string, string> = {}
  for (const row of metaWindsor) {
    const adSetKey = extractAdSetCode(row.adset_name ?? '')
    if (!adSetKey) continue
    spendByAdSet[adSetKey] = (spendByAdSet[adSetKey] ?? 0) + (Number(row.spend) || 0)
    const rawName = (row.adset_name ?? '').trim()
    if (rawName && (!adSetFullNames[adSetKey] || rawName.length > adSetFullNames[adSetKey].length)) {
      adSetFullNames[adSetKey] = rawName
    }
  }
  const adSetSpendKeys = new Set(Object.keys(spendByAdSet))

  // deal → adset key (Meta events only)
  const dealAdSet = new Map<string, string>()
  for (const ev of channelFilteredEvents) {
    if (!ev.deal_id || dealAdSet.has(ev.deal_id)) continue
    if (dealChannels.get(ev.deal_id) !== 'Meta') continue
    const { campaign, adSet } = evtCodes(ev)
    const resolved =
      (adSet && adSetSpendKeys.has(adSet) ? adSet : null) ??
      (campaign && adSetSpendKeys.has(campaign) ? campaign : null) ??
      (adSet || null)
    if (resolved) dealAdSet.set(ev.deal_id, resolved)
  }

  const stageDealsByAdSet: Record<string, Record<string, Set<string>>> = {
    mql: {}, sql: {}, opportunity: {}, meeting_completed: {}, deal_won: {},
  }
  const mrrByAdSet: Record<string, number> = {}

  for (const ev of channelFilteredEvents) {
    if (!ev.deal_id) continue
    const adSet = dealAdSet.get(ev.deal_id)
    if (!adSet) continue
    if (stageDealsByAdSet[ev.event_type]) {
      if (!stageDealsByAdSet[ev.event_type][adSet]) stageDealsByAdSet[ev.event_type][adSet] = new Set()
      stageDealsByAdSet[ev.event_type][adSet].add(ev.deal_id)
    }
    if (ev.event_type === 'deal_won') {
      mrrByAdSet[adSet] = (mrrByAdSet[adSet] ?? 0) + (dealMRR.get(ev.deal_id) ?? 0)
    }
  }

  const allAdSets = new Set([
    ...Object.keys(spendByAdSet),
    ...Object.keys(stageDealsByAdSet.mql),
    ...Object.keys(stageDealsByAdSet.sql),
    ...Object.keys(stageDealsByAdSet.opportunity),
    ...Object.keys(stageDealsByAdSet.meeting_completed),
    ...Object.keys(stageDealsByAdSet.deal_won),
  ])

  const byAdSet: AdSetMetrics[] = [...allAdSets].sort().map((adSet) => ({
    adSet,
    adSetFullName: adSetFullNames[adSet],
    spend: spendByAdSet[adSet] ?? 0,
    dailyBudget: budgetByAdSet[adSet] ?? 0,
    mqls: stageDealsByAdSet.mql[adSet]?.size ?? 0,
    sqls: stageDealsByAdSet.sql[adSet]?.size ?? 0,
    opportunities: stageDealsByAdSet.opportunity[adSet]?.size ?? 0,
    meetings: stageDealsByAdSet.meeting_completed[adSet]?.size ?? 0,
    won: stageDealsByAdSet.deal_won[adSet]?.size ?? 0,
    mrr: mrrByAdSet[adSet] ?? 0,
    status: adSetStatuses[adSet],
  }))

  // ── By-campaign breakdown (all channels) ──
  const spendByCampaign: Record<string, number> = {}
  const campaignFullNames: Record<string, string> = {}
  for (const row of filteredWindsor) {
    const cc = extractCampaignCode(row.campaign ?? '')
    if (!cc) continue
    spendByCampaign[cc] = (spendByCampaign[cc] ?? 0) + (Number(row.spend) || 0)
    const rawName = (row.campaign ?? '').trim()
    if (rawName && (!campaignFullNames[cc] || rawName.length > campaignFullNames[cc].length)) {
      campaignFullNames[cc] = rawName
    }
  }
  const campaignSpendKeys = new Set(Object.keys(spendByCampaign))

  const dealCampaign = new Map<string, string>()
  for (const ev of channelFilteredEvents) {
    if (!ev.deal_id || dealCampaign.has(ev.deal_id)) continue
    const { campaign } = evtCodes(ev)
    if (campaign && (campaignSpendKeys.has(campaign) || campaign)) {
      dealCampaign.set(ev.deal_id, campaign)
    }
  }

  const stageDealsByCampaign: Record<string, Record<string, Set<string>>> = {
    mql: {}, sql: {}, opportunity: {}, meeting_completed: {}, deal_won: {},
  }
  const mrrByCampaign: Record<string, number> = {}

  for (const ev of channelFilteredEvents) {
    if (!ev.deal_id) continue
    const campaign = dealCampaign.get(ev.deal_id)
    if (!campaign) continue
    if (stageDealsByCampaign[ev.event_type]) {
      if (!stageDealsByCampaign[ev.event_type][campaign]) stageDealsByCampaign[ev.event_type][campaign] = new Set()
      stageDealsByCampaign[ev.event_type][campaign].add(ev.deal_id)
    }
    if (ev.event_type === 'deal_won') {
      mrrByCampaign[campaign] = (mrrByCampaign[campaign] ?? 0) + (dealMRR.get(ev.deal_id) ?? 0)
    }
  }

  const allCampaignKeys = new Set([
    ...Object.keys(spendByCampaign),
    ...Object.keys(stageDealsByCampaign.mql),
    ...Object.keys(stageDealsByCampaign.sql),
    ...Object.keys(stageDealsByCampaign.opportunity),
    ...Object.keys(stageDealsByCampaign.meeting_completed),
    ...Object.keys(stageDealsByCampaign.deal_won),
  ])

  const byCampaign: CampaignMetrics[] = [...allCampaignKeys].sort().map((campaign) => ({
    campaign,
    campaignFullName: campaignFullNames[campaign],
    spend: spendByCampaign[campaign] ?? 0,
    dailyBudget: budgetByCampaign[campaign] ?? 0,
    mqls: stageDealsByCampaign.mql[campaign]?.size ?? 0,
    sqls: stageDealsByCampaign.sql[campaign]?.size ?? 0,
    opportunities: stageDealsByCampaign.opportunity[campaign]?.size ?? 0,
    meetings: stageDealsByCampaign.meeting_completed[campaign]?.size ?? 0,
    won: stageDealsByCampaign.deal_won[campaign]?.size ?? 0,
    mrr: mrrByCampaign[campaign] ?? 0,
    status: campaignStatuses[campaign],
  }))

  return {
    totalSpend,
    funnelCounts,
    totalMRR,
    byChannel: byChannelFiltered,
    byAd,
    byAdSet,
    byCampaign,
    dailySpend,
    dailyFunnel,
    mqlEventsByDate,
    investmentPartial,
    campaignStatuses,
    adStatuses,
    adSetStatuses,
  }
}
