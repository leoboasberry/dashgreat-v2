-- Run once against the Railway PostgreSQL database
-- railway run tsx server/migrate.ts   (or paste directly in Railway Console)

CREATE TABLE IF NOT EXISTS gp_leads (
  id          TEXT        PRIMARY KEY,          -- SHA-256(page_id + sorted_fields_json)
  page_id     TEXT        NOT NULL,
  fields      JSONB       NOT NULL,             -- raw Lead[] (array of {id,titulo,valor})
  lead_date   DATE,                             -- parsed in BRT from the date field
  lead_hour   SMALLINT,                         -- 0-23 or NULL
  utm_source  TEXT,
  utm_campaign TEXT,
  faturamento TEXT,
  segmento    TEXT,
  synced_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gp_leads_page_date ON gp_leads (page_id, lead_date);
CREATE INDEX IF NOT EXISTS idx_gp_leads_date       ON gp_leads (lead_date);

CREATE TABLE IF NOT EXISTS gp_sync_log (
  id             BIGSERIAL   PRIMARY KEY,
  type           TEXT        NOT NULL,          -- 'backfill' | 'daily'
  pages_synced   INTEGER,
  leads_upserted INTEGER,
  finished_at    TIMESTAMPTZ DEFAULT NOW()
);
