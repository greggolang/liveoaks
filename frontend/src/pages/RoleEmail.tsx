import { useEffect, useState, useRef } from 'react'
import { api, EmailThread, EmailThreadDetail, EmailMessage } from '../api/client'

type View = 'inbox' | 'sent' | 'trash'
type ComposeMode = null | 'new' | 'reply'

const VIEW_LABEL: Record<View, string> = { inbox: 'INBOX', sent: 'SENT', trash: 'TRASH' }

export default function RoleEmail() {
  const [threads, setThreads] = useState<EmailThread[]>([])
  const [nextPage, setNextPage] = useState<string | null>(null)
  const [mailbox, setMailbox] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<View>('inbox')
  const [search, setSearch] = useState('')
  const [activeThread, setActiveThread] = useState<EmailThreadDetail | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [compose, setCompose] = useState<ComposeMode>(null)
  const [composeData, setComposeData] = useState({ to: '', subject: '', body: '' })
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [replyTo, setReplyTo] = useState<EmailMessage | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async (label: View, q = '', pageToken = '') => {
    setLoading(true); setError('')
    try {
      const res = await api.google.email.listThreads({ label: VIEW_LABEL[label], q: q || undefined, pageToken: pageToken || undefined })
      setThreads(prev => pageToken ? [...prev, ...res.threads] : res.threads)
      setNextPage(res.next_page_token || null)
      setMailbox(res.mailbox)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load email')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(view) }, [view])

  const handleSearch = (q: string) => {
    setSearch(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => load(view, q), 400)
  }

  const openThread = async (thread: EmailThread) => {
    setThreadLoading(true); setActiveThread(null); setCompose(null)
    try {
      const detail = await api.google.email.getThread(thread.id)
      setActiveThread(detail)
      if (thread.unread) {
        await api.google.email.markRead(thread.id)
        setThreads(t => t.map(x => x.id === thread.id ? { ...x, unread: false } : x))
      }
    } finally { setThreadLoading(false) }
  }

  const openCompose = () => {
    setReplyTo(null)
    setComposeData({ to: '', subject: '', body: '' })
    setCompose('new')
  }

  const openReply = (msg: EmailMessage) => {
    setReplyTo(msg)
    setComposeData({
      to: msg.from,
      subject: msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`,
      body: `\n\n--- ${msg.from} wrote ---\n${stripHtml(msg.body)}`,
    })
    setCompose('reply')
  }

  const sendEmail = async () => {
    if (!composeData.to || !composeData.subject) return
    setSending(true); setSendError('')
    try {
      await api.google.email.send({
        to: composeData.to,
        subject: composeData.subject,
        body: composeData.body,
        thread_id: compose === 'reply' && activeThread ? activeThread.id : undefined,
        reply_to_message_id: replyTo?.id,
      })
      setCompose(null)
      if (view === 'sent') load('sent')
    } catch (e: unknown) {
      setSendError(e instanceof Error ? e.message : 'Failed to send')
    } finally { setSending(false) }
  }

  const trashThread = async (threadId: string) => {
    if (!confirm('Move this thread to Trash?')) return
    await api.google.email.trash(threadId)
    setThreads(t => t.filter(x => x.id !== threadId))
    if (activeThread?.id === threadId) setActiveThread(null)
  }

  const unreadCount = threads.filter(t => t.unread).length

  return (
    <div className="flex gap-0 h-[calc(100vh-8rem)] -mx-4 -my-8">
      {/* Sidebar */}
      <div className="w-48 shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <button onClick={openCompose}
            className="w-full bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
            + Compose
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {(['inbox', 'sent', 'trash'] as View[]).map(v => (
            <button key={v} onClick={() => { setView(v); setActiveThread(null) }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition flex items-center justify-between ${view === v ? 'bg-green-50 text-green-800' : 'text-gray-600 hover:bg-gray-50'}`}>
              <span className="capitalize">{v}</span>
              {v === 'inbox' && unreadCount > 0 && (
                <span className="bg-green-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>
              )}
            </button>
          ))}
        </nav>
        {mailbox && (
          <div className="p-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 truncate" title={mailbox}>{mailbox}</p>
          </div>
        )}
      </div>

      {/* Thread list */}
      <div className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-3 border-b border-gray-100">
          <input value={search} onChange={e => handleSearch(e.target.value)}
            placeholder="Search…"
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && threads.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading…</div>
          ) : error ? (
            <div className="p-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
                <p className="font-semibold text-amber-800 mb-1">Not configured</p>
                <p className="text-amber-700 text-xs">{error}</p>
              </div>
            </div>
          ) : threads.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">No messages</div>
          ) : (
            <>
              {threads.map(t => (
                <button key={t.id} onClick={() => openThread(t)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition ${activeThread?.id === t.id ? 'bg-green-50' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-xs truncate flex-1 ${t.unread ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
                      {t.from.replace(/<.*>/, '').trim() || t.from}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0 mt-0.5">{formatDate(t.date)}</span>
                  </div>
                  <div className={`text-xs truncate mt-0.5 ${t.unread ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                    {t.subject || '(no subject)'}
                  </div>
                  <div className="text-xs text-gray-400 truncate mt-0.5">{t.snippet}</div>
                </button>
              ))}
              {nextPage && (
                <button onClick={() => load(view, search, nextPage)}
                  className="w-full py-3 text-xs text-green-700 hover:bg-green-50 transition">
                  Load more
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main pane */}
      <div className="flex-1 bg-gray-50 flex flex-col overflow-hidden">
        {compose ? (
          <ComposePanel
            data={composeData} onChange={setComposeData}
            onSend={sendEmail} onCancel={() => setCompose(null)}
            sending={sending} error={sendError}
            isReply={compose === 'reply'}
          />
        ) : threadLoading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">Loading…</div>
        ) : activeThread ? (
          <ThreadView
            thread={activeThread}
            onReply={openReply}
            onTrash={() => trashThread(activeThread.id)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2">
            <svg className="w-12 h-12 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="text-sm">Select a thread to read</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ThreadView({ thread, onReply, onTrash }: {
  thread: EmailThreadDetail
  onReply: (msg: EmailMessage) => void
  onTrash: () => void
}) {
  const lastMsg = thread.messages[thread.messages.length - 1]
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800 text-base truncate flex-1 mr-4">
          {thread.subject || '(no subject)'}
        </h2>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => onReply(lastMsg)}
            className="text-sm px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white rounded-lg transition font-medium">
            Reply
          </button>
          <button onClick={onTrash}
            className="text-sm px-3 py-1.5 border border-gray-200 hover:bg-gray-100 rounded-lg transition text-gray-600">
            Trash
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {thread.messages.map((msg, i) => (
          <MessageCard key={msg.id} msg={msg} defaultOpen={i === thread.messages.length - 1} onReply={() => onReply(msg)} />
        ))}
      </div>
    </div>
  )
}

function MessageCard({ msg, defaultOpen, onReply }: { msg: EmailMessage; defaultOpen: boolean; onReply: () => void }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full text-left px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
            {(msg.from[0] || '?').toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-800 truncate">{msg.from}</div>
            {!open && <div className="text-xs text-gray-400 truncate">{stripHtml(msg.body).slice(0, 80)}</div>}
          </div>
        </div>
        <span className="text-xs text-gray-400 shrink-0 ml-3">{formatDate(msg.date)}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100">
          <div className="px-5 py-2 bg-gray-50 text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-0.5">
            <span><span className="font-medium">To:</span> {msg.to}</span>
            {msg.cc && <span><span className="font-medium">Cc:</span> {msg.cc}</span>}
          </div>
          <div className="p-5">
            <iframe
              srcDoc={msg.body}
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              className="w-full border-0 min-h-[200px] max-h-[600px]"
              style={{ height: '400px' }}
              title="email-body"
            />
          </div>
          <div className="px-5 pb-4">
            <button onClick={onReply}
              className="text-sm px-4 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition text-gray-700">
              ↩ Reply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ComposePanel({ data, onChange, onSend, onCancel, sending, error, isReply }: {
  data: { to: string; subject: string; body: string }
  onChange: (d: typeof data) => void
  onSend: () => void
  onCancel: () => void
  sending: boolean
  error: string
  isReply: boolean
}) {
  return (
    <div className="flex-1 flex flex-col bg-white">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">{isReply ? 'Reply' : 'New Message'}</h2>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 flex flex-col p-6 gap-3">
        <input value={data.to} onChange={e => onChange({ ...data, to: e.target.value })}
          placeholder="To" className="border-b border-gray-200 pb-2 text-sm focus:outline-none focus:border-green-500 w-full" />
        <input value={data.subject} onChange={e => onChange({ ...data, subject: e.target.value })}
          placeholder="Subject" className="border-b border-gray-200 pb-2 text-sm focus:outline-none focus:border-green-500 w-full" />
        <textarea value={data.body} onChange={e => onChange({ ...data, body: e.target.value })}
          placeholder="Message…"
          className="flex-1 text-sm resize-none focus:outline-none leading-relaxed min-h-[200px]" />
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onSend} disabled={sending || !data.to || !data.subject}
            className="px-6 py-2 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
            {sending ? 'Sending…' : 'Send'}
          </button>
          <button onClick={onCancel} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Discard
          </button>
        </div>
      </div>
    </div>
  )
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr.slice(0, 11)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
