/** Field name normalizer — strips diacritics, lowercase, removes separators */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[\s_\-.()/]/g, '')
}

// ── Phone cleaning ────────────────────────────────────────────────────────────

/**
 * Cleans a Brazilian phone number to E.164 (+55XXXXXXXXXX).
 * Returns null if the number can't be reliably cleaned.
 */
export function cleanPhone(raw: string): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null

  // Already has country code 55
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return '+' + digits
  }
  // 10 digits (DDD + 8-digit landline) or 11 digits (DDD + 9-digit mobile)
  if (digits.length === 10 || digits.length === 11) return '+55' + digits

  return null
}

// ── Name splitting ────────────────────────────────────────────────────────────

export function splitName(name: string): { fn: string; ln: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { fn: '', ln: '' }
  if (parts.length === 1) return { fn: parts[0]!, ln: '' }
  return { fn: parts[0]!, ln: parts.slice(1).join(' ') }
}

// ── Contact field extraction ──────────────────────────────────────────────────

export interface ContactFields {
  email: string
  phone: string | null
  fullName: string | null
  fn: string | null
  ln: string | null
  company: string | null
  city: string | null
  state: string | null   // 2-letter BR state abbreviation
  zip: string | null     // digits only
}

/**
 * Extracts contact fields from a raw form submission (Record of field title → value).
 * Tries multiple naming conventions used across different LP templates.
 */
export function extractContactFields(raw: Record<string, string>): ContactFields {
  let email = ''
  let rawPhone = ''
  let fullName = ''
  let company = ''
  let city = ''
  let state = ''
  let zip = ''

  for (const [key, value] of Object.entries(raw)) {
    const k = norm(key)
    const v = (value ?? '').trim()
    if (!v || v === '-') continue

    if (!email && (k.includes('email') || k === 'email' || k === 'emaildobuyer') && v.includes('@')) {
      email = v.toLowerCase()
    } else if (!rawPhone && (
      k === 'telefone' || k === 'celular' || k === 'whatsapp' || k === 'phone' ||
      k === 'fone' || k === 'tel' || k === 'numerodetelefone' || k === 'numerodecellphone' ||
      k.includes('telefone') || k.includes('celular') || k.includes('whatsapp') || k.includes('numerodotel')
    )) {
      rawPhone = v
    } else if (!fullName && (
      k === 'nome' || k === 'name' || k === 'nomecompleto' || k === 'nomedobuyer' ||
      k === 'nomedoproprietario' || k === 'nomedodono' ||
      (k.startsWith('nome') && !k.includes('empresa') && !k.includes('negocio') &&
       !k.includes('fantasia') && !k.includes('razao') && !k.includes('social') && !k.includes('pagina'))
    )) {
      fullName = v
    } else if (!company && (
      k === 'empresa' || k === 'nomedaempresa' || k === 'razaosocial' || k === 'company' ||
      k.includes('empresa') || k.includes('razaosocial') || k.includes('nomefantasia') || k.includes('negocio')
    )) {
      company = v
    } else if (!city && (k === 'cidade' || k === 'city' || k === 'ct' || k === 'municipio')) {
      city = v
    } else if (!state && (k === 'estado' || k === 'uf' || k === 'state' || k === 'st' || k === 'estadobr')) {
      // Try to extract 2-letter code
      const match = v.toUpperCase().match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/)
      state = match ? match[1]! : v.toUpperCase().slice(0, 2)
    } else if (!zip && (k === 'cep' || k === 'zip' || k === 'codigopostal' || k === 'cepdobuyer')) {
      zip = v.replace(/\D/g, '')
    }
  }

  const { fn, ln } = splitName(fullName)

  return {
    email,
    phone: cleanPhone(rawPhone),
    fullName: fullName || null,
    fn: fn || null,
    ln: ln || null,
    company: company || null,
    city: city || null,
    state: state || null,
    zip: zip || null,
  }
}

// ── Audience row ──────────────────────────────────────────────────────────────

export interface AudienceRow {
  email: string
  phone: string | null
  fn: string | null
  ln: string | null
  company: string | null
  country: 'BR'
  zip: string | null
  city: string | null
  state: string | null
  // Reference fields (not sent to Meta, shown in preview)
  utmCampaign: string
  utmSource: string
  pageName: string
  leadDate: string
  highestStage: string | null  // highest CRM stage reached
  segment: string | null
  faturamento: string | null
}

// ── CSV generation ────────────────────────────────────────────────────────────

function csvCell(v: string): string {
  if (!v) return ''
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"'
  }
  return v
}

/**
 * Builds a Meta Ads–compatible CSV.
 * Columns: email, phone, fn, ln, country, zip, ct, st
 */
export function buildMetaCsv(rows: AudienceRow[]): string {
  const headers = ['email', 'phone', 'fn', 'ln', 'country', 'zip', 'ct', 'st']
  const lines: string[] = [headers.join(',')]

  for (const r of rows) {
    const cols = [
      r.email,
      r.phone ?? '',
      r.fn ?? '',
      r.ln ?? '',
      r.country,
      r.zip ?? '',
      r.city ?? '',
      r.state ?? '',
    ].map(csvCell)
    lines.push(cols.join(','))
  }

  return lines.join('\n')
}

/** CRM stage display order (highest to lowest) */
export const STAGE_ORDER_AUDIENCE = [
  'deal_won',
  'deal_lost',
  'meeting_completed',
  'opportunity',
  'sql',
  'mql',
  'not_mql',
] as const

export const STAGE_LABEL_AUDIENCE: Record<string, string> = {
  deal_won: 'Deal Ganho',
  deal_lost: 'Deal Perdido',
  meeting_completed: 'Reunião Realizada',
  opportunity: 'Oportunidade',
  sql: 'SQL',
  mql: 'MQL',
  not_mql: 'Não MQL',
}

/** Returns the highest CRM stage from a set of stages */
export function highestStage(stages: Set<string>): string | null {
  for (const s of STAGE_ORDER_AUDIENCE) {
    if (stages.has(s)) return s
  }
  return null
}
