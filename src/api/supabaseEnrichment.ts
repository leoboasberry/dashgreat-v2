import type { LeadEnrichment } from '../types/capi'

function getBase(): { url: string; key: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return { url, key }
}

const BATCH = 200

/**
 * Upsert lead enrichments derived from GreatPages leads into Supabase.
 * Called from the CAPI section whenever pages are loaded, so the Edge Function
 * (pg_cron auto-dispatch) has phone/name/city/state/zip/fbc for advanced matching.
 */
export async function upsertEnrichments(
  enrichMap: Record<string, LeadEnrichment>,
): Promise<void> {
  const sb = getBase()
  if (!sb) return

  const entries = Object.entries(enrichMap).filter(
    ([email, e]) =>
      email &&
      (e.phone || e.fn || e.ln || e.city || e.state || e.zip || e.fbc || e.fbp || e.fbclid),
  )
  if (entries.length === 0) return

  const rows = entries.map(([email_norm, e]) => ({
    email_norm,
    phone:   e.phone   ?? null,
    fn:      e.fn      ?? null,
    ln:      e.ln      ?? null,
    city:    e.city    ?? null,
    state:   e.state   ?? null,
    zip:     e.zip     ?? null,
    fbp:     e.fbp     ?? null,
    fbc:     e.fbc     ?? null,
    fbclid:  e.fbclid  ?? null,
    lead_ts: e.leadTs  ?? null,
    updated_at: new Date().toISOString(),
  }))

  const url = `${sb.url}/rest/v1/lead_enrichments`
  const headers = {
    apikey: sb.key,
    Authorization: `Bearer ${sb.key}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  }

  for (let i = 0; i < rows.length; i += BATCH) {
    await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(rows.slice(i, i + BATCH)),
    }).catch(() => {})
  }
}
