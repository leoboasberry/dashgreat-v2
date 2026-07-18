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

export interface CrmEmailEvent {
  email_norm: string
  event_type: string
  payload: {
    deal?: {
      segment?: string
      revenue?: string
      utmCampaign?: string
      potentialNewMRR?: number | string | null
      annualRevenue?: string | null
    }
    segment?: string
    revenue?: string
  } | null
}

export interface CrmEntry {
  stages: Set<string>
  segment: string | null
  revenue: string | null
  mrr: number | null   // potentialNewMRR from deal_won payload
}

/**
 * Fetches CRM events for the given event types and date range.
 * Returns a map of email_norm → CrmEntry.
 * For deal_won events, also captures potentialNewMRR for value-based audiences.
 */
export async function fetchCrmByEmail(
  eventTypes: string[],
  dateFrom: string,
  dateTo: string,
): Promise<{ map: Map<string, CrmEntry>; error: string | null }> {
  const empty = new Map<string, CrmEntry>()
  const sb = getSupabaseBase()
  if (!sb) return { map: empty, error: null }
  if (eventTypes.length === 0) return { map: empty, error: null }

  const base = `${sb.url}/rest/v1/events`
  // PostgREST OR: or=(event_type.eq.mql,event_type.eq.sql,...)
  const orFilter = `or=(${eventTypes.map((t) => `event_type.eq.${t}`).join(',')})`
  const qs = `select=email_norm,event_type,payload&${orFilter}&event_date=gte.${dateFrom}&event_date=lte.${dateTo}`

  const result = new Map<string, CrmEntry>()

  function add(row: CrmEmailEvent) {
    if (!row.email_norm) return
    const existing = result.get(row.email_norm) ?? { stages: new Set(), segment: null, revenue: null, mrr: null }
    existing.stages.add(row.event_type)
    const seg = row.payload?.deal?.segment ?? row.payload?.segment ?? null
    const rev = row.payload?.deal?.revenue ?? row.payload?.revenue ?? null
    if (seg && !existing.segment) existing.segment = seg
    if (rev && !existing.revenue) existing.revenue = rev
    // Capture MRR from deal_won events
    if (row.event_type === 'deal_won' && existing.mrr === null) {
      const rawMrr = row.payload?.deal?.potentialNewMRR
      if (rawMrr !== null && rawMrr !== undefined) {
        const parsed = typeof rawMrr === 'number' ? rawMrr : parseFloat(String(rawMrr).replace(',', '.'))
        if (!isNaN(parsed)) existing.mrr = parsed
      }
    }
    result.set(row.email_norm, existing)
  }

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
      return { map: empty, error: `Supabase retornou HTTP ${first.status}: ${text.slice(0, 300)}` }
    }

    const firstData: CrmEmailEvent[] = await first.json()
    firstData.forEach(add)

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
      const nextData: CrmEmailEvent[] = await next.json()
      nextData.forEach(add)
      fetched += nextData.length
      if (nextData.length === 0) break
    }

    return { map: result, error: null }
  } catch (e) {
    return { map: empty, error: String(e) }
  }
}
