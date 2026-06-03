import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { parseDate } from '../utils/dates'
import { api, MemberMessage, ConvSummary, ConvDetail } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

function timeAgo(ts: string | null) {
  if (!ts) return ''
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
  return parseDate(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function fmtFull(ts: string) {
  return parseDate(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function sortTime(ts: string | null) { return ts ? parseDate(ts).getTime() : 0 }

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

type DMItem = {
  kind: 'dm'; key: string; otherId: string; name: string
  messages: MemberMessage[]; lastBody: string; lastFromMe: boolean; lastAt: string; unread: number
}
type GroupItem = {
  kind: 'group'; key: string; convId: string; name: string
  lastBody: string | null; lastSender: string | null; lastAt: string | null; unread: number; memberCount: number
}
type ChatItem = DMItem | GroupItem

export default function Messages() {
  const { user } = useAuth()
  const me = user?.id
  const [inbox, setInbox] = useState<MemberMessage[]>([])
  const [sent, setSent] = useState<MemberMessage[]>([])
  const [groups, setGroups] = useState<ConvSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [groupDetail, setGroupDetail] = useState<ConvDetail | null>(null)
  const [groupLoading, setGroupLoading] = useState(false)

  const [replyBody, setReplyBody] = useState('')
  const [replySending, setReplySending] = useState(false)
  const [replyError, setReplyError] = useState('')
  const threadEndRef = useRef<HTMLDivElement | null>(null)

  // Compose
  const [composing, setComposing] = useState(false)
  const [recipients, setRecipients] = useState<Member[]>([])
  const [composeTitle, setComposeTitle] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [memberResults, setMemberResults] = useState<Member[]>([])
  const [searching, setSearching] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [deletingKey, setDeletingKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [i, s, g] = await Promise.all([api.messages.inbox(), api.messages.sent(), api.conversations.list()])
      setInbox(i); setSent(s); setGroups(g)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Build the unified chat list: one DM per other person + every group.
  const chats = useMemo<ChatItem[]>(() => {
    if (!me) return []
    const other = (m: MemberMessage) =>
      m.sender_id === me ? { id: m.recipient_id, name: m.recipient_name } : { id: m.sender_id, name: m.sender_name }

    const byOther = new Map<string, MemberMessage[]>()
    const seen = new Set<string>()
    for (const m of [...inbox, ...sent]) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      const o = other(m)
      const arr = byOther.get(o.id) ?? []
      arr.push(m); byOther.set(o.id, arr)
    }

    const dms: DMItem[] = []
    for (const [otherId, msgs] of byOther) {
      msgs.sort((a, b) => sortTime(a.created_at) - sortTime(b.created_at))
      const last = msgs[msgs.length - 1]
      dms.push({
        kind: 'dm', key: 'dm:' + otherId, otherId, name: other(last).name,
        messages: msgs, lastBody: last.body, lastFromMe: last.sender_id === me,
        lastAt: last.created_at, unread: msgs.filter(m => m.recipient_id === me && !m.read_at).length,
      })
    }

    const grp: GroupItem[] = groups.map(g => ({
      kind: 'group', key: 'grp:' + g.id, convId: g.id,
      name: g.title || g.participants || 'Group', lastBody: g.last_body,
      lastSender: g.last_sender_name, lastAt: g.last_at, unread: g.unread, memberCount: g.member_count,
    }))

    return [...dms, ...grp].sort((a, b) => sortTime(b.lastAt) - sortTime(a.lastAt))
  }, [inbox, sent, groups, me])

  const selected = chats.find(c => c.key === selectedKey) ?? null
  const totalUnread = chats.reduce((n, c) => n + c.unread, 0)

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'end' })
  }, [selectedKey, groupDetail?.messages.length, selected?.kind === 'dm' ? selected.messages.length : 0])

  async function openChat(item: ChatItem) {
    setSelectedKey(item.key)
    setReplyBody(''); setReplyError('')
    if (item.kind === 'dm') {
      setGroupDetail(null)
      const unread = item.messages.filter(m => m.recipient_id === me && !m.read_at)
      if (unread.length) {
        await Promise.all(unread.map(m => api.messages.get(m.id).catch(() => {})))
        const now = new Date().toISOString()
        const ids = new Set(unread.map(m => m.id))
        setInbox(prev => prev.map(m => ids.has(m.id) ? { ...m, read_at: now } : m))
      }
    } else {
      setGroupDetail(null); setGroupLoading(true)
      try {
        const detail = await api.conversations.get(item.convId)
        setGroupDetail(detail)
        setGroups(prev => prev.map(g => g.id === item.convId ? { ...g, unread: 0 } : g))
      } catch { /* ignore */ }
      finally { setGroupLoading(false) }
    }
  }

  async function sendReply() {
    if (!selected || !replyBody.trim()) return
    setReplySending(true); setReplyError('')
    try {
      if (selected.kind === 'dm') {
        await api.messages.send({ recipient_id: selected.otherId, subject: 'Member message', body: replyBody.trim() })
        setReplyBody(''); await load()
      } else {
        await api.conversations.send(selected.convId, replyBody.trim())
        setReplyBody('')
        const detail = await api.conversations.get(selected.convId).catch(() => null)
        if (detail) setGroupDetail(detail)
        await load()
      }
    } catch (e: any) {
      setReplyError(e.message || 'Could not send message.')
    } finally { setReplySending(false) }
  }

  // Member search
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current)
    if (memberSearch.length < 2) { setMemberResults([]); return }
    searchRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await api.friends.searchMembers(memberSearch) as Member[]
        const taken = new Set([me, ...recipients.map(r => r.id)])
        setMemberResults(results.filter(m => !taken.has(m.id)))
      } finally { setSearching(false) }
    }, 300)
    return () => { if (searchRef.current) clearTimeout(searchRef.current) }
  }, [memberSearch, me, recipients])

  function startCompose() {
    setComposing(true)
    setRecipients([]); setMemberSearch(''); setMemberResults([])
    setComposeTitle(''); setComposeBody(''); setSendError('')
  }
  function closeCompose() {
    setComposing(false); setRecipients([]); setMemberSearch(''); setMemberResults([])
    setComposeTitle(''); setComposeBody(''); setSendError('')
  }

  async function handleSendNew() {
    if (recipients.length === 0 || !composeBody.trim()) {
      setSendError('Pick at least one member and write a message.'); return
    }
    setSending(true); setSendError('')
    try {
      if (recipients.length === 1) {
        await api.messages.send({ recipient_id: recipients[0].id, subject: 'Member message', body: composeBody.trim() })
        closeCompose(); await load(); setSelectedKey('dm:' + recipients[0].id)
      } else {
        const res = await api.conversations.create({
          title: composeTitle.trim() || undefined,
          participant_ids: recipients.map(r => r.id),
          body: composeBody.trim(),
        })
        closeCompose(); await load()
        const key = 'grp:' + res.id
        setSelectedKey(key)
        const detail = await api.conversations.get(res.id).catch(() => null)
        if (detail) setGroupDetail(detail)
      }
    } catch (e: any) {
      setSendError(e.message || 'Could not send message.')
    } finally { setSending(false) }
  }

  async function handleDelete() {
    const item = chats.find(c => c.key === deletingKey)
    if (!item) { setDeletingKey(null); return }
    if (item.kind === 'dm') {
      await Promise.all(item.messages.map(m => api.messages.delete(m.id).catch(() => {})))
    } else {
      await api.conversations.leave(item.convId).catch(() => {})
    }
    setDeletingKey(null)
    if (selectedKey === item.key) { setSelectedKey(null); setGroupDetail(null) }
    await load()
  }

  // Bubbles for the open conversation (DM messages, or group detail messages).
  const bubbles = selected?.kind === 'dm'
    ? selected.messages.map(m => ({ id: m.id, mine: m.sender_id === me, sender: m.sender_name, body: m.body, at: m.created_at, read: m.read_at }))
    : (groupDetail?.messages ?? []).map(m => ({ id: m.id, mine: m.sender_id === me, sender: m.sender_name, body: m.body, at: m.created_at, read: undefined as string | undefined }))

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-110px)]">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 leading-none">Messages</h1>
          <p className="text-sm text-gray-500 mt-1">Direct & group messages with members</p>
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

        {/* ── Chat list ── */}
        <div className={`flex flex-col rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-sm
          ${selected ? 'hidden lg:flex lg:w-80 shrink-0' : 'flex-1'}`}>
          <div className="px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-700">
              Conversations{totalUnread > 0 && <span className="ml-1.5 text-green-700">· {totalUnread} unread</span>}
            </span>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : chats.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm gap-2 px-6 text-center">
              No conversations yet. Start one with “New Message”.
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {chats.map(c => {
                const active = c.key === selectedKey
                const isGroup = c.kind === 'group'
                const preview = isGroup
                  ? (c.lastBody ? `${c.lastSender ? c.lastSender.split(' ')[0] + ': ' : ''}${c.lastBody}` : 'No messages yet')
                  : `${c.lastFromMe ? 'You: ' : ''}${c.lastBody}`
                return (
                  <button key={c.key} onClick={() => openChat(c)}
                    className={`w-full text-left px-4 py-3 transition flex items-start gap-3 ${active ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                    <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${isGroup ? 'bg-indigo-100 text-indigo-700' : avatarColor(c.name)}`}>
                      {isGroup ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      ) : nameInitials(c.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm truncate ${c.unread ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                          {c.name}{isGroup && <span className="text-gray-400 font-normal"> · {c.memberCount}</span>}
                        </span>
                        <span className="text-[11px] text-gray-400 shrink-0">{timeAgo(c.lastAt)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {c.unread > 0 && <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />}
                        <span className={`text-xs truncate ${c.unread ? 'text-gray-700' : 'text-gray-400'}`}>
                          {(preview ?? '').slice(0, 56)}{(preview ?? '').length > 56 ? '…' : ''}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Conversation view ── */}
        {selected ? (
          <div className="flex-1 flex flex-col rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-sm min-h-0">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
              <button onClick={() => { setSelectedKey(null); setGroupDetail(null) }}
                className="lg:hidden p-1 -ml-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${selected.kind === 'group' ? 'bg-indigo-100 text-indigo-700' : avatarColor(selected.name)}`}>
                {selected.kind === 'group' ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ) : nameInitials(selected.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{selected.name}</p>
                {selected.kind === 'group' && groupDetail && (
                  <p className="text-xs text-gray-400 truncate">{groupDetail.participants.map(p => p.name.split(' ')[0]).join(', ')}</p>
                )}
              </div>
              <button onClick={() => setDeletingKey(selected.key)} title={selected.kind === 'group' ? 'Leave conversation' : 'Delete conversation'}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50/40">
              {groupLoading ? (
                <div className="h-full flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : bubbles.map(b => (
                <div key={b.id} className={`flex ${b.mine ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[78%]">
                    {selected.kind === 'group' && !b.mine && (
                      <p className="text-[11px] text-gray-500 font-medium mb-0.5 ml-1">{b.sender}</p>
                    )}
                    <div className={`rounded-2xl px-4 py-2.5 ${b.mine ? 'bg-green-700 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'}`}>
                      <div className="text-sm whitespace-pre-wrap leading-relaxed break-words">{b.body}</div>
                      <div className={`text-[10px] mt-1 flex items-center gap-1 ${b.mine ? 'text-green-100/80 justify-end' : 'text-gray-400'}`}>
                        {fmtFull(b.at)}
                        {b.mine && selected.kind === 'dm' && (b.read
                          ? <span title={`Read ${fmtReadAt(b.read)}`}>· Read</span>
                          : <span>· Sent</span>)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={threadEndRef} />
            </div>

            {/* Reply box */}
            <div className="px-4 py-3 border-t border-gray-100 bg-white">
              {replyError && <p className="text-xs text-red-600 mb-1.5">{replyError}</p>}
              <div className="flex items-end gap-2">
                <textarea value={replyBody} onChange={e => setReplyBody(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                  placeholder={`Message ${selected.kind === 'group' ? 'the group' : selected.name.split(' ')[0]}…`}
                  rows={1}
                  className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none max-h-32" />
                <button onClick={sendReply} disabled={replySending || !replyBody.trim()}
                  className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition disabled:opacity-50 shrink-0">
                  {replySending ? '…' : 'Send'}
                </button>
              </div>
              <p className="text-[10px] text-gray-300 mt-1">Enter to send · Shift+Enter for a new line</p>
            </div>
          </div>
        ) : (
          <div className="hidden lg:flex flex-1 items-center justify-center rounded-2xl border border-dashed border-gray-300 text-gray-400 text-sm">
            Select a conversation to read it
          </div>
        )}
      </div>

      {/* ── New message modal ── */}
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
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  To {recipients.length > 1 && <span className="text-gray-400">· group of {recipients.length}</span>}
                </label>
                <div className="flex flex-wrap gap-1.5 border border-gray-300 rounded-xl px-2 py-1.5 min-h-[42px]">
                  {recipients.map(r => (
                    <span key={r.id} className="flex items-center gap-1 bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-lg">
                      {r.first_name} {r.last_name}
                      <button onClick={() => setRecipients(rs => rs.filter(x => x.id !== r.id))} className="hover:text-red-600">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </span>
                  ))}
                  <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                    placeholder={recipients.length ? 'Add another…' : 'Search members…'}
                    className="flex-1 min-w-[120px] outline-none text-sm bg-transparent py-0.5" />
                </div>
                {(memberResults.length > 0 || searching) && (
                  <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {searching ? (
                      <p className="px-4 py-3 text-sm text-gray-400">Searching…</p>
                    ) : memberResults.map(m => (
                      <button key={m.id} onClick={() => { setRecipients(rs => [...rs, m]); setMemberSearch(''); setMemberResults([]) }}
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition border-b border-gray-100 last:border-0">
                        <div className="text-sm font-medium text-gray-800">{m.first_name} {m.last_name}</div>
                        <div className="text-xs text-gray-400">{m.email}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {recipients.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Group name <span className="text-gray-400">(optional)</span></label>
                  <input value={composeTitle} onChange={e => setComposeTitle(e.target.value)} placeholder="e.g. Tennis Committee"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
                <textarea value={composeBody} onChange={e => setComposeBody(e.target.value)} placeholder="Write your message…"
                  rows={5} spellCheck
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
              </div>

              {sendError && <p className="text-sm text-red-600">{sendError}</p>}
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 shrink-0">
              <button onClick={closeCompose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">Cancel</button>
              <button onClick={handleSendNew} disabled={sending || recipients.length === 0 || !composeBody.trim()}
                className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-5 py-2 rounded-xl transition disabled:opacity-50 flex items-center gap-2">
                {sending ? 'Sending…' : recipients.length > 1 ? 'Create group' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete / leave confirm ── */}
      {deletingKey && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDeletingKey(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              {deletingKey.startsWith('grp:') ? 'Leave conversation?' : 'Delete conversation?'}
            </h3>
            <p className="text-sm text-gray-500 mb-5">
              {deletingKey.startsWith('grp:')
                ? 'It disappears from your list. A new message in the group brings it back.'
                : 'This removes the whole conversation from your view. The other member keeps their copy.'}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletingKey(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition">Cancel</button>
              <button onClick={handleDelete} className="px-5 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition">
                {deletingKey.startsWith('grp:') ? 'Leave' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
