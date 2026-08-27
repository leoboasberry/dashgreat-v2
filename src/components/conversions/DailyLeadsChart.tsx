import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import {
  BarChart,
  Bar,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { ParsedLead } from '../../utils/parseLeads'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

interface Props {
  filteredLeads: ParsedLead[]
}

function fmtDate(d: string) {
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length || !label) return null
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="text-gray-500 font-medium mb-1">{fmtDate(label)}</p>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: '#0D2F9F' }} />
        <span className="text-gray-600">Leads:</span>
        <span className="font-semibold text-gray-800">{payload[0].value}</span>
      </div>
    </div>
  )
}

export default function DailyLeadsChart({ filteredLeads }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const isMobile = useIsMobile()

  const leadsByDate: Record<string, number> = {}
  for (const l of filteredLeads) {
    if (l.date) leadsByDate[l.date] = (leadsByDate[l.date] ?? 0) + 1
  }

  const data = Object.entries(leadsByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, leads]) => ({ date, leads }))

  const total = filteredLeads.filter((l) => l.date).length
  const max = Math.max(...data.map((d) => d.leads), 1)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer select-none hover:bg-gray-50 transition-colors"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-700">Leads por dia</h3>
          {collapsed && (
            <span className="text-xs bg-blue-50 text-[#0D2F9F] font-medium px-2 py-0.5 rounded-full">
              {total} total
            </span>
          )}
        </div>
        <button className="text-gray-400 hover:text-gray-600 transition-colors ml-2 shrink-0">
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {!collapsed && (
        <div className="px-2 pb-4">
          <ResponsiveContainer width="100%" height={isMobile ? 150 : 180}>
            <BarChart data={data} margin={{ top: isMobile ? 4 : 18, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{ fontSize: isMobile ? 10 : 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                interval={isMobile ? 'preserveStartEnd' : 0}
              />
              <YAxis
                tick={{ fontSize: isMobile ? 10 : 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                width={isMobile ? 22 : 28}
                domain={[0, max + Math.ceil(max * 0.15)]}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="leads" name="Leads" fill="#0D2F9F" radius={[3, 3, 0, 0]} maxBarSize={isMobile ? 20 : 32}>
                {!isMobile && (
                  <LabelList
                    dataKey="leads"
                    position="top"
                    style={{ fontSize: 11, fill: '#a5b4fc', fontWeight: 500 }}
                  />
                )}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
