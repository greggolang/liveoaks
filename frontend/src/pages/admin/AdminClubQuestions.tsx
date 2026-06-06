import { useEffect, useState } from 'react'
import { api, ClubQuestion } from '../../api/client'
import { parseDate } from '../../utils/dates'

function when(iso: string) {
  return parseDate(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function AdminClubQuestions() {
  const [questions, setQuestions] = useState<ClubQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const load = () => {
    setLoading(true)
    api.admin.clubQuestions().then(setQuestions).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const answer = async (id: string) => {
    const text = (drafts[id] ?? '').trim()
    if (!text) return
    setSavingId(id)
    try {
      await api.admin.answerClubQuestion(id, text)
      setDrafts(d => { const n = { ...d }; delete n[id]; return n })
      load()
    } finally { setSavingId(null) }
  }

  const startEdit = (q: ClubQuestion) => {
    setEditingId(q.id)
    setEditDraft(q.answer ?? '')
  }

  const saveEdit = async (id: string) => {
    const text = editDraft.trim()
    if (!text) return
    setSavingId(id)
    try {
      await api.admin.answerClubQuestion(id, text)
      setEditingId(null)
      load()
    } finally { setSavingId(null) }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this question?')) return
    await api.admin.deleteClubQuestion(id)
    load()
  }

  const pending = questions.filter(q => q.status === 'pending')
  const answered = questions.filter(q => q.status === 'answered')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Club Q&amp;A</h1>
        <p className="text-sm text-gray-500 mt-1">
          Questions members forwarded from the “Ask the Club” assistant. Your answer is sent back to the member and added to
          the assistant's knowledge, so future askers get it automatically.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {/* Pending */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Needs an answer {pending.length > 0 && <span className="text-amber-600">· {pending.length}</span>}
            </h2>
            {pending.length === 0 ? (
              <p className="text-sm text-gray-400">Nothing waiting — you're all caught up. 🎾</p>
            ) : (
              <div className="space-y-3">
                {pending.map(q => (
                  <div key={q.id} className="bg-white border border-amber-200 rounded-xl p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-gray-800">{q.question}</p>
                      <button onClick={() => remove(q.id)} className="text-xs text-gray-300 hover:text-red-500 shrink-0">✕</button>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {q.asked_by_name ?? 'A member'} · {when(q.created_at)}
                    </p>
                    <textarea
                      value={drafts[q.id] ?? ''}
                      onChange={e => setDrafts(d => ({ ...d, [q.id]: e.target.value }))}
                      placeholder="Write the board's answer…"
                      rows={3}
                      className="w-full mt-3 border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500" />
                    <div className="flex justify-end mt-2">
                      <button onClick={() => answer(q.id)} disabled={savingId === q.id || !(drafts[q.id] ?? '').trim()}
                        className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
                        {savingId === q.id ? 'Sending…' : 'Send answer'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Answered */}
          {answered.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Answered</h2>
              <div className="space-y-3">
                {answered.map(q => (
                  <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-gray-800">{q.question}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => editingId === q.id ? setEditingId(null) : startEdit(q)}
                          className={`text-xs px-2 py-1 rounded-lg border transition font-medium ${
                            editingId === q.id
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-white text-amber-600 border-amber-200 hover:border-amber-500'
                          }`}>
                          ✏️ Edit
                        </button>
                        <button onClick={() => remove(q.id)} className="text-xs text-gray-300 hover:text-red-500">✕</button>
                      </div>
                    </div>

                    {editingId === q.id ? (
                      <div className="mt-3">
                        <textarea
                          value={editDraft}
                          onChange={e => setEditDraft(e.target.value)}
                          rows={4}
                          className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400" />
                        <div className="flex justify-end gap-2 mt-2">
                          <button onClick={() => setEditingId(null)}
                            className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5">
                            Cancel
                          </button>
                          <button onClick={() => saveEdit(q.id)} disabled={savingId === q.id || !editDraft.trim()}
                            className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold px-4 py-1.5 rounded-lg transition disabled:opacity-50">
                            {savingId === q.id ? 'Saving…' : 'Save answer'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{q.answer}</p>
                    )}

                    <p className="text-xs text-gray-400 mt-2">
                      Asked by {q.asked_by_name ?? 'a member'}
                      {q.answered_by_name && ` · answered by ${q.answered_by_name}`}
                      {q.answered_at && ` · ${when(q.answered_at)}`}
                      <span className="ml-1.5 text-green-600">· now in the assistant's knowledge</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
