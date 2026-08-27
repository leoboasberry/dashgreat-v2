import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import type { Test, TestFlag, TestActivity } from '../../api/tests'

// Dias sem atividade para considerar o teste "estagnado"
export const STALE_DAYS = 4

const STATUS_DOT: Record<Test['status'], string> = {
  verde: 'bg-green-400',
  amarelo: 'bg-yellow-400',
  laranja: 'bg-orange-400',
  vermelho: 'bg-red-400',
}

const APPROVAL_LABELS: Record<Test['approval_status'], string> = {
  proposto: 'proposto',
  aprovado: 'aprovado',
  pausado: 'pausado',
  concluido: 'concluído',
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function isStale(status: Test['status'], activity: TestActivity[]): boolean {
  if (status !== 'amarelo' && status !== 'vermelho') return false
  if (!activity.length) return true
  return daysSince(activity[0].created_at) >= STALE_DAYS
}

interface Props {
  test: Test
  flags: TestFlag[]
  activity: TestActivity[]   // most recent first
  isOpen: boolean
  onToggle: () => void
}

export default function TestCard({ test, flags, activity, isOpen, onToggle }: Props) {
  const stale = isStale(test.status, activity)
  const lastAct = activity[0]
  const lastActLabel = lastAct
    ? `${daysSince(lastAct.created_at)}d atrás`
    : 'sem atividade'

  return (
    <div
      className={`border rounded-xl bg-white transition-shadow hover:shadow-sm cursor-pointer ${
        isOpen ? 'border-blue-200 shadow-sm' : 'border-gray-200'
      }`}
    >
      <div
        className="flex items-start gap-3 px-4 py-3"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onToggle()}
      >
        {/* Status dot */}
        <div className="mt-1.5 shrink-0">
          <div className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[test.status]}`} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  test.account === 'principal'
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-purple-50 text-purple-600'
                }`}>
                  {test.account}
                </span>
                {test.category && (
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                    {test.category}
                  </span>
                )}
                <span className="text-[10px] text-gray-400">
                  {APPROVAL_LABELS[test.approval_status]}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-800 truncate">{test.title}</p>

              {/* Linked codes */}
              {test.linked_codes.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {test.linked_codes.map((c) => (
                    <code key={c} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">
                      {c}
                    </code>
                  ))}
                </div>
              )}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 shrink-0">
              {stale && (
                <AlertTriangle size={13} className="text-orange-400" title="Sem atividade recente" />
              )}
              <span className="text-[10px] text-gray-400">{lastActLabel}</span>
              {isOpen ? (
                <ChevronUp size={14} className="text-gray-400" />
              ) : (
                <ChevronDown size={14} className="text-gray-400" />
              )}
            </div>
          </div>

          {/* Flags */}
          {flags.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {flags.map((f) => (
                <span
                  key={f.id}
                  className="text-[10px] bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded-full"
                >
                  {f.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
