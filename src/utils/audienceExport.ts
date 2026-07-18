/** Field name normalizer — strips diacritics, lowercase, removes separators */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[\s_\-.()/\*:]/g, '')
}

// ── Phone cleaning ────────────────────────────────────────────────────────────

export function cleanPhone(raw: string): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return '+' + digits
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

// ── State normalization ───────────────────────────────────────────────────────

const STATE_NAMES: Record<string, string> = {
  ac: 'AC', acre: 'AC',
  al: 'AL', alagoas: 'AL',
  ap: 'AP', amapa: 'AP',
  am: 'AM', amazonas: 'AM',
  ba: 'BA', bahia: 'BA',
  ce: 'CE', ceara: 'CE',
  df: 'DF', distritofederal: 'DF', brasilia: 'DF',
  es: 'ES', espiritosanto: 'ES',
  go: 'GO', goias: 'GO',
  ma: 'MA', maranhao: 'MA',
  mt: 'MT', matogrosso: 'MT',
  ms: 'MS', matogrossodosul: 'MS',
  mg: 'MG', minasgerais: 'MG',
  pa: 'PA', para: 'PA',
  pb: 'PB', paraiba: 'PB',
  pr: 'PR', parana: 'PR',
  pe: 'PE', pernambuco: 'PE',
  pi: 'PI', piaui: 'PI',
  rj: 'RJ', riodejaneiro: 'RJ',
  rn: 'RN', riograndedonorte: 'RN',
  rs: 'RS', riograndedosul: 'RS',
  ro: 'RO', rondonia: 'RO',
  rr: 'RR', roraima: 'RR',
  sc: 'SC', santacatarina: 'SC',
  sp: 'SP', saopaulo: 'SP',
  se: 'SE', sergipe: 'SE',
  to: 'TO', tocantins: 'TO',
}

function normalizeState(raw: string): string {
  if (!raw) return ''
  // Extract 2-letter code from combined formats like "São Paulo/SP" or "SP - São Paulo"
  const m2 = raw.toUpperCase().match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/)
  if (m2) return m2[1]!
  const k = norm(raw)
  return STATE_NAMES[k] ?? raw.toUpperCase().slice(0, 2)
}

// ── Approximate CEP lookup ────────────────────────────────────────────────────

const STATE_TO_CEP: Record<string, string> = {
  AC: '69900000', AL: '57000000', AP: '68900000', AM: '69000000',
  BA: '40000000', CE: '60000000', DF: '70000000', ES: '29000000',
  GO: '74000000', MA: '65000000', MT: '78000000', MS: '79000000',
  MG: '30000000', PA: '66000000', PB: '58000000', PR: '80000000',
  PE: '50000000', PI: '64000000', RJ: '20000000', RN: '59000000',
  RS: '90000000', RO: '76800000', RR: '69300000', SC: '88000000',
  SP: '01000000', SE: '49000000', TO: '77000000',
}

