import { useState, useRef, useEffect } from 'react'
import { Ban, ChevronDown, X } from 'lucide-react'

interface Props {
  allCampaigns: string[]   // all Windsor campaign full names
  excluded: string[]
  onChange: (excluded: string[]) => void
}

export default function ExcludedCampaignsFilter({ allCampaigns, excluded, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggle(name: string) {
    if (excluded.includes(name)) {
      onChange(excluded.filter((n) => n !== name))
    } else {
      onChange([...excluded, name])
    }
  }

  const count = excluded.length

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className={`flex items-center gap-1.5 text-xs border rounded-lg px-2.5 py-1.5 whitespace-nowrap transition-colors ${
          count > 0
            ? 'border-red-300 bg-red-50 text-red-700'
            : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
        }`}
      >
        <Ban size={12} className="shrink-0" />
        <span>Campanhas Excluídas</span>
        {count > 0 && (
          <span className="bg-red-200 text-red-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
            {count}
          </span>
        )}
        <ChevronDown size={11} className={`ml-0.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-[100] w-72 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">Excluir campanhas de todas as métricas</span>
            {count > 0 && (
              <button
                onClick={() => onChange([])}
                className="text-[11px] text-red-500 hover:text-red-700 flex items-center gap-0.5"
              >
                <X size={11} /> Limpar
              </button>
            )}
          </div>
          {allCampaigns.length === 0 ? (
            <p className="text-xs text-gray-400 px-3 py-3 text-center">Nenhuma campanha disponível</p>
          ) : (
            <div className="max-h-64 overflow-y-auto py-1">
              {allCampaigns.map((name) => (
                <label
                  key={name}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={excluded.includes(name)}
                    onChange={() => toggle(name)}
                    className="accent-red-500 shrink-0"
                  />
                  <span
                    className={`text-xs truncate ${excluded.includes(name) ? 'line-through text-gray-400' : 'text-gray-700'}`}
                    title={name}
                  >
                    {name}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
