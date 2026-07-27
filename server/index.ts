import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import path from 'path'
import { fileURLToPath } from 'url'
import cron from 'node-cron'
import leadsRouter from './routes/leads.ts'
import { runDailySync } from './sync.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 4173

// ── API proxies (same targets as vite.config.ts) ─────────────────────────────
// Note: use pathFilter (not app.use prefix) so req.url is not stripped before
// pathRewrite sees the full path.

app.use(
  createProxyMiddleware({
    pathFilter: '/api/greatpages',
    target: 'https://api.greatpages.com.br',
    changeOrigin: true,
    pathRewrite: { '^/api/greatpages': '/v1' },
    headers: { Origin: 'https://api.greatpages.com.br' },
  }),
)

app.use(
  createProxyMiddleware({
    pathFilter: '/api/windsor',
    target: 'https://connectors.windsor.ai',
    changeOrigin: true,
    pathRewrite: { '^/api/windsor': '' },
  }),
)

// ── Mirror leads API ─────────────────────────────────────────────────────────

app.use(express.json())
app.use('/mirror', leadsRouter)

// ── Static files (Vite build output) ─────────────────────────────────────────

const distDir = path.join(__dirname, '../dist')
app.use(express.static(distDir))
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(distDir, 'index.html')))

app.listen(PORT, () => console.log(`[server] listening on port ${PORT}`))

// ── Daily sync: 02:00 BRT = 05:00 UTC ───────────────────────────────────────

cron.schedule('0 5 * * *', () => {
  console.log('[cron] starting daily sync')
  runDailySync().catch(console.error)
})
