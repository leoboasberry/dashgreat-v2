export type CrmEventType =
  | 'mql'
  | 'not_mql'
  | 'sql'
  | 'opportunity'
  | 'meeting_completed'
  | 'deal_won'
  | 'deal_lost'

export const EVENT_TYPE_LABELS: Record<CrmEventType, string> = {
  mql: 'MQL',
  not_mql: 'Não MQL',
  sql: 'SQL',
  opportunity: 'Oportunidade',
  meeting_completed: 'Reunião Realizada',
  deal_won: 'Deal Ganho',
  deal_lost: 'Deal Perdido',
}

// Priority-ordered date columns — first non-empty valid date wins
const DATE_COLS: Record<CrmEventType, string[]> = {
  mql: ['Data de criação'],
  not_mql: ['Data de criação'],
  sql: ['Data de criação'],
  opportunity: ['Data de criação'],
  meeting_completed: [
    'Data Reunião de Vendas (Agendada)',
    'Data de conclusão da tarefa "Realizar Reunião de Vendas"',
    'Data de criação',
  ],
  deal_won: ['Data do pagamento efetuado', 'Data de criação'],
  deal_lost: ['Data/Hora Entrada em Perdido', 'Data de criação'],
}

function parseBrDate(raw: string): { date: string; ts: string } | null {
  const s = raw.trim()
  if (!s || s === '-') return null

  // ISO format
  const isoM = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoM) {
    const date = isoM[1]
    const ts = s.replace(' ', 'T') + (s.length > 10 ? '.000Z' : 'T00:00:00.000Z')
    if (date < '2000-01-01') return null
    return { date, ts }
  }

  // BR: dd/mm/yyyy HH:MM
  const brM = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/)
  if (brM) {
    const date = `${brM[3]}-${brM[2]}-${brM[1]}`
    if (date < '2000-01-01') return null
    const ts = brM[4]
      ? `${brM[3]}-${brM[2]}-${brM[1]}T${brM[4]}:${brM[5]}:00.000Z`
      : `${brM[3]}-${brM[2]}-${brM[1]}T00:00:00.000Z`
    return { date, ts }
  }

  return null
}

function parseBrMoney(raw: string): number | null {
  const s = raw
    .trim()
    .replace(/^R?\$\s*/, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim()
  if (!s || s === '-') return null
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function inferPlatform(utmSource: string | null): string | null {
  if (!utmSource) return null
  const src = utmSource.toLowerCase()
  if (['facebook', 'instagram', 'fb'].includes(src)) return 'meta'
  if (src.includes('google')) return 'google'
  if (src.includes('linkedin')) return 'linkedin'
  if (src.includes('tiktok')) return 'tiktok'
  if (src.includes('bing') || src.includes('microsoft')) return 'bing'
  return null
}

export interface CrmRow {
  dealId: string
  dealName: string
  emailNorm: string
  eventType: CrmEventType
  eventDate: string
  eventTs: string
  utmSource: string | null
  utmCampaign: string | null
  revenue: string | null
  segment: string | null
  mrr: number | null
  // Enriched from GreatPages
  pagina: string | null
  pageId: string | null
  enriched: boolean
  // Derived
  eventId: string
  // For duplicate check
  existsInSupabase: boolean
}

export function buildEventPayload(row: CrmRow) {
  const platform = inferPlatform(row.utmSource)
  return {
    deal: {
      utmCampaign: row.utmCampaign ?? null,
      utmSource: row.utmSource ?? null,
      revenue: row.revenue ?? null,
      segment: row.segment ?? null,
      platform,
      potentialNewMRR: row.mrr,
      annualRevenue: row.revenue ?? null,
      pagina: row.pagina ?? null,
    },
    utmSource: row.utmSource ?? null,
    utmCampaign: row.utmCampaign ?? null,
    revenue: row.revenue ?? null,
    segment: row.segment ?? null,
    event_type: row.eventType,
    pagina: row.pagina ?? null,
    revenueNormalization: row.revenue
      ? { normalizedValue: row.revenue, source: 'frontend_backfill' }
      : null,
  }
}

/** Minimal RFC 4180-compliant CSV line parser */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

export function parseCrmCsvText(
  csvText: string,
  eventType: CrmEventType,
): { rows: CrmRow[]; skipped: number } {
  // Strip UTF-8 BOM if present
  const text = csvText.replace(/^﻿/, '')
  const lines = text.split(/\r?\n/)
  if (lines.length < 2) return { rows: [], skipped: 0 }

  const headers = parseCSVLine(lines[0])
  const dateCols = DATE_COLS[eventType]
  const rows: CrmRow[] = []
  let skipped = 0

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const vals = parseCSVLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, j) => {
      row[h] = vals[j] ?? ''
    })

    const dealId = row['Key do Deal']?.trim()
    if (!dealId) {
      skipped++
      continue
    }

    let parsed: { date: string; ts: string } | null = null
    for (const col of dateCols) {
      const raw = row[col]?.trim()
      if (raw && raw !== '-') {
        parsed = parseBrDate(raw)
        if (parsed) break
      }
    }
    if (!parsed) {
      skipped++
      continue
    }

    const emailNorm = (row['Email do contato'] ?? '').trim().toLowerCase()
    const utmSource = row['utmSource']?.trim() || null
    const utmCampaign = row['utmCampaign']?.trim() || null
    const revenue = row['Faixa de faturamento']?.trim() || null
    const segment = row['Segmento']?.trim() || null
    const mrr = parseBrMoney(row['Valor do contrato'] ?? '')
    const dealName = (row['Nome do deal'] ?? '').trim()
    const eventId = `${dealId}:${eventType}:${parsed.ts}`

    rows.push({
      dealId,
      dealName,
      emailNorm,
      eventType,
      eventDate: parsed.date,
      eventTs: parsed.ts,
      utmSource,
      utmCampaign,
      revenue,
      segment,
      mrr,
      pagina: null,
      pageId: null,
      enriched: false,
      eventId,
      existsInSupabase: false,
    })
  }

  return { rows, skipped }
}
