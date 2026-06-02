import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'

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

  async function load() {
    try {
      const [accs, users] = await Promise.all([api.mail.list(), api.admin.users() as Promise<BoardMember[]>])
      setAccounts(accs)
      setBoardMembers((users as BoardMember[]).filter(isBoardMember))
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
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

  const assigned  = accounts.filter(a => a.assigned_user_id).length
  const withPw    = accounts.filter(a => a.has_password).length
  const unassigned = accounts.filter(a => !a.assigned_user_id).length

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Accounts', value: accounts.length, icon: '📬', bg: 'bg-slate-50 border-slate-200', text: 'text-slate-700' },
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
              <p className="text-xs text-gray-500 mb-3 truncate">
                <span className="text-gray-400">From: </span>{a.display_name}
              </p>

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
    </div>
  )
}
