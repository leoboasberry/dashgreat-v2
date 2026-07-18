import type { CrmEventType } from '../utils/parseCrmCsv'

// ── Event name mapping ────────────────────────────────────────────────────────

export const META_STANDARD_EVENTS = [
  'Lead', 'Purchase', 'Subscribe', 'StartTrial', 'Schedule',
  'CompleteRegistration', 'InitiateCheckout', 'ViewContent', 'Contact',
] as const

export const DEFAULT_EVENT_MAPPING: Record<CrmEventType, string> = {
  mql: 'Lead',
  not_mql: '',           // empty = don't send
  sql: 'Lead',
  opportunity: 'Opportunity',
  meeting_completed: 'Schedule',
  deal_won: 'Purchase',
  deal_lost: '',
}

// ── Pixel configuration ───────────────────────────────────────────────────────

export interface PixelFilters {
  eventTypes: CrmEventType[]      // which CRM stages to send (empty = all)
  minMrr?: number
  maxMrr?: number
  segments: string[]              // empty = all
  campaigns: string[]             // utm_campaign values; empty = all
  utmSources: string[]            // empty = all
  faturamentos: string[]          // empty = all
}

export interface PixelConfig {
  id: string                      // internal UUID
  name: string                    // user label
  pixelId: string
  accessToken: string
  testEventCode?: string
  enabled: boolean
  eventMapping: Record<CrmEventType, string>  // '' = skip
  filters: PixelFilters
  lookbackDays: number            // how far back to fetch events
  autoDispatch: boolean
  intervalMinutes: number         // 15 | 30 | 60 | 240 | 1440
}

// ── Dispatch log ──────────────────────────────────────────────────────────────

export interface DispatchLogEntry {
  id: string
  pixelId: string
  pixelName: string
  startedAt: string              // ISO
  eventsAttempted: number
  eventsSent: number
  errors: string[]
}

// ── Supabase event shape for CAPI ─────────────────────────────────────────────

export interface CapiSupabaseEvent {
  event_id: string
  event_type: string
  event_ts: string | null
  event_date: string | null
  email_norm: string | null
  payload: {
    deal?: {
      utmCampaign?: string
      utmSource?: string
      platform?: string
      segment?: string
      revenue?: string
      potentialNewMRR?: number | string | null
      pagina?: string
    }
    utmSource?: string
    utmCampaign?: string
    segment?: string
    revenue?: string
  } | null
}

// ── Enriched lead data (from GreatPages) ──────────────────────────────────────

export interface LeadEnrichment {
  phone: string | null            // E.164
  fn: string | null
  ln: string | null
  city: string | null
  state: string | null
  zip: string | null
  fbp?: string                    // _fbp cookie value (not hashed)
  fbc?: string                    // _fbc cookie value (not hashed)
  fbclid?: string                 // raw fbclid from URL param
  leadTs?: number                 // unix timestamp of lead creation
}

export function defaultPixelConfig(overrides?: Partial<PixelConfig>): PixelConfig {
  return {
    id: crypto.randomUUID(),
    name: '',
    pixelId: '',
    accessToken: '',
    testEventCode: '',
    enabled: true,
    eventMapping: { ...DEFAULT_EVENT_MAPPING },
    filters: { eventTypes: [], segments: [], campaigns: [], utmSources: [], faturamentos: [] },
    lookbackDays: 7,
    autoDispatch: false,
    intervalMinutes: 60,
    ...overrides,
  }
}
