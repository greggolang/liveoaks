import { useEffect, useRef, useState } from 'react'
import { api, IMAPMessage, IMAPMessageDetail, MailContact, DocFile } from '../api/client'
import { formatPhone } from '../utils/phone'
import { parseDate } from '../utils/dates'

const FOLDERS = [
  { key: 'INBOX', label: 'Inbox' },
  { key: 'Sent',  label: 'Sent'  },
  { key: 'Trash', label: 'Trash' },
]

function formatDate(iso: string) {
  if (!iso) return ''
  const d = parseDate(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function fromName(from: string) {
  const m = from.match(/^(.+?)\s*</)
  return m ? m[1].trim() : from.split('@')[0]
}

function fromEmail(from: string) {
  const m = from.match(/<(.+?)>/)
  return m ? m[1] : from
}

function contactInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
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

type SectionTab = 'mail' | 'contacts'

const emptyContactForm = { name: '', email: '', phone: '', notes: '' }

export default function MailInbox() {
  const [section, setSection] = useState<SectionTab>('mail')

  // ── Mail state ──
  const [folder, setFolder]     = useState('INBOX')
  const [messages, setMessages] = useState<IMAPMessage[]>([])
  const [mailbox, setMailbox]   = useState('')
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [selected, setSelected] = useState<IMAPMessageDetail | null>(null)
  const [msgLoading, setMsgLoading] = useState(false)
  const viewerRef   = useRef<HTMLDivElement>(null)
  const toInputRef  = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Compose state ──
  const [composing, setComposing]     = useState(false)
  const [composeData, setComposeData] = useState({ to: '', subject: '', body: '' })
  const [ccField, setCcField]         = useState('')
  const [showCc, setShowCc]           = useState(false)
  const [attachments, setAttachments] = useState<File[]>([])
  const [docAttachments, setDocAttachments] = useState<{id: string, name: string}[]>([])
  const [docPickerOpen, setDocPickerOpen]   = useState(false)
  const [allDocs, setAllDocs]         = useState<{id: string, name: string}[]>([])
  const [sending, setSending]         = useState(false)
  const [sendError, setSendError]     = useState('')
  const [sendOk, setSendOk]           = useState(false)
  const [contactPickerOpen, setContactPickerOpen] = useState(false)
  const [contactSearch, setContactSearch] = useState('')
  const [toChips, setToChips]         = useState<string[]>([])

  // ── Inbox search ──
  const [search, setSearch] = useState('')

  // ── Contacts state ──
  const [contacts, setContacts]         = useState<MailContact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactSearch2, setContactSearch2]   = useState('')
  const [editingContact, setEditingContact]   = useState<MailContact | null>(null)
  const [showAddContact, setShowAddContact]   = useState(false)
  const [contactForm, setContactForm]         = useState(emptyContactForm)
  const [contactSaving, setContactSaving]     = useState(false)
  const [contactError, setContactError]       = useState('')
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null)

  // ── Templates state ──
  type EmailTemplate = { id: string; name: string; subject: string; body: string }
  const [templates, setTemplates]           = useState<EmailTemplate[]>([])
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)

  // ── Load mail ──
  async function loadFolder(f: string) {
    setLoading(true); setError(''); setSelected(null)
    try {
      const res = await api.imap.listMessages(f)
      setMessages(res.messages); setMailbox(res.mailbox)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadFolder(folder) }, [folder])

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await api.imap.listMessages(folder)
        setMessages(res.messages)
      } catch {}
    }, 30_000)
    return () => clearInterval(id)
  }, [folder])

  // ── Load contacts ──
  async function loadContacts() {
    setContactsLoading(true)
    try { setContacts(await api.imap.contacts.list()) }
    catch {}
    finally { setContactsLoading(false) }
  }

  useEffect(() => { loadContacts() }, [])

  useEffect(() => {
    api.emailTemplates.list().then(setTemplates).catch(() => {})
  }, [])

  useEffect(() => {
    api.documents.list().then(folders => {
      const flat: {id: string, name: string}[] = []
      function walk(f: any) {
        f.docs?.forEach((d: DocFile) => flat.push({ id: d.id, name: d.title || d.original_name }))
        f.children?.forEach(walk)
      }
      folders.forEach(walk)
      setAllDocs(flat)
    }).catch(() => {})
  }, [])

  // ── Open message ──
  async function openMessage(msg: IMAPMessage) {
    setMsgLoading(true); setSelected(null)
    try {
      const detail = await api.imap.getMessage(msg.uid, folder)
      setSelected(detail)
      if (msg.unread)
        setMessages(prev => prev.map(m => m.uid === msg.uid ? { ...m, unread: false } : m))
      viewerRef.current?.scrollTo({ top: 0 })
    } catch (e: any) { setError(e.message) }
    finally { setMsgLoading(false) }
  }

  async function deleteMessage(uid: number) {
    try {
      await api.imap.delete(uid, folder)
      setMessages(prev => prev.filter(m => m.uid !== uid))
      if (selected?.uid === uid) setSelected(null)
    } catch (e: any) { setError(e.message) }
  }

  // ── Compose ──
  function resetCompose() {
    setComposeData({ to: '', subject: '', body: '' })
    setToChips([]); setContactSearch('')
    setCcField(''); setShowCc(false)
    setAttachments([]); setDocAttachments([]); setDocPickerOpen(false)
    setContactPickerOpen(false); setTemplatePickerOpen(false)
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault(); setSending(true); setSendError('')
    const extra = contactSearch.trim()
    const recipients = extra ? [...toChips, extra] : toChips
    if (recipients.length === 0) { setSendError('Please add at least one recipient'); setSending(false); return }
    try {
      await api.imap.send({
        to: recipients.join(', '),
        cc: ccField || undefined,
        subject: composeData.subject,
        body: composeData.body,
        attachments,
        docIds: docAttachments.map(d => d.id),
      })
      setSendOk(true)
      setTimeout(() => { setComposing(false); setSendOk(false); resetCompose() }, 1500)
    } catch (e: any) { setSendError(e.message) }
    finally { setSending(false) }
  }

  function startReply() {
    if (!selected) return
    resetCompose()
    setToChips([selected.from])
    setComposeData({ to: '', subject: selected.subject.startsWith('Re:') ? selected.subject : 'Re: ' + selected.subject, body: '' })
    setComposing(true)
  }

  function startForward() {
    if (!selected) return
    resetCompose()
    setComposeData({
      to: '',
      subject: selected.subject.startsWith('Fwd:') ? selected.subject : 'Fwd: ' + selected.subject,
      body: `\n\n---------- Forwarded message ----------\nFrom: ${selected.from}\nDate: ${parseDate(selected.date).toLocaleString()}\nSubject: ${selected.subject}\n\n`,
    })
    setComposing(true)
  }

  async function handleMarkUnread() {
    if (!selected) return
    try {
      await api.imap.markUnread(selected.uid, folder)
      setMessages(prev => prev.map(m => m.uid === selected.uid ? { ...m, unread: true } : m))
      setSelected(null)
    } catch {}
  }

  function openCompose() {
    resetCompose(); setComposing(true)
  }

  // ── Save sender as contact ──
  function saveSenderAsContact() {
    if (!selected) return
    const email = fromEmail(selected.from)
    const name  = fromName(selected.from)
    const already = contacts.find(c => c.email.toLowerCase() === email.toLowerCase())
    if (already) return
    setContactForm({ name, email, phone: '', notes: '' })
    setShowAddContact(true)
    setSection('contacts')
  }

  // ── Contact CRUD ──
  async function handleSaveContact(e: React.FormEvent) {
    e.preventDefault(); setContactSaving(true); setContactError('')
    try {
      if (editingContact) {
        await api.imap.contacts.update(editingContact.id, contactForm)
      } else {
        await api.imap.contacts.create(contactForm)
      }
      setShowAddContact(false); setEditingContact(null); setContactForm(emptyContactForm)
      await loadContacts()
    } catch (e: any) { setContactError(e.message) }
    finally { setContactSaving(false) }
  }

  async function handleDeleteContact() {
    if (!deleteContactId) return
    try {
      await api.imap.contacts.delete(deleteContactId)
      setDeleteContactId(null)
      await loadContacts()
    } catch {}
  }

  function openEditContact(c: MailContact) {
    setEditingContact(c)
    setContactForm({ name: c.name, email: c.email, phone: c.phone ?? '', notes: c.notes ?? '' })
    setContactError(''); setShowAddContact(true)
  }

  const unreadCount = messages.filter(m => m.unread).length
  const filteredMessages = search
    ? messages.filter(m =>
        m.subject?.toLowerCase().includes(search.toLowerCase()) ||
        m.from?.toLowerCase().includes(search.toLowerCase()))
    : messages
  const filteredContacts = contacts.filter(c =>
    !contactSearch2 ||
    c.name.toLowerCase().includes(contactSearch2.toLowerCase()) ||
    c.email.toLowerCase().includes(contactSearch2.toLowerCase())
  )
  const composeContactSuggestions = contacts.filter(c =>
    contactSearch.length > 0 &&
    (c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
     c.email.toLowerCase().includes(contactSearch.toLowerCase()))
  )

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-120px)]">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-none">Messages</h1>
          {mailbox && <p className="text-xs text-gray-400 mt-0.5 font-mono">{mailbox}</p>}
        </div>
        <button
          onClick={openCompose}
          className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-xl hover:bg-green-800 active:scale-95 transition shadow-sm shadow-green-900/20">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Compose
        </button>
      </div>

      {/* ── Nav: section + folders in one row ── */}
      <div className="flex items-center gap-0.5 mb-4 border-b border-gray-200 overflow-x-auto">
        <button onClick={() => setSection('mail')}
          className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition ${
            section === 'mail' ? 'border-green-700 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Mail
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 bg-green-700 text-white text-[11px] font-bold rounded-full leading-none">{unreadCount}</span>
          )}
        </button>
        <button onClick={() => setSection('contacts')}
          className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition ${
            section === 'contacts' ? 'border-green-700 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Contacts
          {contacts.length > 0 && <span className="text-xs text-gray-400 font-normal">{contacts.length}</span>}
        </button>

        {section === 'mail' && (
          <>
            <span className="w-px h-4 bg-gray-200 mx-1 shrink-0" />
            {FOLDERS.map(f => (
              <button key={f.key} onClick={() => setFolder(f.key)}
                className={`px-3 py-2.5 text-sm border-b-2 -mb-px whitespace-nowrap transition ${
                  folder === f.key ? 'border-green-700 text-green-700 font-medium' : 'border-transparent text-gray-400 hover:text-gray-700'
                }`}>
                {f.label}
              </button>
            ))}
            <button onClick={() => loadFolder(folder)} title="Refresh"
              className="ml-auto p-2 text-gray-400 hover:text-green-700 hover:bg-green-50 rounded-lg transition shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </>
        )}

        {section === 'contacts' && (
          <button
            onClick={() => { setEditingContact(null); setContactForm(emptyContactForm); setContactError(''); setShowAddContact(true) }}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 mr-0.5 text-xs font-semibold text-green-700 hover:bg-green-50 rounded-lg transition shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Contact
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {/* ══════════════ MAIL SECTION ══════════════ */}
      {section === 'mail' && (
        <div className="flex flex-1 gap-3 min-h-0">

          {/* ── Message list ── */}
          <div className={`flex flex-col rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-sm
            ${selected ? 'hidden lg:flex lg:w-72 xl:w-80 shrink-0' : 'flex-1'}`}>
            {/* Search bar */}
            <div className="px-3 pt-3 pb-2">
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
                </svg>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-gray-100 border-0 focus:outline-none focus:ring-2 focus:ring-green-500 placeholder-gray-400"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm gap-2 pb-6">
                <svg className="w-10 h-10 opacity-15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <p>{search ? 'No matches' : 'No messages'}</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {filteredMessages.map((msg, idx) => {
                  const name = fromName(msg.from)
                  const isSelected = selected?.uid === msg.uid
                  return (
                    <button key={msg.uid} onClick={() => openMessage(msg)}
                      className={`w-full text-left px-3 py-3 transition group
                        ${isSelected ? 'bg-green-50 border-l-2 border-green-600' : 'border-l-2 border-transparent hover:bg-gray-50'}
                        ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
                      <div className="flex items-start gap-2.5">
                        <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${avatarColor(name)}`}>
                          {nameInitials(name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className={`text-sm truncate ${msg.unread ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                              {name}
                            </span>
                            <span className="text-[11px] text-gray-400 shrink-0">{formatDate(msg.date)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {msg.unread && <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />}
                            <p className={`text-xs truncate leading-snug ${msg.unread ? 'text-gray-700' : 'text-gray-400'}`}>
                              {msg.subject || '(no subject)'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Message viewer ── */}
          {(selected || msgLoading) && (
            <div ref={viewerRef} className="flex-1 flex flex-col rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-sm min-h-0">
              {msgLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : selected ? (
                <>
                  {/* Viewer header */}
                  <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                    {/* Subject + back */}
                    <div className="flex items-start gap-3 mb-3">
                      <button onClick={() => setSelected(null)}
                        className="mt-0.5 p-1 -ml-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-200 transition lg:hidden shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <h2 className="flex-1 text-base font-semibold text-gray-900 leading-snug">
                        {selected.subject || '(no subject)'}
                      </h2>
                    </div>
                    {/* Sender row */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${avatarColor(fromName(selected.from))}`}>
                        {nameInitials(fromName(selected.from))}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{fromName(selected.from)}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {selected.from} · {parseDate(selected.date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    {/* Meta */}
                    <div className="text-xs text-gray-500 space-y-0.5 mb-3 pl-12">
                      <p><span className="text-gray-400">To:</span> {selected.to}</p>
                      {selected.cc && <p><span className="text-gray-400">Cc:</span> {selected.cc}</p>}
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-wrap pl-12">
                      <button onClick={startReply}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-green-700 text-white rounded-lg hover:bg-green-800 transition">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        Reply
                      </button>
                      <button onClick={startForward}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2m18-10l-6-6m6 6l-6 6" />
                        </svg>
                        Forward
                      </button>
                      <button onClick={handleMarkUnread} title="Mark as unread"
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </button>
                      {!contacts.find(c => c.email.toLowerCase() === fromEmail(selected.from).toLowerCase()) && (
                        <button onClick={saveSenderAsContact} title="Save sender as contact"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                          </svg>
                        </button>
                      )}
                      <button onClick={() => deleteMessage(selected.uid)} title="Delete"
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {/* Body */}
                  <div className="flex-1 overflow-y-auto px-6 py-5">
                    {selected.body ? (
                      <div className="prose prose-sm max-w-none text-gray-800"
                        dangerouslySetInnerHTML={{ __html: selected.body }} />
                    ) : (
                      <p className="text-gray-400 text-sm italic">No content</p>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ CONTACTS SECTION ══════════════ */}
      {section === 'contacts' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="mb-4 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
            </svg>
            <input
              value={contactSearch2}
              onChange={e => setContactSearch2(e.target.value)}
              placeholder="Search contacts…"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            />
          </div>

          {contactsLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-5 h-5 border-2 border-green-700 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
              <svg className="w-10 h-10 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="font-medium text-sm">{contactSearch2 ? 'No contacts match' : 'No contacts yet'}</p>
              {!contactSearch2 && <p className="text-xs mt-1 text-gray-400">Use "+ Contact" when reading an email to add senders.</p>}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredContacts.map(c => (
                <div key={c.id}
                  className="bg-white border border-gray-200 rounded-2xl p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${avatarColor(c.name)}`}>
                      {nameInitials(c.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                      <p className="text-xs text-gray-400 truncate">{c.email}</p>
                    </div>
                  </div>
                  {(c.phone || c.notes) && (
                    <div className="text-xs text-gray-500 space-y-0.5 mb-3 border-t border-gray-100 pt-2.5">
                      {c.phone && <p className="flex items-center gap-1.5"><svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>{formatPhone(c.phone)}</p>}
                      {c.notes && <p className="text-gray-400 truncate italic">"{c.notes}"</p>}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-2.5 border-t border-gray-100">
                    <button
                      onClick={() => { resetCompose(); setToChips([c.email]); setComposing(true) }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 text-xs font-semibold transition">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Email
                    </button>
                    <button onClick={() => openEditContact(c)}
                      className="p-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-500 transition">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={() => setDeleteContactId(c.id)}
                      className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 transition">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ COMPOSE MODAL ══════════════ */}
      {composing && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 bg-gray-50 rounded-t-2xl border-b border-gray-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-green-700 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-gray-800">New Message</h3>
              </div>
              <button onClick={() => setComposing(false)} className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSend} className="p-5 space-y-3">
              {/* To field — chip multi-recipient */}
              <div className="relative">
                <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                <div className="flex gap-2">
                  <div
                    className="flex-1 flex flex-wrap gap-1.5 border border-gray-300 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-green-500 bg-white cursor-text min-h-[42px]"
                    onClick={() => toInputRef.current?.focus()}>
                    {toChips.map((email, i) => (
                      <span key={i} className="flex items-center gap-1 bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-lg shrink-0">
                        {email}
                        <button type="button"
                          onClick={ev => { ev.stopPropagation(); setToChips(c => c.filter((_, j) => j !== i)) }}
                          className="hover:text-red-600 transition leading-none">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                    <input
                      ref={toInputRef}
                      className="flex-1 min-w-[120px] outline-none text-sm py-0.5 bg-transparent"
                      placeholder={toChips.length === 0 ? 'recipient@example.com' : 'Add another…'}
                      value={contactSearch}
                      onChange={e => { setContactSearch(e.target.value); setContactPickerOpen(true) }}
                      onFocus={() => setContactPickerOpen(true)}
                      onKeyDown={e => {
                        if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab') && contactSearch.trim()) {
                          e.preventDefault()
                          setToChips(c => [...c, contactSearch.trim()])
                          setContactSearch(''); setContactPickerOpen(false)
                        } else if (e.key === 'Backspace' && !contactSearch && toChips.length > 0) {
                          setToChips(c => c.slice(0, -1))
                        }
                      }}
                    />
                  </div>
                  {contacts.length > 0 && (
                    <button type="button"
                      onClick={() => setContactPickerOpen(o => !o)}
                      title="Pick from contacts"
                      className="px-2.5 border border-gray-300 rounded-xl text-gray-400 hover:text-green-700 hover:border-green-400 transition">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                  )}
                </div>
                {/* Contact suggestions dropdown */}
                {contactPickerOpen && (composeContactSuggestions.length > 0 || (contactSearch === '' && contacts.length > 0)) && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                    {(contactSearch === '' ? contacts : composeContactSuggestions).map(c => (
                      <button key={c.id} type="button"
                        onClick={() => {
                          if (!toChips.includes(c.email)) setToChips(ch => [...ch, c.email])
                          // Refocus the input first: focus() synchronously fires the
                          // input's onFocus (which reopens the picker), so we must queue
                          // the close *after* it or the popup stays open.
                          toInputRef.current?.focus()
                          setContactPickerOpen(false); setContactSearch('')
                        }}
                        className="w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition">
                        <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {contactInitials(c.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                          <p className="text-xs text-gray-400 truncate">{c.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* CC field */}
              {showCc ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cc</label>
                  <input
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="cc@example.com, ..."
                    value={ccField}
                    onChange={e => setCcField(e.target.value)}
                  />
                </div>
              ) : (
                <button type="button" onClick={() => setShowCc(true)}
                  className="text-xs text-gray-400 hover:text-green-700 transition self-start">
                  + Cc
                </button>
              )}

              {/* Template picker */}
              {templates.length > 0 && (
                <div className="relative">
                  <button type="button"
                    onClick={() => setTemplatePickerOpen(o => !o)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-sm transition ${
                      templatePickerOpen
                        ? 'border-green-400 bg-green-50 text-green-700'
                        : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    }`}>
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Use a template
                    </span>
                    <svg className={`w-4 h-4 transition-transform ${templatePickerOpen ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {templatePickerOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                      {templates.map(t => (
                        <button key={t.id} type="button"
                          onClick={() => {
                            setComposeData(d => ({ ...d, subject: t.subject, body: t.body }))
                            setTemplatePickerOpen(false)
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 transition border-b border-gray-100 last:border-0">
                          <p className="text-sm font-medium text-gray-800">{t.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{t.subject}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
                <input
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Subject"
                  value={composeData.subject}
                  onChange={e => setComposeData(d => ({ ...d, subject: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
                <textarea rows={8}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  placeholder="Write your message…"
                  spellCheck={true}
                  value={composeData.body}
                  onChange={e => setComposeData(d => ({ ...d, body: e.target.value }))}
                />
              </div>

              {/* ── Attachments ── */}
              <div className="space-y-2">
                {/* Attached file chips */}
                {(attachments.length > 0 || docAttachments.length > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    {attachments.map((f, i) => (
                      <span key={i} className="flex items-center gap-1 bg-gray-100 text-gray-700 text-xs font-medium px-2 py-1 rounded-lg">
                        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        {f.name}
                        <button type="button" onClick={() => setAttachments(a => a.filter((_, j) => j !== i))}
                          className="hover:text-red-600 transition leading-none">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                    {docAttachments.map((d, i) => (
                      <span key={d.id} className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-medium px-2 py-1 rounded-lg">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        {d.name}
                        <button type="button" onClick={() => setDocAttachments(a => a.filter((_, j) => j !== i))}
                          className="hover:text-red-600 transition leading-none">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {/* Attach buttons */}
                <div className="flex items-center gap-2">
                  <input ref={fileInputRef} type="file" multiple className="hidden"
                    onChange={e => { if (e.target.files) setAttachments(a => [...a, ...Array.from(e.target.files!)]) }} />
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-green-700 transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    Attach file
                  </button>
                  {allDocs.length > 0 && (
                    <button type="button" onClick={() => setDocPickerOpen(o => !o)}
                      className={`flex items-center gap-1.5 text-xs transition ${docPickerOpen ? 'text-green-700' : 'text-gray-500 hover:text-green-700'}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      From Files
                    </button>
                  )}
                </div>
                {/* Doc picker dropdown */}
                {docPickerOpen && allDocs.length > 0 && (
                  <div className="border border-gray-200 rounded-xl bg-white shadow-sm max-h-40 overflow-y-auto">
                    {allDocs.map(d => {
                      const already = docAttachments.some(a => a.id === d.id)
                      return (
                        <button key={d.id} type="button"
                          onClick={() => {
                            if (!already) setDocAttachments(a => [...a, d])
                            setDocPickerOpen(false)
                          }}
                          className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition ${already ? 'opacity-40 cursor-default' : ''}`}>
                          <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="truncate">{d.name}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {sendError && <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{sendError}</p>}
              {sendOk    && <p className="text-green-600 text-xs font-medium">Message sent!</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setComposing(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition">Cancel</button>
                <button type="submit" disabled={sending}
                  className="px-5 py-2 bg-green-700 text-white text-sm font-semibold rounded-xl hover:bg-green-800 disabled:opacity-50 transition">
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════ ADD / EDIT CONTACT MODAL ══════════════ */}
      {showAddContact && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">
                {editingContact ? 'Edit Contact' : 'Add Contact'}
              </h3>
              <button onClick={() => { setShowAddContact(false); setEditingContact(null) }}
                className="text-gray-400 hover:text-gray-600 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSaveContact} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Name <span className="text-red-400">*</span></label>
                <input className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Full name"
                  value={contactForm.name}
                  onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email <span className="text-red-400">*</span></label>
                <input type="email" className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="email@example.com"
                  value={contactForm.email}
                  onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Phone <span className="text-gray-400 font-normal">(optional)</span></label>
                <input className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="(555) 555-5555"
                  value={contactForm.phone}
                  onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea rows={2} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  placeholder="Any notes about this contact…"
                  value={contactForm.notes}
                  onChange={e => setContactForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              {contactError && <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{contactError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => { setShowAddContact(false); setEditingContact(null) }}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition">Cancel</button>
                <button type="submit" disabled={contactSaving}
                  className="px-5 py-2 bg-green-700 text-white text-sm font-semibold rounded-xl hover:bg-green-800 disabled:opacity-50 transition">
                  {contactSaving ? 'Saving…' : editingContact ? 'Save Changes' : 'Add Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════ DELETE CONTACT CONFIRM ══════════════ */}
      {deleteContactId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setDeleteContactId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete contact?</h3>
            <p className="text-sm text-gray-500 mb-5">
              {contacts.find(c => c.id === deleteContactId)?.name} will be permanently removed.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteContactId(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition">Cancel</button>
              <button onClick={handleDeleteContact}
                className="px-5 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
