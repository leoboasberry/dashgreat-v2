/**
 * One-time backfill script.
 *
 * Run locally with DATABASE_URL from Railway:
 *   DATABASE_URL="postgres://..." npx tsx server/backfill.ts
 *
 * Fetches ALL leads from GreatPages since CUTOFF_DATE (2026-01-01),
 * paginating through all pages and stopping when a batch contains
 * only leads older than the cutoff.
 */

import { fetchAllPages, fetchLeadsPage, parseLeadRows, upsertLeads } from './sync.ts'
import { pool } from './db.ts'

const CUTOFF_DATE = '2026-01-01'
const DELAY_MS = 200

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function backfillPage(pageId: string, titulo: string): Promise<number> {
  let gpPage = 1
  let totalUpserted = 0

  while (true) {
    await delay(DELAY_MS)
    const rawLeads = await fetchLeadsPage(pageId, gpPage)

    if (rawLeads.length === 0) break

    const rows = parseLeadRows(pageId, titulo, rawLeads)

    // Leads with no date pass through (don't discard undatable leads)
    const inRange = rows.filter((r) => !r.lead_date || r.lead_date >= CUTOFF_DATE)
    const beforeCutoff = rows.filter((r) => r.lead_date && r.lead_date < CUTOFF_DATE)

    if (inRange.length > 0) {
      const n = await upsertLeads(inRange)
      totalUpserted += n
    }

    process.stdout.write(`  page ${gpPage}: ${rawLeads.length} fetched, ${inRange.length} in range, ${totalUpserted} total upserted\r`)

    // Stop when entire batch is before cutoff (leads are DESC ordered)
    if (beforeCutoff.length === rawLeads.length) break
    // Stop if last page
    if (rawLeads.length < 200) break

    gpPage++
  }

  return totalUpserted
}

async function main() {
  console.log(`[backfill] starting — cutoff: ${CUTOFF_DATE}`)
  const pages = await fetchAllPages()
  console.log(`[backfill] ${pages.length} pages found`)

  let totalPages = 0
  let totalLeads = 0

  for (const page of pages) {
    console.log(`\n[backfill] → ${page.titulo} (${page.id})`)
    const n = await backfillPage(page.id, page.titulo)
    console.log(`\n[backfill] ✓ ${page.titulo}: ${n} leads upserted`)
    totalPages++
    totalLeads += n
  }

  await pool.query(
    `INSERT INTO gp_sync_log(type,pages_synced,leads_upserted) VALUES('backfill',$1,$2)`,
    [totalPages, totalLeads],
  )

  console.log(`\n[backfill] done — ${totalLeads} leads across ${totalPages} pages`)
  await pool.end()
}

main().catch((err) => {
  console.error('[backfill] fatal:', err)
  process.exit(1)
})
