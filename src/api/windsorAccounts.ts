/**
 * Windsor.ai — suporte a duas contas nomeadas.
 *
 * Usa variáveis de ambiente:
 *   VITE_WINDSOR_ACCOUNT_PRINCIPAL_ID  — conta principal (consultoria)
 *   VITE_WINDSOR_ACCOUNT_LAB_ID        — conta de testes (Berry Consult Lab)
 *
 * Este módulo é separado de windsor.ts para não impactar o dashboard principal,
 * que continua usando fetchWindsorData() de windsor.ts sem tag de conta.
 */

import { getCacheEntry, setCacheEntry } from './cache'

export type WindsorAccount = 'principal' | 'lab' | 'google' | 'bing' | 'linkedin' | 'tiktok' | 'openai'

export interface WindsorRowTagged {
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
  account: WindsorAccount
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
const CACHE_VERSION = 'wacct_v1'

const memCache = new Map<string, WindsorRowTagged[]>()

const ACCOUNT_ENV: Record<WindsorAccount, string> = {
  principal: 'VITE_WINDSOR_ACCOUNT_PRINCIPAL_ID',
  lab:       'VITE_WINDSOR_ACCOUNT_LAB_ID',
  google:    'VITE_WINDSOR_ACCOUNT_GOOGLE_ID',
  bing:      'VITE_WINDSOR_ACCOUNT_BING_ID',
  linkedin:  'VITE_WINDSOR_ACCOUNT_LINKEDIN_ID',
  tiktok:    'VITE_WINDSOR_ACCOUNT_TIKTOK_ID',
  openai:    'VITE_WINDSOR_ACCOUNT_OPENAI_ID',
}

function getAccountId(account: WindsorAccount): string | null {
  const val = (import.meta.env[ACCOUNT_ENV[account]] as string | undefined)
  return val?.trim() || null
}

function parseResponse(text: string): Record<string, unknown>[] {
  text = text.trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed?.data)) return parsed.data
    if (Array.isArray(parsed)) return parsed
    return []
  } catch {
    try {
      return text.split('\n').filter(Boolean).map((l) => JSON.parse(l))
    } catch {
      return []
    }
  }
}

async function fetchForAccount(
  dateFrom: string,
  dateTo: string,
  account: WindsorAccount,
): Promise<WindsorRowTagged[]> {
  const apiKey = import.meta.env.VITE_WINDSOR_API_KEY as string | undefined
  if (!apiKey) return []

  const accountId = getAccountId(account)
  if (!accountId) return []

  const params = new URLSearchParams({
    api_key: apiKey,
    date_from: dateFrom,
    date_to: dateTo,
    fields: WINDSOR_FIELDS.join(','),
    select_accounts: accountId,
  })

  const res = await fetch(`/api/windsor/all?${params}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Windsor API (${account}) ${res.status}: ${body.slice(0, 200)}`)
  }

  const rows = parseResponse(await res.text())
  return rows.map((r) => ({ ...(r as WindsorRowTagged), account }))
}

/**
 * Fetch Windsor data for one named account, with cache.
 * Returns [] when the account ID env var is not configured.
 */
export async function fetchWindsorForAccount(
  dateFrom: string,
  dateTo: string,
  account: WindsorAccount,
): Promise<WindsorRowTagged[]> {
  const cacheKey = `${CACHE_VERSION}_${account}_${dateFrom}_${dateTo}`

  if (memCache.has(cacheKey)) return memCache.get(cacheKey)!

  const stored = getCacheEntry<WindsorRowTagged[]>(cacheKey)
  if (stored) {
    memCache.set(cacheKey, stored)
    return stored
  }

  const rows = await fetchForAccount(dateFrom, dateTo, account)
  setCacheEntry(cacheKey, rows, CACHE_TTL_MINUTES)
  memCache.set(cacheKey, rows)
  return rows
}

export function invalidateWindsorAccountCache(
  dateFrom: string,
  dateTo: string,
  account?: WindsorAccount,
) {
  const targets: WindsorAccount[] = account ? [account] : ['principal', 'lab']
  for (const acc of targets) {
    const key = `${CACHE_VERSION}_${acc}_${dateFrom}_${dateTo}`
    memCache.delete(key)
    import('./cache').then(({ clearCacheByKey }) => clearCacheByKey(key))
  }
}
