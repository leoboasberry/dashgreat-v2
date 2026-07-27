import { createHash } from 'crypto'
import { pool } from './db.ts'
import { parseLeadRow } from '../src/utils/parseLeads.ts'
import type { Lead } from '../src/types/greatpages.ts'

const GP_BASE = 'https://api.greatpages.com.br/v1'
const LEADS_PER_PAGE = 200

function gpHeaders() {
  return { 'X-GreatPages-Token': process.env.VITE_GP_TOKEN! }
}

function makeLeadId(pageId: string, fields: Lead[]): string {
  const canonical = JSON.stringify([...fields].sort((a, b) => a.id.localeCompare(b.id)))
  return createHash('sha256').update(`${pageId}:${canonical}`).digest('hex')
}

export interface GpPage {
  id: string
  titulo: string
}

export async function fetchAllPages(): Promise<GpPage[]> {
  const userId = process.env.VITE_GP_USER_ID
  const projectId = process.env.VITE_GP_PROJECT_ID
  const all: GpPage[] = []
  let page = 1

  while (true) {
    const res = await fetch(
      `${GP_BASE}/paginas?id_usuario=${userId}&id_projeto=${projectId}&pagina_quantidade=10&pagina=${page}`,
      { headers: gpHeaders() },
    )
    if (!res.ok) break
    const data: any = await res.json()
    const paginas: GpPage[] = data.retorno?.paginas ?? []
    all.push(...paginas)
    if (paginas.length < 10) break
    page++
  }

  return all
}

export async function fetchLeadsPage(pageId: string, page: number): Promise<Lead[][]> {
  const userId = process.env.VITE_GP_USER_ID
  const projectId = process.env.VITE_GP_PROJECT_ID
  const res = await fetch(
    `${GP_BASE}/paginas/${pageId}/leads?id_usuario=${userId}&id_projeto=${projectId}&pagina_quantidade=${LEADS_PER_PAGE}&pagina_ordenacao=DESC&pagina=${page}`,
    { headers: gpHeaders() },
  )
  if (!res.ok) return []
  const data: any = await res.json()
  return data.retorno?.paginas?.leads ?? []
}

interface LeadRow {
  id: string
  page_id: string
  fields: Lead[]
  lead_date: string | null
  lead_hour: number | null
  utm_source: string
  utm_campaign: string
  faturamento: string
  segmento: string
}

export function parseLeadRows(pageId: string, titulo: string, rawLeads: Lead[][]): LeadRow[] {
  return rawLeads.map((row) => {
    const parsed = parseLeadRow(row, titulo)
    return {
      id: makeLeadId(pageId, row),
      page_id: pageId,
      fields: row,
      lead_date: parsed.date || null,
      lead_hour: parsed.hour >= 0 ? parsed.hour : null,
      utm_source: parsed.utmSource,
      utm_campaign: parsed.utmCampaign,
      faturamento: parsed.faturamento,
      segmento: parsed.segmento,
    }
  })
}

export async function upsertLeads(rows: LeadRow[]): Promise<number> {
  if (rows.length === 0) return 0
  // Batch insert with ON CONFLICT DO NOTHING for deduplication
  const cols = '(id,page_id,fields,lead_date,lead_hour,utm_source,utm_campaign,faturamento,segmento)'
  const placeholders = rows
    .map((_, i) => {
      const b = i * 9
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9})`
    })
    .join(',')
  const values = rows.flatMap((r) => [
    r.id, r.page_id, JSON.stringify(r.fields),
    r.lead_date, r.lead_hour,
    r.utm_source, r.utm_campaign, r.faturamento, r.segmento,
  ])
  const result = await pool.query(
    `INSERT INTO gp_leads ${cols} VALUES ${placeholders} ON CONFLICT(id) DO NOTHING`,
    values,
  )
  return result.rowCount ?? 0
}

// ── Daily sync: fetches the 2 most recent lead pages per page ────────────────
export async function runDailySync(): Promise<void> {
  const pages = await fetchAllPages()
  let totalUpserted = 0

  for (const page of pages) {
    await delay(150)
    const leads1 = await fetchLeadsPage(page.id, 1)
    const leads2 = leads1.length >= LEADS_PER_PAGE ? await fetchLeadsPage(page.id, 2) : []
    const rows = parseLeadRows(page.id, page.titulo, [...leads1, ...leads2])
    const n = await upsertLeads(rows)
    totalUpserted += n
    console.log(`[daily] ${page.titulo}: +${n}`)
  }

  await pool.query(
    `INSERT INTO gp_sync_log(type,pages_synced,leads_upserted) VALUES('daily',$1,$2)`,
    [pages.length, totalUpserted],
  )
  console.log(`[daily-sync] done — ${totalUpserted} new leads across ${pages.length} pages`)
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
