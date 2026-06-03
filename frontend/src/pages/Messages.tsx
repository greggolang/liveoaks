import { useEffect, useState, useCallback, useRef } from 'react'
import { parseDate } from '../utils/dates'
import { api, MemberMessage } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import MailInbox from './MailInbox'

const USTA_RATINGS = ['2.5', '3.0', '3.5', '4.0', '4.5', '5.0']

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtReadAt(ts?: string) {
  if (!ts) return null
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

interface Member { id: string; first_name: string; last_name: string; email: string }

export default function Messages() {
  const { user } = useAuth()
  const [mailAccount, setMailAccount] = useState<{ address: string } | null | undefined>(undefined)
  const [mainTab, setMainTab] = useState<'messages' | 'email'>('messages')
  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox')
  const [inbox, setInbox] = useState<MemberMessage[]>([])
  const [sent, setSent] = useState<MemberMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<MemberMessage | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Compose
  const [composing, setComposing] = useState(false)
  const [replyTo, setReplyTo] = useState<MemberMessage | null>(null)
  const [composeRecipient, setComposeRecipient] = useState<Member | null>(null)
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [memberResults, setMemberResults] = useState<Member[]>([])
  const [searching, setSearching] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sendSuccess, setSendSuccess] = useState(false)

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [i, s] = await Promise.all([api.messages.inbox(), api.messages.sent()])
      setInbox(i)
      setSent(s)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.mail.myAccount().then(d => setMailAccount(d ?? null)).catch(() => setMailAccount(null))
  }, [])

  // Debounced member search
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current)
    if (memberSearch.length < 2) { setMemberResults([]); return }
    searchRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await api.friends.searchMembers(memberSearch) as Member[]
        // Exclude self
        setMemberResults(results.filter(m => m.id !== user?.id))
      } finally { setSearching(false) }
    }, 300)
    return () => { if (searchRef.current) clearTimeout(searchRef.current) }
  }, [memberSearch, user?.id])

  const openMessage = async (msg: MemberMessage) => {
    if (selected?.id === msg.id) return
    setDetailLoading(true)
    try {
      const full = await api.messages.get(msg.id)
      setSelected(full)
      // Update unread state locally
      if (tab === 'inbox') {
        setInbox(prev => prev.map(m => m.id === msg.id ? { ...m, read_at: full.read_at } : m))
      }
    } finally { setDetailLoading(false) }
  }

  const startCompose = (prefillRecipient?: Member, prefillReply?: MemberMessage) => {
    setComposing(true)
    setReplyTo(prefillReply ?? null)
    setComposeRecipient(prefillRecipient ?? null)
    setMemberSearch(prefillRecipient ? `${prefillRecipient.first_name} ${prefillRecipient.last_name}` : '')
    setMemberResults([])
    setComposeSubject(prefillReply ? (prefillReply.subject.startsWith('Re:') ? prefillReply.subject : `Re: ${prefillReply.subject}`) : '')
    setComposeBody('')
    setSendError('')
    setSendSuccess(false)
  }

  const closeCompose = () => {
    setComposing(false); setReplyTo(null); setComposeRecipient(null)
    setMemberSearch(''); setMemberResults([])
    setComposeSubject(''); setComposeBody('')
    setSendError(''); setSendSuccess(false)
  }

  const handleSend = async () => {
    if (!composeRecipient || !composeBody.trim()) {
      setSendError('Recipient and message are required.')
      return
    }
    setSending(true); setSendError('')
    try {
      await api.messages.send({
        recipient_id: composeRecipient.id,
        subject: composeSubject.trim() || '(no subject)',
        body: composeBody.trim(),
        reply_to: replyTo?.id,
      })
      setSendSuccess(true)
      load()
      setTimeout(closeCompose, 1200)
    } catch (e: any) {
      setSendError(e.message || 'Could not send message.')
    } finally { setSending(false) }
  }

  const handleDelete = async (id: string) => {
    await api.messages.delete(id)
    setDeletingId(null)
    if (selected?.id === id) setSelected(null)
    load()
  }

  const handleMarkAllRead = async () => {
    await api.messages.markAllRead()
    load()
  }

  const messages = tab === 'inbox' ? inbox : sent
  const unreadCount = inbox.filter(m => !m.read_at).length

  return (
    <div className="max-w-5xl">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Mail</h1>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        <button
          onClick={() => setMainTab('messages')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
            mainTab === 'messages' ? 'border-green-700 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>
          Member Messages
          {unreadCount > 0 && mainTab !== 'messages' && (
            <span className="ml-1.5 px-1.5 py-0.5 bg-green-700 text-white text-xs rounded-full">{unreadCount}</span>
          )}
        </button>
        {mailAccount && (
          <button
            onClick={() => setMainTab('email')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              mainTab === 'email' ? 'border-green-700 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            Email
            <span className="ml-1.5 text-[10px] text-gray-400 font-mono">{mailAccount.address}</span>
          </button>
        )}
      </div>

      {mainTab === 'email' && mailAccount ? <MailInbox /> : (
      <>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-sm text-gray-500">Direct messages with other members</p>
        </div>
        <button onClick={() => startCompose()}
          className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Compose
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* ── Message list ── */}
        <div className="lg:col-span-2">
          {/* Tabs */}
          <div className="flex items-center gap-1 mb-3">
            <button onClick={() => setTab('inbox')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition
                ${tab === 'inbox' ? 'bg-green-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              Inbox
              {unreadCount > 0 && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${tab === 'inbox' ? 'bg-white text-green-700' : 'bg-green-700 text-white'}`}>
                  {unreadCount}
                </span>
              )}
            </button>
            <button onClick={() => setTab('sent')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition
                ${tab === 'sent' ? 'bg-green-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              Sent
            </button>
            {tab === 'inbox' && unreadCount > 0 && (
              <button onClick={handleMarkAllRead}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition">
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            {loading ? (
              <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
            ) : messages.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                {tab === 'inbox' ? 'No messages yet.' : 'You haven\'t sent any messages.'}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {messages.map(m => {
                  const isUnread = tab === 'inbox' && !m.read_at
                  const isSelected = selected?.id === m.id
                  const other = tab === 'inbox' ? m.sender_name : m.recipient_name
                  return (
                    <button key={m.id} onClick={() => openMessage(m)}
                      className={`w-full text-left px-4 py-3.5 transition ${isSelected ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {isUnread && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0 mt-1" />}
                          <div className="min-w-0">
                            <div className={`text-sm truncate ${isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                              {other}
                            </div>
                            <div className={`text-xs truncate mt-0.5 ${isUnread ? 'text-gray-700' : 'text-gray-400'}`}>
                              {m.subject}
                            </div>
                            <div className="text-xs text-gray-400 truncate mt-0.5">
                              {m.body.slice(0, 60)}{m.body.length > 60 ? '…' : ''}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-gray-400 shrink-0 mt-0.5">{timeAgo(m.created_at)}</div>
                      </div>
                      {/* Read receipt for sent messages */}
                      {tab === 'sent' && (
                        <div className={`text-xs mt-1.5 flex items-center gap-1 ${m.read_at ? 'text-green-600' : 'text-gray-400'}`}>
                          {m.read_at
                            ? <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Read {fmtReadAt(m.read_at)}</>
                            : <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" /></svg>Unread</>}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Message detail / empty state ── */}
        <div className="lg:col-span-3">
          {!selected ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-2xl h-64 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
              <svg className="w-8 h-8 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Select a message to read it
            </div>
          ) : detailLoading ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center text-gray-400 text-sm">Loading…</div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              {/* Message header */}
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-gray-800 text-base">{selected.subject}</h2>
                    <div className="text-sm text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                      <span>
                        {tab === 'inbox'
                          ? <><span className="text-gray-400">From</span> <span className="font-medium text-gray-700">{selected.sender_name}</span></>
                          : <><span className="text-gray-400">To</span> <span className="font-medium text-gray-700">{selected.recipient_name}</span></>}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span className="text-gray-400">{parseDate(selected.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    </div>
                    {/* Read receipt in detail view */}
                    {tab === 'sent' && (
                      <div className={`text-xs mt-1.5 flex items-center gap-1 ${selected.read_at ? 'text-green-600' : 'text-gray-400'}`}>
                        {selected.read_at
                          ? <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Read on {fmtReadAt(selected.read_at)}</>
                          : <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" /></svg>Not yet read</>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => {
                      const other: Member = tab === 'inbox'
                        ? { id: selected.sender_id, first_name: selected.sender_name.split(' ')[0], last_name: selected.sender_name.split(' ').slice(1).join(' '), email: '' }
                        : { id: selected.recipient_id, first_name: selected.recipient_name.split(' ')[0], last_name: selected.recipient_name.split(' ').slice(1).join(' '), email: '' }
                      startCompose(other, selected)
                    }}
                      className="text-sm text-green-700 hover:bg-green-50 font-medium px-3 py-1.5 rounded-lg transition flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                      Reply
                    </button>
                    {deletingId === selected.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500">Delete?</span>
                        <button onClick={() => handleDelete(selected.id)}
                          className="text-xs text-red-600 font-medium hover:underline">Yes</button>
                        <button onClick={() => setDeletingId(null)}
                          className="text-xs text-gray-400 hover:text-gray-600">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeletingId(selected.id)}
                        className="text-gray-400 hover:text-red-500 transition p-1.5 rounded-lg hover:bg-red-50">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Replied-to context */}
                {selected.reply_to_id && selected.reply_to_subject && (
                  <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500">
                    <span className="font-medium text-gray-600">↩ Re: </span>
                    {selected.reply_to_subject}
                    {selected.reply_to_sender_name && (
                      <span className="text-gray-400"> — from {selected.reply_to_sender_name}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="px-5 py-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed min-h-32">
                {selected.body}
              </div>

              {/* Quick reply bar */}
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                <button onClick={() => {
                  const other: Member = tab === 'inbox'
                    ? { id: selected.sender_id, first_name: selected.sender_name.split(' ')[0], last_name: selected.sender_name.split(' ').slice(1).join(' '), email: '' }
                    : { id: selected.recipient_id, first_name: selected.recipient_name.split(' ')[0], last_name: selected.recipient_name.split(' ').slice(1).join(' '), email: '' }
                  startCompose(other, selected)
                }}
                  className="w-full text-left border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-400 bg-white hover:border-green-400 hover:text-gray-600 transition cursor-text">
                  Reply to {tab === 'inbox' ? selected.sender_name.split(' ')[0] : selected.recipient_name.split(' ')[0]}…
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Compose modal ── */}
      {composing && mainTab === 'messages' && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h3 className="font-semibold text-gray-800">
                {replyTo ? `Reply to ${replyTo.sender_name.split(' ')[0]}` : 'New Message'}
              </h3>
              <button onClick={closeCompose} className="text-gray-400 hover:text-gray-600 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
              {/* Replied-to pill */}
              {replyTo && (
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                  Replying to: <span className="font-medium text-gray-700">{replyTo.subject}</span>
                </div>
              )}

              {/* To field */}
              <div className="relative">
                <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                {composeRecipient ? (
                  <div className="flex items-center gap-2 border border-green-400 rounded-xl px-3 py-2 bg-green-50">
                    <span className="text-sm font-medium text-green-800 flex-1">
                      {composeRecipient.first_name} {composeRecipient.last_name}
                    </span>
                    {!replyTo && (
                      <button onClick={() => { setComposeRecipient(null); setMemberSearch('') }}
                        className="text-green-600 hover:text-green-800 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <input value={memberSearch}
                      onChange={e => setMemberSearch(e.target.value)}
                      placeholder="Search member by name or email…"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    {(memberResults.length > 0 || searching) && (
                      <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {searching ? (
                          <p className="px-4 py-3 text-sm text-gray-400">Searching…</p>
                        ) : memberResults.map(m => (
                          <button key={m.id} onClick={() => {
                            setComposeRecipient(m)
                            setMemberSearch(`${m.first_name} ${m.last_name}`)
                            setMemberResults([])
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

              {/* Subject */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
                <input value={composeSubject}
                  onChange={e => setComposeSubject(e.target.value)}
                  placeholder="(no subject)"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
                <textarea value={composeBody}
                  onChange={e => setComposeBody(e.target.value)}
                  placeholder="Write your message…"
                  rows={6}
                  spellCheck={true}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
              </div>

              {sendError && <p className="text-sm text-red-600">{sendError}</p>}
              {sendSuccess && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Message sent!
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 shrink-0">
              <button onClick={closeCompose}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                Cancel
              </button>
              <button onClick={handleSend} disabled={sending || !composeRecipient || !composeBody.trim()}
                className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-5 py-2 rounded-xl transition disabled:opacity-50 flex items-center gap-2">
                {sending
                  ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Sending…</>
                  : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>Send</>}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  )
}
