import type { CrmRow } from '../utils/parseCrmCsv'
import { buildEventPayload } from '../utils/parseCrmCsv'

function getSupabaseBase(): { url: string; key: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return { url, key }
}

// GET requests must NOT include Content-Type — it triggers CORS preflight that Supabase blocks
function readHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  }
}

function writeHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

const PAGE_SIZE = 1000

export interface ExistingIndex {
  byDealId: Set<string>
  byEmailCampaign: Set<string> // "email|utm_campaign" — only when both non-null
}

/**
 * Fetches existing events of `eventType` within the date range of `rows`
 * and builds two deduplication indexes:
 *   - byDealId: deal_ids already in Supabase
 *   - byEmailCampaign: "email|utm_campaign" combos (additional safety net)
 *
 * A CSV row is a duplicate when either index matches.
 * Returns { index, error } — error is surfaced to the UI, never silently swallowed.
 */
export async function fetchExistingIndex(
  rows: CrmRow[],
  eventType: string,
): Promise<{ index: ExistingIndex; error: string | null }> {
  const sb = getSupabaseBase()
  const empty: ExistingIndex = { byDealId: new Set(), byEmailCampaign: new Set() }
  if (!sb) return { index: empty, error: null }

  const dates = rows.map((r) => r.eventDate).filter(Boolean).sort()
  if (dates.length === 0) return { index: empty, error: null }

  const dateFrom = dates[0]
  const dateTo = dates[dates.length - 1]

  const index: ExistingIndex = { byDealId: new Set(), byEmailCampaign: new Set() }
  const base = `${sb.url}/rest/v1/events`
  // Select only columns confirmed to work via anon key; extract utm_campaign from payload
  const qs = `select=deal_id,email_norm,payload&event_type=eq.${eventType}&event_date=gte.${dateFrom}&event_date=lte.${dateTo}`

  function addToIndex(row: { deal_id: string; email_norm?: string | null; payload?: unknown }) {
    if (row.deal_id) index.byDealId.add(row.deal_id)
    // Extract utm_campaign from payload.deal.utmCampaign or payload.utmCampaign
    const p = row.payload as Record<string, unknown> | null | undefined
    const rawUtm = (p?.deal as Record<string, unknown>)?.utmCampaign ?? p?.utmCampaign
    const utmCampaign = typeof rawUtm === 'string' ? rawUtm : null
    const email = row.email_norm ?? null
    if (email && utmCampaign) {
      index.byEmailCampaign.add(`${email}|${utmCampaign}`)
    }
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
      return { index, error: `Supabase retornou HTTP ${first.status}: ${text.slice(0, 300)}` }
    }

    const firstData: Array<{ deal_id: string; email_norm?: string | null; payload?: unknown }> =
      await first.json()
    firstData.forEach(addToIndex)

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
      const nextData: Array<{ deal_id: string; email_norm?: string | null; payload?: unknown }> =
        await next.json()
      nextData.forEach(addToIndex)
      fetched += nextData.length
      if (nextData.length === 0) break
    }

    return { index, error: null }
  } catch (e) {
    return { index, error: String(e) }
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
          ...writeHeaders(sb.key),
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
