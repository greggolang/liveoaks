import { useEffect, useRef, useState } from 'react'
import { api, IMAPMessage, IMAPMessageDetail, MailContact } from '../api/client'

const FOLDERS = [
  { key: 'INBOX', label: 'Inbox' },
  { key: 'Sent',  label: 'Sent'  },
  { key: 'Trash', label: 'Trash' },
]

function formatDate(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
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
  const viewerRef = useRef<HTMLDivElement>(null)

  // ── Compose state ──
  const [composing, setComposing]   = useState(false)
  const [composeData, setComposeData] = useState({ to: '', subject: '', body: '' })
  const [sending, setSending]       = useState(false)
  const [sendError, setSendError]   = useState('')
  const [sendOk, setSendOk]         = useState(false)
  const [contactPickerOpen, setContactPickerOpen] = useState(false)
  const [contactSearch, setContactSearch] = useState('')

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
  async function handleSend(e: React.FormEvent) {
    e.preventDefault(); setSending(true); setSendError('')
    try {
      await api.imap.send(composeData)
      setSendOk(true)
      setTimeout(() => { setComposing(false); setSendOk(false); setComposeData({ to: '', subject: '', body: '' }) }, 1500)
    } catch (e: any) { setSendError(e.message) }
    finally { setSending(false) }
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

  function openCompose() {
    setComposing(true); setComposeData({ to: '', subject: '', body: '' })
    setContactSearch(''); setContactPickerOpen(false); setTemplatePickerOpen(false)
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

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {mailbox && <p className="text-xs text-gray-400 font-mono">{mailbox}</p>}
        </div>
        <button
          onClick={openCompose}
          className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-xl hover:bg-green-800 transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Compose
        </button>
      </div>

      {/* ── Section tabs (Mail / Contacts) ── */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        <button
          onClick={() => setSection('mail')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
            section === 'mail' ? 'border-green-700 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>
          Mail
          {unreadCount > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 bg-green-700 text-white text-xs rounded-full">{unreadCount}</span>
          )}
        </button>
        <button
          onClick={() => setSection('contacts')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
            section === 'contacts' ? 'border-green-700 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>
          Contacts
          {contacts.length > 0 && (
            <span className="ml-1.5 text-xs text-gray-400">{contacts.length}</span>
          )}
        </button>

        {/* Folder tabs — only when on mail section */}
        {section === 'mail' && (
          <>
            <span className="w-px bg-gray-200 mx-1 self-stretch -mb-px" />
            {FOLDERS.map(f => (
              <button key={f.key} onClick={() => setFolder(f.key)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                  folder === f.key ? 'border-green-700 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {f.label}
              </button>
            ))}
            <button onClick={() => loadFolder(folder)}
              className="ml-auto px-3 py-2 text-gray-400 hover:text-gray-600" title="Refresh">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </>
        )}

        {/* Add contact button — only when on contacts section */}
        {section === 'contacts' && (
          <button
            onClick={() => { setEditingContact(null); setContactForm(emptyContactForm); setContactError(''); setShowAddContact(true) }}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50 rounded-lg transition">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Contact
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {/* ══════════════ MAIL SECTION ══════════════ */}
      {section === 'mail' && (
        <div className="flex flex-1 gap-4 min-h-0">
          {/* Message list */}
          <div className={`flex flex-col border border-gray-200 rounded-xl overflow-hidden bg-white
            ${selected ? 'hidden lg:flex lg:w-80 xl:w-96 shrink-0' : 'flex-1'}`}>
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-green-700 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
                <svg className="w-8 h-8 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                No messages
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                {messages.map(msg => (
                  <button key={msg.uid} onClick={() => openMessage(msg)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition ${selected?.uid === msg.uid ? 'bg-green-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-sm truncate ${msg.unread ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
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
                <div className="flex-1 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-green-700 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : selected ? (
                <>
                  <div className="px-5 py-4 border-b border-gray-100">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h2 className="text-base font-semibold text-gray-900 leading-tight">
                          {selected.subject || '(no subject)'}
                        </h2>
                        <div className="mt-1.5 space-y-0.5 text-xs text-gray-500">
                          <p><span className="font-medium text-gray-600">From:</span> {selected.from}</p>
                          <p><span className="font-medium text-gray-600">To:</span> {selected.to}</p>
                          {selected.cc && <p><span className="font-medium text-gray-600">Cc:</span> {selected.cc}</p>}
                          <p className="text-gray-400">{new Date(selected.date).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                        <button onClick={startReply}
                          className="px-3 py-1.5 text-xs font-semibold bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition">
                          Reply
                        </button>
                        {!contacts.find(c => c.email.toLowerCase() === fromEmail(selected.from).toLowerCase()) && (
                          <button onClick={saveSenderAsContact}
                            title="Save sender as contact"
                            className="px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition">
                            + Contact
                          </button>
                        )}
                        <button onClick={() => deleteMessage(selected.uid)}
                          className="px-3 py-1.5 text-xs font-semibold bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition">
                          Delete
                        </button>
                        <button onClick={() => setSelected(null)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 lg:hidden">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto px-5 py-4">
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
          {/* Search */}
          <div className="mb-4">
            <input
              value={contactSearch2}
              onChange={e => setContactSearch2(e.target.value)}
              placeholder="Search contacts…"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            />
          </div>

          {contactsLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-5 h-5 border-2 border-green-700 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
              <svg className="w-9 h-9 mb-3 opacity-25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="font-medium text-sm">{contactSearch2 ? 'No contacts match' : 'No contacts yet'}</p>
              {!contactSearch2 && (
                <p className="text-xs mt-1">Click "Add Contact" or use "+ Contact" when reading an email.</p>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredContacts.map(c => (
                <div key={c.id}
                  className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold shrink-0">
                      {contactInitials(c.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                      <p className="text-xs text-gray-400 truncate">{c.email}</p>
                    </div>
                  </div>
                  {(c.phone || c.notes) && (
                    <div className="text-xs text-gray-500 space-y-0.5 mb-3 pl-1">
                      {c.phone && <p>📞 {c.phone}</p>}
                      {c.notes && <p className="text-gray-400 truncate">"{c.notes}"</p>}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => { setComposeData({ to: c.email, subject: '', body: '' }); setComposing(true) }}
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
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4"
          onClick={() => setComposing(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-800">New Message</h3>
              <button onClick={() => setComposing(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSend} className="p-5 space-y-3">
              {/* To field with contact picker */}
              <div className="relative">
                <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="recipient@example.com"
                    value={composeData.to}
                    onChange={e => { setComposeData(d => ({ ...d, to: e.target.value })); setContactSearch(e.target.value); setContactPickerOpen(true) }}
                    onFocus={() => setContactPickerOpen(true)}
                    required
                  />
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
                        onClick={() => { setComposeData(d => ({ ...d, to: c.email })); setContactPickerOpen(false); setContactSearch('') }}
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
                  value={composeData.body}
                  onChange={e => setComposeData(d => ({ ...d, body: e.target.value }))}
                />
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => { setShowAddContact(false); setEditingContact(null) }}>
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
