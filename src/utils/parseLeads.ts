import type { Lead } from '../types/greatpages'
import type { PageData } from '../hooks/useDashboard'

export interface ParsedLead {
  utmSource: string   // normalized lowercase
  utmMedium: string
  utmCampaign: string // raw value
  utmTerm: string
  utmContent: string
  // Structured campaign breakdown
  campaign: string    // e.g. "F178"
  adSet: string       // e.g. "F178C2"
  ad: string          // e.g. "F178C2AD2"
  date: string        // "YYYY-MM-DD" or ""
  hour: number        // 0-23, or -1 if unknown
  faturamento: string
  segmento: string
  pageName: string
  pageUrl: string
  raw: Record<string, string>
}

/** Parse utmCampaign into structured campaign/adSet/ad */
export function parseCampaign(utmCampaign: string): { campaign: string; adSet: string; ad: string } {
  const m = utmCampaign.match(/^([A-Za-z]+\d+)(C\d+)(AD\d+)?/i)
  if (!m) return { campaign: utmCampaign, adSet: utmCampaign, ad: utmCampaign }
  const campaign = m[1]!
  const adSet = m[1]! + m[2]!
  const ad = m[3] ? m[1]! + m[2]! + m[3] : adSet
  return { campaign, adSet, ad }
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[\s_\-.]/g, '')
}

function extractHour(valor: string): number {
  if (!valor) return -1
  // ISO datetime: 2024-01-15T10:30:00 or 2024-01-15 10:30:00
  const isoTime = valor.match(/[\sT](\d{2}):\d{2}/)
  if (isoTime) return parseInt(isoTime[1]!, 10)
  // BR datetime: 15/01/2024 10:30
  const brTime = valor.match(/\d{2}\/\d{2}\/\d{4}[\sT](\d{2}):\d{2}/)
  if (brTime) return parseInt(brTime[1]!, 10)
  // Unix timestamp
  const ts = Number(valor)
  if (!isNaN(ts) && ts > 1_000_000_000) {
    const ms = ts < 1e12 ? ts * 1000 : ts
    return new Date(ms).getHours()
  }
  return -1
}

