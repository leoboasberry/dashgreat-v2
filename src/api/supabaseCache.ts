// Persistent cross-browser cache backed by Supabase api_cache table.
// Sits between localStorage and the external API call:
//   memCache → localStorage → supabaseCache → API fetch
//
// TTL is enforced here in code (Postgres does not auto-expire rows).
// Writes are upserts (ON CONFLICT / resolution=merge-duplicates) so concurrent
// requests for the same key are safe — last write wins with identical data.

function getSupabaseConfig(): { url: string; key: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !key) return null
  return { url, key }
}

interface CacheRow {
  data: unknown
  cached_at: string
  ttl_seconds: number
}

export async function getSupabaseCacheEntry<T>(
  source: string,
  cacheKey: string,
): Promise<T | null> {
  const cfg = getSupabaseConfig()
  if (!cfg) return null
  try {
    const qs = new URLSearchParams({
      source: `eq.${source}`,
      cache_key: `eq.${cacheKey}`,
      select: 'data,cached_at,ttl_seconds',
      limit: '1',
    })
    const res = await fetch(`${cfg.url}/rest/v1/api_cache?${qs}`, {
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
    })
    if (!res.ok) return null
    const rows: CacheRow[] = await res.json()
    if (!rows.length) return null

    const row = rows[0]!
    const age = Date.now() - new Date(row.cached_at).getTime()
    if (age > row.ttl_seconds * 1000) return null   // expired — callee will re-fetch

    return row.data as T
  } catch {
    return null
  }
}

// Fire-and-forget: does not block the caller.
// Errors are swallowed — localStorage is still populated, so the session stays fast.
export function setSupabaseCacheEntry<T>(
  source: string,
  cacheKey: string,
  data: T,
  ttlSeconds: number,
): void {
  const cfg = getSupabaseConfig()
  if (!cfg) return

  fetch(`${cfg.url}/rest/v1/api_cache`, {
    method: 'POST',
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
      // ON CONFLICT (source, cache_key) DO UPDATE — idempotent, no duplicates
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      source,
      cache_key: cacheKey,
      data,
      cached_at: new Date().toISOString(),
      ttl_seconds: ttlSeconds,
    }),
  }).catch(() => {/* non-blocking — local caches already populated */})
}
