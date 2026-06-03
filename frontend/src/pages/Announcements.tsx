import { useEffect, useState } from 'react'
import { parseDate } from '../utils/dates'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface Announcement {
  id: string
  title: string
  body: string
  created_at: string
  author_first_name: string
  author_last_name: string
  require_confirmation: boolean
  confirmed: boolean
  confirmed_count: number
}

interface ReadEntry  { user_id: string; first_name: string; last_name: string; read_at: string }
interface UnreadEntry { user_id: string; first_name: string; last_name: string }
interface ReadStats {
  total_members: number
  confirmed_count: number
  confirmed: ReadEntry[]
  unconfirmed: UnreadEntry[]
}

export default function Announcements() {
  const { isBoard } = useAuth()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [form, setForm] = useState({ title: '', body: '', send_email: false, require_confirmation: false })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [statsOpen, setStatsOpen] = useState<string | null>(null) // announcement id
  const [stats, setStats] = useState<ReadStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ title: '', body: '' })
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')

  const load = () => api.announcements.list().then(d => setAnnouncements(d as Announcement[]))

  useEffect(() => {
    load()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.announcements.create(form)
      setForm({ title: '', body: '', send_email: false, require_confirmation: false })
      setShowForm(false)
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this announcement?')) return
    await api.announcements.delete(id)
    load()
  }

  const openEdit = (a: Announcement) => {
    setEditingId(a.id)
    setEditForm({ title: a.title, body: a.body })
    setEditError('')
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingId) return
    setEditLoading(true)
    setEditError('')
    try {
      await api.announcements.update(editingId, editForm)
      setEditingId(null)
      load()
    } catch (err: any) {
      setEditError(err.message)
    } finally {
      setEditLoading(false)
    }
  }

  const toggleStats = async (id: string) => {
    if (statsOpen === id) { setStatsOpen(null); setStats(null); return }
    setStatsOpen(id)
    setStats(null)
    setStatsLoading(true)
    try {
      const d = await api.announcements.getReadStats(id)
      setStats(d as ReadStats)
    } finally {
      setStatsLoading(false)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Announcements</h1>
        {isBoard && (
          <button onClick={() => setShowForm(s => !s)}
            className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition">
            {showForm ? 'Cancel' : '+ New Announcement'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} required rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="flex flex-col gap-3">
            <label className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer">
              <input type="checkbox" checked={form.send_email}
                onChange={e => setForm(f => ({ ...f, send_email: e.target.checked }))}
                className="w-4 h-4 mt-0.5 text-green-600 rounded cursor-pointer" />
              <span>
                <div className="text-sm font-medium text-blue-800">📧 Email to all active members</div>
                <div className="text-xs text-blue-600 mt-0.5">If unchecked, it will only appear on the dashboard.</div>
              </span>
            </label>
            <label className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer">
              <input type="checkbox" checked={form.require_confirmation}
                onChange={e => setForm(f => ({ ...f, require_confirmation: e.target.checked }))}
                className="w-4 h-4 mt-0.5 text-amber-600 rounded cursor-pointer" />
              <span>
                <div className="text-sm font-medium text-amber-800">✅ Require Read Confirmation</div>
                <div className="text-xs text-amber-600 mt-0.5">
                  Members must click "Read" to dismiss this from their dashboard. You can track who hasn't confirmed yet.
                </div>
              </span>
            </label>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="bg-green-700 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition disabled:opacity-50">
            {loading ? 'Posting...' : form.send_email ? 'Post & Email Members' : 'Post Announcement'}
          </button>
        </form>
      )}

      {announcements.length === 0 ? (
        <p className="text-gray-400 text-sm">No announcements yet.</p>
      ) : (
        <div className="space-y-4">
          {announcements.map(a => (
            <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              {editingId === a.id ? (
                <form onSubmit={handleEdit} className="space-y-3">
                  <input
                    value={editForm.title}
                    onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <textarea
                    value={editForm.body}
                    onChange={e => setEditForm(f => ({ ...f, body: e.target.value }))}
                    required
                    rows={4}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  {editError && <p className="text-red-600 text-xs">{editError}</p>}
                  <div className="flex gap-2">
                    <button type="submit" disabled={editLoading}
                      className="bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-green-800 transition disabled:opacity-50">
                      {editLoading ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => setEditingId(null)}
                      className="px-4 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-semibold text-gray-800 text-lg">{a.title}</h2>
                        {a.require_confirmation && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">
                            ✅ Read Confirmation
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600 text-sm mt-2 whitespace-pre-wrap">{a.body}</p>
                      <p className="text-gray-400 text-xs mt-3">
                        {a.author_first_name} {a.author_last_name} · {parseDate(a.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {isBoard && (
                      <div className="flex items-center gap-3 shrink-0">
                        <button onClick={() => openEdit(a)}
                          className="text-gray-400 hover:text-green-700 text-xs font-medium transition">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(a.id)}
                          className="text-red-400 hover:text-red-600 text-xs font-medium">
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Read stats — board only, only for announcements that require confirmation */}
                  {isBoard && a.require_confirmation && (
                <div className="mt-4 border-t border-gray-100 pt-3">
                  <button
                    onClick={() => toggleStats(a.id)}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-green-700 transition">
                    <span className="font-medium text-green-700">{a.confirmed_count}</span> confirmed
                    <span className="text-gray-300">·</span>
                    <span className="font-medium text-amber-600">
                      {statsOpen === a.id && stats ? stats.unconfirmed.length : '…'}
                    </span> not yet
                    <span className="text-xs text-gray-400 ml-1">{statsOpen === a.id ? '▲ hide' : '▼ show'}</span>
                  </button>

                  {statsOpen === a.id && (
                    <div className="mt-3 grid sm:grid-cols-2 gap-4">
                      {statsLoading ? (
                        <p className="text-xs text-gray-400 col-span-2">Loading…</p>
                      ) : stats ? (
                        <>
                          {/* Not yet confirmed */}
                          <div>
                            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                              Not Yet Confirmed ({stats.unconfirmed.length})
                            </p>
                            {stats.unconfirmed.length === 0 ? (
                              <p className="text-xs text-gray-400 italic">Everyone has confirmed!</p>
                            ) : (
                              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                {stats.unconfirmed.map(u => (
                                  <div key={u.user_id} className="text-xs text-gray-700 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                    {u.first_name} {u.last_name}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Confirmed */}
                          <div>
                            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">
                              Confirmed ({stats.confirmed.length})
                            </p>
                            {stats.confirmed.length === 0 ? (
                              <p className="text-xs text-gray-400 italic">No confirmations yet.</p>
                            ) : (
                              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                {stats.confirmed.map(u => (
                                  <div key={u.user_id} className="text-xs text-gray-700 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                                    {u.first_name} {u.last_name}
                                    <span className="text-gray-400 ml-auto shrink-0">
                                      {parseDate(u.read_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
