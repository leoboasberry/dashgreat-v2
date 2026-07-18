/**
 * CAPI Meta — Supabase Edge Function
 *
 * Triggered by:
 *   1. pg_cron every 30 min (body: { auto: true })
 *   2. Browser manual dispatch (body: { pixelId?, dateFrom?, dateTo?, enrichData? })
 *
 * enrichData: Record<email_norm, { fn?, ln?, phone?, city?, state?, zip?, fbp?, fbc?, fbclid?, leadTs? }>
 * When absent (auto/cron mode), only email is used for matching.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PAGE_SIZE    = 1000
const BATCH_SIZE   = 50

// ── CORS ─────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// ── SHA-256 ───────────────────────────────────────────────────────────────────

async function sha256(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value)
  const buf = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hashField(value: string | undefined | null): Promise<string[] | undefined> {
  if (!value) return undefined
  const cleaned = value.toLowerCase().trim()
  if (!cleaned) return undefined
  return [await sha256(cleaned)]
}

// safe unicode escapes — avoids encoding issues in Deno runtime
function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

interface EnrichEntry {
  fn?: string; ln?: string; phone?: string
  city?: string; state?: string; zip?: string
  fbp?: string; fbc?: string; fbclid?: string; leadTs?: number
}

async function buildUserData(email: string | null, enrich?: EnrichEntry | null) {
  const [em, ph, fn, ln, ct, st, zp, country, extId] = await Promise.all([
    hashField(email),
    hashField(enrich?.phone?.replace(/\D/g, '')),
    enrich?.fn  ? hashField(stripDiacritics(enrich.fn).toLowerCase())  : Promise.resolve(undefined),
    enrich?.ln  ? hashField(stripDiacritics(enrich.ln).toLowerCase())  : Promise.resolve(undefined),
    enrich?.city  ? hashField(stripDiacritics(enrich.city).toLowerCase().replace(/\s+/g, '')) : Promise.resolve(undefined),
    hashField(enrich?.state?.toLowerCase()),
    hashField(enrich?.zip?.replace(/\D/g, '')),
    hashField('br'),
    hashField(email),
  ])

  const fbclid = enrich?.fbclid
  const fbc    = enrich?.fbc ?? (fbclid && enrich?.leadTs ? `fb.1.${enrich.leadTs}.${fbclid}` : undefined)
  const fbp    = enrich?.fbp

  return {
    ...(em  && { em }),
    ...(ph  && { ph }),
    ...(fn  && { fn }),
    ...(ln  && { ln }),
    ...(ct  && { ct }),
    ...(st  && { st }),
    ...(zp  && { zp }),
    ...(country && { country }),
    ...(fbc && { fbc }),
    ...(fbp && { fbp }),
    ...(extId && { external_id: extId }),
  }
}

// ── Filters ───────────────────────────────────────────────────────────────────

interface Filters {
  campaigns?: string[]; utmSources?: string[]; segments?: string[]; faturamentos?: string[]
  minMrr?: number; maxMrr?: number
}

function passesFilters(ev: Record<string, unknown>, filters: Filters): boolean {
  const payload  = (ev.payload ?? {}) as Record<string, unknown>
  const deal     = (payload.deal ?? {}) as Record<string, unknown>
  const campaign = String(deal.utmCampaign ?? payload.utmCampaign ?? '').trim()
  const source   = String(deal.utmSource   ?? payload.utmSource   ?? '').toLowerCase().trim()
  const segment  = String(deal.segment     ?? payload.segment     ?? '').trim()
  const revenue  = String(deal.revenue     ?? payload.revenue     ?? '').trim()

  if (filters.campaigns?.length    && !filters.campaigns.includes(campaign))  return false
  if (filters.utmSources?.length   && !filters.utmSources.includes(source))   return false
  if (filters.segments?.length     && !filters.segments.some(s  => segment.toLowerCase().includes(s.toLowerCase()))) return false
  if (filters.faturamentos?.length && !filters.faturamentos.some(r => revenue.toLowerCase().includes(r.toLowerCase()))) return false

  if (ev.event_type === 'deal_won') {
    const rawMrr = deal.potentialNewMRR
    if (rawMrr !== null && rawMrr !== undefined) {
      const mrr = typeof rawMrr === 'number' ? rawMrr : parseFloat(String(rawMrr).replace(',', '.'))
      if (!isNaN(mrr)) {
        if (filters.minMrr !== undefined && mrr < filters.minMrr) return false
        if (filters.maxMrr !== undefined && mrr > filters.maxMrr) return false
      }
    }
  }
  return true
}

// ── Meta CAPI send ────────────────────────────────────────────────────────────

async function sendBatch(
  pixelId: string, token: string, events: unknown[], testCode?: string | null,
): Promise<{ sent: number; error?: string }> {
  const body: Record<string, unknown> = { data: events, access_token: token }
  if (testCode) body.test_event_code = testCode
  try {
    const res  = await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) return { sent: 0, error: data?.error?.message ?? `HTTP ${res.status}` }
    return { sent: data.events_received ?? 0 }
  } catch (e) {
    return { sent: 0, error: String(e) }
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function subtractDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Always handle preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  // Wrap everything so CORS headers are always present even on crash
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars' }, 500)
    }

    const body = await req.json().catch(() => ({})) as {
      auto?: boolean
      pixelId?: string
      dateFrom?: string
      dateTo?: string
      enrichData?: Record<string, EnrichEntry>
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY)

    // ── Select pixels ───────────────────────────────────────────────────────

    let q = sb.from('capi_pixels').select('*').eq('enabled', true)
    if (body.pixelId) {
      q = q.eq('id', body.pixelId)
    } else {
      q = q.eq('auto_dispatch', true)
    }

    const { data: pixels, error: pixelErr } = await q
    if (pixelErr) return json({ ok: false, error: pixelErr.message }, 500)

    const today = todayISO()
    const summary: unknown[] = []

    for (const pixel of (pixels ?? [])) {
      // In auto mode skip pixels whose interval hasn't elapsed
      if (!body.pixelId && body.auto && pixel.last_dispatched_at) {
        const elapsed = (Date.now() - new Date(pixel.last_dispatched_at).getTime()) / 60000
        if (elapsed < pixel.interval_minutes) continue
      }

      const from = body.dateFrom ?? subtractDays(today, pixel.lookback_days)
      const to   = body.dateTo   ?? today

      const mapping    = (pixel.event_mapping ?? {}) as Record<string, string>
      const activeTypes = Object.entries(mapping).filter(([, v]) => v).map(([k]) => k)
      if (activeTypes.length === 0) continue

      // ── Fetch events ──────────────────────────────────────────────────────

      const allEvents: Record<string, unknown>[] = []
      let offset = 0

      while (true) {
        const { data: batch } = await sb
          .from('events')
          .select('event_id,event_type,event_ts,email_norm,payload')
          .in('event_type', activeTypes)
          .gte('event_date', from)
          .lte('event_date', to)
          .order('event_ts', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1)

        if (!batch || batch.length === 0) break
        allEvents.push(...batch)
        offset += batch.length
        if (batch.length < PAGE_SIZE) break
      }

      // ── Already-sent set ──────────────────────────────────────────────────

      const { data: sentRows } = await sb
        .from('capi_sent')
        .select('event_id')
        .eq('pixel_id', pixel.pixel_id)

      const sentSet = new Set<string>((sentRows ?? []).map((r: { event_id: string }) => r.event_id))

      // ── Filter ────────────────────────────────────────────────────────────

      const toSend = allEvents.filter(ev =>
        !sentSet.has(ev.event_id as string) &&
        passesFilters(ev, (pixel.filters ?? {}) as Filters)
      )

      // ── Build CAPI events ─────────────────────────────────────────────────

      const capiEvents: unknown[] = []
      const readyIds: string[]    = []

      for (const ev of toSend) {
        const metaName = mapping[ev.event_type as string]
        if (!metaName) continue

        const email  = ev.email_norm as string | null
        const enrich = body.enrichData?.[email ?? ''] ?? null
        const deal   = ((ev.payload as Record<string, unknown>)?.deal ?? {}) as Record<string, unknown>

        const rawMrr = deal.potentialNewMRR
        const mrr    = (ev.event_type === 'deal_won' && rawMrr != null)
          ? (typeof rawMrr === 'number' ? rawMrr : parseFloat(String(rawMrr).replace(',', '.')))
          : null

        const userData = await buildUserData(email, enrich)

        const eventTs = ev.event_ts
          ? Math.floor(new Date(ev.event_ts as string).getTime() / 1000)
          : Math.floor(Date.now() / 1000)

        const customData: Record<string, unknown> = {
          content_category: 'CRM',
          content_name: metaName,
        }
        if (mrr !== null && !isNaN(mrr)) {
          customData.currency = 'BRL'
          customData.value    = mrr
        }

        capiEvents.push({
          event_name:    metaName,
          event_time:    eventTs,
          event_id:      ev.event_id,
          action_source: 'crm',
          user_data:     userData,
          custom_data:   customData,
        })
        readyIds.push(ev.event_id as string)
      }

      // ── Send in batches of 50 ─────────────────────────────────────────────

      let totalSent = 0
      const errors: string[] = []

      for (let i = 0; i < capiEvents.length; i += BATCH_SIZE) {
        const batch    = capiEvents.slice(i, i + BATCH_SIZE)
        const batchIds = readyIds.slice(i, i + BATCH_SIZE)
        const result   = await sendBatch(pixel.pixel_id, pixel.access_token, batch, pixel.test_event_code)

        if (result.error) {
          errors.push(result.error)
        } else {
          totalSent += result.sent
          await sb.from('capi_sent').upsert(
            batchIds.map(id => ({ pixel_id: pixel.pixel_id, event_id: id })),
            { onConflict: 'pixel_id,event_id' }
          )
        }
      }

      // ── Bookkeeping ───────────────────────────────────────────────────────

      await sb.from('capi_pixels')
        .update({ last_dispatched_at: new Date().toISOString() })
        .eq('id', pixel.id)

      await sb.from('capi_dispatch_log').insert({
        pixel_db_id:      pixel.id,
        pixel_name:       pixel.name,
        events_attempted: capiEvents.length,
        events_sent:      totalSent,
        errors,
      })

      summary.push({ pixel: pixel.name, attempted: capiEvents.length, sent: totalSent, errors })
    }

    return json({ ok: true, dispatched: summary })

  } catch (err) {
    console.error('capi-dispatch unhandled error:', err)
    return json({ ok: false, error: String(err) }, 500)
  }
})
