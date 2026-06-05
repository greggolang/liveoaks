import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { parseDate } from '../../utils/dates'

interface BoardMember {
  id: string
  first_name: string
  last_name: string
  role: string
}

interface PasswordEntry {
  id: string
  label: string
  username: string
  password: string
  url: string
  category: string
  notes: string
  created_by_name: string
  updated_by_name: string
  created_at: string
  updated_at: string
}

// Open a stored site in a new tab, adding https:// if the URL has no scheme.
function launchSite(rawUrl: string) {
  const u = rawUrl.trim()
  if (!u) return
  const full = /^https?:\/\//i.test(u) ? u : `https://${u}`
  window.open(full, '_blank', 'noopener,noreferrer')
}

function timeAgo(iso: string) {
  const diff = Date.now() - parseDate(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return parseDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminPasswords() {
  const [entries, setEntries] = useState<PasswordEntry[]>([])
  const [selected, setSelected] = useState<PasswordEntry | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [label, setLabel] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [url, setUrl] = useState('')
  const [category, setCategory] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [dirty, setDirty] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [copied, setCopied] = useState(false)
  const [addingNewCategory, setAddingNewCategory] = useState(false)
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleFolder = (k: string) =>
    setCollapsed(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const labelRef = useRef<HTMLInputElement>(null)

  // Board alerts state
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([])
  const [alertTargets, setAlertTargets] = useState<Set<string>>(new Set())
  const [alertMsg, setAlertMsg] = useState('')
  const [alertType, setAlertType] = useState('info')
  const [sendingAlert, setSendingAlert] = useState(false)
  const [alertSuccess, setAlertSuccess] = useState('')

  const toggleTarget = (id: string) =>
    setAlertTargets(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const toggleAll = () => {
    if (alertTargets.size === boardMembers.length) setAlertTargets(new Set())
    else setAlertTargets(new Set(boardMembers.map(m => m.id)))
  }

  const handleSendAlert = async () => {
    if (!alertMsg.trim() || alertTargets.size === 0) return
    setSendingAlert(true)
    setAlertSuccess('')
    try {
      await Promise.all(
        [...alertTargets].map(uid => api.memberAlerts.adminCreate(uid, alertMsg.trim(), alertType))
      )
      const names = boardMembers
        .filter(m => alertTargets.has(m.id))
        .map(m => m.first_name)
        .join(', ')
      setAlertSuccess(`Sent to ${names}`)
      setAlertMsg('')
      setAlertTargets(new Set())
      setTimeout(() => setAlertSuccess(''), 4000)
    } finally { setSendingAlert(false) }
  }

  useEffect(() => {
    api.passwords.list().then(d => setEntries(d as PasswordEntry[]))
    api.boardCommunications.boardMembers().then(d => setBoardMembers(d as BoardMember[]))
  }, [])

  const openEntry = (entry: PasswordEntry) => {
    setSelected(entry)
    setIsNew(false)
    setLabel(entry.label)
    setUsername(entry.username)
    setPassword(entry.password)
    setUrl(entry.url)
    setCategory(entry.category)
    setNotes(entry.notes)
    setDirty(false)
    setShowPassword(false)
    setAddingNewCategory(false)
    setError('')
  }

  const startNew = () => {
    setSelected(null)
    setIsNew(true)
    setLabel('')
    setUsername('')
    setPassword('')
    setUrl('')
    setCategory('')
    setNotes('')
    setDirty(false)
    setShowPassword(false)
    setAddingNewCategory(false)
    setError('')
    setTimeout(() => labelRef.current?.focus(), 50)
  }

  const handleSave = async () => {
    if (!label.trim()) return
    setSaving(true)
    setError('')
    try {
      const data = { label: label.trim(), username, password, url, category: category.trim(), notes }
      if (isNew) {
        const created = await api.passwords.create(data) as PasswordEntry
        setEntries(es => [...es, created].sort((a, b) =>
          a.category.localeCompare(b.category) || a.label.localeCompare(b.label)))
        setSelected(created)
        setIsNew(false)
      } else if (selected) {
        const updated = await api.passwords.update(selected.id, data) as PasswordEntry
        setEntries(es => es.map(e => e.id === updated.id ? updated : e)
          .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label)))
        setSelected(updated)
      }
      setDirty(false)
      setAddingNewCategory(false)
    } catch (e: any) {
      setError(e?.message || 'Could not save entry')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!selected || !confirm('Delete this entry?')) return
    setDeleting(true)
    try {
      await api.passwords.delete(selected.id)
      setEntries(es => es.filter(e => e.id !== selected.id))
      setSelected(null)
      setIsNew(false)
    } finally { setDeleting(false) }
  }

  const copyPassword = async () => {
    if (!password) return
    await navigator.clipboard.writeText(password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const mark = () => setDirty(true)

  const filtered = entries.filter(e =>
    !search ||
    e.label.toLowerCase().includes(search.toLowerCase()) ||
    e.username.toLowerCase().includes(search.toLowerCase()) ||
    e.category.toLowerCase().includes(search.toLowerCase()) ||
    e.url.toLowerCase().includes(search.toLowerCase())
  )

  const grouped = filtered.reduce<Record<string, PasswordEntry[]>>((acc, e) => {
    const key = e.category || 'No Folder'
    ;(acc[key] ??= []).push(e)
    return acc
  }, {})

  const categories = Array.from(new Set(entries.map(e => e.category).filter(Boolean))).sort()

  const showEditor = isNew || selected !== null

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">Password Vault</h2>
        <button onClick={startNew}
          className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
          + New Entry
        </button>
      </div>

      <div className="flex gap-4 h-[calc(100vh-260px)] min-h-[400px]">

        {/* List */}
        <div className="w-64 shrink-0 flex flex-col gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full"
          />
          <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">
            {filtered.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">
                {entries.length === 0 ? 'No entries yet.' : 'No matches.'}
              </p>
            )}
            {Object.entries(grouped).map(([cat, items]) => {
              const isCollapsed = collapsed.has(cat) && !search
              return (
              <div key={cat}>
                <button onClick={() => toggleFolder(cat)}
                  className="w-full flex items-center gap-1.5 px-1 mb-1 text-xs font-semibold text-gray-400 hover:text-gray-600 transition">
                  <svg className={`w-3 h-3 shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <svg className="w-3.5 h-3.5 shrink-0 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="flex-1 text-left truncate uppercase tracking-wider">{cat}</span>
                  <span className="text-gray-300 font-normal">{items.length}</span>
                </button>
                {!isCollapsed && items.map(entry => {
                  const active = selected?.id === entry.id && !isNew
                  return (
                    <div key={entry.id} className="relative group">
                      <button onClick={() => openEntry(entry)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg transition border ${
                          active
                            ? 'bg-green-50 border-green-300'
                            : 'bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                        }`}>
                        <p className={`text-sm font-medium truncate ${active ? 'text-green-800' : 'text-gray-800'} ${entry.url ? 'pr-6' : ''}`}>
                          {entry.label}
                        </p>
                        {entry.username && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{entry.username}</p>
                        )}
                      </button>
                      {entry.url && (
                        <button onClick={() => launchSite(entry.url)} title="Open site"
                          className="absolute right-2 top-2.5 p-1 rounded text-gray-300 hover:text-green-700 hover:bg-white opacity-0 group-hover:opacity-100 transition">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              )
            })}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 min-w-0 flex flex-col">
          {showEditor ? (
            <div className="flex flex-col gap-3 flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Label <span className="text-red-400">*</span></label>
                  <input
                    ref={labelRef}
                    value={label}
                    onChange={e => { setLabel(e.target.value); mark() }}
                    placeholder="e.g. WiFi Password"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Folder</label>
                  {addingNewCategory ? (
                    <div className="flex gap-1.5">
                      <input
                        autoFocus
                        value={category}
                        onChange={e => { setCategory(e.target.value); mark() }}
                        placeholder="New folder name"
                        className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <button
                        type="button"
                        title="Choose an existing folder"
                        onClick={() => { setAddingNewCategory(false); setCategory(''); mark() }}
                        className="px-2.5 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg shrink-0">
                        ✕
                      </button>
                    </div>
                  ) : (
                    <select
                      value={category}
                      onChange={e => {
                        if (e.target.value === '__new__') {
                          setAddingNewCategory(true); setCategory(''); mark()
                        } else {
                          setCategory(e.target.value); mark()
                        }
                      }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                      <option value="">No folder</option>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="__new__">➕ New folder…</option>
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Username / Email</label>
                <input
                  value={username}
                  onChange={e => { setUsername(e.target.value); mark() }}
                  placeholder="Login username or email"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Password</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => { setPassword(e.target.value); mark() }}
                      placeholder="Enter password"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(s => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs px-1">
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={copyPassword}
                    disabled={!password}
                    className="px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition shrink-0">
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">URL</label>
                <div className="flex gap-2">
                  <input
                    value={url}
                    onChange={e => { setUrl(e.target.value); mark() }}
                    placeholder="https://…"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button type="button" onClick={() => launchSite(url)} disabled={!url.trim()}
                    className="px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-green-400 hover:text-green-700 disabled:opacity-40 transition shrink-0 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col">
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={e => { setNotes(e.target.value); mark() }}
                  placeholder="Any additional details…"
                  className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 leading-relaxed min-h-[80px]"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs">
                  {error ? (
                    <span className="text-red-600">{error}</span>
                  ) : selected && !isNew ? (
                    <span className="text-gray-400">Updated {timeAgo(selected.updated_at)}{selected.updated_by_name ? ` by ${selected.updated_by_name}` : ''}</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {selected && !isNew && (
                    <button onClick={handleDelete} disabled={deleting}
                      className="text-xs text-red-400 hover:text-red-600 transition disabled:opacity-40 px-2 py-1.5">
                      {deleting ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={saving || !label.trim() || (!dirty && !isNew)}
                    className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition disabled:opacity-40">
                    {saving ? 'Saving…' : isNew ? 'Save Entry' : dirty ? 'Save Changes' : 'Saved'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-300 text-sm select-none">
              Select an entry or create a new one
            </div>
          )}
        </div>
      </div>

      {/* Board Alerts */}
      <div className="mt-6 border border-gray-200 rounded-xl bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Send Dashboard Alert to Board Members</h3>
        <p className="text-xs text-gray-400 mb-4">Alerts appear on the selected members' dashboards until dismissed.</p>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">

          {/* Recipient list */}
          <div className="shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-gray-500">Recipients</span>
              <button onClick={toggleAll}
                className="text-xs text-green-700 hover:underline">
                {alertTargets.size === boardMembers.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
              {boardMembers.map(m => (
                <label key={m.id} className="flex items-center gap-2 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={alertTargets.has(m.id)}
                    onChange={() => toggleTarget(m.id)}
                    className="accent-green-700 w-3.5 h-3.5"
                  />
                  <span className={`text-xs ${alertTargets.has(m.id) ? 'text-gray-800 font-medium' : 'text-gray-500'} group-hover:text-gray-700 transition`}>
                    {m.first_name} {m.last_name}
                  </span>
                  <span className="text-xs text-gray-300 capitalize hidden sm:inline">
                    {m.role.replace(/_/g, ' ')}
                  </span>
                </label>
              ))}
              {boardMembers.length === 0 && (
                <p className="text-xs text-gray-300">Loading…</p>
              )}
            </div>
          </div>

          {/* Message + type + send */}
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex gap-2">
              <select value={alertType} onChange={e => setAlertType(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-green-500 shrink-0">
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="danger">Urgent</option>
              </select>
              <div className={`text-xs px-2 py-1.5 rounded-lg border font-medium shrink-0 ${
                alertType === 'danger' ? 'bg-red-50 border-red-200 text-red-700' :
                alertType === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                'bg-blue-50 border-blue-200 text-blue-700'
              }`}>
                {alertType === 'danger' ? 'Urgent' : alertType === 'warning' ? 'Warning' : 'Info'}
              </div>
            </div>
            <textarea
              value={alertMsg}
              onChange={e => setAlertMsg(e.target.value)}
              placeholder="e.g. SSL certificate renews June 30 — please verify the renewal is configured."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-green-500 leading-relaxed"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={handleSendAlert}
                disabled={sendingAlert || !alertMsg.trim() || alertTargets.size === 0}
                className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition disabled:opacity-40">
                {sendingAlert ? 'Sending…' : `Send Alert${alertTargets.size > 1 ? ` (${alertTargets.size})` : ''}`}
              </button>
              {alertTargets.size === 0 && !alertSuccess && (
                <span className="text-xs text-gray-400">Select at least one recipient</span>
              )}
              {alertSuccess && (
                <span className="text-xs text-green-600 font-medium">{alertSuccess}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
