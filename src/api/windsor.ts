import { getCacheEntry, setCacheEntry } from './cache'
import { getSupabaseCacheEntry, setSupabaseCacheEntry } from './supabaseCache'

export interface WindsorRow {
  date: string
  datasource: string
  source: string
  campaign: string
  adset_name: string
  ad_name: string
  spend: number
  clicks: number
  campaign_status?: string
  status?: string
  campaign_daily_budget?: number | null
  adset_daily_budget?: number | null
  campaign_budget?: number | null
  // Quality metrics fields
  frequency?: number | null
  impressions?: number | null
  cpm?: number | null
  ctr?: number | null
  website_ctr_link_click?: number | null
  link_clicks?: number | null
  actions_landing_page_view?: number | null
  cost_per_action_type_landing_page_view?: number | null
  video_p25_watched_actions_video_view?: number | null
  video_p50_watched_actions_video_view?: number | null
  video_p75_watched_actions_video_view?: number | null
  video_p100_watched_actions_video_view?: number | null
  video_thruplay_watched_actions_video_view?: number | null
}

const WINDSOR_FIELDS = [
  'date', 'datasource', 'source', 'campaign', 'adset_name', 'ad_name', 'spend', 'clicks',
  'campaign_status', 'status',
  'campaign_daily_budget', 'adset_daily_budget', 'campaign_budget',
  'frequency', 'impressions', 'cpm', 'ctr', 'website_ctr_link_click', 'link_clicks',
  'actions_landing_page_view', 'cost_per_action_type_landing_page_view',
  'video_p25_watched_actions_video_view', 'video_p50_watched_actions_video_view',
  'video_p75_watched_actions_video_view', 'video_p100_watched_actions_video_view',
  'video_thruplay_watched_actions_video_view',
]
const CACHE_TTL_MINUTES = 30
// Bump this when WINDSOR_FIELDS changes to auto-invalidate stale cache entries
const CACHE_VERSION = 'v4'

// In-memory session cache — instant re-access without localStorage parse
const memCache = new Map<string, WindsorRow[]>()

function parseResponse(text: string): WindsorRow[] {
  text = text.trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.data)) return parsed.data
    if (Array.isArray(parsed)) return parsed
    return []
  } catch {
    try {
      return text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
    } catch {
      return []
    }
  }
}

export async function fetchWindsorData(dateFrom: string, dateTo: string): Promise<WindsorRow[]> {
  const apiKey = import.meta.env.VITE_WINDSOR_API_KEY
  if (!apiKey) return []

  const cacheKey = `windsor_${CACHE_VERSION}_${dateFrom}_${dateTo}`

  // 1. In-memory hit (fastest)
  if (memCache.has(cacheKey)) return memCache.get(cacheKey)!

  // 2. localStorage hit
  const stored = getCacheEntry<WindsorRow[]>(cacheKey)
  if (stored) {
    memCache.set(cacheKey, stored)
    return stored
  }

  // 3. Supabase cache hit (shared across browsers, survives page refresh)
  const sbData = await getSupabaseCacheEntry<WindsorRow[]>('windsor', cacheKey)
  if (sbData) {
    setCacheEntry(cacheKey, sbData, CACHE_TTL_MINUTES)
    memCache.set(cacheKey, sbData)
    return sbData
  }

  // 4. Network fetch
  const params = new URLSearchParams({
    api_key: apiKey,
    date_from: dateFrom,
    date_to: dateTo,
    fields: WINDSOR_FIELDS.join(','),
  })
  const accountIds = import.meta.env.VITE_WINDSOR_ACCOUNT_IDS
  if (accountIds?.trim()) params.set('select_accounts', accountIds.trim())

  const res = await fetch(`/api/windsor/all?${params}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Windsor API ${res.status}: ${body.slice(0, 200)}`)
  }
  const rows = parseResponse(await res.text())

  setCacheEntry(cacheKey, rows, CACHE_TTL_MINUTES)
  memCache.set(cacheKey, rows)
  setSupabaseCacheEntry('windsor', cacheKey, rows, CACHE_TTL_MINUTES * 60)
  return rows
}

export function invalidateWindsorCache(dateFrom: string, dateTo: string) {
  const key = `windsor_${CACHE_VERSION}_${dateFrom}_${dateTo}`
  memCache.delete(key)
  // localStorage entry will be cleared on next getCacheEntry via TTL or manually
  import('./cache').then(({ clearCacheByKey }) => clearCacheByKey(key))
}
