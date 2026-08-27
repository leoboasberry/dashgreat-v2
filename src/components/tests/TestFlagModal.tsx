import { useState } from 'react'
import { X, Plus, Loader2 } from 'lucide-react'
import type { TestFlag } from '../../api/tests'
import { createFlag, addFlagLink, removeFlagLink, insertActivity } from '../../api/tests'

interface Props {
  testId: string
  allFlags: TestFlag[]
  activeFlags: TestFlag[]
  author?: string
  onClose: () => void
  onUpdate: (activeFlags: TestFlag[], allFlags: TestFlag[]) => void
}

const COLOR_CLASSES: Record<string, string> = {
  danger: 'bg-red-100 text-red-700',
  warning: 'bg-yellow-100 text-yellow-700',
  accent: 'bg-blue-100 text-blue-700',
}

function flagClass(color: string | null) {
  return COLOR_CLASSES[color ?? ''] ?? 'bg-gray-100 text-gray-600'
}

export default function TestFlagModal({ testId, allFlags, activeFlags, author = 'Você', onClose, onUpdate }: Props) {
  const activeIds = new Set(activeFlags.map((f) => f.id))
  const [pending, setPending] = useState(new Set(activeIds))
  const [saving, setSaving] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [creating, setCreating] = useState(false)

  function toggle(id: string) {
    setPending((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const toAdd = [...pending].filter((id) => !activeIds.has(id))
      const toRemove = [...activeIds].filter((id) => !pending.has(id))

      const flagMap = new Map(allFlags.map((f) => [f.id, f]))

      await Promise.all([
        ...toAdd.map(async (id) => {
          await addFlagLink(testId, id)
          await insertActivity({
            test_id: testId,
            activity_type: 'flag_added',
            author,
            text: flagMap.get(id)?.label ?? null,
            attachment_url: null,
            metadata: { flag_id: id },
          })
        }),
        ...toRemove.map(async (id) => {
          await removeFlagLink(testId, id)
          await insertActivity({
            test_id: testId,
            activity_type: 'flag_removed',
            author,
            text: flagMap.get(id)?.label ?? null,
            attachment_url: null,
            metadata: { flag_id: id },
          })
        }),
      ])

      const newActiveFlags = allFlags.filter((f) => pending.has(f.id))
      onUpdate(newActiveFlags, allFlags)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateFlag() {
    const label = newLabel.trim()
    if (!label || creating) return
    setCreating(true)
    try {
      const flag = await createFlag(label)
      const updatedAllFlags = [...allFlags, flag]
      setPending((prev) => new Set([...prev, flag.id]))
      onUpdate(activeFlags, updatedAllFlags)
      setNewLabel('')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-80 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-700">Sinalizar</span>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-1.5">
          {allFlags.map((flag) => (
            <label key={flag.id} className="flex items-center gap-2.5 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={pending.has(flag.id)}
                onChange={() => toggle(flag.id)}
                className="rounded"
              />
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${flagClass(flag.color)}`}>
                {flag.label}
              </span>
            </label>
          ))}
        </div>

        {/* Create new flag */}
        <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFlag()}
            placeholder="Nova flag..."
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-400"
          />
          <button
            onClick={handleCreateFlag}
            disabled={!newLabel.trim() || creating}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-40"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          </button>
        </div>

        <div className="px-4 pb-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full text-sm bg-blue-600 text-white py-2 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
