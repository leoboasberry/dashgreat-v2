import { useState, useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { Test, TestFlag, TestFlagLink, TestActivity } from '../../api/tests'
import TestCard, { STALE_DAYS } from './TestCard'
import TestDetail from './TestDetail'

type AccountFilter = 'todas' | 'principal' | 'lab'
type StatusFilter = Test['status'] | 'todas'
type View = 'lista' | 'kanban' | 'revisar'

interface TestWithData {
  test: Test
  flags: TestFlag[]
  activity: TestActivity[]
}

interface Props {
  tests: Test[]
  flags: TestFlag[]
  flagLinks: TestFlagLink[]
  activityMap: Record<string, TestActivity[]>
  onTestChange: (t: Test) => void
  onTestDelete: (id: string) => void
}

function flagsForTest(testId: string, flags: TestFlag[], flagLinks: TestFlagLink[]): TestFlag[] {
  const ids = new Set(flagLinks.filter((l) => l.test_id === testId).map((l) => l.flag_id))
  return flags.filter((f) => ids.has(f.id))
}

function isForReview(test: Test, activity: TestActivity[]): boolean {
  if (test.next_reminder_at && new Date(test.next_reminder_at) <= new Date()) return true
  if (test.status !== 'amarelo' && test.status !== 'vermelho') return false
  if (!activity.length) return true
  const diffDays = (Date.now() - new Date(activity[0].created_at).getTime()) / 86400000
  return diffDays >= STALE_DAYS
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

const STATUS_DOT: Record<Test['status'], string> = {
  verde: 'bg-green-400',
  amarelo: 'bg-yellow-400',
  laranja: 'bg-orange-400',
  vermelho: 'bg-red-400',
}

const STATUS_OPTIONS: Array<{ value: StatusFilter; dot: string; label: string }> = [
  { value: 'todas', dot: '', label: 'Todos' },
  { value: 'verde', dot: 'bg-green-400', label: 'Verde' },
  { value: 'amarelo', dot: 'bg-yellow-400', label: 'Amarelo' },
  { value: 'laranja', dot: 'bg-orange-400', label: 'Laranja' },
  { value: 'vermelho', dot: 'bg-red-400', label: 'Vermelho' },
]

const KANBAN_COLUMNS: Array<{
  key: Test['approval_status']
  label: string
  headerCls: string
  borderCls: string
}> = [
  { key: 'proposto',  label: 'Proposto',  headerCls: 'bg-gray-100 text-gray-600',    borderCls: 'border-gray-200' },
  { key: 'aprovado',  label: 'Aprovado',  headerCls: 'bg-blue-100 text-blue-700',    borderCls: 'border-blue-200' },
  { key: 'pausado',   label: 'Pausado',   headerCls: 'bg-orange-100 text-orange-700', borderCls: 'border-orange-200' },
  { key: 'concluido', label: 'Concluído', headerCls: 'bg-purple-100 text-purple-700', borderCls: 'border-purple-200' },
]

function KanbanCard({
  data, isSelected, onSelect,
}: {
  data: TestWithData
  isSelected: boolean
  onSelect: () => void
}) {
  const { test, flags, activity } = data
  const stale = isForReview(test, activity)
  const lastAct = activity[0]
  const lastActLabel = lastAct ? `${daysSince(lastAct.created_at)}d atrás` : 'sem atividade'

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left bg-white border rounded-xl px-3 py-2.5 hover:shadow-sm transition-all ${
        isSelected ? 'border-blue-400 shadow-sm ring-1 ring-blue-200' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start gap-2 mb-1.5">
        <div className={`mt-1 shrink-0 w-2 h-2 rounded-full ${STATUS_DOT[test.status]}`} />
        <p className="text-xs font-medium text-gray-800 leading-snug flex-1 min-w-0">{test.title}</p>
        {stale && <AlertTriangle size={11} className="text-orange-400 shrink-0 mt-0.5" />}
      </div>

      {test.linked_codes.length > 0 && (
        <div className="flex gap-1 flex-wrap mb-1.5 pl-4">
          {test.linked_codes.map((c) => (
            <code key={c} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">
              {c}
            </code>
          ))}
        </div>
      )}

      {flags.length > 0 && (
        <div className="flex gap-1 flex-wrap mb-1.5 pl-4">
          {flags.map((f) => (
            <span key={f.id} className="text-[10px] bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded-full">
              {f.label}
            </span>
          ))}
        </div>
      )}

      <div className="pl-4 flex items-center gap-1.5">
        {test.category && (
          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
            {test.category}
          </span>
        )}
        <span className="text-[10px] text-gray-400 ml-auto">{lastActLabel}</span>
      </div>
    </button>
  )
}

export default function TestBoard({ tests, flags, flagLinks, activityMap, onTestChange, onTestDelete }: Props) {
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('todas')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todas')
  const [view, setView] = useState<View>('kanban')
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null)

  function handleToggle(id: string) {
    setSelectedTestId((prev) => (prev === id ? null : id))
  }

  function handleTestChange(t: Test) {
    onTestChange(t)
  }

  const enriched: TestWithData[] = useMemo(() => {
    return tests.map((test) => ({
      test,
      flags: flagsForTest(test.id, flags, flagLinks),
      activity: activityMap[test.id] ?? [],
    }))
  }, [tests, flags, flagLinks, activityMap])

  const visible = useMemo(() => {
    let filtered = enriched

    if (accountFilter !== 'todas') {
      filtered = filtered.filter((d) => d.test.account === accountFilter)
    }
    if (statusFilter !== 'todas') {
      filtered = filtered.filter((d) => d.test.status === statusFilter)
    }
    if (view === 'revisar') {
      filtered = filtered.filter((d) => isForReview(d.test, d.activity))
    }

    return [...filtered].sort((a, b) => {
      const endedA = a.test.approval_status === 'concluido' ? 1 : 0
      const endedB = b.test.approval_status === 'concluido' ? 1 : 0
      if (endedA !== endedB) return endedA - endedB
      return new Date(b.test.updated_at).getTime() - new Date(a.test.updated_at).getTime()
    })
  }, [enriched, accountFilter, statusFilter, view])

  const reviewCount = useMemo(
    () => enriched.filter((d) => isForReview(d.test, d.activity)).length,
    [enriched]
  )

  const selectedData = selectedTestId
    ? (visible.find((d) => d.test.id === selectedTestId) ?? enriched.find((d) => d.test.id === selectedTestId))
    : null

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Account filter */}
        <div className="flex bg-gray-100 rounded-xl p-0.5 gap-0.5 text-xs">
          {(['todas', 'principal', 'lab'] as AccountFilter[]).map((a) => (
            <button
              key={a}
              onClick={() => setAccountFilter(a)}
              className={`px-3 py-1.5 rounded-lg transition-colors font-medium ${
                accountFilter === a ? 'bg-white shadow-sm text-gray-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {a.charAt(0).toUpperCase() + a.slice(1)}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex bg-gray-100 rounded-xl p-0.5 gap-0.5">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setStatusFilter(o.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-xs font-medium ${
                statusFilter === o.value ? 'bg-white shadow-sm text-gray-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {o.dot && <div className={`w-2 h-2 rounded-full ${o.dot}`} />}
              {o.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* View toggle */}
        <div className="flex bg-gray-100 rounded-xl p-0.5 gap-0.5 text-xs">
          <button
            onClick={() => setView('lista')}
            className={`px-3 py-1.5 rounded-lg transition-colors font-medium ${
              view === 'lista' ? 'bg-white shadow-sm text-gray-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Lista
          </button>
          <button
            onClick={() => { setView('kanban'); setSelectedTestId(null) }}
            className={`px-3 py-1.5 rounded-lg transition-colors font-medium ${
              view === 'kanban' ? 'bg-white shadow-sm text-gray-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Kanban
          </button>
          <button
            onClick={() => setView('revisar')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-medium ${
              view === 'revisar' ? 'bg-white shadow-sm text-gray-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Para revisar
            {reviewCount > 0 && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                view === 'revisar' ? 'bg-orange-100 text-orange-700' : 'bg-orange-100 text-orange-600'
              }`}>
                {reviewCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Kanban view ── */}
      {view === 'kanban' ? (
        <>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {KANBAN_COLUMNS.map((col) => {
              const colTests = visible.filter((d) => d.test.approval_status === col.key)
              return (
                <div key={col.key} className="flex flex-col gap-2 min-w-[240px] flex-1">
                  {/* Column header */}
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold ${col.headerCls}`}>
                    <span>{col.label}</span>
                    <span className="ml-auto opacity-60">{colTests.length}</span>
                  </div>
                  {/* Cards */}
                  <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
                    {colTests.length === 0 ? (
                      <div className="text-[11px] text-gray-300 text-center py-6">Nenhum teste</div>
                    ) : (
                      colTests.map((d) => (
                        <KanbanCard
                          key={d.test.id}
                          data={d}
                          isSelected={selectedTestId === d.test.id}
                          onSelect={() => handleToggle(d.test.id)}
                        />
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Slide-over detail panel */}
          {selectedData && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-20 bg-black/20"
                onClick={() => setSelectedTestId(null)}
              />
              {/* Panel */}
              <div className="fixed inset-y-0 right-0 z-30 w-full max-w-2xl bg-white shadow-2xl overflow-y-auto border-l border-gray-200">
                <TestDetail
                  test={selectedData.test}
                  onClose={() => setSelectedTestId(null)}
                  onTestChange={(t) => { handleTestChange(t) }}
                  onDelete={() => { setSelectedTestId(null); onTestDelete(selectedData.test.id) }}
                />
              </div>
            </>
          )}
        </>
      ) : (
        /* ── Lista / Para revisar view ── */
        visible.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-12">
            {view === 'revisar'
              ? 'Nenhum teste para revisar no momento.'
              : 'Nenhum teste encontrado para os filtros selecionados.'}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {visible.map(({ test, flags: testFlags, activity }) => (
              <div key={test.id}>
                {selectedTestId === test.id ? (
                  /* Quando aberto: mostra apenas o detalhe, sem duplicar a linha */
                  <TestDetail
                    test={selectedData?.test ?? test}
                    onClose={() => setSelectedTestId(null)}
                    onTestChange={handleTestChange}
                    onDelete={() => { setSelectedTestId(null); onTestDelete(test.id) }}
                  />
                ) : (
                  <TestCard
                    test={test}
                    flags={testFlags}
                    activity={activity}
                    isOpen={false}
                    onToggle={() => handleToggle(test.id)}
                  />
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
