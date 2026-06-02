import { useEffect, useRef, useState } from 'react'
import { api, IMAPMessage, IMAPMessageDetail } from '../api/client'

const FOLDERS = [
  { key: 'INBOX', label: 'Inbox' },
  { key: 'Sent', label: 'Sent' },
  { key: 'Trash', label: 'Trash' },
]

function formatDate(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function fromName(from: string) {
  const m = from.match(/^(.+?)\s*</)
  return m ? m[1].trim() : from.split('@')[0]
}

export default function MailInbox() {
  const [folder, setFolder] = useState('INBOX')
  const [messages, setMessages] = useState<IMAPMessage[]>([])
  const [mailbox, setMailbox] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selected, setSelected] = useState<IMAPMessageDetail | null>(null)
  const [msgLoading, setMsgLoading] = useState(false)

  const [composing, setComposing] = useState(false)
  const [composeData, setComposeData] = useState({ to: '', subject: '', body: '' })
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sendOk, setSendOk] = useState(false)

  const viewerRef = useRef<HTMLDivElement>(null)

  async function loadFolder(f: string) {
    setLoading(true)
    setError('')
    setSelected(null)
    try {
      const res = await api.imap.listMessages(f)
      setMessages(res.messages)
      setMailbox(res.mailbox)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadFolder(folder) }, [folder])

  async function openMessage(msg: IMAPMessage) {
    setMsgLoading(true)
    setSelected(null)
    try {
      const detail = await api.imap.getMessage(msg.uid, folder)
      setSelected(detail)
      // Mark unread messages as read in the list
      if (msg.unread) {
        setMessages(prev => prev.map(m => m.uid === msg.uid ? { ...m, unread: false } : m))
      }
      viewerRef.current?.scrollTo({ top: 0 })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setMsgLoading(false)
    }
  }

  async function deleteMessage(uid: number) {
    try {
      await api.imap.delete(uid, folder)
      setMessages(prev => prev.filter(m => m.uid !== uid))
      if (selected?.uid === uid) setSelected(null)
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setSendError('')
    try {
      await api.imap.send(composeData)
      setSendOk(true)
      setTimeout(() => {
        setComposing(false)
        setSendOk(false)
        setComposeData({ to: '', subject: '', body: '' })
      }, 1500)
    } catch (e: any) {
      setSendError(e.message)
    } finally {
      setSending(false)
    }
  }

  function startReply() {
    if (!selected) return
    setComposeData({
      to: selected.from,
      subject: selected.subject.startsWith('Re:') ? selected.subject : 'Re: ' + selected.subject,
      body: '',
    })
    setComposing(true)
  }

  const unreadCount = messages.filter(m => m.unread).length

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Email</h1>
          {mailbox && <p className="text-xs text-gray-500 font-mono mt-0.5">{mailbox}</p>}
        </div>
        <button
          onClick={() => { setComposing(true); setComposeData({ to: '', subject: '', body: '' }) }}
          className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Compose
        </button>
      </div>

      {/* Folder tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {FOLDERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFolder(f.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              folder === f.key
                ? 'border-green-700 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {f.label}
            {f.key === 'INBOX' && unreadCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-green-700 text-white text-xs rounded-full">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
        <button
          onClick={() => loadFolder(folder)}
          className="ml-auto px-3 py-2 text-gray-400 hover:text-gray-600 text-sm"
          title="Refresh">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Message list */}
        <div className={`flex flex-col border border-gray-200 rounded-xl overflow-hidden bg-white
          ${selected ? 'hidden lg:flex lg:w-80 xl:w-96 shrink-0' : 'flex-1'}`}>
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Loading…
            </div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              No messages
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {messages.map(msg => (
                <button
                  key={msg.uid}
                  onClick={() => openMessage(msg)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition ${
                    selected?.uid === msg.uid ? 'bg-green-50' : ''
                  }`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-sm truncate ${msg.unread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                      {fromName(msg.from)}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">{formatDate(msg.date)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {msg.unread && <span className="w-1.5 h-1.5 rounded-full bg-green-600 shrink-0" />}
                    <p className={`text-xs truncate ${msg.unread ? 'text-gray-700' : 'text-gray-400'}`}>
                      {msg.subject || '(no subject)'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Message viewer */}
        {(selected || msgLoading) && (
          <div ref={viewerRef} className="flex-1 flex flex-col border border-gray-200 rounded-xl overflow-hidden bg-white min-h-0">
            {msgLoading ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
            ) : selected ? (
              <>
                {/* Viewer header */}
                <div className="px-5 py-4 border-b border-gray-100">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-semibold text-gray-900 leading-tight">
                        {selected.subject || '(no subject)'}
                      </h2>
                      <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                        <p><span className="font-medium">From:</span> {selected.from}</p>
                        <p><span className="font-medium">To:</span> {selected.to}</p>
                        {selected.cc && <p><span className="font-medium">Cc:</span> {selected.cc}</p>}
                        <p>{new Date(selected.date).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={startReply}
                        className="px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 rounded-lg hover:bg-green-100">
                        Reply
                      </button>
                      <button
                        onClick={() => deleteMessage(selected.uid)}
                        className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 rounded-lg hover:bg-red-100">
                        Delete
                      </button>
                      <button
                        onClick={() => setSelected(null)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 lg:hidden">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {selected.body ? (
                    <div
                      className="prose prose-sm max-w-none text-gray-800"
                      dangerouslySetInnerHTML={{ __html: selected.body }}
                    />
                  ) : (
                    <p className="text-gray-400 text-sm italic">No content</p>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Compose modal */}
      {composing && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4"
          onClick={() => setComposing(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-800">New Message</h3>
              <button onClick={() => setComposing(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSend} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="recipient@example.com"
                  value={composeData.to}
                  onChange={e => setComposeData(d => ({ ...d, to: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Subject"
                  value={composeData.subject}
                  onChange={e => setComposeData(d => ({ ...d, subject: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
                <textarea
                  rows={8}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  placeholder="Write your message…"
                  value={composeData.body}
                  onChange={e => setComposeData(d => ({ ...d, body: e.target.value }))}
                />
              </div>

              {sendError && <p className="text-red-600 text-xs">{sendError}</p>}
              {sendOk && <p className="text-green-600 text-xs font-medium">Message sent!</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setComposing(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                  Cancel
                </button>
                <button type="submit" disabled={sending}
                  className="px-5 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 disabled:opacity-50 transition">
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
