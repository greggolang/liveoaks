import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, MemberMessage } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface ActiveAlert {
  id: string; user_id: string; message: string; type: string; created_at: string; target_name: string
}
interface Member { id: string; first_name: string; last_name: string; email: string }

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
  const navigate = useNavigate()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [inbox, setInbox] = useState<MemberMessage[]>([])
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

  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [alertTarget, setAlertTarget] = useState('')
  const [alertMsg, setAlertMsg] = useState('')
  const [alertType, setAlertType] = useState('info')
  const [sendingAlert, setSendingAlert] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')

  const load = () => api.announcements.list().then(d => setAnnouncements(d as Announcement[]))
  const loadAlerts = () => api.memberAlerts.adminListAll().then(d => setActiveAlerts(d)).catch(() => {})

  useEffect(() => {
    load()
    api.messages.inbox().then(d => setInbox(d)).catch(() => {})
    if (isBoard) {
      loadAlerts()
      api.admin.users().then(d => setMembers(d as Member[])).catch(() => {})
    }
  }, [isBoard])

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

      {/* Member Alerts — board/admin only */}
      {isBoard && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Member Dashboard Alerts</h2>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4">
            {/* Send form */}
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-48">
                <label className="block text-xs font-medium text-gray-600 mb-1">Member</label>
                <input
                  value={memberSearch}
                  onChange={e => { setMemberSearch(e.target.value); setAlertTarget('') }}
                  placeholder="Search name…"
                  list="member-alert-list"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <datalist id="member-alert-list">
                  {members
                    .filter(m => memberSearch.length > 0 && (`${m.first_name} ${m.last_name}`).toLowerCase().includes(memberSearch.toLowerCase()))
                    .slice(0, 10)
                    .map(m => (
                      <option key={m.id} value={`${m.first_name} ${m.last_name}`}
                        onClick={() => { setAlertTarget(m.id); setMemberSearch(`${m.first_name} ${m.last_name}`) }} />
                    ))}
                </datalist>
                {/* Hidden select for reliable ID capture */}
                <select className="sr-only" value={alertTarget} onChange={e => setAlertTarget(e.target.value)}>
                  <option value="">—</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                  ))}
                </select>
                {memberSearch && !alertTarget && (
                  <div className="mt-1 border border-gray-200 rounded-lg bg-white shadow-sm max-h-40 overflow-y-auto">
                    {members
                      .filter(m => (`${m.first_name} ${m.last_name}`).toLowerCase().includes(memberSearch.toLowerCase()))
                      .slice(0, 8)
                      .map(m => (
                        <button key={m.id} type="button"
                          className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-green-50 hover:text-green-800"
                          onClick={() => { setAlertTarget(m.id); setMemberSearch(`${m.first_name} ${m.last_name}`) }}>
                          {m.first_name} {m.last_name}
                          <span className="text-xs text-gray-400 ml-2">{m.email}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <div className="w-32">
                <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <select value={alertType} onChange={e => setAlertType(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="danger">Urgent</option>
                </select>
              </div>
              <div className="flex-1 min-w-56">
                <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
                <input value={alertMsg} onChange={e => setAlertMsg(e.target.value)}
                  placeholder="Alert message…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <button
                disabled={!alertTarget || !alertMsg.trim() || sendingAlert}
                onClick={async () => {
                  setSendingAlert(true)
                  try {
                    await api.memberAlerts.adminCreate(alertTarget, alertMsg.trim(), alertType)
                    setAlertMsg('')
                    setAlertTarget('')
                    setMemberSearch('')
                    loadAlerts()
                  } finally { setSendingAlert(false) }
                }}
                className="px-4 py-2 bg-green-700 text-white text-sm font-medium rounded-lg hover:bg-green-800 transition disabled:opacity-50 shrink-0">
                {sendingAlert ? 'Sending…' : 'Send Alert'}
              </button>
            </div>

            {/* Active alerts list */}
            {activeAlerts.length === 0 ? (
              <p className="text-xs text-gray-400">No active member alerts.</p>
            ) : (
              <div className="space-y-1.5 pt-1 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 pt-1">Active alerts ({activeAlerts.length})</p>
                {activeAlerts.map(a => {
                  const colors: Record<string, string> = {
                    info:    'bg-blue-50 border-blue-200 text-blue-800',
                    warning: 'bg-amber-50 border-amber-200 text-amber-800',
                    danger:  'bg-red-50 border-red-200 text-red-800',
                  }
                  return (
                    <div key={a.id} className={`flex items-center gap-3 border rounded-lg px-3 py-2 text-xs ${colors[a.type] ?? colors.info}`}>
                      <span className="font-semibold shrink-0">{a.target_name}</span>
                      <span className="flex-1">{a.message}</span>
                      <span className="opacity-50 capitalize shrink-0">{a.type}</span>
                      <button onClick={async () => {
                        await api.memberAlerts.adminDelete(a.id)
                        loadAlerts()
                      }} className="opacity-40 hover:opacity-70 transition shrink-0">✕</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {announcements.length === 0 && inbox.length === 0 ? (
        <p className="text-gray-400 text-sm">No announcements yet.</p>
      ) : (() => {
        type FeedItem =
          | { kind: 'announcement'; data: Announcement; date: string }
          | { kind: 'message'; data: MemberMessage; date: string }
        const feed: FeedItem[] = [
          ...announcements.map(a => ({ kind: 'announcement' as const, data: a, date: a.created_at })),
          ...inbox.map(m => ({ kind: 'message' as const, data: m, date: m.created_at })),
        ].sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())

        return (
        <div className="space-y-4">
          {feed.map(item => item.kind === 'message' ? (
            <button
              key={`msg-${item.data.id}`}
              type="button"
              onClick={() => navigate('/messages')}
              className={`w-full text-left bg-white border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow ${item.data.read_at ? 'border-gray-200' : 'border-blue-300'}`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${item.data.read_at ? 'bg-gray-300' : 'bg-blue-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">Message</span>
                    <span className="text-xs text-gray-400">from {item.data.sender_name}</span>
                  </div>
                  <p className={`text-sm mt-0.5 truncate ${item.data.read_at ? 'text-gray-700' : 'text-gray-900 font-semibold'}`}>
                    {item.data.subject}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.data.body}</p>
                  <p className="text-xs text-gray-400 mt-2">{new Date(item.data.created_at).toLocaleDateString()}</p>
                </div>
                {!item.data.read_at && (
                  <span className="shrink-0 self-center bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                    Unread
                  </span>
                )}
              </div>
            </button>
          ) : (
            (() => { const a = item.data as Announcement; return (
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
                        {a.author_first_name} {a.author_last_name} · {new Date(a.created_at).toLocaleDateString()}
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
                                      {new Date(u.read_at).toLocaleDateString()}
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
          )})()
          ))}
        </div>
        )
      })()}
    </div>
  )
}
