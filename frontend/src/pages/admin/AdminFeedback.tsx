import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { parseDate } from '../../utils/dates'
import { api, type FeedbackDigest } from '../../api/client'

interface FeedbackItem {
  id: string
  number: number
  user_id: string
  message: string
  status: string
  type: string
  page?: string
  assigned_to?: string
  note?: string
  created_at: string
  first_name: string
  last_name: string
  email: string
  reply_count: number
}

interface FeedbackReply {
  id: string
  feedback_id: string
  message_id?: string
  sender_id?: string
  sender_name: string
  body: string
  direction: 'outbound' | 'inbound'
  created_at: string
}

const STATUSES = [
  { value: 'new',             label: 'New',             color: 'bg-blue-100 text-blue-700' },
  { value: 'planned',         label: 'In Progress',     color: 'bg-purple-100 text-purple-700' },
  { value: 'need_validation', label: 'Need Validation', color: 'bg-orange-100 text-orange-700' },
  { value: 'validated',       label: 'Validated',       color: 'bg-teal-100 text-teal-700' },
  { value: 'declined',        label: 'Declined',        color: 'bg-gray-100 text-gray-500' },
]

const ASSIGNEES = ['Greg', 'Sean', 'Ian']
const ASSIGN_UNSET = '__unassigned__'

function pillClass(active: boolean) {
  return `px-3 py-1 rounded-full text-xs font-medium transition border ${active ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'}`
}
function toggleSet(s: Set<string>, v: string) {
  const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n
}

function statusStyle(status: string) {
  return STATUSES.find(s => s.value === status)?.color ?? 'bg-gray-100 text-gray-500'
}
function statusLabel(status: string) {
  return STATUSES.find(s => s.value === status)?.label ?? status
}

