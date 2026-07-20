import { getCacheEntry, setCacheEntry } from './cache'

const CACHE_TTL_MINUTES = 20

// In-memory session cache
const memCache = new Map<string, SupabaseEvent[]>()

export interface SupabaseEvent {
  event_type: string
  deal_id: string
  event_date: string | null
  event_ts: string | null
  email_norm: string | null
  payload: {
    deal?: {
      platform?: string
      utmCampaign?: string
      potentialNewMRR?: number | string
      pagina?: string
      revenue?: string
      revenueNormalization?: { normalizedValue?: string }
      segment?: string
    }
    utmSource?: string
    utmCampaign?: string
    /** Top-level fallbacks (some events store these outside deal) */
    pagina?: string
    revenue?: string
    segment?: string
  } | null
}

const PAGE_SIZE = 1000

// BRT = UTC-3 (fixed, Brazil dropped DST in 2019).
// Filter by event_ts instead of event_date so events with event_date=null
// (created before the column was backfilled) are still returned.
function addDayISO(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export async function fetchEvents(dateFrom: string, dateTo: string): Promise<SupabaseEvent[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return []

  const cacheKey = `supabase_events_v4_${dateFrom}_${dateTo}`

  // 1. In-memory hit
  if (memCache.has(cacheKey)) return memCache.get(cacheKey)!

  // 2. localStorage hit
  const stored = getCacheEntry<SupabaseEvent[]>(cacheKey)
  if (stored) {
    memCache.set(cacheKey, stored)
    return stored
  }

  // 3. Network fetch
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  }

  // Fetch events in range using an OR condition so both cases are covered:
  //   1. event_date is set and falls in [dateFrom, dateTo]  (normal events)
  //   2. event_date is null but event_ts falls in the equivalent UTC range
  //      (events created before event_date was backfilled)
  // BRT = UTC-3 → dateFrom 00:00 BRT = dateFrom T03:00:00Z in UTC
  //             → dateTo   23:59 BRT = (dateTo+1) T02:59:59Z in UTC
  const tsFrom = `${dateFrom}T03:00:00Z`
  const tsTo   = `${addDayISO(dateTo)}T02:59:59Z`

  const base = `${supabaseUrl}/rest/v1/events`
  const orFilter = `or=(and(event_date.gte.${dateFrom},event_date.lte.${dateTo}),and(event_date.is.null,event_ts.gte.${tsFrom},event_ts.lte.${tsTo}))`
  const qs = `select=event_type,deal_id,event_date,event_ts,email_norm,payload&${orFilter}`

  const first = await fetch(`${base}?${qs}`, {
    headers: { ...headers, Range: `0-${PAGE_SIZE - 1}`, 'Range-Unit': 'items', Prefer: 'count=estimated' },
  })
  if (!first.ok) {
    const text = await first.text()
    throw new Error(`Supabase error ${first.status}: ${text.slice(0, 200)}`)
  }

  const firstData: SupabaseEvent[] = await first.json()
  const contentRange = first.headers.get('content-range') ?? ''
  const total = Number(contentRange.split('/')[1]) || firstData.length

  let events = firstData
  if (total > PAGE_SIZE) {
    const totalPages = Math.ceil(total / PAGE_SIZE)
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) => {
        const from = (i + 1) * PAGE_SIZE
        const to = from + PAGE_SIZE - 1
        return fetch(`${base}?${qs}`, {
          headers: { ...headers, Range: `${from}-${to}`, 'Range-Unit': 'items', Prefer: 'count=none' },
        }).then((r) => (r.ok ? (r.json() as Promise<SupabaseEvent[]>) : Promise.resolve([] as SupabaseEvent[])))
      }),
    )
    events = [firstData, ...rest].flat()
  }

  setCacheEntry(cacheKey, events, CACHE_TTL_MINUTES)
  memCache.set(cacheKey, events)
  return events
}

export function invalidateSupabaseCache(dateFrom: string, dateTo: string) {
  const key = `supabase_events_v4_${dateFrom}_${dateTo}`
  memCache.delete(key)
  import('./cache').then(({ clearCacheByKey }) => clearCacheByKey(key))
}

// ── Settings (budget config sync) ──

function getSupabaseBase() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return { url, key }
}

export async function loadRemoteSetting<T>(settingKey: string): Promise<T | null> {
  const sb = getSupabaseBase()
  if (!sb) return null
  try {
    const res = await fetch(
      `${sb.url}/rest/v1/settings?key=eq.${encodeURIComponent(settingKey)}&select=value`,
      { headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}` } },
    )
    if (!res.ok) return null
    const rows: Array<{ value: T }> = await res.json()
    return rows[0]?.value ?? null
  } catch {
    return null
  }
}

export async function saveRemoteSetting<T>(settingKey: string, value: T): Promise<void> {
  const sb = getSupabaseBase()
  if (!sb) return
  try {
    await fetch(`${sb.url}/rest/v1/settings`, {
      method: 'POST',
      headers: {
        apikey: sb.key,
        Authorization: `Bearer ${sb.key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ key: settingKey, value, updated_at: new Date().toISOString() }),
    })
  } catch {
    // silently fail — local save already done
  }
}
