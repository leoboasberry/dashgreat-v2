import type { Config, PagesListResponse, PageReportResponse, LeadsResponse } from '../types/greatpages'
import { getCacheEntry, setCacheEntry } from './cache'
import { getSupabaseCacheEntry, setSupabaseCacheEntry } from './supabaseCache'

function buildHeaders(token: string): HeadersInit {
  return {
    'X-GreatPages-Token': token,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  }
}

const PAGES_PAGE_SIZE = 10
// Successful responses arrive in ~2-3s; broken ones hang for ~10s — abort at 4s
const PAGE_FETCH_TIMEOUT_MS = 4000
const PAGE_RETRY_DELAYS = [500]

async function fetchPageRetry(url: string, headers: HeadersInit): Promise<PagesListResponse | null> {
  for (let attempt = 0; attempt <= PAGE_RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, PAGE_RETRY_DELAYS[attempt - 1]))

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PAGE_FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(`${url}&_=${Date.now()}`, { headers, signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok) continue
      const data: PagesListResponse = await res.json()
      if ((data.retorno?.paginas?.length ?? 0) > 0) return data
    } catch {
      clearTimeout(timer)
    }
  }
  return null
}

export async function listPages(config: Config, forceRefresh = false): Promise<PagesListResponse> {
  const { token, id_usuario, id_projeto, cacheTtlMinutes } = config
  const cacheKey = `pages_${id_usuario}_${id_projeto}`
  const sbSource = 'gp_pages'
  const ttlSeconds = cacheTtlMinutes * 60

  if (forceRefresh) {
    const { clearCacheByKey } = await import('./cache')
    clearCacheByKey(cacheKey)
  }

  // 1. localStorage
  if (!forceRefresh) {
    const cached = getCacheEntry<PagesListResponse>(cacheKey)
    if (cached !== null) return cached
  }

  // 2. Supabase cache (shared, survives browser refresh)
  if (!forceRefresh) {
    const sbData = await getSupabaseCacheEntry<PagesListResponse>(sbSource, cacheKey)
    if (sbData !== null) {
      setCacheEntry(cacheKey, sbData, cacheTtlMinutes)
      return sbData
    }
  }

  // 3. GreatPages API
  const headers = buildHeaders(token)
  const baseUrl = `/api/greatpages/paginas?id_usuario=${id_usuario}&id_projeto=${id_projeto}&pagina_quantidade=${PAGES_PAGE_SIZE}`

  const firstData = await fetchPageRetry(`${baseUrl}&pagina=1`, headers)
  if (!firstData) throw new Error('GreatPages retornou 0 páginas após várias tentativas')

  const total = Number(firstData.retorno?.quantidade_total ?? firstData.retorno?.quantidade ?? 0)
  let allPages = [...(firstData.retorno?.paginas ?? [])]

  if (total > PAGES_PAGE_SIZE) {
    const totalPages = Math.ceil(total / PAGES_PAGE_SIZE)
    // Sequential to avoid triggering server-side rate limiting
    for (let p = 2; p <= totalPages; p++) {
      const pageData = await fetchPageRetry(`${baseUrl}&pagina=${p}`, headers)
      if (pageData) {
        allPages = [...allPages, ...(pageData.retorno?.paginas ?? [])]
      }
    }
  }

  const merged: PagesListResponse = {
    ...firstData,
    retorno: { ...firstData.retorno, quantidade: allPages.length, paginas: allPages },
  }

  setCacheEntry(cacheKey, merged, cacheTtlMinutes)
  setSupabaseCacheEntry(sbSource, cacheKey, merged, ttlSeconds)
  return merged
}