function extractDate(valor: string): string {
  if (!valor) return ''
  // ISO: 2024-01-15 or 2024-01-15T10:00:00
  const iso = valor.match(/(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]!
  // BR: 15/01/2024
  const br = valor.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  // Unix timestamp (seconds or ms)
  const ts = Number(valor)
  if (!isNaN(ts) && ts > 1_000_000_000) {
    const ms = ts < 1e12 ? ts * 1000 : ts
    return new Date(ms).toISOString().slice(0, 10)
  }
  return ''
}

// Field title → ParsedLead key
const UTM_KEYS: Record<string, keyof ParsedLead> = {
  utmsource: 'utmSource',
  utmmedium: 'utmMedium',
  utmcampaign: 'utmCampaign',
  utmterm: 'utmTerm',
  utmcontent: 'utmContent',
}

const DATE_KEYS = new Set([
  'data', 'datacriacao', 'dataconversao', 'datadeconversao', 'dataregistro',
  'datahora', 'createdat', 'convertedat', 'date', 'timestamp',
])

const FAT_KEYS = new Set([
  'faturamento', 'faturamentoanual', 'faturamentomensal',
  'receita', 'revenue', 'renda', 'rendamensal',
])

const SEG_KEYS = new Set([
  'segmento', 'segment', 'nicho', 'area', 'setor', 'mercado', 'ramo',
])

export function parseLeadRow(row: Lead[], pageName: string, pageUrl = ''): ParsedLead {
  const raw: Record<string, string> = {}
  const lead: ParsedLead = {
    utmSource: '', utmMedium: '', utmCampaign: '', utmTerm: '', utmContent: '',
    campaign: '', adSet: '', ad: '',
    date: '', hour: -1, faturamento: '', segmento: '', pageName, pageUrl, raw,
  }

  for (const field of row) {
    const key = norm(field.titulo)
    raw[field.titulo] = field.valor

    const utmTarget = UTM_KEYS[key]
    if (utmTarget) {
      // Normalize utmSource to lowercase for deduplication
      const val = utmTarget === 'utmSource' ? field.valor.toLowerCase() : field.valor
      lead[utmTarget] = val as never
    } else if (DATE_KEYS.has(key) && !lead.date) {
      lead.date = extractDate(field.valor)
      if (lead.hour === -1) lead.hour = extractHour(field.valor)
    } else if ((FAT_KEYS.has(key) || key.includes('faturamento') || key.includes('receita') || key.includes('revenue')) && !lead.faturamento) {
      lead.faturamento = field.valor
    } else if ((SEG_KEYS.has(key) || key.includes('segmento') || key.includes('nicho') || key.includes('setor')) && !lead.segmento) {
      lead.segmento = field.valor
    }
  }

  // Derive structured campaign fields from utmCampaign
  if (lead.utmCampaign) {
    const parsed = parseCampaign(lead.utmCampaign)
    lead.campaign = parsed.campaign
    lead.adSet = parsed.adSet
    lead.ad = parsed.ad
  }

  return lead
}

export function parseAllLeads(pages: PageData[]): ParsedLead[] {
  const result: ParsedLead[] = []
  for (const page of pages) {
    const rows = page.leads?.retorno?.paginas?.leads ?? []
    const pageUrl = page.summary.link.publico ?? ''
    for (const row of rows) {
      if (row.length > 0) result.push(parseLeadRow(row, page.summary.titulo, pageUrl))
    }
  }
  return result
}

/** Returns true if faturamento matches "Até R$ 40 mil" range */
export function isSmallRevenue(lead: ParsedLead): boolean {
  const fat = lead.faturamento.toLowerCase().trim()
  if (!fat) return false
  if (fat.includes('até') && fat.includes('40')) return true
  if (fat.match(/^até\s*r?\$?\s*40/)) return true
  // Numeric check ≤ 40000
  const num = parseFloat(fat.replace(/[^\d,.]/, '').replace(',', '.'))
  if (!isNaN(num) && num <= 40000) return true
  return false
}

/** Apply date, source/campaign, and page filters to a list of leads */
export function filterLeads(
  leads: ParsedLead[],
  opts: {
    dateFrom?: string
    dateTo?: string
    utmSource?: string
    campaignCode?: string   // e.g. "F178"
    adSetCode?: string      // e.g. "F178C2"
    adCode?: string         // e.g. "F178C2AD2"
    pageName?: string
  },
): ParsedLead[] {
  return leads.filter((l) => {
    if (opts.dateFrom && l.date && l.date < opts.dateFrom) return false
    if (opts.dateTo && l.date && l.date > opts.dateTo) return false
    if (opts.utmSource && l.utmSource !== opts.utmSource) return false
    if (opts.campaignCode && l.campaign !== opts.campaignCode) return false
    if (opts.adSetCode && l.adSet !== opts.adSetCode) return false
    if (opts.adCode && l.ad !== opts.adCode) return false
    if (opts.pageName && l.pageName !== opts.pageName) return false
    return true
  })
}

/** Group leads by a string key, return sorted by count desc */
export function groupBy(leads: ParsedLead[], key: keyof ParsedLead): Map<string, ParsedLead[]> {
  const map = new Map<string, ParsedLead[]>()
  for (const l of leads) {
    const v = (l[key] as string) || '(não informado)'
    if (!map.has(v)) map.set(v, [])
    map.get(v)!.push(l)
  }
  return new Map([...map.entries()].sort((a, b) => b[1].length - a[1].length))
}

/** Build a day-by-day series. Returns [{date, total, [source]: count}] */
export function buildDailySeries(
  leads: ParsedLead[],
  stackBySource: boolean,
): { date: string; [key: string]: number | string }[] {
  const datedLeads = leads.filter((l) => l.date)
  if (datedLeads.length === 0) return []

  const sources = stackBySource
    ? [...new Set(datedLeads.map((l) => l.utmSource || '(direto)'))]
    : []

  const byDate = new Map<string, ParsedLead[]>()
  for (const l of datedLeads) {
    if (!byDate.has(l.date)) byDate.set(l.date, [])
    byDate.get(l.date)!.push(l)
  }

  const dates = [...byDate.keys()].sort()
  return dates.map((date) => {
    const rows = byDate.get(date)!
    const entry: { date: string; [key: string]: number | string } = { date, total: rows.length }
    if (stackBySource) {
      for (const src of sources) {
        entry[src] = rows.filter((l) => (l.utmSource || '(direto)') === src).length
      }
    }
    return entry
  })
}

/** Build a day-by-day series stacked by any string key of ParsedLead */
export function buildDailySeriesByKey(
  leads: ParsedLead[],
  key: keyof ParsedLead,
  fallback = '(não informado)',
): { date: string; keys: string[]; [k: string]: number | string | string[] }[] {
  const datedLeads = leads.filter((l) => l.date)
  if (datedLeads.length === 0) return []

  const allKeys = [...new Set(datedLeads.map((l) => (l[key] as string) || fallback))].sort()

  const byDate = new Map<string, ParsedLead[]>()
  for (const l of datedLeads) {
    if (!byDate.has(l.date)) byDate.set(l.date, [])
    byDate.get(l.date)!.push(l)
  }

  const dates = [...byDate.keys()].sort()
  return dates.map((date) => {
    const rows = byDate.get(date)!
    const entry: { date: string; keys: string[]; [k: string]: number | string | string[] } = {
      date,
      keys: allKeys,
      total: rows.length,
    }
    for (const k of allKeys) {
      entry[k] = rows.filter((l) => ((l[key] as string) || fallback) === k).length
    }
    return entry
  }) as { date: string; keys: string[]; [k: string]: number | string | string[] }[]
}

export function allUniqueSources(leads: ParsedLead[]): string[] {
  // utmSource is already lowercased — returns deduplicated values
  return [...new Set(leads.map((l) => l.utmSource).filter(Boolean))].sort()
}

export function allUniqueCampaignCodes(leads: ParsedLead[]): string[] {
  return [...new Set(leads.map((l) => l.campaign).filter(Boolean))].sort()
}

/** Returns unique ad sets for the given campaign. Excludes rows with no real adSet structure. */
export function allUniqueAdSets(leads: ParsedLead[], campaignCode?: string): string[] {
  const src = campaignCode ? leads.filter((l) => l.campaign === campaignCode) : leads
  const sets = src.filter((l) => l.adSet && l.adSet !== l.campaign).map((l) => l.adSet)
  return [...new Set(sets)].sort()
}

/** Returns unique ads for the given adSet. Excludes rows with no real ad structure. */
export function allUniqueAds(leads: ParsedLead[], adSetCode?: string): string[] {
  const src = adSetCode ? leads.filter((l) => l.adSet === adSetCode) : leads
  const ads = src.filter((l) => l.ad && l.ad !== l.adSet).map((l) => l.ad)
  return [...new Set(ads)].sort()
}

export function allFaturamentoRanges(leads: ParsedLead[]): string[] {
  return [...new Set(leads.map((l) => l.faturamento).filter(Boolean))].sort()
}

export function allUniquePages(leads: ParsedLead[]): { name: string; url: string }[] {
  const map = new Map<string, string>()
  for (const l of leads) {
    if (!map.has(l.pageName)) map.set(l.pageName, l.pageUrl)
  }
  return [...map.entries()].map(([name, url]) => ({ name, url })).sort((a, b) => a.name.localeCompare(b.name))
}
