/** BRT = UTC-3, fixed (Brazil stopped DST in 2019) */
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000

function brtNow(): Date {
  return new Date(Date.now() - BRT_OFFSET_MS)
}

/** Returns YYYY-MM-DD for today in BRT */
export function todayBRT(): string {
  return brtNow().toISOString().slice(0, 10)
}

/** Returns YYYY-MM-DD for yesterday in BRT */
export function yesterdayBRT(): string {
  const d = brtNow()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** Returns YYYY-MM-DD for n days ago in BRT */
export function daysAgoBRT(n: number): string {
  const d = brtNow()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/** Returns { from, to } for the current month in BRT */
export function currentMonthBRT(): { from: string; to: string } {
  const d = brtNow()
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() // 0-based
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const mm = String(m + 1).padStart(2, '0')
  return {
    from: `${y}-${mm}-01`,
    to: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
  }
}

/** Returns { from, to } for the previous month in BRT */
export function prevMonthBRT(): { from: string; to: string } {
  const d = brtNow()
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() // 0-based
  const prevM = m === 0 ? 11 : m - 1
  const prevY = m === 0 ? y - 1 : y
  const lastDay = new Date(Date.UTC(prevY, prevM + 1, 0)).getUTCDate()
  const mm = String(prevM + 1).padStart(2, '0')
  return {
    from: `${prevY}-${mm}-01`,
    to: `${prevY}-${mm}-${String(lastDay).padStart(2, '0')}`,
  }
}

export interface DatePreset { label: string; from: string; to: string }

/** Standard date presets up to 90 days, all computed in BRT */
export function getDatePresets(): DatePreset[] {
  const today = todayBRT()
  const yesterday = yesterdayBRT()
  const cm = currentMonthBRT()
  const pm = prevMonthBRT()
  return [
    { label: 'Hoje',      from: today,            to: today },
    { label: 'Ontem',     from: yesterday,         to: yesterday },
    { label: '7 dias',    from: daysAgoBRT(6),     to: today },
    { label: '14 dias',   from: daysAgoBRT(13),    to: today },
    { label: '30 dias',   from: daysAgoBRT(29),    to: today },
    { label: 'Este mês',  from: cm.from,           to: cm.to },
    { label: 'Mês ant.',  from: pm.from,           to: pm.to },
    { label: '60 dias',   from: daysAgoBRT(59),    to: today },
    { label: '90 dias',   from: daysAgoBRT(89),    to: today },
  ]
}
