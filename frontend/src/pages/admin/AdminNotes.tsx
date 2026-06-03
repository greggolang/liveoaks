import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { parseDate } from '../../utils/dates'

interface Note {
  id: string
  title: string
  body: string
  created_by: string | null
  created_by_name: string
  updated_by: string | null
  updated_by_name: string
  created_at: string
  updated_at: string
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

export default function AdminNotes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [selected, setSelected] = useState<Note | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [dirty, setDirty] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    api.notes.list().then(d => setNotes(d as Note[]))
  }, [])

  const openNote = (note: Note) => {
    setSelected(note)
    setIsNew(false)
    setTitle(note.title)
    setBody(note.body)
    setDirty(false)
  }

  const startNew = () => {
    setSelected(null)
    setIsNew(true)
    setTitle('')
    setBody('')
    setDirty(false)
    setTimeout(() => bodyRef.current?.focus(), 50)
  }

  const handleSave = async () => {
    if (!title.trim() && !body.trim()) return
    setSaving(true)
    try {
      if (isNew) {
        const created = await api.notes.create(title.trim() || 'Untitled', body) as Note
        setNotes(ns => [created, ...ns])
        setSelected(created)
        setIsNew(false)
        setTitle(created.title)
      } else if (selected) {
        const updated = await api.notes.update(selected.id, title.trim() || 'Untitled', body) as Note
        setNotes(ns => ns.map(n => n.id === updated.id ? updated : n))
        setSelected(updated)
      }
      setDirty(false)
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!selected || !confirm('Delete this note?')) return
    setDeleting(true)
    try {
      await api.notes.delete(selected.id)
      setNotes(ns => ns.filter(n => n.id !== selected.id))
      setSelected(null)
      setIsNew(false)
      setTitle('')
      setBody('')
    } finally { setDeleting(false) }
  }

  const filtered = notes.filter(n =>
    !search || n.title.toLowerCase().includes(search.toLowerCase()) || n.body.toLowerCase().includes(search.toLowerCase())
  )

  const hasContent = title.trim() || body.trim()
  const showEditor = isNew || selected !== null

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">Admin Notes</h2>
        <button onClick={startNew}
          className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
          + New Note
        </button>
      </div>

      <div className="flex gap-4 h-[calc(100vh-260px)] min-h-[400px]">

        {/* ── Note list ── */}
        <div className="w-64 shrink-0 flex flex-col gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search notes…"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full"
          />
          <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
            {filtered.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">
                {notes.length === 0 ? 'No notes yet.' : 'No matches.'}
              </p>
            )}
            {filtered.map(note => {
              const active = selected?.id === note.id && !isNew
              return (
                <button key={note.id} onClick={() => openNote(note)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition border ${
                    active
                      ? 'bg-green-50 border-green-300'
                      : 'bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                  }`}>
                  <p className={`text-sm font-medium truncate ${active ? 'text-green-800' : 'text-gray-800'}`}>
                    {note.title || <span className="italic text-gray-400">Untitled</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {timeAgo(note.updated_at)}
                    {note.updated_by_name && ` · ${note.updated_by_name}`}
                  </p>
                  {note.body && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{note.body.slice(0, 60)}</p>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Editor ── */}
        <div className="flex-1 min-w-0 flex flex-col">
          {showEditor ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <input
                  value={title}
                  onChange={e => { setTitle(e.target.value); setDirty(true) }}
                  placeholder="Note title…"
                  className="flex-1 text-lg font-semibold text-gray-800 border-0 border-b border-gray-200 focus:outline-none focus:border-green-500 pb-1 bg-transparent"
                />
              </div>
              <textarea
                ref={bodyRef}
                value={body}
                onChange={e => { setBody(e.target.value); setDirty(true) }}
                placeholder="Write your note here…"
                className="flex-1 resize-none border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 leading-relaxed"
              />
              <div className="flex items-center justify-between mt-3">
                <div className="text-xs text-gray-400">
                  {selected && !isNew && (
                    <>
                      Created {timeAgo(selected.created_at)} by {selected.created_by_name}
                      {selected.updated_by_name && selected.updated_by_name !== selected.created_by_name && (
                        <> · Last edited by {selected.updated_by_name}</>
                      )}
                    </>
                  )}
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
                    disabled={saving || !hasContent || (!dirty && !isNew)}
                    className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition disabled:opacity-40">
                    {saving ? 'Saving…' : isNew ? 'Save Note' : dirty ? 'Save Changes' : 'Saved'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-300 text-sm select-none">
              Select a note or create a new one
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
