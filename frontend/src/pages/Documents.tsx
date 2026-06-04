import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, CollabDocSummary, CollabEditor } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

// ── HTML sanitizer ───────────────────────────────────────────────────────────
// Member-authored HTML is rendered into other members' editors, so strip
// anything executable. We keep only the tags the toolbar can produce and drop
// every attribute except safe link/table ones. No external dependency needed.
const ALLOWED_TAGS = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'H1', 'H2', 'H3',
  'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE', 'HR', 'TABLE', 'THEAD', 'TBODY',
  'TR', 'TH', 'TD', 'SPAN', 'DIV', 'CODE', 'PRE',
])
const KEEP_ATTRS = new Set(['href', 'colspan', 'rowspan'])

function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const clean = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element
        if (!ALLOWED_TAGS.has(el.tagName)) {
          // Unwrap unknown/dangerous tags (script, img, iframe…) — their text
          // content survives but the element itself is removed.
          while (el.firstChild) node.insertBefore(el.firstChild, el)
          node.removeChild(el)
          continue
        }
        for (const attr of Array.from(el.attributes)) {
          const name = attr.name.toLowerCase()
          if (name === 'href') {
            if (/^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name)
          } else if (!KEEP_ATTRS.has(name)) {
            el.removeAttribute(attr.name)
          }
        }
        clean(el)
      } else if (child.nodeType === Node.COMMENT_NODE) {
        node.removeChild(child)
      }
    }
  }
  clean(doc.body)
  return doc.body.innerHTML
}

function relTime(s: string): string {
  if (!s) return ''
  const d = new Date(s)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString()
}

