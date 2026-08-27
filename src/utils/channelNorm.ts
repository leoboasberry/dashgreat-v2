export const CHANNELS = [
  'Google', 'Meta', 'Meta Lab', 'Bing', 'LinkedIn', 'TikTok', 'OpenAI Ads', 'Outras Origens',
] as const
export type Channel = (typeof CHANNELS)[number]

/** Normalize a Supabase `platform` or `utmSource` value to a canonical channel name */
export function normalizeCrmChannel(platform: string | undefined, utmSource?: string | undefined): Channel {
  const p = (platform ?? utmSource ?? '').toLowerCase().trim()
  if (['meta', 'facebook', 'instagram'].includes(p)) return 'Meta'
  if (p === 'google') return 'Google'
  if (p === 'tiktok') return 'TikTok'
  if (p === 'bing') return 'Bing'
  if (p === 'linkedin') return 'LinkedIn'
  if (p.includes('openai')) return 'OpenAI Ads'
  return 'Outras Origens'
}

/**
 * Normalize a Windsor row to a canonical channel name.
 * `account` distinguishes Meta Lab ('lab') and OpenAI ('openai') from the main feed.
 */
export function normalizeWindsorChannel(datasource: string, source?: string, account?: string): Channel {
  // Account-tagged rows take priority (fetched separately to avoid double-counting)
  if (account === 'lab') return 'Meta Lab'
  if (account === 'openai') return 'OpenAI Ads'
  const ds = (datasource ?? '').toLowerCase()
  const src = (source ?? '').toLowerCase()
  if (ds.includes('facebook') || ds === 'meta' || src === 'facebook' || src === 'meta') return 'Meta'
  if (ds.includes('google') || src === 'google') return 'Google'
  if (ds.includes('tiktok') || src === 'tiktok') return 'TikTok'
  if (ds.includes('bing') || src === 'bing') return 'Bing'
  if (ds.includes('linkedin') || src === 'linkedin') return 'LinkedIn'
  if (ds.includes('openai') || src.includes('openai')) return 'OpenAI Ads'
  return 'Outras Origens'
}

export const CHANNEL_COLORS: Record<Channel, string> = {
  Google: '#EA4335',
  Meta: '#1877F2',
  'Meta Lab': '#8B5CF6',
  Bing: '#00809D',
  LinkedIn: '#1a4cb0',
  TikTok: '#010101',
  'OpenAI Ads': '#10A37F',
  'Outras Origens': '#9CA3AF',
}