// Normalized city name → 8-digit approximate CEP
const CITY_TO_CEP: Record<string, string> = {
  'sao paulo': '01310100', 'sp': '01310100',
  'rio de janeiro': '20040020', 'rio': '20040020',
  'belo horizonte': '30110000', 'bh': '30110000',
  'curitiba': '80010000',
  'porto alegre': '90010000', 'poa': '90010000',
  'salvador': '40020000',
  'fortaleza': '60010000',
  'manaus': '69010000',
  'recife': '50010000',
  'belem': '66010000',
  'brasilia': '70000000',
  'goiania': '74000000',
  'florianopolis': '88010000', 'floripa': '88010000',
  'vitoria': '29010000',
  'maceio': '57010000',
  'natal': '59010000',
  'joao pessoa': '58010000',
  'teresina': '64000000',
  'campo grande': '79010000',
  'cuiaba': '78010000',
  'aracaju': '49010000',
  'porto velho': '76800000',
  'boa vista': '69300000',
  'macapa': '68900000',
  'palmas': '77000000',
  'sao luis': '65010000',
  'campinas': '13010000',
  'guarulhos': '07010000',
  'osasco': '06010000',
  'ribeirao preto': '14010000',
  'sorocaba': '18010000',
  'sao jose dos campos': '12210000',
  'santo andre': '09010000',
  'joinville': '89201000',
  'londrina': '86010000',
  'maringa': '87010000',
  'juiz de fora': '36010000',
  'niteroi': '24020000',
  'feira de santana': '44001000',
  'contagem': '32010000',
  'uberlandia': '38400000',
  'duque de caxias': '25010000',
  'nova iguacu': '26010000',
  'sao goncalo': '24400000',
  'aparecida de goiania': '74900000',
  'mogi das cruzes': '08710000',
  'piracicaba': '13400000',
  'montes claros': '39400000',
  'caxias do sul': '95010000',
  'pelotas': '96010000',
  'canoas': '92010000',
  'blumenau': '89010000',
  'chapeco': '89800000',
  'criciuma': '88800000',
  'itajai': '88300000',
  'volta redonda': '27200000',
  'campos dos goytacazes': '28010000',
  'petropolis': '25610000',
  'uberaba': '38010000',
  'ipatinga': '35160000',
  'betim': '32600000',
  'santa maria': '97010000',
  'novo hamburgo': '93310000',
  'balneario camboriu': '88330000',
  'camacari': '42800000',
  'vitoria da conquista': '45010000',
  'imperatriz': '65900000',
  'parnaiba': '64200000',
  'mossoro': '59600000',
  'santarem': '68000000',
  'maraba': '68500000',
  'porto seguro': '45810000',
  'barreiras': '47800000',
  'itabuna': '45600000',
  'lauro de freitas': '42700000',
  'simoes filho': '43700000',
  'caruaru': '55010000',
  'petrolina': '56310000',
  'juazeiro do norte': '63010000',
  'caucaia': '61600000',
  'anapolis': '75100000',
  'passo fundo': '99010000',
  'gravatai': '94010000',
  'sao leopoldo': '93010000',
  'viamao': '94400000',
  'palhoca': '88130000',
  'lages': '88501000',
  'carapicuiba': '06310000',
  'maua': '09370000',
  'franca': '14400000',
  'praia grande': '11700000',
  'macae': '27900000',
  'governador valadares': '35010000',
  'ribeirao das neves': '33880000',
  'sao jose do rio preto': '15010000',
  'aparecida': '12570000',
  'jundiai': '13200000',
  'limeira': '13480000',
  'taubate': '12010000',
  'suzano': '08600000',
  'diadema': '09900000',
  'bauru': '17010000',
  'sao vicente': '11310000',
  'santos': '11010000',
  'guaruja': '11410000',
  'ananindeua': '67000000',
  'castanhal': '68740000',
  'jaboatao dos guararapes': '54310000',
}

function approxCep(city: string, state: string): string {
  const cityKey = city.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()
  return CITY_TO_CEP[cityKey] ?? STATE_TO_CEP[state] ?? ''
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
  state: string | null
  zip: string | null
}

const ENTERPRISE_WORDS = ['empresa', 'negocio', 'fantasia', 'razao', 'social', 'cnpj', 'inscricao', 'ramo']

function isEnterpriseKey(k: string): boolean {
  return ENTERPRISE_WORDS.some((w) => k.includes(w))
}

