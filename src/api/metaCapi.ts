// Meta Conversions API client — browser-side implementation.
// PII is SHA-256 hashed before transmission as required by Meta's spec.
// fbc and fbp are NOT hashed per Meta's documentation.

export interface UserDataRaw {
  email?: string
  phone?: string        // already cleaned E.164 or raw digits
  fn?: string           // first name (plain text)
  ln?: string           // last name (plain text)
  city?: string
  state?: string        // 2-letter code
  zip?: string
  country?: string      // ISO code, defaults to 'br'
  fbc?: string          // NOT hashed
  fbp?: string          // NOT hashed
  externalId?: string   // defaults to email if absent
}

export interface CapiEventPayload {
  event_name: string
  event_time: number      // unix seconds
  event_id: string        // dedup key
  action_source: 'crm'
  user_data: {
    em?: string[]
    ph?: string[]
    fn?: string[]
    ln?: string[]
    ct?: string[]
    st?: string[]
    zp?: string[]
    country?: string[]
    fbc?: string
    fbp?: string
    external_id?: string[]
  }
  custom_data?: Record<string, unknown>
}

async function sha256(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value)
  const buf = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hashField(value: string | undefined): Promise<string[] | undefined> {
  if (!value) return undefined
  const cleaned = value.toLowerCase().trim()
  if (!cleaned) return undefined
  return [await sha256(cleaned)]
}

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

export async function buildCapiUserData(raw: UserDataRaw): Promise<CapiEventPayload['user_data']> {
  // Normalize each field before hashing per Meta's spec
  const [em, ph, fn, ln, ct, st, zp, country, externalId] = await Promise.all([
    hashField(raw.email),
    hashField(raw.phone?.replace(/\D/g, '')),  // digits only
    raw.fn ? hashField(stripDiacritics(raw.fn).toLowerCase()) : Promise.resolve(undefined),
    raw.ln ? hashField(stripDiacritics(raw.ln).toLowerCase()) : Promise.resolve(undefined),
    raw.city ? hashField(stripDiacritics(raw.city).toLowerCase().replace(/\s+/g, '')) : Promise.resolve(undefined),
    hashField(raw.state?.toLowerCase()),
    hashField(raw.zip?.replace(/\D/g, '')),
    hashField(raw.country?.toLowerCase() ?? 'br'),
    hashField(raw.externalId ?? raw.email),
  ])

  return {
    ...(em && { em }),
    ...(ph && { ph }),
    ...(fn && { fn }),
    ...(ln && { ln }),
    ...(ct && { ct }),
    ...(st && { st }),
    ...(zp && { zp }),
    ...(country && { country }),
    ...(raw.fbc && { fbc: raw.fbc }),
    ...(raw.fbp && { fbp: raw.fbp }),
    ...(externalId && { external_id: externalId }),
  }
}

export interface CapiSendResult {
  eventsReceived: number
  messages?: string[]
  fbtrace_id?: string
  error?: string
}

export async function sendCapiEvents(
  pixelId: string,
  accessToken: string,
  events: CapiEventPayload[],
  testEventCode?: string,
): Promise<CapiSendResult> {
  const body: Record<string, unknown> = { data: events, access_token: accessToken }
  if (testEventCode) body.test_event_code = testEventCode

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) {
      return { eventsReceived: 0, error: json?.error?.message ?? `HTTP ${res.status}` }
    }
    return {
      eventsReceived: json.events_received ?? 0,
      messages: json.messages,
      fbtrace_id: json.fbtrace_id,
    }
  } catch (e) {
    return { eventsReceived: 0, error: String(e) }
  }
}
