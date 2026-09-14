import { getCacheEntry, setCacheEntry } from './cache'

const CACHE_TTL_MINUTES = 20

// In-memory session cache
const memCache = new Map<string, SupabaseEvent[]>()

// Separate in-memory cache for lead-centric queries
const leadCentricMemCache = new Map<string, SupabaseEvent[]>()

export interface SupabaseEvent {
  event_id?: string
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
function addDayISO(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const SELECT = 'event_id,event_type,deal_id,event_date,event_ts,email_norm,payload'

// Fetch all pages for a given querystring using a loop, stopping when a partial
// page is returned. This avoids relying on count=estimated which can undercount
// and cause later pages (with earlier-date events) to be silently skipped.
async function fetchAllPages(
  base: string,
  qs: string,
  headers: Record<string, string>,
): Promise<SupabaseEvent[]> {
  const all: SupabaseEvent[] = []
  let from = 0

  while (true) {
    const to = from + PAGE_SIZE - 1
    const res = await fetch(`${base}?${qs}`, {
      headers: { ...headers, Range: `${from}-${to}`, 'Range-Unit': 'items', Prefer: 'count=none' },
    })
    if (!res.ok) {
      if (from === 0) {
        const text = await res.text()
        throw new Error(`Supabase error ${res.status}: ${text.slice(0, 200)}`)
      }
      break
    }
    const page: SupabaseEvent[] = await res.json()
    all.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return all
}

export async function fetchEvents(dateFrom: string, dateTo: string): Promise<SupabaseEvent[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return []

  const cacheKey = `supabase_events_v6_${dateFrom}_${dateTo}`

  // 1. In-memory hit
  if (memCache.has(cacheKey)) return memCache.get(cacheKey)!

  // 2. localStorage hit
  const stored = getCacheEntry<SupabaseEvent[]>(cacheKey)
  if (stored) {
    memCache.set(cacheKey, stored)
    return stored
  }

  // 3. Network fetch — two parallel queries, merged by event_id:
  //   Q1: event_date in [dateFrom, dateTo]   → normal events (event_date populated)
  //   Q2: event_date IS NULL AND event_ts in BRT-equivalent UTC range
  //       → events created before event_date was backfilled in the DB
  // BRT = UTC-3 → dateFrom 00:00 BRT = dateFrom T03:00:00Z in UTC
  //             → dateTo   23:59 BRT = next day T02:59:59Z in UTC
  const tsFrom = `${dateFrom}T03:00:00Z`
  const tsTo   = `${addDayISO(dateTo)}T02:59:59Z`

  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  }
  const base = `${supabaseUrl}/rest/v1/events`

  const [byDate, byTs] = await Promise.all([
    fetchAllPages(base, `select=${SELECT}&event_date=gte.${dateFrom}&event_date=lte.${dateTo}&order=event_id.asc`, headers),
    fetchAllPages(base, `select=${SELECT}&event_date=is.null&event_ts=gte.${tsFrom}&event_ts=lte.${tsTo}&order=event_id.asc`, headers),
  ])

  // Merge: deduplicate by event_id (byDate takes precedence)
  const seen = new Set<string>()
  const events: SupabaseEvent[] = []
  for (const ev of [...byDate, ...byTs]) {
    const id = ev.event_id
    if (id) {
      if (seen.has(id)) continue
      seen.add(id)
    }
    events.push(ev)
  }

  setCacheEntry(cacheKey, events, CACHE_TTL_MINUTES)
  memCache.set(cacheKey, events)
  return events
}

export function invalidateSupabaseCache(dateFrom: string, dateTo: string) {
  const key = `supabase_events_v6_${dateFrom}_${dateTo}`
  memCache.delete(key)
  import('./cache').then(({ clearCacheByKey }) => clearCacheByKey(key))
}

// ── Lead-centric queries ──
// Fetches ALL events for leads (deal_ids) whose MQL event falls within [dateFrom, dateTo].
// Windsor spend is still fetched for the same period by the hook — so spend and lead cohort
// share the same calendar window, giving a correct ROI attribution.

export async function fetchLeadCentricEvents(dateFrom: string, dateTo: string): Promise<SupabaseEvent[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return []

  const cacheKey = `supabase_lead_centric_v1_${dateFrom}_${dateTo}`

  if (leadCentricMemCache.has(cacheKey)) return leadCentricMemCache.get(cacheKey)!

  const stored = getCacheEntry<SupabaseEvent[]>(cacheKey)
  if (stored) {
    leadCentricMemCache.set(cacheKey, stored)
    return stored
  }

  const tsFrom = `${dateFrom}T03:00:00Z`
  const tsTo   = `${addDayISO(dateTo)}T02:59:59Z`

  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  }
  const base = `${supabaseUrl}/rest/v1/events`

  // Step 1: Identify lead cohort — MQL events in the date window
  const [mqlByDate, mqlByTs] = await Promise.all([
    fetchAllPages(base, `select=deal_id&event_type=eq.mql&event_date=gte.${dateFrom}&event_date=lte.${dateTo}&order=event_id.asc`, headers),
    fetchAllPages(base, `select=deal_id&event_type=eq.mql&event_date=is.null&event_ts=gte.${tsFrom}&event_ts=lte.${tsTo}&order=event_id.asc`, headers),
  ])

  const dealIds = [...new Set(
    [...mqlByDate, ...mqlByTs]
      .map((e) => e.deal_id)
      .filter((id): id is string => !!id),
  )]

  if (dealIds.length === 0) return []

  // Step 2: Fetch ALL events for those deal_ids (batched to respect URL limits)
  const BATCH = 80
  const batchResults = await Promise.all(
    Array.from({ length: Math.ceil(dealIds.length / BATCH) }, (_, i) => {
      const slice = dealIds.slice(i * BATCH, (i + 1) * BATCH)
      return fetchAllPages(
        base,
        `select=${SELECT}&deal_id=in.(${slice.join(',')})&order=event_id.asc`,
        headers,
      ).catch(() => [] as SupabaseEvent[])
    }),
  )

  const seen = new Set<string>()
  const events: SupabaseEvent[] = []
  for (const batch of batchResults) {
    for (const ev of batch) {
      const id = ev.event_id
      if (id) {
        if (seen.has(id)) continue
        seen.add(id)
      }
      events.push(ev)
    }
  }

  setCacheEntry(cacheKey, events, CACHE_TTL_MINUTES)
  leadCentricMemCache.set(cacheKey, events)
  return events
}

export function invalidateLeadCentricCache(dateFrom: string, dateTo: string) {
  const key = `supabase_lead_centric_v1_${dateFrom}_${dateTo}`
  leadCentricMemCache.delete(key)
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
