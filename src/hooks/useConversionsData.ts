import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchWindsorData, invalidateWindsorCache, type WindsorRow } from '../api/windsor'
import { fetchEvents, invalidateSupabaseCache, type SupabaseEvent } from '../api/supabase'

// Re-export types so existing component imports still work
export type { FunnelCounts, ChannelMetrics, DailySpend } from '../utils/computeMetrics'

interface RawState {
  loading: boolean
  error: string | null
  rawWindsorRows: WindsorRow[]
  rawEvents: SupabaseEvent[]
}

export function useConversionsData(
  dateFrom: string,
  dateTo: string,
  _totalLeadsFromGP?: number,
): RawState & { reload: () => void } {
  const [state, setState] = useState<RawState>({
    loading: false,
    error: null,
    rawWindsorRows: [],
    rawEvents: [],
  })

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) {
      invalidateWindsorCache(dateFrom, dateTo)
      invalidateSupabaseCache(dateFrom, dateTo)
    }
    setState((s) => ({ ...s, loading: true, error: null }))

    const warnings: string[] = []

    const [rawWindsorRows, rawEvents] = await Promise.all([
      fetchWindsorData(dateFrom, dateTo).catch((err: unknown) => {
        warnings.push(`Windsor: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
        return [] as WindsorRow[]
      }),
      fetchEvents(dateFrom, dateTo).catch((err: unknown) => {
        warnings.push(`Supabase: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
        return [] as SupabaseEvent[]
      }),
    ])

    setState({
      loading: false,
      error: warnings.length > 0 ? warnings.join(' | ') : null,
      rawWindsorRows,
      rawEvents,
    })
  }, [dateFrom, dateTo])

  // Debounce: wait 400ms after dates settle before fetching
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(false), 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [load])

  // reload() bypasses cache and refetches immediately
  const reload = useCallback(() => load(true), [load])

  return { ...state, reload }
}
