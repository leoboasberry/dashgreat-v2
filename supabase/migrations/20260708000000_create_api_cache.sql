-- Cache persistente para respostas das APIs externas (Windsor e GreatPages).
-- TTL é enforced no código (getSupabaseCacheEntry compara cached_at + ttl_seconds < now()).
-- Upsert via ON CONFLICT faz replace completo da linha — nunca merge parcial de JSONB.
CREATE TABLE IF NOT EXISTS api_cache (
  source       TEXT        NOT NULL,
  cache_key    TEXT        NOT NULL,
  data         JSONB       NOT NULL,
  cached_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ttl_seconds  INT         NOT NULL DEFAULT 1800,
  PRIMARY KEY (source, cache_key)
);

-- Índice para limpeza periódica por data de expiração.
CREATE INDEX IF NOT EXISTS api_cache_cached_at_idx ON api_cache (cached_at);

-- RLS: leitura e escrita abertas para anon key (mesmo nível da tabela events/settings).
ALTER TABLE api_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read cache"
  ON api_cache FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon can upsert cache"
  ON api_cache FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon can update cache"
  ON api_cache FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Limpeza periódica (descomentar após MVP, requer pg_cron no plano Pro):
-- SELECT cron.schedule(
--   'purge-api-cache',
--   '0 3 * * 0',   -- toda domingo às 03:00 UTC
--   $$ DELETE FROM api_cache WHERE cached_at < now() - interval '30 days' $$
-- );
