/**
 * Creates database tables. Run once before backfill:
 *   DATABASE_URL="postgres://..." npx tsx server/migrate.ts
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { pool } from './db.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8')

await pool.query(sql)
console.log('[migrate] schema applied successfully')
await pool.end()
