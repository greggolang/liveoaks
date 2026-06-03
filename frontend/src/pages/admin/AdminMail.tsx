import { useEffect, useState } from 'react'
import { api, type MailFilter, type MailFilterInput } from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'

const emptyFilterForm: MailFilterInput = {
  name: '', enabled: true, match_field: 'from', pattern: '',
  source_folder: 'INBOX', action: 'move', dest_folder: '',
}

const MATCH_FIELD_LABELS: Record<MailFilterInput['match_field'], string> = {
  from: 'From', to_cc: 'To / Cc', subject: 'Subject', body: 'Body',
}

interface MailAccount {
  id: string
  address: string
  role_label: string
  display_name: string
  assigned_user_id: string | null
  assigned_name: string | null
  has_password: boolean
  quota_mb: number
  active: boolean
  created_at: string
  updated_at: string
}

interface BoardMember {
  id: string
  first_name: string
  last_name: string
  role: string
  extra_roles: string[]
}

const BOARD_ROLES = new Set([
  'admin','president','vice_president','secretary','treasurer',
  'entertainment','house_grounds','billing','membership','usta','games','pro',
])

function isBoardMember(u: BoardMember) {
  return BOARD_ROLES.has(u.role) || (u.extra_roles ?? []).some(r => BOARD_ROLES.has(r))
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function Modal({ onClose, children }: { onClose?: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function ModalHeader({ title, sub, onClose }: { title: string; sub?: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {sub && <p className="text-xs text-gray-400 font-mono mt-0.5">{sub}</p>}
      </div>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition mt-0.5">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

export default function AdminMail() {
  const { isAdmin } = useAuth()
  const [accounts, setAccounts] = useState<MailAccount[]>([])
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showGuide, setShowGuide] = useState(false)

  type MailStat = { messages: number; unseen: number; by_folder: Record<string, number> }
  const [stats, setStats] = useState<Record<string, MailStat | 'loading' | 'error'>>({})

  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ address: '', role_label: '', display_name: '', quota_mb: 1000 })
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  const [editTarget, setEditTarget] = useState<MailAccount | null>(null)
  const [editForm, setEditForm] = useState({ role_label: '', display_name: '', quota_mb: 1000 })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const [assignTarget, setAssignTarget] = useState<MailAccount | null>(null)
  const [assignUserId, setAssignUserId] = useState('')
  const [assignSaving, setAssignSaving] = useState(false)
  const [assignError, setAssignError] = useState('')

  const [pwTarget, setPwTarget] = useState<MailAccount | null>(null)
  const [pwLoading, setPwLoading] = useState(false)
  const [generatedPw, setGeneratedPw] = useState('')
  const [pwCopied, setPwCopied] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<MailAccount | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [importTarget, setImportTarget] = useState<MailAccount | null>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importFolder, setImportFolder] = useState('__auto__')
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importResult, setImportResult] = useState<{ imported: number; failed: number; by_folder: Record<string, number> } | null>(null)
  const [importError, setImportError] = useState('')

  const [emptyTarget, setEmptyTarget] = useState<MailAccount | null>(null)
  const [emptyConfirm, setEmptyConfirm] = useState('')
  const [emptyLoading, setEmptyLoading] = useState(false)
  const [emptyResult, setEmptyResult] = useState<{ deleted: number } | null>(null)
  const [emptyError, setEmptyError] = useState('')

  const [filtersTarget, setFiltersTarget] = useState<MailAccount | null>(null)
  const [filters, setFilters] = useState<MailFilter[]>([])
  const [filtersLoading, setFiltersLoading] = useState(false)
  const [filterForm, setFilterForm] = useState<MailFilterInput>(emptyFilterForm)
  const [editingFilterId, setEditingFilterId] = useState<string | null>(null)
  const [filterSaving, setFilterSaving] = useState(false)
  const [filterError, setFilterError] = useState('')
  const [filterRunning, setFilterRunning] = useState(false)
  const [filterRunMsg, setFilterRunMsg] = useState('')
  const [filterTest, setFilterTest] = useState<{ matched: number; by_field: Record<string, number> } | null>(null)
  const [filterTesting, setFilterTesting] = useState(false)

  async function load() {
    try {
      const [accs, users] = await Promise.all([api.mail.list(), api.admin.users() as Promise<BoardMember[]>])
      setAccounts(accs)
      setBoardMembers((users as BoardMember[]).filter(isBoardMember))
      loadStats(accs)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  // Email counts come from IMAP, so they're fetched per-account after the list
  // renders rather than blocking the page. Accounts with no password can't be
  // queried and are left without a count.
  async function refreshStat(id: string) {
    setStats(s => ({ ...s, [id]: 'loading' }))
    try {
      const stat = await api.mail.stats(id)
      setStats(s => ({ ...s, [id]: stat }))
    } catch {
      setStats(s => ({ ...s, [id]: 'error' }))
    }
  }

  function loadStats(accs: MailAccount[]) {
    accs.filter(a => a.has_password).forEach(a => refreshStat(a.id))
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setAddSaving(true); setAddError('')
    try {
      await api.mail.create(addForm)
      setShowAdd(false)
      setAddForm({ address: '', role_label: '', display_name: '', quota_mb: 1000 })
      await load()
    } catch (e: any) { setAddError(e.message) }
    finally { setAddSaving(false) }
  }

  function openEdit(a: MailAccount) {
    setEditTarget(a)
    setEditForm({ role_label: a.role_label, display_name: a.display_name, quota_mb: a.quota_mb })
    setEditError('')
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editTarget) return
    setEditSaving(true); setEditError('')
    try {
      await api.mail.update(editTarget.id, editForm)
      setEditTarget(null); await load()
    } catch (e: any) { setEditError(e.message) }
    finally { setEditSaving(false) }
  }

  function openAssign(a: MailAccount) {
    setAssignTarget(a); setAssignUserId(a.assigned_user_id ?? ''); setAssignError('')
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!assignTarget) return
    setAssignSaving(true); setAssignError('')
    try {
      await api.mail.assign(assignTarget.id, assignUserId || null)
      setAssignTarget(null); await load()
    } catch (e: any) { setAssignError(e.message) }
    finally { setAssignSaving(false) }
  }

  async function handleResetPassword(a: MailAccount) {
    setPwTarget(a); setGeneratedPw(''); setPwCopied(false); setPwLoading(true)
    try {
      const res = await api.mail.resetPassword(a.id)
      setGeneratedPw(res.password); await load()
    } catch { setGeneratedPw('') }
    finally { setPwLoading(false) }
  }

  function copyPassword() {
    if (!generatedPw) return
    const copy = (t: string) => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(t).catch(() => fallbackCopy(t))
      } else {
        fallbackCopy(t)
      }
    }
    copy(generatedPw); setPwCopied(true); setTimeout(() => setPwCopied(false), 2000)
  }

  function fallbackCopy(text: string) {
    const ta = document.createElement('textarea')
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.focus(); ta.select()
    document.execCommand('copy'); document.body.removeChild(ta)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try { await api.mail.delete(deleteTarget.id); setDeleteTarget(null); await load() }
    catch { /* ignore */ }
    finally { setDeleteLoading(false) }
  }

  function openImport(a: MailAccount) {
    setImportTarget(a); setImportFile(null); setImportFolder('INBOX')
    setImportProgress(0); setImportResult(null); setImportError('')
  }

  function openEmpty(a: MailAccount) {
    setEmptyTarget(a); setEmptyConfirm(''); setEmptyResult(null); setEmptyError('')
  }

  async function handleEmpty() {
    if (!emptyTarget || emptyConfirm.trim().toLowerCase() !== emptyTarget.address.toLowerCase()) return
    setEmptyLoading(true); setEmptyError('')
    try {
      const res = await api.mail.emptyMailbox(emptyTarget.id)
      setEmptyResult({ deleted: res.deleted })
    } catch (e: any) { setEmptyError(e.message) }
    finally { setEmptyLoading(false) }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()
    if (!importTarget || !importFile) return
    setImporting(true); setImportError(''); setImportResult(null); setImportProgress(0)
    try {
      const res = await api.mail.importMbox(importTarget.id, importFile, importFolder, setImportProgress)
      setImportResult({ imported: res.imported, failed: res.failed, by_folder: res.by_folder ?? {} })
      refreshStat(importTarget.id)
    } catch (e: any) { setImportError(e.message) }
    finally { setImporting(false) }
  }

  async function openFilters(a: MailAccount) {
    setFiltersTarget(a); setFilters([]); resetFilterForm()
    setFilterRunMsg(''); setFiltersLoading(true)
    try { setFilters(await api.mail.filters(a.id)) }
    catch (e: any) { setFilterError(e.message) }
    finally { setFiltersLoading(false) }
  }

  async function reloadFilters() {
    if (!filtersTarget) return
    try { setFilters(await api.mail.filters(filtersTarget.id)) } catch { /* ignore */ }
  }

  function resetFilterForm() {
    setEditingFilterId(null); setFilterForm(emptyFilterForm); setFilterError(''); setFilterTest(null)
  }

  async function handleTestFilter() {
    if (!filtersTarget || !filterForm.pattern.trim()) { setFilterError('Enter a pattern to test'); return }
    setFilterTesting(true); setFilterError(''); setFilterTest(null)
    try {
      setFilterTest(await api.mail.testFilter(filtersTarget.id, {
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
    if (!filtersTarget) return
    setFilterSaving(true); setFilterError('')
    try {
      if (editingFilterId) await api.mail.updateFilter(editingFilterId, filterForm)
      else await api.mail.createFilter(filtersTarget.id, filterForm)
      resetFilterForm(); await reloadFilters()
    } catch (e: any) { setFilterError(e.message) }
    finally { setFilterSaving(false) }
  }

  async function toggleFilter(f: MailFilter) {
    try { await api.mail.updateFilter(f.id, { ...f, enabled: !f.enabled }); await reloadFilters() }
    catch { /* ignore */ }
  }

  async function handleDeleteFilter(id: string) {
    try {
      await api.mail.deleteFilter(id)
      if (editingFilterId === id) resetFilterForm()
      await reloadFilters()
    } catch { /* ignore */ }
  }

  async function handleRunFilters() {
    if (!filtersTarget) return
    setFilterRunning(true); setFilterRunMsg('')
    try {
      const res = await api.mail.runFilters(filtersTarget.id)
      const errs = res.errors ?? []
      setFilterRunMsg(
        errs.length
          ? `Acted on ${res.matched} · ${errs.length} error${errs.length === 1 ? '' : 's'}: ${errs[0]}`
          : `Acted on ${res.matched} message${res.matched === 1 ? '' : 's'}`
      )
      await reloadFilters()
    } catch (e: any) { setFilterRunMsg(e.message) }
    finally { setFilterRunning(false) }
  }

  function filterSummary(f: MailFilter) {
    const where = `${MATCH_FIELD_LABELS[f.match_field]} contains “${f.pattern}” in ${f.source_folder}`
    const what = f.action === 'move' ? `move to ${f.dest_folder}`
      : f.action === 'delete' ? 'move to Trash' : 'mark read'
    return `${where} → ${what}`
  }

  const assigned  = accounts.filter(a => a.assigned_user_id).length
  const withPw    = accounts.filter(a => a.has_password).length
  const unassigned = accounts.filter(a => !a.assigned_user_id).length

  const loadedStats = Object.values(stats).filter((s): s is MailStat => typeof s === 'object')
  const totalEmails = loadedStats.reduce((n, s) => n + s.messages, 0)
  const countsPending = accounts.some(a => a.has_password && (!stats[a.id] || stats[a.id] === 'loading'))

  if (!isAdmin) return <div className="text-gray-500 text-sm p-4">You don't have permission to manage mail accounts.</div>

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-6 h-6 border-2 border-green-700 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (error) return <div className="text-red-600 text-sm p-4 bg-red-50 rounded-xl">{error}</div>

  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mail Accounts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Board member email addresses and credentials</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setAddError('') }}
          className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-xl transition shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Account
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Accounts', value: accounts.length, icon: '📬', bg: 'bg-slate-50 border-slate-200', text: 'text-slate-700' },
          { label: 'Total Emails',   value: countsPending ? `${totalEmails.toLocaleString()}…` : totalEmails.toLocaleString(), icon: '✉️', bg: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700' },
          { label: 'Assigned',       value: assigned,         icon: '👤', bg: 'bg-green-50 border-green-200', text: 'text-green-700' },
          { label: 'Unassigned',     value: unassigned,       icon: '⚠️', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
          { label: 'Password Set',   value: withPw,           icon: '🔑', bg: 'bg-blue-50 border-blue-200',   text: 'text-blue-700' },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl border px-4 py-3.5 ${s.bg} flex items-center gap-3`}>
            <span className="text-2xl">{s.icon}</span>
            <div>
              <p className={`text-2xl font-bold leading-none ${s.text}`}>{s.value}</p>
              <p className={`text-xs font-medium mt-0.5 ${s.text} opacity-70`}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Account cards ── */}
      {accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
          <svg className="w-10 h-10 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="font-medium text-sm">No mail accounts yet</p>
          <p className="text-xs mt-1">Click "Add Account" to create the first one.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.map(a => (
            <div key={a.id}
              className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">

              {/* Top row: address + badges */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                    {a.role_label ? a.role_label.slice(0, 2).toUpperCase() : '??'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">{a.role_label}</p>
                    <p className="text-xs text-gray-400 font-mono truncate">{a.address}</p>
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {a.has_password
                    ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">PW set</span>
                    : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">No PW</span>}
                </div>
              </div>

              {/* Display name */}
              <p className="text-xs text-gray-500 mb-2 truncate">
                <span className="text-gray-400">From: </span>{a.display_name}
              </p>

              {/* Email count (loaded lazily from IMAP) */}
              {(() => {
                const st = stats[a.id]
                const obj = typeof st === 'object' ? st : null
                const tip = obj
                  ? Object.entries(obj.by_folder).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1])
                      .map(([f, n]) => `${f}: ${n.toLocaleString()}`).join('\n') || 'No email'
                  : undefined
                return (
                  <div className="mb-3 flex items-center gap-1.5 text-xs" title={tip}>
                    <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    {!a.has_password ? (
                      <span className="text-gray-400">Set a password to see counts</span>
                    ) : !st || st === 'loading' ? (
                      <span className="text-gray-400 flex items-center gap-1.5">
                        <span className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin inline-block" />
                        Counting…
                      </span>
                    ) : st === 'error' ? (
                      <button onClick={() => refreshStat(a.id)} className="text-gray-400 hover:text-gray-600 underline decoration-dotted">
                        Count unavailable — retry
                      </button>
                    ) : (
                      <span className="text-gray-600">
                        <strong className="text-gray-800">{obj!.messages.toLocaleString()}</strong> email{obj!.messages === 1 ? '' : 's'}
                        {obj!.unseen > 0 && <span className="text-green-700"> · {obj!.unseen.toLocaleString()} unread</span>}
                      </span>
                    )}
                  </div>
                )
              })()}

              {/* Assigned to */}
              <div className="flex items-center gap-2 mb-4">
                {a.assigned_name ? (
                  <>
                    <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                      {initials(a.assigned_name)}
                    </div>
                    <span className="text-xs text-gray-700 font-medium">{a.assigned_name}</span>
                  </>
                ) : (
                  <>
                    <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center shrink-0">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-400 italic">Unassigned</span>
                  </>
                )}
                <span className="text-gray-200 text-xs ml-auto">
                  {a.quota_mb >= 1000 ? `${(a.quota_mb / 1000).toFixed(a.quota_mb % 1000 === 0 ? 0 : 1)} GB` : `${a.quota_mb} MB`} quota
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                <button
                  onClick={() => handleResetPassword(a)}
                  title="Reset password"
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  Password
                </button>
                <button
                  onClick={() => openAssign(a)}
                  title="Assign to board member"
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold transition">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Assign
                </button>
                <button
                  onClick={() => openImport(a)}
                  title="Import email from MBOX file"
                  className="p-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 hover:text-amber-700 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
                <button
                  onClick={() => openFilters(a)}
                  title="Email filters — auto-move/delete rules"
                  className="p-2 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-600 hover:text-teal-700 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L14 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 018 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                  </svg>
                </button>
                <button
                  onClick={() => openEdit(a)}
                  title="Edit account"
                  className="p-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => setDeleteTarget(a)}
                  title="Delete account"
                  className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {/* Empty mailbox — wipe all email but keep the account (reset before re-import) */}
              <button
                onClick={() => openEmpty(a)}
                className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-red-600 hover:bg-red-50 transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                Empty mailbox — delete all email
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Setup Guide ── */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setShowGuide(g => !g)}
          className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 hover:bg-gray-100 transition text-sm font-medium text-gray-700">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Mail Server Setup Guide
          </div>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${showGuide ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showGuide && (
          <div className="px-5 py-5 space-y-5 text-sm text-gray-700 bg-white">
            <p className="text-gray-500 text-xs leading-relaxed">
              Passwords are stored as bcrypt hashes in the <code className="bg-gray-100 px-1 rounded">mail_accounts</code> table.
              Configure your mail server to authenticate against this database.
            </p>

            {[
              {
                title: 'Stalwart Mail — SQL authentication',
                code: `# stalwart.toml
[directory.sql]
type = "sql"
address = "postgresql://user:pass@localhost/liveoaks"

[directory.sql.query]
name = "SELECT display_name FROM mail_accounts WHERE address = $1 AND active = true"
emails = "SELECT address FROM mail_accounts WHERE address = $1 AND active = true"
verify = "SELECT address FROM mail_accounts WHERE address LIKE '%' || $1 || '%' AND active = true"
domains = "SELECT 1 FROM mail_accounts WHERE address LIKE '%@' || $1 AND active = true LIMIT 1"

[directory.sql.query.secrets]
hash = "SELECT password_hash FROM mail_accounts WHERE address = $1 AND active = true"`,
              },
              {
                title: 'Dovecot — PostgreSQL auth',
                code: `# /etc/dovecot/dovecot-sql.conf.ext
driver = pgsql
connect = host=localhost dbname=liveoaks user=dovecot password=secret
default_pass_scheme = BLF-CRYPT

password_query = \\
  SELECT password_hash AS password \\
  FROM mail_accounts \\
  WHERE address = '%u' AND active = true

user_query = \\
  SELECT quota_mb * 1048576 AS quota_rule \\
  FROM mail_accounts \\
  WHERE address = '%u' AND active = true`,
              },
              {
                title: 'Postfix — virtual mailbox maps',
                code: `# /etc/postfix/pgsql-virtual-mailbox-maps.cf
hosts = localhost
dbname = liveoaks
user = postfix
password = secret
query = SELECT address FROM mail_accounts WHERE address='%s' AND active = true`,
              },
            ].map(({ title, code }) => (
              <div key={title}>
                <p className="text-xs font-semibold text-gray-800 mb-2">{title}</p>
                <pre className="bg-gray-900 text-green-300 text-xs rounded-xl p-4 overflow-x-auto whitespace-pre leading-relaxed">
                  {code}
                </pre>
              </div>
            ))}

            <p className="text-xs text-gray-400">
              Run migration <code className="bg-gray-100 px-1 rounded">074_mail_accounts.sql</code> first,
              then use "Password" above to set credentials before handing off each account.
            </p>
          </div>
        )}
      </div>


      {/* ── Add Modal ── */}
      {showAdd && (
        <Modal>
          <ModalHeader title="Add Mail Account" onClose={() => setShowAdd(false)} />
          <form onSubmit={handleAdd} className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email Address</label>
              <input className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="treasurer@liveoakstennis.com"
                value={addForm.address}
                onChange={e => setAddForm(f => ({ ...f, address: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Role Label</label>
              <input className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Treasurer"
                value={addForm.role_label}
                onChange={e => setAddForm(f => ({ ...f, role_label: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Display Name <span className="text-gray-400 font-normal">(shown in From field)</span></label>
              <input className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="LOTA Treasurer"
                value={addForm.display_name}
                onChange={e => setAddForm(f => ({ ...f, display_name: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Mailbox Quota</label>
              <div className="flex items-center gap-2">
                <input type="number" min="100"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  value={addForm.quota_mb}
                  onChange={e => setAddForm(f => ({ ...f, quota_mb: parseInt(e.target.value) || 1000 }))} />
                <span className="text-sm text-gray-400 shrink-0">MB</span>
              </div>
            </div>
            {addError && <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{addError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowAdd(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition">Cancel</button>
              <button type="submit" disabled={addSaving}
                className="px-5 py-2 bg-green-700 text-white text-sm font-semibold rounded-xl hover:bg-green-800 disabled:opacity-50 transition">
                {addSaving ? 'Creating…' : 'Create Account'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Edit Modal ── */}
      {editTarget && (
        <Modal>
          <ModalHeader title="Edit Account" sub={editTarget.address} onClose={() => setEditTarget(null)} />
          <form onSubmit={handleEdit} className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Role Label</label>
              <input className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={editForm.role_label}
                onChange={e => setEditForm(f => ({ ...f, role_label: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Display Name</label>
              <input className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={editForm.display_name}
                onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Mailbox Quota</label>
              <div className="flex items-center gap-2">
                <input type="number" min="100"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  value={editForm.quota_mb}
                  onChange={e => setEditForm(f => ({ ...f, quota_mb: parseInt(e.target.value) || 1000 }))} />
                <span className="text-sm text-gray-400 shrink-0">MB</span>
              </div>
            </div>
            {editError && <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{editError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition">Cancel</button>
              <button type="submit" disabled={editSaving}
                className="px-5 py-2 bg-green-700 text-white text-sm font-semibold rounded-xl hover:bg-green-800 disabled:opacity-50 transition">
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Assign Modal ── */}
      {assignTarget && (
        <Modal>
          <ModalHeader title="Assign Account" sub={assignTarget.address} onClose={() => setAssignTarget(null)} />
          <form onSubmit={handleAssign} className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Board Member</label>
              <select
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={assignUserId}
                onChange={e => setAssignUserId(e.target.value)}>
                <option value="">— Unassign —</option>
                {boardMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-2.5 leading-relaxed">
              After assigning, use "Password" to generate and share credentials with the new holder.
            </p>
            {assignError && <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{assignError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setAssignTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition">Cancel</button>
              <button type="submit" disabled={assignSaving}
                className="px-5 py-2 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 transition">
                {assignSaving ? 'Saving…' : 'Save Assignment'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Reset Password Modal ── */}
      {pwTarget && (
        <Modal onClose={() => { setPwTarget(null); setGeneratedPw('') }}>
          <ModalHeader title="Reset Password" sub={pwTarget.address} onClose={() => { setPwTarget(null); setGeneratedPw('') }} />
          <div className="px-6 py-5 space-y-4">
            {pwLoading && (
              <div className="flex items-center gap-3 text-sm text-gray-500 py-2">
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                Generating password…
              </div>
            )}
            {!pwLoading && !generatedPw && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                Failed to generate password. Please try again.
              </div>
            )}
            {generatedPw && (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-amber-800">
                    Copy this password now — it will not be shown again.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white border border-amber-300 rounded-lg px-3 py-2.5 text-sm font-mono tracking-widest select-all text-gray-800">
                      {generatedPw}
                    </code>
                    <button onClick={copyPassword}
                      className={`shrink-0 px-3 py-2.5 text-xs font-semibold rounded-lg transition ${
                        pwCopied ? 'bg-green-600 text-white' : 'bg-amber-200 hover:bg-amber-300 text-amber-900'
                      }`}>
                      {pwCopied ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Share this with <strong>{pwTarget.assigned_name ?? 'the board member'}</strong>.
                  They'll use it to log into webmail or configure their email client (IMAP/SMTP).
                </p>
              </>
            )}
            <div className="flex justify-end pt-1">
              <button onClick={() => { setPwTarget(null); setGeneratedPw('') }}
                className="px-5 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition">
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Empty Mailbox Modal ── */}
      {emptyTarget && (
        <Modal onClose={emptyLoading ? undefined : () => setEmptyTarget(null)}>
          <ModalHeader title="Empty Mailbox" sub={emptyTarget.address}
            onClose={() => { if (!emptyLoading) setEmptyTarget(null) }} />
          <div className="px-6 py-5 space-y-4">
            {emptyResult ? (
              <>
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
                  Deleted <strong>{emptyResult.deleted}</strong> message{emptyResult.deleted === 1 ? '' : 's'} from
                  every folder. The mailbox is now empty.
                </div>
                <div className="flex justify-end">
                  <button onClick={() => { setEmptyTarget(null); load() }}
                    className="px-5 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition">
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 space-y-1">
                  <p className="font-semibold">This permanently deletes every email in this mailbox.</p>
                  <p className="text-red-600">
                    All folders — Inbox, Archive, Sent, Drafts, Trash, Spam — are wiped. The account itself,
                    its password and assignment are kept. <strong>This cannot be undone.</strong>
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Type <span className="font-mono text-gray-800">{emptyTarget.address}</span> to confirm
                  </label>
                  <input autoFocus value={emptyConfirm} onChange={e => setEmptyConfirm(e.target.value)}
                    disabled={emptyLoading}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder={emptyTarget.address} />
                </div>
                {emptyError && <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{emptyError}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setEmptyTarget(null)} disabled={emptyLoading}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition disabled:opacity-50">
                    Cancel
                  </button>
                  <button onClick={handleEmpty}
                    disabled={emptyLoading || emptyConfirm.trim().toLowerCase() !== emptyTarget.address.toLowerCase()}
                    className="px-5 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 transition">
                    {emptyLoading ? 'Deleting…' : 'Delete all email'}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* ── Import MBOX Modal ── */}
      {importTarget && (
        <Modal onClose={importing ? undefined : () => setImportTarget(null)}>
          <ModalHeader title="Import Email" sub={importTarget.address}
            onClose={() => { if (!importing) setImportTarget(null) }} />
          <form onSubmit={handleImport} className="px-6 py-5 space-y-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              Upload an <strong>.mbox</strong> file exported from Google Workspace (Google Takeout → Mail).
              Every message in the file is copied into this mailbox over IMAP, so the archive survives after
              the Workspace account is cancelled.
            </p>

            {!importTarget.has_password && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-800">
                This mailbox has no password yet. Click <strong>Password</strong> on the account first —
                the importer needs to log in to deliver the mail.
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">MBOX File</label>
              <input type="file" accept=".mbox,.mbx,application/mbox"
                disabled={importing}
                onChange={e => { setImportFile(e.target.files?.[0] ?? null); setImportResult(null); setImportError('') }}
                className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100" />
              {importFile && (
                <p className="text-xs text-gray-400 mt-1.5">
                  {importFile.name} — {(importFile.size / 1048576).toFixed(1)} MB
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Where to file the messages</label>
              <select value={importFolder} onChange={e => setImportFolder(e.target.value)}
                disabled={importing}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="__auto__">Auto-sort by Gmail labels (recommended)</option>
                <option value="INBOX">Everything into Inbox</option>
                <option value="Archive">Everything into Archive</option>
                <option value="Sent">Everything into Sent</option>
              </select>
              <p className="text-xs text-gray-400 mt-1.5">
                {importFolder === '__auto__'
                  ? 'Sent mail → Sent, archived mail → Archive, and Inbox/Drafts/Trash/Spam to matching folders — rebuilding the original mailbox.'
                  : 'Every message in the file goes into this one folder.'}
              </p>
            </div>

            {importing && (
              <div>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>{importProgress < 100 ? 'Uploading…' : 'Importing messages — this can take a minute…'}</span>
                  <span>{importProgress}%</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-600 transition-all" style={{ width: `${importProgress}%` }} />
                </div>
              </div>
            )}

            {importResult && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 space-y-2">
                <div>
                  Imported <strong>{importResult.imported}</strong> message{importResult.imported === 1 ? '' : 's'}
                  {importResult.failed > 0 && <> — <span className="text-amber-700">{importResult.failed} failed</span></>}.
                </div>
                {Object.keys(importResult.by_folder).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(importResult.by_folder).sort((a, b) => b[1] - a[1]).map(([folder, n]) => (
                      <span key={folder} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white border border-green-200 text-green-700">
                        {folder}: {n}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {importError && <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{importError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              {importResult ? (
                <button type="button" onClick={() => setImportTarget(null)}
                  className="px-5 py-2 bg-green-700 text-white text-sm font-semibold rounded-xl hover:bg-green-800 transition">
                  Done
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => setImportTarget(null)} disabled={importing}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition disabled:opacity-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={importing || !importFile || !importTarget.has_password}
                    className="px-5 py-2 bg-green-700 text-white text-sm font-semibold rounded-xl hover:bg-green-800 disabled:opacity-50 transition">
                    {importing ? 'Importing…' : 'Import'}
                  </button>
                </>
              )}
            </div>
          </form>
        </Modal>
      )}

      {/* ── Delete Modal ── */}
      {deleteTarget && (
        <Modal onClose={() => setDeleteTarget(null)}>
          <ModalHeader title="Delete Account?" onClose={() => setDeleteTarget(null)} />
          <div className="px-6 py-5 space-y-4">
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <p className="text-sm text-red-700 font-mono">{deleteTarget.address}</p>
            </div>
            <p className="text-sm text-gray-600">
              This permanently removes the account record. The mailbox on the mail server must be deleted separately.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition">Cancel</button>
              <button onClick={handleDelete} disabled={deleteLoading}
                className="px-5 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 transition">
                {deleteLoading ? 'Deleting…' : 'Delete Account'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Filters Modal ── */}
      {filtersTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setFiltersTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Email Filters</h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{filtersTarget.address}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleRunFilters} disabled={filterRunning || !filtersTarget.has_password}
                  title={filtersTarget.has_password ? 'Run all rules now' : 'Set a mailbox password first'}
                  className="px-3 py-1.5 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50 transition">
                  {filterRunning ? 'Running…' : 'Run now'}
                </button>
                <button onClick={() => setFiltersTarget(null)} className="text-gray-400 hover:text-gray-600 transition mt-0.5">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <p className="text-xs text-gray-500 leading-relaxed">
                Rules run automatically every 5 minutes and check the matched messages, case-insensitive.
                Each rule matches one field and moves, deletes, or marks them read.
              </p>
              {!filtersTarget.has_password && (
                <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                  This mailbox has no password yet — rules are saved but can't run until you click “Password”.
                </p>
              )}
              {filterRunMsg && <p className="text-xs text-gray-700 bg-gray-50 px-3 py-2 rounded-lg">{filterRunMsg}</p>}

              {/* Existing rules */}
              {filtersLoading ? (
                <div className="flex items-center justify-center py-6">
                  <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filters.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4 border-2 border-dashed border-gray-200 rounded-xl">
                  No rules yet. Add one below.
                </p>
              ) : (
                <div className="space-y-2">
                  {filters.map(f => (
                    <div key={f.id} className="border border-gray-200 rounded-xl px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {f.name && <p className="text-xs font-semibold text-gray-800 truncate">{f.name}</p>}
                          <p className="text-xs text-gray-600">{filterSummary(f)}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            Matched {f.matched_count.toLocaleString()}
                            {f.last_run_at && <> · last run {new Date(f.last_run_at).toLocaleString()}</>}
                          </p>
                          {f.last_error && <p className="text-[11px] text-red-600 mt-0.5">⚠ {f.last_error}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => toggleFilter(f)}
                            title={f.enabled ? 'Disable' : 'Enable'}
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition ${
                              f.enabled ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                            {f.enabled ? 'On' : 'Off'}
                          </button>
                          <button onClick={() => editFilter(f)} title="Edit"
                            className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button onClick={() => handleDeleteFilter(f.id)} title="Delete"
                            className="p-1 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <form onSubmit={handleSaveFilter} className="border-t border-gray-100 pt-4 space-y-3">
                <p className="text-xs font-semibold text-gray-700">{editingFilterId ? 'Edit rule' : 'Add a rule'}</p>
                <input
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Rule name (optional)"
                  value={filterForm.name}
                  onChange={e => setFilterForm(f => ({ ...f, name: e.target.value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">When field</label>
                    <select
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      placeholder="newsletter@…  or  text"
                      value={filterForm.pattern}
                      onChange={e => { setFilterForm(f => ({ ...f, pattern: e.target.value })); setFilterTest(null) }} required />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">In folder</label>
                    <input
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      placeholder="INBOX"
                      value={filterForm.source_folder}
                      onChange={e => { setFilterForm(f => ({ ...f, source_folder: e.target.value })); setFilterTest(null) }} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">Then</label>
                    <select
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      value={filterForm.action}
                      onChange={e => setFilterForm(f => ({ ...f, action: e.target.value as MailFilterInput['action'] }))}>
                      <option value="move">Move to folder</option>
                      <option value="delete">Delete (to Trash)</option>
                      <option value="mark_read">Mark as read</option>
                    </select>
                  </div>
                  {filterForm.action === 'move' && (
                    <div className="col-span-2">
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">Destination folder</label>
                      <input
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                        placeholder="Newsletters"
                        value={filterForm.dest_folder}
                        onChange={e => setFilterForm(f => ({ ...f, dest_folder: e.target.value }))}
                        required={filterForm.action === 'move'} />
                    </div>
                  )}
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input type="checkbox" checked={filterForm.enabled}
                    onChange={e => setFilterForm(f => ({ ...f, enabled: e.target.checked }))} />
                  Enabled
                </label>
                {filterError && <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{filterError}</p>}

                {filterTest && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-xs space-y-1.5">
                    <p className="text-blue-900">
                      Matches <strong>{filterTest.matched}</strong> message{filterTest.matched === 1 ? '' : 's'} in {filterForm.source_folder || 'INBOX'} right now
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
                      className="px-5 py-2 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-50 transition">
                      {filterSaving ? 'Saving…' : editingFilterId ? 'Save rule' : 'Add rule'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
