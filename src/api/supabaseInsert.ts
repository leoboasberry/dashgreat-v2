import type { CrmRow } from '../utils/parseCrmCsv'
import { buildEventPayload } from '../utils/parseCrmCsv'

function getSupabaseBase(): { url: string; key: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return { url, key }
}

function baseHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

const PAGE_SIZE = 1000

/**
 * Fetches all deal_ids that already have an event of `eventType` within
 * the date range covered by `rows`. Uses a date-range query (same pattern as
 * fetchEvents) to avoid PostgREST in.() syntax issues with long ID lists.
 *
 * Returns { existing, error } — error is a human-readable string when the
 * query fails so the UI can surface it instead of silently returning nothing.
 */
export async function fetchExistingDealIds(
  rows: CrmRow[],
  eventType: string,
): Promise<{ existing: Set<string>; error: string | null }> {
  const sb = getSupabaseBase()
  if (!sb) return { existing: new Set(), error: null }

  const dates = rows.map((r) => r.eventDate).filter(Boolean).sort()
  if (dates.length === 0) return { existing: new Set(), error: null }

  // Cover the full date range from the CSV rows (±0 days — dates are exact)
  const dateFrom = dates[0]
  const dateTo = dates[dates.length - 1]

  const existing = new Set<string>()
  const base = `${sb.url}/rest/v1/events`
  const qs = `select=deal_id&event_type=eq.${eventType}&event_date=gte.${dateFrom}&event_date=lte.${dateTo}`

  try {
    // First page
    const first = await fetch(`${base}?${qs}`, {
      headers: {
        ...baseHeaders(sb.key),
        Range: `0-${PAGE_SIZE - 1}`,
        'Range-Unit': 'items',
        Prefer: 'count=exact',
      },
    })

    if (!first.ok) {
      const text = await first.text()
      return {
        existing,
        error: `Supabase retornou HTTP ${first.status}: ${text.slice(0, 300)}`,
      }
    }

    const firstData: Array<{ deal_id: string }> = await first.json()
    for (const { deal_id } of firstData) existing.add(deal_id)

    // Paginate if more rows exist
    const contentRange = first.headers.get('content-range') ?? ''
    const total = Number(contentRange.split('/')[1]) || firstData.length
    let fetched = firstData.length

    while (fetched < total) {
      const from = fetched
      const to = from + PAGE_SIZE - 1
      const next = await fetch(`${base}?${qs}`, {
        headers: {
          ...baseHeaders(sb.key),
          Range: `${from}-${to}`,
          'Range-Unit': 'items',
          Prefer: 'count=none',
        },
      })
      if (!next.ok) break
      const nextData: Array<{ deal_id: string }> = await next.json()
      for (const { deal_id } of nextData) existing.add(deal_id)
      fetched += nextData.length
      if (nextData.length === 0) break
    }

    return { existing, error: null }
  } catch (e) {
    return { existing, error: String(e) }
  }
}

export interface InsertResult {
  ok: number
  err: number
  errors: string[]
}

/**
 * Upserts CrmRows as Supabase events.
 * Rows marked existsInSupabase are skipped.
 * Uses ignore-duplicates so re-runs are always safe.
 */
export async function upsertCrmRows(
  rows: CrmRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<InsertResult> {
  const sb = getSupabaseBase()
  if (!sb) return { ok: 0, err: rows.length, errors: ['Supabase não configurado'] }

  const toInsert = rows.filter((r) => !r.existsInSupabase)
  if (toInsert.length === 0) return { ok: 0, err: 0, errors: [] }

  const BATCH = 25
  let ok = 0
  let err = 0
  const errors: string[] = []

  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH).map((r) => ({
      event_id: r.eventId,
      event_type: r.eventType,
      event_ts: r.eventTs,
      event_date: r.eventDate,
      deal_id: r.dealId,
      email_norm: r.emailNorm || null,
      export_status: 'frontend_backfill',
      payload: buildEventPayload(r),
      utm_campaign: r.utmCampaign ?? null,
    }))

    try {
      const res = await fetch(`${sb.url}/rest/v1/events?on_conflict=event_id`, {
        method: 'POST',
        headers: {
          ...baseHeaders(sb.key),
          Prefer: 'resolution=ignore-duplicates,return=minimal',
        },
        body: JSON.stringify(batch),
      })
      if (res.ok) {
        ok += batch.length
      } else {
        const text = await res.text()
        err += batch.length
        errors.push(`Lote ${Math.floor(i / BATCH) + 1}: HTTP ${res.status} — ${text.slice(0, 200)}`)
      }
    } catch (e) {
      err += batch.length
      errors.push(`Lote ${Math.floor(i / BATCH) + 1}: ${String(e)}`)
    }

    onProgress?.(Math.min(i + BATCH, toInsert.length), toInsert.length)
    if (i + BATCH < toInsert.length) await new Promise((r) => setTimeout(r, 500))
  }

  return { ok, err, errors }
}
