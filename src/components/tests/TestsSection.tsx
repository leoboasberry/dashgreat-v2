import { useState, useEffect, useCallback } from 'react'
import { Plus, Loader2, RefreshCw, FileJson, Download } from 'lucide-react'
import type { Test, TestFlag, TestFlagLink, TestActivity } from '../../api/tests'
import { fetchTests, fetchFlags, fetchAllFlagLinks, fetchActivity } from '../../api/tests'
import TestBoard from './TestBoard'
import TestCreateModal from './TestCreateModal'
import TestImportModal from './TestImportModal'

export default function TestsSection() {
  const [tests, setTests] = useState<Test[]>([])
  const [flags, setFlags] = useState<TestFlag[]>([])
  const [flagLinks, setFlagLinks] = useState<TestFlagLink[]>([])
  const [activityMap, setActivityMap] = useState<Record<string, TestActivity[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  const loadAll = useCallback(async () => {
    setError(null)
    try {
      const [ts, fs, fl] = await Promise.all([fetchTests(), fetchFlags(), fetchAllFlagLinks()])
      setTests(ts)
      setFlags(fs)
      setFlagLinks(fl)

      // Load recent activity for each test (latest 3 per test for stale calc)
      const entries = await Promise.all(
        ts.map(async (t): Promise<[string, TestActivity[]]> => {
          const acts = await fetchActivity(t.id)
          return [t.id, acts]
        })
      )
      setActivityMap(Object.fromEntries(entries))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar testes')
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    loadAll().finally(() => setLoading(false))
  }, [loadAll])

  function handleTestChange(updated: Test) {
    setTests((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
  }

  function handleCreated(t: Test) {
    setTests((prev) => [t, ...prev])
    setActivityMap((prev) => ({ ...prev, [t.id]: [] }))
  }

  function handleDelete(id: string) {
    setTests((prev) => prev.filter((t) => t.id !== id))
    setActivityMap((prev) => { const next = { ...prev }; delete next[id]; return next })
  }

  function handleExportJson() {
    const payload = {
      exported_at: new Date().toISOString(),
      tests: tests.map((t) => ({
        ...t,
        flags: flagLinks
          .filter((l) => l.test_id === t.id)
          .map((l) => flags.find((f) => f.id === l.flag_id))
          .filter(Boolean),
        activity: activityMap[t.id] ?? [],
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `testes-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Testes</h2>
          {!loading && (
            <p className="text-xs text-gray-400 mt-0.5">
              {tests.length} teste{tests.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setLoading(true); loadAll().finally(() => setLoading(false)) }}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Atualizar"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={handleExportJson}
            disabled={loading || tests.length === 0}
            className="flex items-center gap-1.5 text-sm border border-gray-200 text-gray-600 px-3 py-1.5 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Exportar todos os testes como JSON"
          >
            <Download size={14} />
            Exportar JSON
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 text-sm border border-gray-200 text-gray-600 px-3 py-1.5 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <FileJson size={14} />
            Importar JSON
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Plus size={14} />
            Novo teste
          </button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-gray-400 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Carregando testes...
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : (
        <TestBoard
          tests={tests}
          flags={flags}
          flagLinks={flagLinks}
          activityMap={activityMap}
          onTestChange={handleTestChange}
          onTestDelete={handleDelete}
        />
      )}

      {showCreateModal && (
        <TestCreateModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreated}
        />
      )}

      {showImportModal && (
        <TestImportModal
          onClose={() => setShowImportModal(false)}
          onImported={(imported) => {
            imported.forEach(handleCreated)
            setShowImportModal(false)
          }}
        />
      )}
    </div>
  )
}
