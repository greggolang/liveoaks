import { useEffect, useRef, useState } from 'react'
import { api, IMAPMessage, IMAPMessageDetail, MailContact, DocFile, type MailFilter, type MailFilterInput } from '../api/client'
import { formatPhone } from '../utils/phone'
import { parseDate } from '../utils/dates'

const emptyFilterForm: MailFilterInput = {
  name: '', enabled: true, match_field: 'from', pattern: '',
  source_folder: 'INBOX', action: 'move', dest_folder: '',
}

const MATCH_FIELD_LABELS: Record<MailFilterInput['match_field'], string> = {
  from: 'From', to_cc: 'To / Cc', subject: 'Subject', body: 'Body',
}

type Folder = { key: string; label: string; d: string }

const FOLDERS: Folder[] = [
  { key: 'INBOX',   label: 'Inbox',   d: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { key: 'Archive', label: 'Archive', d: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4' },
  { key: 'Sent',    label: 'Sent',    d: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8' },
  { key: 'Drafts',  label: 'Drafts',  d: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
  { key: 'Junk',    label: 'Spam',    d: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' },
  { key: 'Trash',   label: 'Trash',   d: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' },
]

const ICON = {
  read:    'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  unread:  'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  archive: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
  spam:    'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
  trash:   'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  move:    'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
}

const FOLDER_ICON = 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z'

// Names the server reports that map to built-in folders; anything else the user
// created themselves and is shown as a custom folder.
const SYSTEM_FOLDER_NAMES = new Set([
  'inbox', 'sent', 'sent items', 'drafts', 'draft', 'trash',
  'deleted items', 'junk', 'spam', 'archive', 'archives', 'all mail',
])
function isCustomFolder(name: string) {
  return !SYSTEM_FOLDER_NAMES.has(name.trim().toLowerCase())
}

function folderLabel(key: string) {
  return FOLDERS.find(f => f.key === key)?.label ?? key
}

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

type SectionTab = 'mail' | 'contacts' | 'filters'

const emptyContactForm = { name: '', email: '', phone: '', notes: '' }

// ── Small icon action button used in the list toolbar and viewer ──
function ToolbarBtn({ onClick, title, d, danger, disabled }: {
  onClick: () => void; title: string; d: string; danger?: boolean; disabled?: boolean
}) {
  return (
    <button onClick={onClick} title={title} disabled={disabled}
      className={`p-1.5 rounded-lg transition disabled:opacity-40 ${
        danger ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
      }`}>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
      </svg>
    </button>
  )
}

// ── "Move to folder" dropdown, reused by the toolbar and the open message ──
function MoveMenu({ folder, customFolders, onMove, up }: {
  folder: string; customFolders: string[]; onMove: (to: string) => void; up?: boolean
}) {
  const [open, setOpen] = useState(false)
  const sysTargets = FOLDERS.filter(f => f.key !== folder)
  const customTargets = customFolders.filter(c => c !== folder)
  return (
    <div className="relative">
      <ToolbarBtn onClick={() => setOpen(o => !o)} title="Move to folder" d={ICON.move} />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className={`absolute right-0 ${up ? 'bottom-full mb-1' : 'top-full mt-1'} z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-44 max-h-80 overflow-y-auto`}>
            <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Move to</p>
            {sysTargets.map(t => (
              <button key={t.key} onClick={() => { onMove(t.key); setOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.d} />
                </svg>
                {t.label}
              </button>
            ))}
            {customTargets.length > 0 && <div className="my-1 border-t border-gray-100" />}
            {customTargets.map(name => (
              <button key={name} onClick={() => { onMove(name); setOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={FOLDER_ICON} />
                </svg>
                <span className="truncate">{name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function MailInbox() {
  const [section, setSection] = useState<SectionTab>('mail')

  // ── Filter rules state ──
  const [filters, setFilters] = useState<MailFilter[]>([])
  const [filtersLoading, setFiltersLoading] = useState(false)
  const [filterForm, setFilterForm] = useState<MailFilterInput>(emptyFilterForm)
  const [editingFilterId, setEditingFilterId] = useState<string | null>(null)
  const [filterSaving, setFilterSaving] = useState(false)
  const [filterError, setFilterError] = useState('')
  const [filterTest, setFilterTest] = useState<{ matched: number; by_field: Record<string, number> } | null>(null)
  const [filterTesting, setFilterTesting] = useState(false)
  const [filterRunning, setFilterRunning] = useState(false)
  const [filterRunMsg, setFilterRunMsg] = useState('')

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

  // ── Selection / bulk actions ──
  const [selectedUids, setSelectedUids] = useState<Set<number>>(new Set())
  const [actionBusy, setActionBusy]     = useState(false)
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  // ── Custom folders ──
  const [customFolders, setCustomFolders] = useState<string[]>([])
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [folderError, setFolderError] = useState('')
  const [deleteFolderName, setDeleteFolderName] = useState<string | null>(null)

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
    setLoading(true); setError(''); setSelected(null); setSelectedUids(new Set<number>())
    try {
      const res = await api.imap.listMessages(f)
      setMessages(res.messages); setMailbox(res.mailbox)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadFolder(folder) }, [folder])

  // ── Custom folder list ──
  async function loadFolders() {
    try {
      const res = await api.imap.folders()
      setCustomFolders(res.folders.filter(isCustomFolder).sort((a, b) => a.localeCompare(b)))
    } catch {}
  }
  useEffect(() => { loadFolders() }, [])

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault()
    const name = newFolderName.trim()
    if (!name) return
    setCreatingFolder(true); setFolderError('')
    try {
      await api.imap.createFolder(name)
      setNewFolderName(''); setShowNewFolder(false)
      await loadFolders()
      setFolder(name)
    } catch (e: any) { setFolderError(e.message) }
    finally { setCreatingFolder(false) }
  }

  async function handleDeleteFolder() {
    if (!deleteFolderName) return
    try {
      await api.imap.deleteFolder(deleteFolderName)
      if (folder === deleteFolderName) setFolder('INBOX')
      setDeleteFolderName(null)
      await loadFolders()
    } catch (e: any) { setError(e.message) }
  }

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

  // ── Filter rules ──
  async function loadFilters() {
    setFiltersLoading(true)
    try { setFilters(await api.imap.filters.list()) }
    catch (e: any) { setFilterError(e.message) }
    finally { setFiltersLoading(false) }
  }

  // Load rules the first time the Filters tab is opened.
  useEffect(() => { if (section === 'filters' && filters.length === 0) loadFilters() }, [section])

  function resetFilterForm() {
    setEditingFilterId(null); setFilterForm(emptyFilterForm); setFilterError(''); setFilterTest(null)
  }

  async function handleTestFilter() {
    if (!filterForm.pattern.trim()) { setFilterError('Enter a pattern to test'); return }
    setFilterTesting(true); setFilterError(''); setFilterTest(null)
    try {
      setFilterTest(await api.imap.filters.test({
        match_field: filterForm.match_field,
        pattern: filterForm.pattern,
        source_folder: filterForm.source_folder,
      }))
    } catch (e: any) { setFilterError(e.message) }
    finally { setFilterTesting(false) }
  }

  function editFilter(f: MailFilter) {
    setEditingFilterId(f.id)
    setFilterForm({
      name: f.name, enabled: f.enabled, match_field: f.match_field, pattern: f.pattern,
      source_folder: f.source_folder, action: f.action, dest_folder: f.dest_folder,
    })
    setFilterError('')
  }

  async function handleSaveFilter(e: React.FormEvent) {
    e.preventDefault()
    setFilterSaving(true); setFilterError('')
    try {
      if (editingFilterId) await api.imap.filters.update(editingFilterId, filterForm)
      else await api.imap.filters.create(filterForm)
      resetFilterForm(); await loadFilters()
    } catch (e: any) { setFilterError(e.message) }
    finally { setFilterSaving(false) }
  }

  async function toggleFilter(f: MailFilter) {
    try { await api.imap.filters.update(f.id, { ...f, enabled: !f.enabled }); await loadFilters() }
    catch { /* ignore */ }
  }

  async function handleDeleteFilter(id: string) {
    try {
      await api.imap.filters.delete(id)
      if (editingFilterId === id) resetFilterForm()
      await loadFilters()
    } catch { /* ignore */ }
  }

  async function handleRunFilters() {
    setFilterRunning(true); setFilterRunMsg('')
    try {
      const res = await api.imap.filters.run()
      const errs = res.errors ?? []
      setFilterRunMsg(
        errs.length
          ? `Acted on ${res.matched} · ${errs.length} error${errs.length === 1 ? '' : 's'}: ${errs[0]}`
          : `Acted on ${res.matched} message${res.matched === 1 ? '' : 's'}`
      )
      await loadFilters()
      loadFolder(folder)
    } catch (e: any) { setFilterRunMsg(e.message) }
    finally { setFilterRunning(false) }
  }

  function filterSummary(f: MailFilter) {
    const where = `${MATCH_FIELD_LABELS[f.match_field]} contains “${f.pattern}” in ${folderLabel(f.source_folder)}`
    const what = f.action === 'move' ? `move to ${folderLabel(f.dest_folder)}`
      : f.action === 'delete' ? 'move to Trash' : 'mark read'
    return `${where} → ${what}`
  }

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

  // ── Bulk / single message actions ──
  type Action = 'delete' | 'read' | 'unread' | 'move' | 'spam' | 'archive'
  async function applyAction(uids: number[], action: Action, to?: string) {
    if (uids.length === 0) return
    setActionBusy(true); setError('')
    try {
      await api.imap.action(folder, uids, action, to)
      if (action === 'read' || action === 'unread') {
        const unread = action === 'unread'
        setMessages(prev => prev.map(m => uids.includes(m.uid) ? { ...m, unread } : m))
      } else {
        // delete / move / spam / archive all remove the message from this folder
        setMessages(prev => prev.filter(m => !uids.includes(m.uid)))
        if (selected && uids.includes(selected.uid)) setSelected(null)
      }
      setSelectedUids(new Set<number>())
    } catch (e: any) { setError(e.message) }
    finally { setActionBusy(false) }
  }

  async function emptyCurrentFolder() {
    setActionBusy(true); setError('')
    try {
      await api.imap.emptyFolder(folder)
      setMessages([]); setSelected(null); setSelectedUids(new Set<number>()); setConfirmEmpty(false)
    } catch (e: any) { setError(e.message) }
    finally { setActionBusy(false) }
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
  const allSelected = filteredMessages.length > 0 && filteredMessages.every(m => selectedUids.has(m.uid))
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

  function toggleSelect(uid: number) {
    setSelectedUids(prev => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid); else next.add(uid)
      return next
    })
  }
  function toggleSelectAll() {
    setSelectedUids(allSelected ? new Set<number>() : new Set(filteredMessages.map(m => m.uid)))
  }

  const isTrashOrSpam = folder === 'Trash' || folder === 'Junk'

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-110px)]">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 leading-none">Email</h1>
          {mailbox && <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">{mailbox}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex bg-gray-100 rounded-xl p-0.5">
            {(['mail', 'contacts', 'filters'] as SectionTab[]).map(s => (
              <button key={s} onClick={() => setSection(s)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
                  section === s ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}>
                {s === 'mail' ? 'Mail' : s === 'contacts' ? 'Contacts' : 'Filters'}
              </button>
            ))}
          </div>
          <button
            onClick={openCompose}
            className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-xl hover:bg-green-800 active:scale-95 transition shadow-sm shadow-green-900/20">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span className="hidden sm:inline">Compose</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {/* ══════════════ MAIL SECTION ══════════════ */}
      {section === 'mail' && (
        <div className="flex flex-1 gap-3 min-h-0">

          {/* ── Folder rail (desktop) ── */}
          <div className="hidden md:flex flex-col w-40 shrink-0 gap-0.5">
            {FOLDERS.map(f => {
              const active = folder === f.key
              return (
                <button key={f.key} onClick={() => setFolder(f.key)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                    active ? 'bg-green-100 text-green-800 font-semibold' : 'text-gray-600 hover:bg-gray-100'
                  }`}>
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={f.d} />
                  </svg>
                  <span className="flex-1 text-left">{f.label}</span>
                  {f.key === 'INBOX' && unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-green-700 text-white text-[11px] font-bold rounded-full leading-none">{unreadCount}</span>
                  )}
                </button>
              )
            })}

            {/* Custom folders */}
            {customFolders.length > 0 && <div className="my-1 border-t border-gray-100" />}
            {customFolders.map(name => {
              const active = folder === name
              return (
                <div key={name}
                  className={`group flex items-center rounded-lg ${active ? 'bg-green-100' : 'hover:bg-gray-100'}`}>
                  <button onClick={() => setFolder(name)}
                    className={`flex-1 flex items-center gap-2.5 px-3 py-2 text-sm min-w-0 ${active ? 'text-green-800 font-semibold' : 'text-gray-600'}`}>
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={FOLDER_ICON} />
                    </svg>
                    <span className="flex-1 text-left truncate">{name}</span>
                  </button>
                  <button onClick={() => setDeleteFolderName(name)} title="Delete folder"
                    className="opacity-0 group-hover:opacity-100 px-2 py-2 text-gray-300 hover:text-red-600 transition shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICON.trash} />
                    </svg>
                  </button>
                </div>
              )
            })}

            <button onClick={() => { setShowNewFolder(true); setNewFolderName(''); setFolderError('') }}
              className="flex items-center gap-2.5 px-3 py-2 mt-0.5 text-sm text-gray-400 hover:text-green-700 hover:bg-gray-100 rounded-lg transition">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New folder
            </button>
          </div>

          {/* ── List + viewer ── */}
          <div className="flex flex-1 gap-3 min-h-0">

            {/* Message list */}
            <div className={`flex flex-col rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-sm
              ${selected ? 'hidden lg:flex lg:w-80 xl:w-96 shrink-0' : 'flex-1'}`}>

              {/* Toolbar */}
              <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-1 min-h-[46px]">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer mr-1"
                  title="Select all" />
                {selectedUids.size > 0 ? (
                  <>
                    <span className="text-xs font-medium text-gray-500 mr-1">{selectedUids.size}</span>
                    <ToolbarBtn onClick={() => applyAction([...selectedUids], 'read')}   title="Mark read"   d={ICON.read}   disabled={actionBusy} />
                    <ToolbarBtn onClick={() => applyAction([...selectedUids], 'unread')} title="Mark unread" d={ICON.unread} disabled={actionBusy} />
                    {folder !== 'Archive' && <ToolbarBtn onClick={() => applyAction([...selectedUids], 'archive')} title="Archive" d={ICON.archive} disabled={actionBusy} />}
                    {folder !== 'Junk' && <ToolbarBtn onClick={() => applyAction([...selectedUids], 'spam')} title="Mark as spam" d={ICON.spam} disabled={actionBusy} />}
                    <MoveMenu folder={folder} customFolders={customFolders} onMove={to => applyAction([...selectedUids], 'move', to)} />
                    <ToolbarBtn onClick={() => applyAction([...selectedUids], 'delete')} title="Delete" d={ICON.trash} danger disabled={actionBusy} />
                    <button onClick={() => setSelectedUids(new Set<number>())}
                      className="ml-auto text-xs text-gray-400 hover:text-gray-700 px-2 py-1 transition">Cancel</button>
                  </>
                ) : (
                  <>
                    {/* Mobile folder picker */}
                    <select value={folder} onChange={e => setFolder(e.target.value)}
                      className="md:hidden text-sm font-medium bg-gray-100 border-0 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-green-500">
                      {FOLDERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                      {customFolders.length > 0 && (
                        <optgroup label="Folders">
                          {customFolders.map(name => <option key={name} value={name}>{name}</option>)}
                        </optgroup>
                      )}
                    </select>
                    <button onClick={() => { setShowNewFolder(true); setNewFolderName(''); setFolderError('') }} title="New folder"
                      className="md:hidden p-1.5 text-gray-400 hover:text-green-700 hover:bg-green-50 rounded-lg transition">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                    <span className="hidden md:block text-sm font-semibold text-gray-700 px-1">{folderLabel(folder)}</span>
                    <button onClick={() => loadFolder(folder)} title="Refresh"
                      className="p-1.5 text-gray-400 hover:text-green-700 hover:bg-green-50 rounded-lg transition">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                    {isTrashOrSpam && messages.length > 0 && (
                      <button onClick={() => setConfirmEmpty(true)}
                        className="ml-auto text-xs font-semibold text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition">
                        Empty {folder === 'Trash' ? 'Trash' : 'Spam'}
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Search */}
              <div className="px-3 pt-2 pb-1.5">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
                  </svg>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                    className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-gray-100 border-0 focus:outline-none focus:ring-2 focus:ring-green-500 placeholder-gray-400" />
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
                    const isChecked = selectedUids.has(msg.uid)
                    return (
                      <div key={msg.uid}
                        className={`flex items-start gap-2 px-3 py-3 transition group
                          ${isSelected ? 'bg-green-50 border-l-2 border-green-600' : isChecked ? 'bg-green-50/40 border-l-2 border-transparent' : 'border-l-2 border-transparent hover:bg-gray-50'}
                          ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
                        <input type="checkbox" checked={isChecked}
                          onChange={() => toggleSelect(msg.uid)}
                          onClick={e => e.stopPropagation()}
                          className="mt-2 w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer shrink-0" />
                        <button onClick={() => openMessage(msg)} className="flex-1 flex items-start gap-2.5 text-left min-w-0">
                          <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${avatarColor(name)}`}>
                            {nameInitials(name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <span className={`text-sm truncate ${msg.unread ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{name}</span>
                              <span className="text-[11px] text-gray-400 shrink-0">{formatDate(msg.date)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {msg.unread && <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />}
                              <p className={`text-xs truncate leading-snug ${msg.unread ? 'text-gray-700' : 'text-gray-400'}`}>
                                {msg.subject || '(no subject)'}
                              </p>
                            </div>
                          </div>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Message viewer */}
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
                        <span className="w-px h-5 bg-gray-200 mx-0.5" />
                        <ToolbarBtn onClick={() => { applyAction([selected.uid], 'unread'); setSelected(null) }} title="Mark as unread" d={ICON.unread} disabled={actionBusy} />
                        {folder !== 'Archive' && <ToolbarBtn onClick={() => applyAction([selected.uid], 'archive')} title="Archive" d={ICON.archive} disabled={actionBusy} />}
                        {folder !== 'Junk' && <ToolbarBtn onClick={() => applyAction([selected.uid], 'spam')} title="Mark as spam" d={ICON.spam} disabled={actionBusy} />}
                        <MoveMenu folder={folder} customFolders={customFolders} onMove={to => applyAction([selected.uid], 'move', to)} />
                        {!contacts.find(c => c.email.toLowerCase() === fromEmail(selected.from).toLowerCase()) && (
                          <ToolbarBtn onClick={saveSenderAsContact} title="Save sender as contact"
                            d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        )}
                        <ToolbarBtn onClick={() => applyAction([selected.uid], 'delete')} title="Delete" d={ICON.trash} danger disabled={actionBusy} />
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
        </div>
      )}

      {/* ══════════════ CONTACTS SECTION ══════════════ */}
      {section === 'contacts' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
              </svg>
              <input value={contactSearch2} onChange={e => setContactSearch2(e.target.value)} placeholder="Search contacts…"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
            </div>
            <button
              onClick={() => { setEditingContact(null); setContactForm(emptyContactForm); setContactError(''); setShowAddContact(true) }}
              className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-green-700 bg-green-50 hover:bg-green-100 rounded-xl transition shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Contact
            </button>
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

      {/* ══════════════ FILTERS SECTION ══════════════ */}
      {section === 'filters' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-3xl mx-auto space-y-4">

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500 leading-relaxed">
                Rules run automatically every 5 minutes (and on demand) against your mailbox,
                matching case-insensitively. Each rule matches one field and moves, deletes, or
                marks messages read.
              </p>
              <button onClick={handleRunFilters} disabled={filterRunning}
                className="shrink-0 px-3 py-1.5 bg-green-700 text-white text-xs font-semibold rounded-lg hover:bg-green-800 disabled:opacity-50 transition">
                {filterRunning ? 'Running…' : 'Run now'}
              </button>
            </div>
            {filterRunMsg && <p className="text-xs text-gray-700 bg-gray-50 px-3 py-2 rounded-lg">{filterRunMsg}</p>}

            {/* Existing rules */}
            {filtersLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-green-700 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filters.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8 border-2 border-dashed border-gray-200 rounded-2xl">
                No rules yet. Add one below to auto-sort your mail.
              </p>
            ) : (
              <div className="space-y-2">
                {filters.map(f => (
                  <div key={f.id} className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {f.name && <p className="text-sm font-semibold text-gray-800 truncate">{f.name}</p>}
                        <p className="text-sm text-gray-600">{filterSummary(f)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Matched {f.matched_count.toLocaleString()}
                          {f.last_run_at && <> · last run {formatDate(f.last_run_at)}</>}
                        </p>
                        {f.last_error && <p className="text-xs text-red-600 mt-0.5">⚠ {f.last_error}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => toggleFilter(f)}
                          title={f.enabled ? 'Disable' : 'Enable'}
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full transition ${
                            f.enabled ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          {f.enabled ? 'On' : 'Off'}
                        </button>
                        <button onClick={() => editFilter(f)} title="Edit"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={() => handleDeleteFilter(f.id)} title="Delete"
                          className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add / edit form */}
            <form onSubmit={handleSaveFilter} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 shadow-sm">
              <p className="text-sm font-semibold text-gray-700">{editingFilterId ? 'Edit rule' : 'Add a rule'}</p>
              <input
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Rule name (optional)"
                value={filterForm.name}
                onChange={e => setFilterForm(f => ({ ...f, name: e.target.value }))} />
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">When field</label>
                  <select
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    value={filterForm.match_field}
                    onChange={e => setFilterForm(f => ({ ...f, match_field: e.target.value as MailFilterInput['match_field'] }))}>
                    <option value="from">From</option>
                    <option value="to_cc">To / Cc</option>
                    <option value="subject">Subject</option>
                    <option value="body">Body</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Contains</label>
                  <input
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="newsletter@…  or  text"
                    value={filterForm.pattern}
                    onChange={e => { setFilterForm(f => ({ ...f, pattern: e.target.value })); setFilterTest(null) }} required />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">In folder</label>
                  <select
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    value={filterForm.source_folder}
                    onChange={e => { setFilterForm(f => ({ ...f, source_folder: e.target.value })); setFilterTest(null) }}>
                    {FOLDERS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                    {customFolders.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Then</label>
                  <select
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    value={filterForm.action}
                    onChange={e => setFilterForm(f => ({ ...f, action: e.target.value as MailFilterInput['action'] }))}>
                    <option value="move">Move to folder</option>
                    <option value="delete">Delete (to Trash)</option>
                    <option value="mark_read">Mark as read</option>
                  </select>
                </div>
                {filterForm.action === 'move' && (
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">Destination folder</label>
                    <select
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      value={filterForm.dest_folder}
                      onChange={e => setFilterForm(f => ({ ...f, dest_folder: e.target.value }))}
                      required={filterForm.action === 'move'}>
                      <option value="">Choose a folder…</option>
                      {FOLDERS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                      {customFolders.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={filterForm.enabled}
                  onChange={e => setFilterForm(f => ({ ...f, enabled: e.target.checked }))} />
                Enabled
              </label>
              {filterError && <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{filterError}</p>}

              {filterTest && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-xs space-y-1.5">
                  <p className="text-blue-900">
                    Matches <strong>{filterTest.matched}</strong> message{filterTest.matched === 1 ? '' : 's'} in {folderLabel(filterForm.source_folder)} right now
                    <span className="text-blue-500"> (using {MATCH_FIELD_LABELS[filterForm.match_field]})</span>.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['from', 'to_cc', 'subject', 'body'] as const).map(f => (
                      <span key={f}
                        className={`px-2 py-0.5 rounded-full ${f === filterForm.match_field ? 'bg-blue-600 text-white font-semibold' : 'bg-white border border-blue-200 text-blue-700'}`}>
                        {MATCH_FIELD_LABELS[f]}: {filterTest.by_field[f] ?? 0}
                      </span>
                    ))}
                  </div>
                  {filterTest.matched === 0 && (() => {
                    const best = (['from', 'subject', 'to_cc', 'body'] as const).find(f => (filterTest.by_field[f] ?? 0) > 0)
                    return best
                      ? <p className="text-blue-700">Tip: “{MATCH_FIELD_LABELS[best]}” matches {filterTest.by_field[best]} — switch the field to that.</p>
                      : <p className="text-blue-700">Nothing matches that pattern in any field.</p>
                  })()}
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={handleTestFilter} disabled={filterTesting || !filterForm.pattern.trim()}
                  className="px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition disabled:opacity-50">
                  {filterTesting ? 'Testing…' : 'Test'}
                </button>
                <div className="flex gap-2">
                  {editingFilterId && (
                    <button type="button" onClick={resetFilterForm}
                      className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition">Cancel edit</button>
                  )}
                  <button type="submit" disabled={filterSaving}
                    className="px-5 py-2 bg-green-700 text-white text-sm font-semibold rounded-xl hover:bg-green-800 disabled:opacity-50 transition">
                    {filterSaving ? 'Saving…' : editingFilterId ? 'Save rule' : 'Add rule'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════ EMPTY FOLDER CONFIRM ══════════════ */}
      {confirmEmpty && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setConfirmEmpty(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-2">Empty {folder === 'Trash' ? 'Trash' : 'Spam'}?</h3>
            <p className="text-sm text-gray-500 mb-5">
              This permanently deletes <strong>every</strong> message in {folder === 'Trash' ? 'Trash' : 'Spam'} — not just the ones shown. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmEmpty(false)} disabled={actionBusy}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition disabled:opacity-50">Cancel</button>
              <button onClick={emptyCurrentFolder} disabled={actionBusy}
                className="px-5 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 transition">
                {actionBusy ? 'Emptying…' : `Empty ${folder === 'Trash' ? 'Trash' : 'Spam'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ NEW FOLDER MODAL ══════════════ */}
      {showNewFolder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => { if (!creatingFolder) setShowNewFolder(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-1">New Folder</h3>
            <p className="text-xs text-gray-500 mb-4">
              Create a folder to organize your email. You can move any message into it from the message list or while reading it.
            </p>
            <form onSubmit={handleCreateFolder}>
              <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                placeholder="e.g. Receipts, Vendors, Board"
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              {folderError && <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg mt-2">{folderError}</p>}
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => { setShowNewFolder(false); setNewFolderName(''); setFolderError('') }}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition">Cancel</button>
                <button type="submit" disabled={creatingFolder || !newFolderName.trim()}
                  className="px-5 py-2 bg-green-700 text-white text-sm font-semibold rounded-xl hover:bg-green-800 disabled:opacity-50 transition">
                  {creatingFolder ? 'Creating…' : 'Create Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════ DELETE FOLDER CONFIRM ══════════════ */}
      {deleteFolderName && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setDeleteFolderName(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete "{deleteFolderName}"?</h3>
            <p className="text-sm text-gray-500 mb-5">
              The folder and any messages still inside it will be permanently deleted. Move anything you want to keep first.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteFolderName(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition">Cancel</button>
              <button onClick={handleDeleteFolder}
                className="px-5 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition">
                Delete Folder
              </button>
            </div>
          </div>
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
                {contactPickerOpen && (composeContactSuggestions.length > 0 || (contactSearch === '' && contacts.length > 0)) && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                    {(contactSearch === '' ? contacts : composeContactSuggestions).map(c => (
                      <button key={c.id} type="button"
                        onClick={() => {
                          if (!toChips.includes(c.email)) setToChips(ch => [...ch, c.email])
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