// ── Editor presence pills ────────────────────────────────────────────────────
function EditorPills({ editors, meId }: { editors: CollabEditor[]; meId: string }) {
  const others = editors.filter(e => e.user_id !== meId)
  if (others.length === 0) return null
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-gray-400">Also here:</span>
      {others.map(e => (
        <span key={e.user_id}
          className={`text-xs px-2 py-0.5 rounded-full ${
            e.editing ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}>
          {e.name}{e.editing ? ' ✏️' : ''}
        </span>
      ))}
    </div>
  )
}

// ── Toolbar ──────────────────────────────────────────────────────────────────
function Toolbar({ onCommand }: { onCommand: (cmd: string, value?: string) => void }) {
  const btn = 'px-2.5 py-1.5 text-sm rounded hover:bg-gray-100 text-gray-600 transition select-none'
  return (
    <div className="flex items-center gap-0.5 flex-wrap border-b border-gray-200 px-2 py-1.5 bg-gray-50 rounded-t-xl sticky top-0 z-10">
      <button type="button" className={`${btn} font-bold`} title="Bold" onMouseDown={e => { e.preventDefault(); onCommand('bold') }}>B</button>
      <button type="button" className={`${btn} italic`} title="Italic" onMouseDown={e => { e.preventDefault(); onCommand('italic') }}>I</button>
      <button type="button" className={`${btn} underline`} title="Underline" onMouseDown={e => { e.preventDefault(); onCommand('underline') }}>U</button>
      <span className="w-px h-5 bg-gray-200 mx-1" />
      <button type="button" className={`${btn} font-bold`} title="Heading" onMouseDown={e => { e.preventDefault(); onCommand('formatBlock', 'H2') }}>H1</button>
      <button type="button" className={`${btn} font-semibold`} title="Subheading" onMouseDown={e => { e.preventDefault(); onCommand('formatBlock', 'H3') }}>H2</button>
      <button type="button" className={btn} title="Normal text" onMouseDown={e => { e.preventDefault(); onCommand('formatBlock', 'P') }}>¶</button>
      <span className="w-px h-5 bg-gray-200 mx-1" />
      <button type="button" className={btn} title="Bulleted list" onMouseDown={e => { e.preventDefault(); onCommand('insertUnorderedList') }}>• List</button>
      <button type="button" className={btn} title="Numbered list" onMouseDown={e => { e.preventDefault(); onCommand('insertOrderedList') }}>1. List</button>
      <span className="w-px h-5 bg-gray-200 mx-1" />
      <button type="button" className={btn} title="Add link" onMouseDown={e => {
        e.preventDefault()
        const url = prompt('Link URL:')
        if (url) onCommand('createLink', url)
      }}>🔗 Link</button>
      <button type="button" className={btn} title="Clear formatting" onMouseDown={e => { e.preventDefault(); onCommand('removeFormat') }}>Clear</button>
    </div>
  )
}

// ── Editor view ──────────────────────────────────────────────────────────────
type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'

function DocumentEditor({ docId, onClose }: { docId: string; onClose: () => void }) {
  const { user, isBoard } = useAuth()
  const editorRef = useRef<HTMLDivElement>(null)

  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [savedAt, setSavedAt] = useState('')
  const [editors, setEditors] = useState<CollabEditor[]>([])
  const [canDelete, setCanDelete] = useState(false)
  const [conflict, setConflict] = useState(false)

  // Refs hold the live editing state the timers/heartbeat read, avoiding stale
  // closures and unnecessary re-renders while typing.
  const versionRef = useRef(0)
  const dirtyRef = useRef(false)
  const editingRef = useRef(false)
  const titleRef = useRef('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Holds the loaded body until the editor div has mounted (it's hidden behind
  // the loading skeleton while the fetch is in flight, so it can't receive HTML yet).
  const pendingBodyRef = useRef<string | null>(null)

  const setEditorHtml = (html: string) => {
    if (editorRef.current) editorRef.current.innerHTML = sanitizeHtml(html)
  }

  // ── Load the document ──────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    setLoading(true); setNotFound(false); setConflict(false)
    api.collabDocs.get(docId)
      .then(doc => {
        if (!alive) return
        setTitle(doc.title); titleRef.current = doc.title
        versionRef.current = doc.version
        // The editor isn't mounted yet (loading skeleton is showing), so stash the
        // body and inject it once the editor appears (see the effect below).
        pendingBodyRef.current = doc.body
        setEditorHtml(doc.body)
        setSavedAt(doc.updated_at)
        setCanDelete(isBoard || (!!user && doc.created_by === user.id))
        dirtyRef.current = false
        setStatus('idle')
      })
      .catch(() => { if (alive) setNotFound(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId])

  // Once loading ends and the editor div mounts, inject the body that was loaded
  // while it was still hidden behind the skeleton.
  useEffect(() => {
    if (!loading && pendingBodyRef.current !== null) {
      setEditorHtml(pendingBodyRef.current)
      pendingBodyRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // ── Save ───────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!editorRef.current) return
    const body = sanitizeHtml(editorRef.current.innerHTML)
    const t = titleRef.current.trim() || 'Untitled document'
    setStatus('saving')
    try {
      const res = await api.collabDocs.update(docId, { title: t, body, version: versionRef.current })
      if (res.status === 'ok') {
        versionRef.current = res.version
        setSavedAt(res.updated_at)
        dirtyRef.current = false
        setConflict(false)
        setStatus('saved')
      } else {
        // Someone saved a newer version first. Keep the user's text in place but
        // bump to the server version and flag a conflict so they can decide.
        versionRef.current = res.document.version
        setConflict(true)
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }, [docId])

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true
    setStatus('unsaved')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void save() }, 1500)
  }, [save])

  const saveNow = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (dirtyRef.current) void save()
  }, [save])

  // ── Toolbar commands ───────────────────────────────────────────────────────
  const runCommand = (cmd: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, value)
    scheduleSave()
  }

  // ── Presence heartbeat + remote-change polling ─────────────────────────────
  useEffect(() => {
    let alive = true
    const beat = async () => {
      try {
        const p = await api.collabDocs.presence(docId, editingRef.current)
        if (!alive) return
        setEditors(p.editors)
        // If the server has a newer version and we have no pending local edits,
        // pull in the other person's changes live.
        if (p.version > versionRef.current && !dirtyRef.current && !editingRef.current) {
          const doc = await api.collabDocs.get(docId)
          if (!alive) return
          versionRef.current = doc.version
          setEditorHtml(doc.body)
          setTitle(doc.title); titleRef.current = doc.title
          setSavedAt(doc.updated_at)
        }
      } catch {}
    }
    beat()
    const id = setInterval(beat, 7000)
    return () => {
      alive = false
      clearInterval(id)
      saveNow()
      api.collabDocs.leave(docId).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId])

  // Flush a pending save if the tab is closed/hidden.
  useEffect(() => {
    const onHide = () => saveNow()
    window.addEventListener('beforeunload', onHide)
    return () => window.removeEventListener('beforeunload', onHide)
  }, [saveNow])

  const handleDelete = async () => {
    if (!confirm('Delete this document? This cannot be undone.')) return
    try {
      await api.collabDocs.delete(docId)
      onClose()
    } catch (e: any) {
      alert(e.message || 'Could not delete document')
    }
  }

  const reloadTheirs = async () => {
    const doc = await api.collabDocs.get(docId)
    versionRef.current = doc.version
    setEditorHtml(doc.body)
    setTitle(doc.title); titleRef.current = doc.title
    setSavedAt(doc.updated_at)
    dirtyRef.current = false
    setConflict(false); setStatus('idle')
  }

  const statusLabel = {
    idle: savedAt ? `Saved ${relTime(savedAt)}` : '',
    unsaved: 'Unsaved changes…',
    saving: 'Saving…',
    saved: 'Saved',
    error: conflict ? '' : 'Save failed — retrying on next edit',
  }[status]

  if (notFound) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm mb-4">This document no longer exists.</p>
        <button onClick={onClose} className="text-green-700 hover:text-green-900 text-sm font-medium">← Back to documents</button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800 transition flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All documents
        </button>
        <div className="flex items-center gap-3">
          <EditorPills editors={editors} meId={user?.id ?? ''} />
          <span className={`text-xs ${status === 'error' && !conflict ? 'text-red-500' : 'text-gray-400'}`}>{statusLabel}</span>
          {canDelete && (
            <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-600 transition">Delete</button>
          )}
        </div>
      </div>

      {/* Conflict banner */}
      {conflict && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-amber-800">
            Someone else saved changes while you were editing. Keep your version or load theirs?
          </p>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => { void save() }}
              className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium px-3 py-1.5 rounded transition">
              Keep mine
            </button>
            <button onClick={() => { void reloadTheirs() }}
              className="text-xs bg-white border border-amber-300 text-amber-700 hover:bg-amber-100 font-medium px-3 py-1.5 rounded transition">
              Load theirs
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-10 bg-gray-100 rounded-lg w-2/3" />
          <div className="h-96 bg-gray-100 rounded-xl" />
        </div>
      ) : (
        <>
          {/* Title */}
          <input
            value={title}
            onChange={e => { setTitle(e.target.value); titleRef.current = e.target.value; scheduleSave() }}
            placeholder="Document title"
            className="w-full text-2xl font-bold text-gray-800 border-0 border-b border-transparent focus:border-gray-200 focus:outline-none px-1 py-1 bg-transparent"
          />

          {/* Editor */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <Toolbar onCommand={runCommand} />
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={scheduleSave}
              onBlur={() => { editingRef.current = false; saveNow() }}
              onFocus={() => { editingRef.current = true }}
              className="prose-doc min-h-[55vh] max-w-none px-5 py-4 text-sm text-gray-800 focus:outline-none leading-relaxed"
            />
          </div>
          <p className="text-xs text-gray-400 px-1">
            Changes save automatically and sync to anyone else viewing this document.
          </p>
        </>
      )}
    </div>
  )
}

// ── List view ────────────────────────────────────────────────────────────────
export default function Documents() {
  const [params, setParams] = useSearchParams()
  const docId = params.get('doc')

  const [docs, setDocs] = useState<CollabDocSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.collabDocs.list()
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (!docId) load() }, [docId, load])

  const open = (id: string) => setParams({ doc: id })
  const close = () => { setParams({}); }

  const create = async () => {
    setCreating(true)
    try {
      const doc = await api.collabDocs.create('Untitled document')
      open(doc.id)
    } catch (e: any) {
      alert(e.message || 'Could not create document')
    } finally {
      setCreating(false)
    }
  }

  if (docId) return <DocumentEditor docId={docId} onClose={close} />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Documents</h1>
          <p className="text-sm text-gray-500 mt-1">Shared documents members can write and edit together.</p>
        </div>
        <button onClick={create} disabled={creating}
          className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50">
          {creating ? 'Creating…' : '+ New Document'}
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16">
          <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-400 text-sm">No documents yet — create one to get started.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100">
          {docs.map(d => (
            <button key={d.id} onClick={() => open(d.id)}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition text-left group">
              <svg className="w-5 h-5 shrink-0 text-gray-300 group-hover:text-green-600 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 group-hover:text-green-700 transition truncate">{d.title || 'Untitled document'}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Edited {relTime(d.updated_at)}{d.updated_by_name ? ` by ${d.updated_by_name}` : ''}
                </p>
              </div>
              {d.active_editors > 0 && (
                <span className="shrink-0 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  {d.active_editors} here now
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
