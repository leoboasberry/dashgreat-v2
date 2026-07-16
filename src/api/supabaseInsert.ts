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

/**
 * Returns the set of deal_ids that already have an event of `eventType`
 * in Supabase. Batches requests to keep URLs short.
 */
export async function fetchExistingDealIds(
  dealIds: string[],
  eventType: string,
): Promise<Set<string>> {
  const sb = getSupabaseBase()
  if (!sb || dealIds.length === 0) return new Set()

  const existing = new Set<string>()
  const CHUNK = 50

  for (let i = 0; i < dealIds.length; i += CHUNK) {
    const chunk = dealIds.slice(i, i + CHUNK)
    const inClause = chunk.map((id) => `"${id}"`).join(',')
    try {
      const res = await fetch(
        `${sb.url}/rest/v1/events?select=deal_id&event_type=eq.${eventType}&deal_id=in.(${inClause})`,
        { headers: baseHeaders(sb.key) },
      )
      if (res.ok) {
        const data: Array<{ deal_id: string }> = await res.json()
        for (const { deal_id } of data) existing.add(deal_id)
      }
    } catch {
      // Network error on one chunk — continue
    }
  }

  return existing
}

export interface InsertResult {
  ok: number
  err: number
  errors: string[]
}

/**
 * Upserts a batch of CrmRows as Supabase events.
 * Skips rows already marked existsInSupabase.
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
