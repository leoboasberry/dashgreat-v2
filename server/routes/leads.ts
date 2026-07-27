import { Router } from 'express'
import { pool } from '../db.ts'

const router = Router()

// Optional auth — if MIRROR_SECRET is set, require X-Mirror-Key header
router.use((req, res, next) => {
  const secret = process.env.MIRROR_SECRET
  if (secret && req.headers['x-mirror-key'] !== secret) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
})

// GET /mirror/leads?page_id=X&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
router.get('/leads', async (req, res) => {
  const { page_id, dateFrom, dateTo } = req.query as Record<string, string>

  if (!page_id) {
    res.status(400).json({ error: 'page_id is required' })
    return
  }

  try {
    const result = await pool.query<{ fields: unknown[] }>(
      `SELECT fields FROM gp_leads
       WHERE page_id = $1
         AND ($2::date IS NULL OR lead_date >= $2::date)
         AND ($3::date IS NULL OR lead_date <= $3::date)
       ORDER BY lead_date DESC NULLS LAST, lead_hour DESC NULLS LAST`,
      [page_id, dateFrom ?? null, dateTo ?? null],
    )

    // Return in the same LeadsResponse shape the dashboard already knows
    res.json({
      status: 'ok',
      retorno: {
        pagina: 1,
        quantidade: result.rows.length,
        quantidade_total: result.rows.length,
        paginas: { leads: result.rows.map((r) => r.fields) },
      },
    })
  } catch (err) {
    console.error('[mirror/leads]', err)
    res.status(500).json({ error: 'internal error' })
  }
})

// GET /mirror/stats — total leads + last sync timestamp
router.get('/stats', async (_req, res) => {
  try {
    const [counts, lastSync] = await Promise.all([
      pool.query<{ page_id: string; total: string }>(
        `SELECT page_id, COUNT(*) as total FROM gp_leads GROUP BY page_id ORDER BY total DESC`,
      ),
      pool.query<{ type: string; leads_upserted: number; finished_at: string }>(
        `SELECT type, leads_upserted, finished_at FROM gp_sync_log ORDER BY finished_at DESC LIMIT 5`,
      ),
    ])
    res.json({ pages: counts.rows, recentSyncs: lastSync.rows })
  } catch (err) {
    console.error('[mirror/stats]', err)
    res.status(500).json({ error: 'internal error' })
  }
})

export default router
