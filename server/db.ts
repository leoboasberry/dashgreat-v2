import pkg from 'pg'
const { Pool } = pkg

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL env var is required')
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
  max: 5,
})
