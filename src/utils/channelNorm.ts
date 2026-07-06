export const CHANNELS = ['Google', 'Meta', 'Bing', 'LinkedIn', 'TikTok', 'Outras Origens'] as const
export type Channel = (typeof CHANNELS)[number]

/** Normalize a Supabase `platform` or `utmSource` value to a canonical channel name */
export function normalizeCrmChannel(platform: string | undefined, utmSource?: string | undefined): Channel {
  const p = (platform ?? utmSource ?? '').toLowerCase().trim()
  if (['meta', 'facebook', 'instagram'].includes(p)) return 'Meta'
  if (p === 'google') return 'Google'
  if (p === 'tiktok') return 'TikTok'
  if (p === 'bing') return 'Bing'
  if (p === 'linkedin') return 'LinkedIn'
  return 'Outras Origens'
}

/** Normalize a Windsor `datasource` / `source` value to a canonical channel name */
export function normalizeWindsorChannel(datasource: string, source?: string): Channel {
  const ds = (datasource ?? '').toLowerCase()
  const src = (source ?? '').toLowerCase()
  if (ds.includes('facebook') || ds === 'meta' || src === 'facebook' || src === 'meta') return 'Meta'
  if (ds.includes('google') || src === 'google') return 'Google'
  if (ds.includes('tiktok') || src === 'tiktok') return 'TikTok'
  if (ds.includes('bing') || src === 'bing') return 'Bing'
  if (ds.includes('linkedin') || src === 'linkedin') return 'LinkedIn'
  return 'Outras Origens'
}

export const CHANNEL_COLORS: Record<Channel, string> = {
  Google: '#EA4335',
  Meta: '#1877F2',
  Bing: '#00809D',
  LinkedIn: '#1a4cb0',
  TikTok: '#010101',
  'Outras Origens': '#9CA3AF',
}
