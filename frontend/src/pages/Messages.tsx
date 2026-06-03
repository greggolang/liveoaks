import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { parseDate } from '../utils/dates'
import { api, MemberMessage } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

function timeAgo(ts: string) {
  const diff = Date.now() - parseDate(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return parseDate(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtReadAt(ts?: string) {
  if (!ts) return null
  return parseDate(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function fmtFull(ts: string) {
  return parseDate(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700', 'bg-sky-100 text-sky-700', 'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700', 'bg-orange-100 text-orange-700',
]
function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function nameInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase()
}

interface Member { id: string; first_name: string; last_name: string; email: string }

// A conversation: a reply chain rooted at one message, between the current user
// and one other member, with its messages in chronological order.
type Thread = {
  rootId: string
  other: { id: string; name: string }
  subject: string
  messages: MemberMessage[]
  last: MemberMessage
  unread: number
}

export default function Messages() {
  const { user } = useAuth()
  const me = user?.id
  const [inbox, setInbox] = useState<MemberMessage[]>([])
  const [sent, setSent] = useState<MemberMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null)

  // Reply (within the open thread)
  const [replyBody, setReplyBody] = useState('')
  const [replySending, setReplySending] = useState(false)
  const [replyError, setReplyError] = useState('')
  const threadEndRef = useRef<HTMLDivElement | null>(null)

  // New conversation compose
  const [composing, setComposing] = useState(false)
  const [composeRecipient, setComposeRecipient] = useState<Member | null>(null)
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [memberResults, setMemberResults] = useState<Member[]>([])
  const [searching, setSearching] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Delete conversation confirm
  const [deletingRoot, setDeletingRoot] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [i, s] = await Promise.all([api.messages.inbox(), api.messages.sent()])
      setInbox(i); setSent(s)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Build threads from inbox + sent ──
  const threads = useMemo<Thread[]>(() => {
    if (!me) return []
    const byId = new Map<string, MemberMessage>()
    for (const m of [...inbox, ...sent]) byId.set(m.id, m)

    // Walk reply_to up to the highest ancestor we still have.
    const rootOf = (m: MemberMessage) => {
      let cur = m
      const seen = new Set<string>()
      while (cur.reply_to_id && byId.has(cur.reply_to_id) && !seen.has(cur.id)) {
        seen.add(cur.id)
        cur = byId.get(cur.reply_to_id)!
      }
      return cur.id
    }

    const groups = new Map<string, MemberMessage[]>()
    for (const m of byId.values()) {
      const r = rootOf(m)
      const arr = groups.get(r) ?? []
      arr.push(m)
      groups.set(r, arr)
    }

    const other = (m: MemberMessage) =>
      m.sender_id === me ? { id: m.recipient_id, name: m.recipient_name }
                         : { id: m.sender_id, name: m.sender_name }

    const out: Thread[] = []
    for (const [rootId, msgs] of groups) {
      msgs.sort((a, b) => parseDate(a.created_at).getTime() - parseDate(b.created_at).getTime())
      const root = byId.get(rootId) ?? msgs[0]
      const last = msgs[msgs.length - 1]
      out.push({
        rootId,
        other: other(last),
        subject: root.subject,
        messages: msgs,
        last,
        unread: msgs.filter(m => m.recipient_id === me && !m.read_at).length,
      })
    }
    out.sort((a, b) => parseDate(b.last.created_at).getTime() - parseDate(a.last.created_at).getTime())
    return out
  }, [inbox, sent, me])

  const selectedThread = threads.find(t => t.rootId === selectedRoot) ?? null
  const totalUnread = threads.reduce((n, t) => n + t.unread, 0)

  // Scroll the thread to the newest message when it opens or grows.
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'end' })
  }, [selectedRoot, selectedThread?.messages.length])

  async function openThread(t: Thread) {
    setSelectedRoot(t.rootId)
    setReplyBody(''); setReplyError('')
    const unread = t.messages.filter(m => m.recipient_id === me && !m.read_at)
    if (unread.length) {
      // get() marks each as read server-side; update local state optimistically.
      await Promise.all(unread.map(m => api.messages.get(m.id).catch(() => {})))
      const now = new Date().toISOString()
      const ids = new Set(unread.map(m => m.id))
      setInbox(prev => prev.map(m => ids.has(m.id) ? { ...m, read_at: now } : m))
    }
  }

  async function sendReply() {
    if (!selectedThread || !replyBody.trim()) return
    setReplySending(true); setReplyError('')
    try {
      const subject = selectedThread.subject.startsWith('Re:')
        ? selectedThread.subject : `Re: ${selectedThread.subject}`
      await api.messages.send({
        recipient_id: selectedThread.other.id,
        subject,
        body: replyBody.trim(),
        reply_to: selectedThread.last.id,
      })
      setReplyBody('')
      await load()
    } catch (e: any) {
      setReplyError(e.message || 'Could not send reply.')
    } finally { setReplySending(false) }
  }

  // Debounced member search for new conversations
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current)
    if (memberSearch.length < 2) { setMemberResults([]); return }
    searchRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await api.friends.searchMembers(memberSearch) as Member[]
        setMemberResults(results.filter(m => m.id !== me))
      } finally { setSearching(false) }
    }, 300)
    return () => { if (searchRef.current) clearTimeout(searchRef.current) }
  }, [memberSearch, me])

  function startCompose() {
    setComposing(true)
    setComposeRecipient(null); setMemberSearch(''); setMemberResults([])
    setComposeSubject(''); setComposeBody(''); setSendError('')
  }
  function closeCompose() {
    setComposing(false); setComposeRecipient(null); setMemberSearch('')
    setMemberResults([]); setComposeSubject(''); setComposeBody(''); setSendError('')
  }

  async function handleSendNew() {
    if (!composeRecipient || !composeBody.trim()) {
      setSendError('Recipient and message are required.'); return
    }
    setSending(true); setSendError('')
    try {
      const created = await api.messages.send({
        recipient_id: composeRecipient.id,
        subject: composeSubject.trim() || '(no subject)',
        body: composeBody.trim(),
      })
      closeCompose()
      await load()
      if (created?.id) setSelectedRoot(created.id)
    } catch (e: any) {
      setSendError(e.message || 'Could not send message.')
    } finally { setSending(false) }
  }

  async function handleDeleteThread() {
    const t = threads.find(x => x.rootId === deletingRoot)
    if (!t) { setDeletingRoot(null); return }
    await Promise.all(t.messages.map(m => api.messages.delete(m.id).catch(() => {})))
    setDeletingRoot(null)
    if (selectedRoot === t.rootId) setSelectedRoot(null)
    await load()
  }

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-110px)]">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 leading-none">Messages</h1>
          <p className="text-sm text-gray-500 mt-1">Conversations with other members</p>
        </div>
        <button onClick={startCompose}
          className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition flex items-center gap-2 shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden sm:inline">New Message</span>
        </button>
      </div>

      <div className="flex flex-1 gap-4 min-h-0">

        {/* ── Conversation list ── */}
        <div className={`flex flex-col rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-sm
          ${selectedThread ? 'hidden lg:flex lg:w-80 shrink-0' : 'flex-1'}`}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">
              Conversations{totalUnread > 0 && <span className="ml-1.5 text-green-700">· {totalUnread} unread</span>}
            </span>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : threads.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm gap-2 px-6 text-center">
              <svg className="w-10 h-10 opacity-15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 3v-3z" />
              </svg>
              No conversations yet. Start one with “New Message”.
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {threads.map(t => {
                const active = t.rootId === selectedRoot
                return (
                  <button key={t.rootId} onClick={() => openThread(t)}
                    className={`w-full text-left px-4 py-3 transition flex items-start gap-3
                      ${active ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                    <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${avatarColor(t.other.name)}`}>
                      {nameInitials(t.other.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm truncate ${t.unread ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                          {t.other.name}
                        </span>
                        <span className="text-[11px] text-gray-400 shrink-0">{timeAgo(t.last.created_at)}</span>
                      </div>
                      <div className="text-xs text-gray-500 truncate mt-0.5">{t.subject || '(no subject)'}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {t.unread > 0 && <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />}
                        <span className={`text-xs truncate ${t.unread ? 'text-gray-700' : 'text-gray-400'}`}>
                          {t.last.sender_id === me ? 'You: ' : ''}{t.last.body.slice(0, 50)}{t.last.body.length > 50 ? '…' : ''}
                        </span>
                      </div>
                    </div>
                    {t.messages.length > 1 && (
                      <span className="text-[10px] text-gray-300 shrink-0 mt-0.5">{t.messages.length}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Thread view ── */}
        {selectedThread ? (
          <div className="flex-1 flex flex-col rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-sm min-h-0">
            {/* Thread header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
              <button onClick={() => setSelectedRoot(null)}
                className="lg:hidden p-1 -ml-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${avatarColor(selectedThread.other.name)}`}>
                {nameInitials(selectedThread.other.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{selectedThread.other.name}</p>
                <p className="text-xs text-gray-400 truncate">{selectedThread.subject || '(no subject)'}</p>
              </div>
              <button onClick={() => setDeletingRoot(selectedThread.rootId)} title="Delete conversation"
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>

            {/* Messages in order */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50/40">
              {selectedThread.messages.map(m => {
                const mine = m.sender_id === me
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${
                      mine ? 'bg-green-700 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'}`}>
                      <div className="text-sm whitespace-pre-wrap leading-relaxed break-words">{m.body}</div>
                      <div className={`text-[10px] mt-1 flex items-center gap-1 ${mine ? 'text-green-100/80 justify-end' : 'text-gray-400'}`}>
                        {fmtFull(m.created_at)}
                        {mine && (m.read_at
                          ? <span title={`Read ${fmtReadAt(m.read_at)}`}>· Read</span>
                          : <span>· Sent</span>)}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={threadEndRef} />
            </div>

            {/* Reply box */}
            <div className="px-4 py-3 border-t border-gray-100 bg-white">
              {replyError && <p className="text-xs text-red-600 mb-1.5">{replyError}</p>}
              <div className="flex items-end gap-2">
                <textarea value={replyBody} onChange={e => setReplyBody(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply() } }}
                  placeholder={`Reply to ${selectedThread.other.name.split(' ')[0]}…`}
                  rows={1}
                  className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none max-h-32" />
                <button onClick={sendReply} disabled={replySending || !replyBody.trim()}
                  className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition disabled:opacity-50 shrink-0">
                  {replySending ? '…' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="hidden lg:flex flex-1 items-center justify-center rounded-2xl border border-dashed border-gray-300 text-gray-400 text-sm">
            Select a conversation to read it
          </div>
        )}
      </div>

      {/* ── New conversation modal ── */}
      {composing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h3 className="font-semibold text-gray-800">New Message</h3>
              <button onClick={closeCompose} className="text-gray-400 hover:text-gray-600 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
              <div className="relative">
                <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                {composeRecipient ? (
                  <div className="flex items-center gap-2 border border-green-400 rounded-xl px-3 py-2 bg-green-50">
                    <span className="text-sm font-medium text-green-800 flex-1">
                      {composeRecipient.first_name} {composeRecipient.last_name}
                    </span>
                    <button onClick={() => { setComposeRecipient(null); setMemberSearch('') }}
                      className="text-green-600 hover:text-green-800 transition">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                      placeholder="Search member by name or email…"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    {(memberResults.length > 0 || searching) && (
                      <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {searching ? (
                          <p className="px-4 py-3 text-sm text-gray-400">Searching…</p>
                        ) : memberResults.map(m => (
                          <button key={m.id} onClick={() => {
                            setComposeRecipient(m); setMemberSearch(`${m.first_name} ${m.last_name}`); setMemberResults([])
                          }}
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition border-b border-gray-100 last:border-0">
                            <div className="text-sm font-medium text-gray-800">{m.first_name} {m.last_name}</div>
                            <div className="text-xs text-gray-400">{m.email}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
                <input value={composeSubject} onChange={e => setComposeSubject(e.target.value)} placeholder="(no subject)"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
                <textarea value={composeBody} onChange={e => setComposeBody(e.target.value)} placeholder="Write your message…"
                  rows={6} spellCheck
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
              </div>

              {sendError && <p className="text-sm text-red-600">{sendError}</p>}
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 shrink-0">
              <button onClick={closeCompose}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">Cancel</button>
              <button onClick={handleSendNew} disabled={sending || !composeRecipient || !composeBody.trim()}
                className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-5 py-2 rounded-xl transition disabled:opacity-50 flex items-center gap-2">
                {sending
                  ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Sending…</>
                  : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>Send</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete conversation confirm ── */}
      {deletingRoot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDeletingRoot(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete conversation?</h3>
            <p className="text-sm text-gray-500 mb-5">
              This removes the whole conversation from your view. The other member keeps their copy.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletingRoot(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition">Cancel</button>
              <button onClick={handleDeleteThread}
                className="px-5 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