export default function AdminFeedback() {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<'all' | 'idea' | 'bug'>('all')
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set())
  const [assignedFilter, setAssignedFilter] = useState<Set<string>>(new Set())
  const [searchText, setSearchText] = useState('')
  const [groupByPage, setGroupByPage] = useState(false)

  const [replyId, setReplyId] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [replySending, setReplySending] = useState(false)
  const [replyDone, setReplyDone] = useState<string | null>(null)
  const [replyError, setReplyError] = useState<string | null>(null)

  const [noteId, setNoteId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)

  // Per-ticket thread state
  const [threadOpen, setThreadOpen] = useState<string | null>(null)
  const [threadReplies, setThreadReplies] = useState<Record<string, FeedbackReply[]>>({})
  const [threadLoading, setThreadLoading] = useState<string | null>(null)

  const [digest, setDigest] = useState<FeedbackDigest | null>(null)
  const [digestLoading, setDigestLoading] = useState(false)
  const [digestError, setDigestError] = useState('')
  const [showDigest, setShowDigest] = useState(false)

  const runDigest = async () => {
    setShowDigest(true); setDigestLoading(true); setDigestError('')
    try {
      setDigest(await api.ai.feedbackDigest())
    } catch (e: any) {
      setDigestError(e.message || 'Could not generate digest.')
    } finally { setDigestLoading(false) }
  }

  const load = () =>
    api.feedback.adminList()
      .then(d => setItems(d as FeedbackItem[]))
      .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const setStatus = async (id: string, status: string) => {
    await api.feedback.updateStatus(id, status)
    setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i))
  }

  const setAssigned = async (id: string, assigned_to: string) => {
    await api.feedback.updateAssigned(id, assigned_to)
    setItems(prev => prev.map(i => i.id === id ? { ...i, assigned_to: assigned_to || undefined } : i))
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this idea?')) return
    await api.feedback.delete(id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const openNote = (item: FeedbackItem) => {
    setNoteId(item.id)
    setNoteDraft(item.note ?? '')
  }

  const saveNote = async (item: FeedbackItem) => {
    setNoteSaving(true)
    try {
      const note = noteDraft.trim()
      await api.feedback.updateNote(item.id, note)
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, note: note || undefined } : i))
      setNoteId(null)
    } finally {
      setNoteSaving(false)
    }
  }

  const openReply = (id: string) => {
    setReplyId(id)
    setReplyBody('')
    setReplyDone(null)
    setReplyError(null)
  }

  const sendReply = async (item: FeedbackItem) => {
    if (!replyBody.trim()) return
    setReplySending(true)
    setReplyError(null)
    try {
      const reply = await api.feedback.reply(item.id, replyBody.trim()) as FeedbackReply
      // Append the new reply to the thread cache and update reply_count
      setThreadReplies(prev => ({
        ...prev,
        [item.id]: [...(prev[item.id] ?? []), reply],
      }))
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, reply_count: i.reply_count + 1 } : i))
      setReplyDone(item.id)
      setReplyBody('')
      // Auto-open thread so admin can see the sent message
      setThreadOpen(item.id)
    } catch {
      setReplyError('Could not send — please try again.')
    } finally {
      setReplySending(false)
    }
  }

  const toggleThread = async (id: string) => {
    if (threadOpen === id) {
      setThreadOpen(null)
      return
    }
    setThreadOpen(id)
    if (threadReplies[id]) return // already loaded
    setThreadLoading(id)
    try {
      const replies = await api.feedback.getReplies(id) as FeedbackReply[]
      setThreadReplies(prev => ({ ...prev, [id]: replies }))
    } finally {
      setThreadLoading(null)
    }
  }

  const q = searchText.trim().toLowerCase().replace(/^#/, '')
  const visible = items
    .filter(i => typeFilter === 'all' || i.type === typeFilter)
    .filter(i => statusFilter.size === 0 || statusFilter.has(i.status))
    .filter(i => assignedFilter.size === 0 || assignedFilter.has(i.assigned_to || ASSIGN_UNSET))
    .filter(i => !q
      || String(i.number).includes(q)
      || i.message.toLowerCase().includes(q)
      || `${i.first_name} ${i.last_name}`.toLowerCase().includes(q))

  const NO_PAGE = '(no page reported)'
  const grouped = (() => {
    const map = new Map<string, FeedbackItem[]>()
    for (const it of visible) {
      const key = it.page && it.page.trim() ? it.page : NO_PAGE
      const arr = map.get(key) ?? []
      arr.push(it)
      map.set(key, arr)
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === NO_PAGE) return 1
      if (b[0] === NO_PAGE) return -1
      return b[1].length - a[1].length
    })
  })()

  const assignees = Array.from(new Set([...ASSIGNEES, ...items.map(i => i.assigned_to).filter((a): a is string => !!a)]))

  const renderThread = (item: FeedbackItem) => {
    const replies = threadReplies[item.id] ?? []
    return (
      <div className="mt-3 pt-3 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-500 mb-2">
          Communication thread — all messages between the board and {item.first_name}
        </p>
        {threadLoading === item.id ? (
          <p className="text-xs text-gray-400 animate-pulse">Loading thread…</p>
        ) : replies.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No messages yet.</p>
        ) : (
          <div className="space-y-2">
            {replies.map(r => (
              <div
                key={r.id}
                className={`rounded-lg px-3 py-2 text-sm ${
                  r.direction === 'outbound'
                    ? 'bg-green-50 border border-green-100 ml-4'
                    : 'bg-blue-50 border border-blue-100 mr-4'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold text-gray-700">
                    {r.direction === 'outbound' ? '📤 ' : '📥 '}{r.sender_name}
                  </span>
                  <span className="text-xs text-gray-400">
                    {parseDate(r.created_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-gray-800 whitespace-pre-wrap text-xs">{r.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderItem = (item: FeedbackItem) => (
    <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{item.message}</p>
          <p className="text-xs text-gray-400 mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="font-mono font-bold text-gray-700">#{item.number}</span>
            <span className={`font-medium px-1.5 py-0.5 rounded text-xs ${item.type === 'bug' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
              {item.type === 'bug' ? '🐛 Bug' : '💡 Idea'}
            </span>
            <span>{item.first_name} {item.last_name}</span>
            <span>·</span>
            <span>{parseDate(item.created_at).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric'
            })}</span>
            {item.page && (
              <>
                <span>·</span>
                <Link to={item.page}
                  className="font-mono text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded transition"
                  title={`Go to ${item.page}`}>
                  {item.page}
                </Link>
              </>
            )}
            {item.assigned_to && (
              <>
                <span>·</span>
                <span className="font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                  👤 {item.assigned_to}
                </span>
              </>
            )}
          </p>
          {item.note && noteId !== item.id && (
            <button onClick={() => openNote(item)}
              title="Click to edit"
              className="mt-2 block w-full text-left text-xs bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 text-amber-900 whitespace-pre-wrap hover:border-amber-300 transition">
              <span className="font-semibold">📝 Note:</span> {item.note}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => replyId === item.id ? setReplyId(null) : openReply(item.id)}
            title="Reply to member"
            className={`text-xs px-2 py-1 rounded-lg border transition font-medium
              ${replyId === item.id
                ? 'bg-green-700 text-white border-green-700'
                : 'bg-white text-green-700 border-green-300 hover:border-green-600'}`}>
            ↩ Reply
          </button>
          <button
            onClick={() => toggleThread(item.id)}
            title="Show communication thread"
            className={`text-xs px-2 py-1 rounded-lg border transition font-medium
              ${threadOpen === item.id
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-indigo-600 border-indigo-200 hover:border-indigo-500'}`}>
            💬 Thread{item.reply_count > 0 ? ` (${item.reply_count})` : ''}
          </button>
          <button
            onClick={() => noteId === item.id ? setNoteId(null) : openNote(item)}
            title="Internal board note (not shown to the member)"
            className={`text-xs px-2 py-1 rounded-lg border transition font-medium
              ${noteId === item.id
                ? 'bg-amber-500 text-white border-amber-500'
                : `bg-white border-amber-300 hover:border-amber-500 ${item.note ? 'text-amber-700' : 'text-amber-600'}`}`}>
            📝 Note{item.note ? ' ✓' : ''}
          </button>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyle(item.status)}`}>
            {statusLabel(item.status)}
          </span>
          <select
            value={item.status}
            onChange={e => setStatus(item.id, e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-600">
            {STATUSES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select
            value={item.assigned_to ?? ''}
            onChange={e => setAssigned(item.id, e.target.value)}
            title="Assign to a board member"
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-600">
            <option value="">Unassigned</option>
            {ASSIGNEES.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button onClick={() => remove(item.id)}
            className="text-gray-300 hover:text-red-400 transition text-sm">
            ✕
          </button>
        </div>
      </div>

      {/* Thread view */}
      {threadOpen === item.id && renderThread(item)}

      {/* Inline reply compose */}
      {replyId === item.id && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          {replyDone === item.id ? (
            <div className="flex items-center justify-between">
              <p className="text-xs text-green-700 font-medium">
                Message sent and logged on the ticket — {item.first_name} will see it in their inbox.
              </p>
              <button onClick={() => { setReplyDone(null); setReplyId(null) }}
                className="text-xs text-gray-400 hover:text-gray-600 ml-4">
                Close
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-1.5">
                Replying to <span className="font-medium text-gray-700">{item.first_name} {item.last_name}</span> — sent to their Messages inbox and stored on this ticket. Their reply will also be captured here.
              </p>
              <textarea
                value={replyBody}
                onChange={e => setReplyBody(e.target.value)}
                placeholder={`Write a message to ${item.first_name}…`}
                rows={3}
                className="w-full text-sm border border-gray-200 rounded-lg p-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-800 placeholder-gray-400"
              />
              {replyError && <p className="text-xs text-red-500 mt-1">{replyError}</p>}
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => setReplyId(null)}
                  className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5">
                  Cancel
                </button>
                <button
                  onClick={() => sendReply(item)}
                  disabled={!replyBody.trim() || replySending}
                  className="text-xs bg-green-700 text-white px-4 py-1.5 rounded-lg hover:bg-green-800 disabled:opacity-40 font-medium transition">
                  {replySending ? 'Sending…' : 'Send Message'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Inline internal note editor */}
      {noteId === item.id && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-1.5">Internal note — visible only to the board, not to {item.first_name}.</p>
          <textarea
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            placeholder="Add a private note about this item…"
            rows={3}
            className="w-full text-sm border border-gray-200 rounded-lg p-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-800 placeholder-gray-400"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setNoteId(null)}
              className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5">
              Cancel
            </button>
            <button onClick={() => saveNote(item)} disabled={noteSaving}
              className="text-xs bg-amber-600 text-white px-4 py-1.5 rounded-lg hover:bg-amber-700 disabled:opacity-40 font-medium transition">
              {noteSaving ? 'Saving…' : 'Save note'}
            </button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-1">
        <h2 className="text-xl font-bold text-gray-800">Site Ideas and Bugs</h2>
        <button onClick={runDigest} disabled={digestLoading}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-green-700 hover:bg-green-800 rounded-lg px-3 py-1.5 transition disabled:opacity-50 shrink-0">
          {digestLoading ? 'Analyzing…' : '✨ AI Triage Digest'}
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-5">Ideas submitted by members from the dashboard.</p>

      {/* AI triage digest */}
      {showDigest && (
        <div className="bg-white border border-green-200 rounded-xl shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">✨ Board-ready digest</h3>
            <button onClick={() => setShowDigest(false)} className="text-gray-300 hover:text-gray-500 text-sm">✕</button>
          </div>
          {digestLoading ? (
            <p className="text-sm text-gray-400 animate-pulse">Grouping and summarizing open feedback…</p>
          ) : digestError ? (
            <p className="text-sm text-red-600">{digestError}</p>
          ) : digest ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">{digest.summary}</p>
              {digest.themes.map((t, i) => {
                const pc = t.priority === 'high' ? 'bg-red-50 text-red-600'
                  : t.priority === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'
                return (
                  <div key={i} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-gray-800 text-sm">{t.title}</span>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${pc}`}>{t.priority} priority</span>
                      <span className="text-xs text-gray-400">{t.count} item{t.count !== 1 ? 's' : ''} · {t.type}</span>
                    </div>
                    <p className="text-sm text-gray-600">{t.summary}</p>
                    <p className="text-sm text-gray-700 mt-1.5"><span className="font-medium">Suggested next step:</span> {t.suggestion}</p>
                    {t.item_numbers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {t.item_numbers.map(n => (
                          <button key={n} onClick={() => setSearchText(`#${n}`)}
                            className="text-xs font-mono bg-gray-100 hover:bg-gray-200 text-gray-600 rounded px-1.5 py-0.5 transition">
                            #{n}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {digest.themes.length === 0 && <p className="text-sm text-gray-400">No open feedback to triage.</p>}
            </div>
          ) : null}
        </div>
      )}

      {/* Filters */}
      <div className="space-y-2 mb-5">
        {/* Type */}
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs font-medium text-gray-400 w-16 shrink-0">Type</span>
          {([['all', 'All Types'], ['idea', '💡 Ideas'], ['bug', '🐛 Bugs']] as const).map(([val, lbl]) => (
            <button key={val} onClick={() => setTypeFilter(val)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition border ${
                typeFilter === val ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
              {lbl}
            </button>
          ))}
          <span className="w-px h-4 bg-gray-200 mx-1" />
          <button onClick={() => setGroupByPage(g => !g)}
            title="Group reports by the page they were submitted from"
            className={`px-3 py-1 rounded-full text-xs font-medium transition border ${groupByPage ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400'}`}>
            🗂 Group by page
          </button>
        </div>

        {/* Status — multiselect */}
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs font-medium text-gray-400 w-16 shrink-0">Status</span>
          <button onClick={() => setStatusFilter(new Set<string>())} className={pillClass(statusFilter.size === 0)}>All</button>
          {STATUSES.map(s => (
            <button key={s.value} onClick={() => setStatusFilter(p => toggleSet(p, s.value))} className={pillClass(statusFilter.has(s.value))}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Assigned — multiselect */}
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs font-medium text-gray-400 w-16 shrink-0">Assigned</span>
          <button onClick={() => setAssignedFilter(new Set<string>())} className={pillClass(assignedFilter.size === 0)}>All</button>
          <button onClick={() => setAssignedFilter(p => toggleSet(p, ASSIGN_UNSET))} className={pillClass(assignedFilter.has(ASSIGN_UNSET))}>Unassigned</button>
          {assignees.map(a => (
            <button key={a} onClick={() => setAssignedFilter(p => toggleSet(p, a))} className={pillClass(assignedFilter.has(a))}>
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="relative max-w-xs mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
        </svg>
        <input value={searchText} onChange={e => setSearchText(e.target.value)}
          placeholder="Search by #number, text, or name…"
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
          No feedback yet.
        </div>
      ) : groupByPage ? (
        <div className="space-y-6">
          {grouped.map(([page, group]) => (
            <div key={page}>
              <div className="flex items-center gap-2 mb-2">
                {page === NO_PAGE
                  ? <span className="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">{page}</span>
                  : <Link to={page} className="font-mono text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded break-all transition">{page}</Link>
                }
                <span className="text-xs text-gray-400">{group.length} report{group.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-3">
                {group.map(renderItem)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(renderItem)}
        </div>
      )}
    </div>
  )
}
