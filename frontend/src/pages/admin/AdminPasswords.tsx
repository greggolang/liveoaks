import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'

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

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
  const labelRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.passwords.list().then(d => setEntries(d as PasswordEntry[]))
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
    const key = e.category || 'Uncategorized'
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
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                <p className="px-1 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{cat}</p>
                {items.map(entry => {
                  const active = selected?.id === entry.id && !isNew
                  return (
                    <button key={entry.id} onClick={() => openEntry(entry)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition border ${
                        active
                          ? 'bg-green-50 border-green-300'
                          : 'bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                      }`}>
                      <p className={`text-sm font-medium truncate ${active ? 'text-green-800' : 'text-gray-800'}`}>
                        {entry.label}
                      </p>
                      {entry.username && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{entry.username}</p>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
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
                  <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                  {addingNewCategory ? (
                    <div className="flex gap-1.5">
                      <input
                        autoFocus
                        value={category}
                        onChange={e => { setCategory(e.target.value); mark() }}
                        placeholder="New category name"
                        className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <button
                        type="button"
                        title="Choose an existing category"
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
                      <option value="">Uncategorized</option>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="__new__">➕ Add new category…</option>
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
                <input
                  value={url}
                  onChange={e => { setUrl(e.target.value); mark() }}
                  placeholder="https://…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
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
    </div>
  )
}
