import { useState, useRef } from 'react'
import { Send, Paperclip, Loader2, MessageSquare, CheckCircle, Flag, Bell, Pause, Play, RefreshCw, Trophy } from 'lucide-react'
import type { TestActivity, ActivityType } from '../../api/tests'
import { insertActivity, uploadAttachment } from '../../api/tests'

interface Props {
  testId: string
  activity: TestActivity[]
  onNewActivity: (a: TestActivity) => void
  author?: string
}

const ICONS: Record<ActivityType, React.ReactNode> = {
  comment:       <MessageSquare size={14} className="text-gray-400" />,
  attachment:    <Paperclip size={14} className="text-blue-400" />,
  approval:      <CheckCircle size={14} className="text-green-500" />,
  flag_added:    <Flag size={14} className="text-orange-400" />,
  flag_removed:  <Flag size={14} className="text-gray-300" />,
  reminder_set:  <Bell size={14} className="text-yellow-500" />,
  paused:        <Pause size={14} className="text-orange-500" />,
  reactivated:   <Play size={14} className="text-green-500" />,
  status_change: <RefreshCw size={14} className="text-blue-400" />,
  concluded:     <Trophy size={14} className="text-purple-500" />,
}

const TYPE_LABELS: Record<ActivityType, string> = {
  comment:       'Comentário',
  attachment:    'Print anexado',
  approval:      'Aprovado',
  flag_added:    'Flag adicionada',
  flag_removed:  'Flag removida',
  reminder_set:  'Lembrete definido',
  paused:        'Pausado',
  reactivated:   'Reativado',
  status_change: 'Status alterado',
  concluded:     'Concluído',
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  return `há ${d}d`
}

export default function TestActivityFeed({ testId, activity, onNewActivity, author = 'Você' }: Props) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    try {
      const a = await insertActivity({
        test_id: testId,
        activity_type: 'comment',
        author,
        text: trimmed,
        attachment_url: null,
        metadata: null,
      })
      onNewActivity(a)
      setText('')
    } finally {
      setSending(false)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadAttachment(file, testId)
      const a = await insertActivity({
        test_id: testId,
        activity_type: 'attachment',
        author,
        text: file.name,
        attachment_url: url,
        metadata: null,
      })
      onNewActivity(a)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function activityLabel(a: TestActivity): string {
    if (a.activity_type === 'status_change' && a.metadata) {
      const m = a.metadata as { from?: string; to?: string }
      return `Status: ${m.from} → ${m.to}`
    }
    if (a.activity_type === 'concluded' && a.metadata) {
      const m = a.metadata as { result?: string }
      return `Concluído como ${m.result ?? ''}`
    }
    if (a.activity_type === 'reminder_set' && a.metadata) {
      const m = a.metadata as { next_reminder_at?: string }
      if (m.next_reminder_at) {
        return `Lembrete: ${new Date(m.next_reminder_at).toLocaleDateString('pt-BR')}`
      }
    }
    return a.text ?? TYPE_LABELS[a.activity_type]
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Composer */}
      <div className="border border-gray-200 rounded-xl p-3 flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend()
          }}
          placeholder="Adicionar comentário... (Cmd+Enter para enviar)"
          rows={2}
          className="w-full text-sm resize-none outline-none text-gray-700 placeholder-gray-400"
        />
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
              title="Anexar print"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
              {uploading ? 'Enviando...' : 'Anexar'}
            </button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} />
          </div>
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="flex items-center gap-1.5 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40"
          >
            {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Enviar
          </button>
        </div>
      </div>

      {/* Feed */}
      {activity.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">Sem atividade registrada ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {activity.map((a) => (
            <div key={a.id} className="flex gap-2.5">
              <div className="mt-0.5 shrink-0">{ICONS[a.activity_type]}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  {a.author && (
                    <span className="text-xs font-medium text-gray-700">{a.author}</span>
                  )}
                  <span className="text-xs text-gray-400">{formatRelative(a.created_at)}</span>
                </div>
                {a.attachment_url ? (
                  <a
                    href={a.attachment_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 underline break-all"
                  >
                    {a.text ?? 'Ver anexo'}
                  </a>
                ) : (
                  <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap break-words">
                    {activityLabel(a)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