/**
 * Extracts contact fields from a raw form submission.
 * Handles dozens of field naming conventions used across GreatPages LP templates.
 * Falls back to approximate CEP from city/state when ZIP is not in the form.
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
    const v = String(value ?? '').trim()
    if (!v || v === '-' || v.toLowerCase() === 'n/a' || v.toLowerCase() === 'nao informado') continue

    // ── Email ──
    if (!email && v.includes('@') && v.includes('.') && !v.includes(' ')) {
      email = v.toLowerCase()
      continue
    }

    // ── Phone ──
    if (!rawPhone && (
      k.includes('telefone') || k.includes('celular') || k.includes('whatsapp') ||
      k === 'phone' || k === 'fone' || k === 'tel' || k === 'contato' ||
      k.includes('numerodotel') || k.includes('numerodocel') || k.includes('numerodewhat')
    ) && !k.includes('email')) {
      rawPhone = v
      continue
    }

    // ── Company (before name to avoid false positives) ──
    if (!company && isEnterpriseKey(k)) {
      company = v
      continue
    }

    // ── Name — broad match: any field with "nome" or "name" not related to enterprise ──
    if (!fullName && !isEnterpriseKey(k) && (
      k.includes('nome') || k === 'name' || k === 'nomecompleto' || k === 'fullname' ||
      k === 'seunome' || k === 'seunomecompleto' || k === 'comovcseconhece' ||
      k.includes('proprietario') || k.includes('responsavel') || k === 'dono'
    ) && !k.includes('email') && !k.includes('utm') && !k.includes('pagina')) {
      fullName = v
      continue
    }

    // ── ZIP ──
    if (!zip && (k.includes('cep') || k.includes('postal') || k === 'zip')) {
      zip = v.replace(/\D/g, '').slice(0, 8)
      continue
    }

    // ── City/State combined field (e.g. "São Paulo / SP" or "SP") ──
    if (!city && (
      k.includes('cidade') || k === 'municipio' || k === 'ct' || k === 'city' ||
      k === 'cidadeeestado' || k === 'cidadeestado' || k === 'localidade'
    )) {
      // Check for combined "City / ST" format
      const combined = v.match(/^(.+?)\s*[\/\-,]\s*([A-Z]{2})$/)
      if (combined) {
        city = combined[1]!.trim()
        if (!state) state = normalizeState(combined[2]!)
      } else {
        city = v
      }
      continue
    }

    // ── State ──
    if (!state && (
      k.includes('estado') || k === 'uf' || k === 'state' || k === 'st' ||
      k === 'estadobr' || k === 'estadouf'
    )) {
      state = normalizeState(v)
      continue
    }
  }

  // ── Approximate ZIP from city/state when form doesn't capture it ──
  if (!zip && (city || state)) {
    zip = approxCep(city, state)
  }

  // ── Normalize state from city if still missing ──
  if (!state && city) {
    const cityKey = city.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()
    // Known capital cities → state
    const CITY_TO_STATE: Record<string, string> = {
      'sao paulo': 'SP', 'rio de janeiro': 'RJ', 'belo horizonte': 'MG',
      'curitiba': 'PR', 'porto alegre': 'RS', 'salvador': 'BA', 'fortaleza': 'CE',
      'manaus': 'AM', 'recife': 'PE', 'belem': 'PA', 'brasilia': 'DF',
      'goiania': 'GO', 'florianopolis': 'SC', 'vitoria': 'ES', 'maceio': 'AL',
      'natal': 'RN', 'joao pessoa': 'PB', 'teresina': 'PI', 'campo grande': 'MS',
      'cuiaba': 'MT', 'aracaju': 'SE', 'porto velho': 'RO', 'boa vista': 'RR',
      'macapa': 'AP', 'palmas': 'TO', 'sao luis': 'MA', 'campinas': 'SP',
      'guarulhos': 'SP', 'osasco': 'SP', 'ribeirao preto': 'SP', 'sorocaba': 'SP',
      'joinville': 'SC', 'londrina': 'PR', 'maringa': 'PR',
    }
    state = CITY_TO_STATE[cityKey] ?? ''
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
  value: number | null
  // Reference fields (not sent to Meta, shown in preview)
  utmCampaign: string
  utmSource: string
  pageName: string
  leadDate: string
  highestStage: string | null
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

export function buildMetaCsv(rows: AudienceRow[]): string {
  const hasValue = rows.some((r) => r.value !== null && r.value !== undefined)
  const headers = ['email', 'phone', 'fn', 'ln', 'country', 'zip', 'ct', 'st']
  if (hasValue) headers.push('value')

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
    if (hasValue) cols.push(r.value !== null && r.value !== undefined ? String(r.value) : '')
    lines.push(cols.join(','))
  }

  return lines.join('\n')
}

// ── CRM stage helpers ─────────────────────────────────────────────────────────

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

export function highestStage(stages: Set<string>): string | null {
  for (const s of STAGE_ORDER_AUDIENCE) {
    if (stages.has(s)) return s
  }
  return null
}
