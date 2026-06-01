import { useEffect, useState } from 'react'
import { api } from '../../api/client'

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

export default function AdminMail() {
  const [accounts, setAccounts] = useState<MailAccount[]>([])
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showGuide, setShowGuide] = useState(false)

  // Add modal
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ address: '', role_label: '', display_name: '', quota_mb: 1000 })
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  // Edit modal
  const [editTarget, setEditTarget] = useState<MailAccount | null>(null)
  const [editForm, setEditForm] = useState({ role_label: '', display_name: '', quota_mb: 1000 })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Assign modal
  const [assignTarget, setAssignTarget] = useState<MailAccount | null>(null)
  const [assignUserId, setAssignUserId] = useState<string>('')
  const [assignSaving, setAssignSaving] = useState(false)
  const [assignError, setAssignError] = useState('')

  // Password modal
  const [pwTarget, setPwTarget] = useState<MailAccount | null>(null)
  const [pwLoading, setPwLoading] = useState(false)
  const [generatedPw, setGeneratedPw] = useState('')
  const [pwCopied, setPwCopied] = useState(false)

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<MailAccount | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  async function load() {
    try {
      const [accs, users] = await Promise.all([
        api.mail.list(),
        api.admin.users() as Promise<BoardMember[]>,
      ])
      setAccounts(accs)
      setBoardMembers((users as BoardMember[]).filter(isBoardMember))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // --- Add ---
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddSaving(true); setAddError('')
    try {
      await api.mail.create(addForm)
      setShowAdd(false)
      setAddForm({ address: '', role_label: '', display_name: '', quota_mb: 1000 })
      await load()
    } catch (e: any) { setAddError(e.message) }
    finally { setAddSaving(false) }
  }

  // --- Edit ---
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
      setEditTarget(null)
      await load()
    } catch (e: any) { setEditError(e.message) }
    finally { setEditSaving(false) }
  }

  // --- Assign ---
  function openAssign(a: MailAccount) {
    setAssignTarget(a)
    setAssignUserId(a.assigned_user_id ?? '')
    setAssignError('')
  }
  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!assignTarget) return
    setAssignSaving(true); setAssignError('')
    try {
      await api.mail.assign(assignTarget.id, assignUserId || null)
      setAssignTarget(null)
      await load()
    } catch (e: any) { setAssignError(e.message) }
    finally { setAssignSaving(false) }
  }

  // --- Reset Password ---
  async function handleResetPassword(a: MailAccount) {
    setPwTarget(a); setGeneratedPw(''); setPwCopied(false); setPwLoading(true)
    try {
      const res = await api.mail.resetPassword(a.id)
      setGeneratedPw(res.password)
      await load()
    } catch (e: any) { setGeneratedPw('') }
    finally { setPwLoading(false) }
  }

  function copyPassword() {
    if (!generatedPw) return
    if (navigator.clipboard) {
      navigator.clipboard.writeText(generatedPw).catch(() => fallbackCopy(generatedPw))
    } else {
      fallbackCopy(generatedPw)
    }
    setPwCopied(true)
    setTimeout(() => setPwCopied(false), 2000)
  }

  function fallbackCopy(text: string) {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }

  // --- Delete ---
  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      await api.mail.delete(deleteTarget.id)
      setDeleteTarget(null)
      await load()
    } catch { /* ignore */ }
    finally { setDeleteLoading(false) }
  }

  const assigned = accounts.filter(a => a.assigned_user_id).length
  const withPw = accounts.filter(a => a.has_password).length

  if (loading) return <div className="text-gray-400 text-sm">Loading...</div>
  if (error) return <div className="text-red-600 text-sm">{error}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Mail Accounts</h2>
        <button onClick={() => { setShowAdd(true); setAddError('') }}
          className="px-3 py-1.5 bg-green-700 text-white text-sm font-medium rounded-lg hover:bg-green-800">
          + Add Account
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: accounts.length, color: 'bg-gray-100 text-gray-700' },
          { label: 'Assigned', value: assigned, color: 'bg-green-50 text-green-700' },
          { label: 'Password Set', value: withPw, color: 'bg-blue-50 text-blue-700' },
          { label: 'No Password', value: accounts.length - withPw, color: 'bg-yellow-50 text-yellow-700' },
        ].map(s => (
          <div key={s.label} className={`rounded-lg px-4 py-3 ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">Email Address</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Assigned To</th>
              <th className="px-4 py-3 text-left">Password</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {accounts.map(a => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{a.address}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{a.role_label}</td>
                <td className="px-4 py-3">
                  {a.assigned_name
                    ? <span className="text-gray-800">{a.assigned_name}</span>
                    : <span className="text-gray-400 italic">Unassigned</span>}
                </td>
                <td className="px-4 py-3">
                  {a.has_password
                    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">Set</span>
                    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700 font-medium">Not set</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => handleResetPassword(a)}
                      className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium">
                      Reset Password
                    </button>
                    <button onClick={() => openAssign(a)}
                      className="text-xs px-2 py-1 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium">
                      Assign
                    </button>
                    <button onClick={() => openEdit(a)}
                      className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium">
                      Edit
                    </button>
                    <button onClick={() => setDeleteTarget(a)}
                      className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 font-medium">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Setup Guide */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setShowGuide(g => !g)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100">
          <span>Mail Server Setup Guide (Stalwart / Postfix + Dovecot)</span>
          <span className="text-gray-400">{showGuide ? '▲' : '▼'}</span>
        </button>
        {showGuide && (
          <div className="px-4 py-4 space-y-4 text-sm text-gray-700">
            <p>
              These accounts are stored in PostgreSQL. Configure your mail server to query this
              database for authentication. Passwords are stored as bcrypt hashes.
            </p>

            <div>
              <p className="font-semibold mb-1">Stalwart Mail — SQL authentication query</p>
              <pre className="bg-gray-900 text-green-300 text-xs rounded-lg p-3 overflow-x-auto whitespace-pre">{`# stalwart.toml
[directory.sql]
type = "sql"
address = "postgresql://user:pass@localhost/liveoaks"

[directory.sql.query]
name = "SELECT display_name FROM mail_accounts WHERE address = $1 AND active = true"
members = ""
emails = "SELECT address FROM mail_accounts WHERE address = $1 AND active = true"
verify = "SELECT address FROM mail_accounts WHERE address LIKE '%' || $1 || '%' AND active = true"
expand = ""
domains = "SELECT 1 FROM mail_accounts WHERE address LIKE '%@' || $1 AND active = true LIMIT 1"

[directory.sql.query.secrets]
hash = "SELECT password_hash FROM mail_accounts WHERE address = $1 AND active = true"`}
              </pre>
            </div>

            <div>
              <p className="font-semibold mb-1">Dovecot — PostgreSQL auth query</p>
              <pre className="bg-gray-900 text-green-300 text-xs rounded-lg p-3 overflow-x-auto whitespace-pre">{`# /etc/dovecot/dovecot-sql.conf.ext
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
  WHERE address = '%u' AND active = true`}
              </pre>
            </div>

            <div>
              <p className="font-semibold mb-1">Postfix — virtual mailbox maps via pgsql</p>
              <pre className="bg-gray-900 text-green-300 text-xs rounded-lg p-3 overflow-x-auto whitespace-pre">{`# /etc/postfix/pgsql-virtual-mailbox-maps.cf
hosts = localhost
dbname = liveoaks
user = postfix
password = secret
query = SELECT address FROM mail_accounts WHERE address='%s' AND active = true`}
              </pre>
            </div>

            <p className="text-xs text-gray-500">
              After installing Stalwart Mail, run the migration <code>074_mail_accounts.sql</code> on
              your database, then use "Reset Password" above to set credentials for each board member
              before handing off the account.
            </p>
          </div>
        )}
      </div>

      {/* ── Add Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Add Mail Account</h3>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email Address</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="treasurer@liveoakstennis.com"
                  value={addForm.address}
                  onChange={e => setAddForm(f => ({ ...f, address: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role Label</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Treasurer"
                  value={addForm.role_label}
                  onChange={e => setAddForm(f => ({ ...f, role_label: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Display Name (shown in From field)</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Liveoaks Tennis Club Treasurer"
                  value={addForm.display_name}
                  onChange={e => setAddForm(f => ({ ...f, display_name: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mailbox Quota (MB)</label>
                <input type="number" min="100" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={addForm.quota_mb}
                  onChange={e => setAddForm(f => ({ ...f, quota_mb: parseInt(e.target.value) || 1000 }))} />
              </div>
              {addError && <p className="text-red-600 text-xs">{addError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                <button type="submit" disabled={addSaving}
                  className="px-4 py-2 bg-green-700 text-white text-sm font-medium rounded-lg hover:bg-green-800 disabled:opacity-50">
                  {addSaving ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setEditTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">Edit Account</h3>
            <p className="text-xs text-gray-500 mb-4 font-mono">{editTarget.address}</p>
            <form onSubmit={handleEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role Label</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={editForm.role_label}
                  onChange={e => setEditForm(f => ({ ...f, role_label: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Display Name</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={editForm.display_name}
                  onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mailbox Quota (MB)</label>
                <input type="number" min="100" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={editForm.quota_mb}
                  onChange={e => setEditForm(f => ({ ...f, quota_mb: parseInt(e.target.value) || 1000 }))} />
              </div>
              {editError && <p className="text-red-600 text-xs">{editError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditTarget(null)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                <button type="submit" disabled={editSaving}
                  className="px-4 py-2 bg-green-700 text-white text-sm font-medium rounded-lg hover:bg-green-800 disabled:opacity-50">
                  {editSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Assign Modal ── */}
      {assignTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setAssignTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">Assign Account</h3>
            <p className="text-xs text-gray-500 mb-4 font-mono">{assignTarget.address}</p>
            <form onSubmit={handleAssign} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Board Member</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                  value={assignUserId}
                  onChange={e => setAssignUserId(e.target.value)}>
                  <option value="">— Unassign —</option>
                  {boardMembers.map(m => (
                    <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                  ))}
                </select>
              </div>
              {assignError && <p className="text-red-600 text-xs">{assignError}</p>}
              <p className="text-xs text-gray-500">
                Assigning records who holds this role. Use "Reset Password" after assigning to give
                the new person their login credentials.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setAssignTarget(null)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                <button type="submit" disabled={assignSaving}
                  className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50">
                  {assignSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Reset Password Modal ── */}
      {pwTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => { setPwTarget(null); setGeneratedPw('') }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">Reset Password</h3>
            <p className="text-xs text-gray-500 mb-4 font-mono">{pwTarget.address}</p>
            {pwLoading && <p className="text-sm text-gray-500">Generating password…</p>}
            {!pwLoading && !generatedPw && (
              <p className="text-sm text-red-500">Failed to generate password. Please try again.</p>
            )}
            {generatedPw && (
              <div className="space-y-3">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-xs text-yellow-800 font-medium mb-2">
                    Copy this password now — it will not be shown again.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white border border-yellow-300 rounded px-3 py-2 text-sm font-mono tracking-widest select-all">
                      {generatedPw}
                    </code>
                    <button onClick={copyPassword}
                      className="shrink-0 px-3 py-2 text-xs font-medium rounded-lg bg-yellow-200 hover:bg-yellow-300 text-yellow-900">
                      {pwCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Give this password to <strong>{pwTarget.assigned_name ?? 'the board member'}</strong>.
                  They will use it to log into webmail or configure their email client with IMAP/SMTP.
                </p>
              </div>
            )}
            <div className="flex justify-end pt-4">
              <button onClick={() => { setPwTarget(null); setGeneratedPw('') }}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Delete Account?</h3>
            <p className="text-sm text-gray-600 mb-1">
              This will permanently delete the mail account:
            </p>
            <p className="text-sm font-mono text-red-700 mb-4">{deleteTarget.address}</p>
            <p className="text-xs text-gray-500 mb-4">
              This does not delete the mailbox on the mail server — remove it there separately.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleDelete} disabled={deleteLoading}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
