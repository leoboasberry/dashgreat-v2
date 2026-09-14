import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchWindsorData, invalidateWindsorCache, type WindsorRow } from '../api/windsor'
import { fetchWindsorForAccount, invalidateWindsorAccountCache } from '../api/windsorAccounts'
import { fetchLeadCentricEvents, invalidateLeadCentricCache, type SupabaseEvent } from '../api/supabase'

export type { FunnelCounts, ChannelMetrics, DailySpend } from '../utils/computeMetrics'

interface RawState {
  loading: boolean
  error: string | null
  rawWindsorRows: WindsorRow[]
  rawEvents: SupabaseEvent[]
  cohortSize: number
}

export function useLeadCentricData(
  dateFrom: string,
  dateTo: string,
): RawState & { reload: () => void } {
  const [state, setState] = useState<RawState>({
    loading: false,
    error: null,
    rawWindsorRows: [],
    rawEvents: [],
    cohortSize: 0,
  })

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (forceRefresh = false) => {
    if (!dateFrom || !dateTo || dateFrom > dateTo) {
      setState({ loading: false, error: null, rawWindsorRows: [], rawEvents: [], cohortSize: 0 })
      return
    }
    if (forceRefresh) {
      invalidateWindsorCache(dateFrom, dateTo)
      invalidateWindsorAccountCache(dateFrom, dateTo, 'lab')
      invalidateWindsorAccountCache(dateFrom, dateTo, 'openai')
      invalidateLeadCentricCache(dateFrom, dateTo)
    }
    setState((s) => ({ ...s, loading: true, error: null }))

    const warnings: string[] = []

    const [mainRows, labRows, openaiRows, rawEvents] = await Promise.all([
      fetchWindsorData(dateFrom, dateTo).catch((err: unknown) => {
        warnings.push(`Windsor: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
        return [] as WindsorRow[]
      }),
      fetchWindsorForAccount(dateFrom, dateTo, 'lab').catch(() => []),
      fetchWindsorForAccount(dateFrom, dateTo, 'openai').catch(() => []),
      fetchLeadCentricEvents(dateFrom, dateTo).catch((err: unknown) => {
        warnings.push(`Supabase: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
        return [] as SupabaseEvent[]
      }),
    ])

    const rawWindsorRows: WindsorRow[] = [
      ...mainRows,
      ...(labRows as WindsorRow[]),
      ...(openaiRows as WindsorRow[]),
    ]

    // cohortSize = unique deal_ids that have an MQL event (the leads created in the period)
    const mqlDealIds = new Set(
      rawEvents.filter((e) => e.event_type === 'mql').map((e) => e.deal_id).filter(Boolean),
    )

    setState({
      loading: false,
      error: warnings.length > 0 ? warnings.join(' | ') : null,
      rawWindsorRows,
      rawEvents,
      cohortSize: mqlDealIds.size,
    })
  }, [dateFrom, dateTo])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(false), 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [load])

  const reload = useCallback(() => load(true), [load])

  return { ...state, reload }
}