export async function getPageReport(
  config: Config,
  pageId: string,
  forceRefresh = false,
): Promise<PageReportResponse> {
  const { token, id_usuario, id_projeto, cacheTtlMinutes } = config
  const cacheKey = `report_${id_usuario}_${id_projeto}_${pageId}`
  const sbSource = 'gp_report'
  const ttlSeconds = cacheTtlMinutes * 60

  if (forceRefresh) {
    const { clearCacheByKey } = await import('./cache')
    clearCacheByKey(cacheKey)
  }

  // 1. localStorage
  if (!forceRefresh) {
    const cached = getCacheEntry<PageReportResponse>(cacheKey)
    if (cached !== null) return cached
  }

  // 2. Supabase cache
  if (!forceRefresh) {
    const sbData = await getSupabaseCacheEntry<PageReportResponse>(sbSource, cacheKey)
    if (sbData !== null) {
      setCacheEntry(cacheKey, sbData, cacheTtlMinutes)
      return sbData
    }
  }

  // 3. GreatPages API
  const url = `/api/greatpages/paginas/${pageId}/relatorios?id_usuario=${id_usuario}&id_projeto=${id_projeto}`
  const res = await fetch(url, { headers: buildHeaders(token) })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  const data: PageReportResponse = await res.json()

  setCacheEntry(cacheKey, data, cacheTtlMinutes)
  setSupabaseCacheEntry(sbSource, cacheKey, data, ttlSeconds)
  return data
}

const LEADS_PAGE_SIZE = 200
const LEADS_MAX_CAP = 2000 // fetch at most 2000 leads per page (10 requests)

export async function getPageLeads(
  config: Config,
  pageId: string,
  forceRefresh = false,
): Promise<LeadsResponse> {
  const { token, id_usuario, id_projeto, cacheTtlMinutes } = config
  const cacheKey = `leads_${id_usuario}_${id_projeto}_${pageId}`
  const sbSource = 'gp_leads'
  const ttlSeconds = cacheTtlMinutes * 60

  if (forceRefresh) {
    const { clearCacheByKey } = await import('./cache')
    clearCacheByKey(cacheKey)
  }

  // 1. localStorage
  if (!forceRefresh) {
    const cached = getCacheEntry<LeadsResponse>(cacheKey)
    if (cached !== null) return cached
  }

  // 2. Supabase cache
  if (!forceRefresh) {
    const sbData = await getSupabaseCacheEntry<LeadsResponse>(sbSource, cacheKey)
    if (sbData !== null) {
      setCacheEntry(cacheKey, sbData, cacheTtlMinutes)
      return sbData
    }
  }

  // 3. GreatPages API
  const headers = buildHeaders(token)
  const baseUrl = `/api/greatpages/paginas/${pageId}/leads?id_usuario=${id_usuario}&id_projeto=${id_projeto}&pagina_ordenacao=DESC&pagina_quantidade=${LEADS_PAGE_SIZE}`

  const firstRes = await fetch(`${baseUrl}&pagina=1`, { headers })
  if (!firstRes.ok) throw new Error(`API error ${firstRes.status}`)
  const first: LeadsResponse = await firstRes.json()

  const total = Number(first.retorno?.quantidade_total ?? 0)
  const allLeads = [...(first.retorno?.paginas?.leads ?? [])]

  if (total > LEADS_PAGE_SIZE && allLeads.length < LEADS_MAX_CAP) {
    const totalPages = Math.ceil(Math.min(total, LEADS_MAX_CAP) / LEADS_PAGE_SIZE)
    const rest = await Promise.allSettled(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        fetch(`${baseUrl}&pagina=${i + 2}`, { headers })
          .then((r) => (r.ok ? r.json() as Promise<LeadsResponse> : null)),
      ),
    )
    for (const r of rest) {
      if (r.status === 'fulfilled' && r.value) {
        allLeads.push(...(r.value.retorno?.paginas?.leads ?? []))
      }
    }
  }

  const merged: LeadsResponse = {
    ...first,
    retorno: {
      ...first.retorno,
      quantidade: allLeads.length,
      paginas: { leads: allLeads },
    },
  }

  setCacheEntry(cacheKey, merged, cacheTtlMinutes)
  setSupabaseCacheEntry(sbSource, cacheKey, merged, ttlSeconds)
  return merged
}
