import type { CapiSupabaseEvent } from '../types/capi'

const PAGE_SIZE = 1000

function getSupabaseBase(): { url: string; key: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return { url, key }
}

function readHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` }
}

/**
 * Fetches CRM events for CAPI dispatch.
 * Returns full rows including event_id (for deduplication), event_ts (for event_time),
 * and payload (for utm filters, MRR, segment, etc.).
 */
export async function fetchCapiEvents(
  eventTypes: string[],
  dateFrom: string,
  dateTo: string,
): Promise<{ events: CapiSupabaseEvent[]; error: string | null }> {
  const sb = getSupabaseBase()
  if (!sb) return { events: [], error: null }
  if (eventTypes.length === 0) return { events: [], error: null }

  const base = `${sb.url}/rest/v1/events`
  const orFilter = `or=(${eventTypes.map((t) => `event_type.eq.${t}`).join(',')})`
  const qs = `select=event_id,event_type,event_ts,event_date,email_norm,payload&${orFilter}&event_date=gte.${dateFrom}&event_date=lte.${dateTo}&order=event_ts.asc`

  const allEvents: CapiSupabaseEvent[] = []

  try {
    const first = await fetch(`${base}?${qs}`, {
      headers: {
        ...readHeaders(sb.key),
        Range: `0-${PAGE_SIZE - 1}`,
        'Range-Unit': 'items',
        Prefer: 'count=exact',
      },
    })

    if (!first.ok) {
      const text = await first.text()
      return { events: [], error: `Supabase HTTP ${first.status}: ${text.slice(0, 300)}` }
    }

    const firstData: CapiSupabaseEvent[] = await first.json()
    allEvents.push(...firstData)

    const contentRange = first.headers.get('content-range') ?? ''
    const total = Number(contentRange.split('/')[1]) || firstData.length
    let fetched = firstData.length

    while (fetched < total) {
      const from = fetched
      const to = from + PAGE_SIZE - 1
      const next = await fetch(`${base}?${qs}`, {
        headers: {
          ...readHeaders(sb.key),
          Range: `${from}-${to}`,
          'Range-Unit': 'items',
          Prefer: 'count=none',
        },
      })
      if (!next.ok) break
      const nextData: CapiSupabaseEvent[] = await next.json()
      allEvents.push(...nextData)
      fetched += nextData.length
      if (nextData.length === 0) break
    }

    return { events: allEvents, error: null }
  } catch (e) {
    return { events: [], error: String(e) }
  }
}
