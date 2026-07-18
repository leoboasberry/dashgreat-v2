import { useState, useEffect, useCallback } from 'react'
import type { PixelConfig, DispatchLogEntry } from '../types/capi'

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

function rh() {
  return { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
}
function wh() {
  return { ...rh(), 'Content-Type': 'application/json', Prefer: 'return=representation' }
}

// ── DB ↔ frontend converters ─────────────────────────────────────────────────

type DbPixel = {
  id: string; name: string; pixel_id: string; access_token: string
  test_event_code: string | null; enabled: boolean; event_mapping: Record<string, string>
  filters: PixelConfig['filters']; lookback_days: number; auto_dispatch: boolean
  interval_minutes: number; last_dispatched_at: string | null; created_at: string
}

function fromDb(r: DbPixel): PixelConfig {
  return {
    id: r.id, name: r.name, pixelId: r.pixel_id, accessToken: r.access_token,
    testEventCode: r.test_event_code ?? '', enabled: r.enabled,
    eventMapping: r.event_mapping as PixelConfig['eventMapping'],
    filters: r.filters, lookbackDays: r.lookback_days,
    autoDispatch: r.auto_dispatch, intervalMinutes: r.interval_minutes,
  }
}

function toDb(cfg: PixelConfig) {
  return {
    name: cfg.name, pixel_id: cfg.pixelId, access_token: cfg.accessToken,
    test_event_code: cfg.testEventCode || null, enabled: cfg.enabled,
    event_mapping: cfg.eventMapping, filters: cfg.filters,
    lookback_days: cfg.lookbackDays, auto_dispatch: cfg.autoDispatch,
    interval_minutes: cfg.intervalMinutes,
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCapiConfig() {
  const [configs, setConfigs] = useState<PixelConfig[]>([])
  const [log, setLog] = useState<DispatchLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  // ── Load ──────────────────────────────────────────────────────────────────

  const reload = useCallback(async () => {
    if (!SB_URL || !SB_KEY) { setLoading(false); return }

    const [pixelRes, logRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/capi_pixels?select=*&order=created_at.asc`, { headers: rh() }),
      fetch(`${SB_URL}/rest/v1/capi_dispatch_log?select=*&order=started_at.desc&limit=100`, { headers: rh() }),
    ])

    if (pixelRes.ok) {
      const rows: DbPixel[] = await pixelRes.json()
      setConfigs(rows.map(fromDb))
    }

    if (logRes.ok) {
      const rows = await logRes.json()
      setLog(rows.map((r: {
        id: string; pixel_db_id: string; pixel_name: string
        started_at: string; events_attempted: number; events_sent: number; errors: string[]
      }) => ({
        id: r.id, pixelId: r.pixel_db_id, pixelName: r.pixel_name,
        startedAt: r.started_at, eventsAttempted: r.events_attempted,
        eventsSent: r.events_sent, errors: r.errors ?? [],
      })))
    }

    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const addConfig = useCallback(async (cfg: PixelConfig) => {
    const body = toDb(cfg)
    const res = await fetch(`${SB_URL}/rest/v1/capi_pixels`, {
      method: 'POST', headers: wh(), body: JSON.stringify(body),
    })
    if (res.ok) {
      const [row]: DbPixel[] = await res.json()
      setConfigs(prev => [...prev, fromDb(row)])
    }
  }, [])

  const updateConfig = useCallback(async (id: string, updates: Partial<PixelConfig>) => {
    const existing = configs.find(c => c.id === id)
    if (!existing) return
    const merged = { ...existing, ...updates }
    const body = toDb(merged)
    const res = await fetch(`${SB_URL}/rest/v1/capi_pixels?id=eq.${id}`, {
      method: 'PATCH', headers: wh(), body: JSON.stringify(body),
    })
    if (res.ok) {
      const [row]: DbPixel[] = await res.json()
      setConfigs(prev => prev.map(c => (c.id === id ? fromDb(row) : c)))
    }
  }, [configs])

  const removeConfig = useCallback(async (id: string) => {
    const cfg = configs.find(c => c.id === id)
    await fetch(`${SB_URL}/rest/v1/capi_pixels?id=eq.${id}`, { method: 'DELETE', headers: rh() })
    setConfigs(prev => prev.filter(c => c.id !== id))
    // Also clear sent tracking for this pixel
    if (cfg) {
      await fetch(`${SB_URL}/rest/v1/capi_sent?pixel_id=eq.${cfg.pixelId}`, { method: 'DELETE', headers: rh() })
    }
  }, [configs])

  const clearSent = useCallback(async (pixelId: string) => {
    await fetch(`${SB_URL}/rest/v1/capi_sent?pixel_id=eq.${pixelId}`, { method: 'DELETE', headers: rh() })
  }, [])

  return { configs, log, loading, reload, addConfig, updateConfig, removeConfig, clearSent }
}
