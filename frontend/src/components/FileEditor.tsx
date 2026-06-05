import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '../api/client'

// FileEditor opens an uploaded Word/ODT/RTF file (converted to HTML on the
// server) in the same rich-text editing experience as the collaborative docs,
// and saves the edits back to the original file. Saving runs a LibreOffice
// conversion on the server, so it's an explicit action rather than per-keystroke
// autosave; we still flush on close and warn about unsaved changes.

// ── HTML sanitizer (mirrors Documents.tsx) ──────────────────────────────────
// Converted office HTML is rendered into a contentEditable, so strip anything
// executable and drop every attribute except safe link/table ones.
const ALLOWED_TAGS = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'H1', 'H2', 'H3', 'H4',
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
        if (!ALLOWED_TAGS.has(el.tagName.toUpperCase())) {
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

// ── Print ────────────────────────────────────────────────────────────────────
function printDocument(title: string, html: string) {
  const win = window.open('', '_blank', 'width=820,height=700')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title>
  <style>
    body{font-family:Georgia,serif;max-width:680px;margin:40px auto;color:#111;line-height:1.65;font-size:14px}
    h1{font-size:1.75em;font-weight:bold;margin:0 0 .15em}
    h2{font-size:1.3em;font-weight:bold;margin:1.4em 0 .3em}
    h3{font-size:1.1em;font-weight:bold;margin:1.2em 0 .25em}
    p{margin:.5em 0}ul,ol{margin:.5em 0;padding-left:1.5em}
    table{border-collapse:collapse;width:100%;margin:1em 0}
    th,td{border:1px solid #ccc;padding:.35em .6em;text-align:left}
    th{background:#f4f4f4;font-weight:bold}
    @media print{body{margin:0}}
  </style></head><body><h1>${title.replace(/</g, '&lt;')}</h1>${html}</body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 350)
}

// ── Toolbar (mirrors Documents.tsx) ───────────────────────────────────────────
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

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'

export default function FileEditor({ docId, onClose }: { docId: string; onClose: () => void }) {
  const editorRef = useRef<HTMLDivElement>(null)

  const [title, setTitle] = useState('')
  const [format, setFormat] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [conflict, setConflict] = useState(false)

  const versionRef = useRef('')
  const dirtyRef = useRef(false)
  // The editor div is hidden behind the loading skeleton during the initial
  // fetch, so it can't receive HTML yet — stash the body and inject it once the
  // editor mounts (same pattern as the collaborative editor).
  const pendingBodyRef = useRef<string | null>(null)

  const setEditorHtml = (html: string) => {
    const clean = sanitizeHtml(html)
    if (editorRef.current) editorRef.current.innerHTML = clean
  }

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    setLoading(true); setLoadError(''); setConflict(false)
    api.documents.editable.get(docId)
      .then(doc => {
        if (!alive) return
        setTitle(doc.title); setFormat(doc.format)
        versionRef.current = doc.version
        pendingBodyRef.current = doc.body
        dirtyRef.current = false
        setStatus('idle')
      })
      .catch(e => { if (alive) setLoadError(e.message || 'Could not open this file for editing') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [docId])

  useEffect(() => {
    if (!loading && pendingBodyRef.current !== null) {
      setEditorHtml(pendingBodyRef.current)
      pendingBodyRef.current = null
    }
  }, [loading])

  // ── Save ──────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!editorRef.current) return
    const body = sanitizeHtml(editorRef.current.innerHTML)
    setStatus('saving')
    try {
      const res = await api.documents.editable.save(docId, body, versionRef.current)
      versionRef.current = res.version
      dirtyRef.current = false
      setConflict(false)
      setStatus('saved')
    } catch (e: any) {
      const msg = e?.message || ''
      if (/changed since you opened/i.test(msg)) setConflict(true)
      setStatus('error')
    }
  }, [docId])

  const markDirty = () => { dirtyRef.current = true; setStatus('unsaved') }

  const runCommand = (cmd: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, value)
    markDirty()
  }

  // Warn the browser before leaving with unsaved changes.
  useEffect(() => {
    const onHide = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', onHide)
    return () => window.removeEventListener('beforeunload', onHide)
  }, [])

  const close = () => {
    if (dirtyRef.current && !confirm('You have unsaved changes. Discard them and close?')) return
    onClose()
  }

  const reloadLatest = async () => {
    setConflict(false)
    setLoading(true)
    try {
      const doc = await api.documents.editable.get(docId)
      setTitle(doc.title); setFormat(doc.format)
      versionRef.current = doc.version
      pendingBodyRef.current = doc.body
      dirtyRef.current = false
      setStatus('idle')
    } catch (e: any) {
      setLoadError(e.message || 'Could not reload this file')
    } finally {
      setLoading(false)
    }
  }

  const statusLabel = {
    idle: '',
    unsaved: 'Unsaved changes',
    saving: 'Saving…',
    saved: 'Saved to file',
    error: conflict ? '' : 'Save failed',
  }[status]

  if (loadError) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 text-sm mb-4">{loadError}</p>
        <button onClick={onClose} className="text-green-700 hover:text-green-900 text-sm font-medium">← Back to files</button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button onClick={close} className="text-sm text-gray-500 hover:text-gray-800 transition flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to files
        </button>
        <div className="flex items-center gap-3">
          <span className={`text-xs ${status === 'error' && !conflict ? 'text-red-500' : 'text-gray-400'}`}>{statusLabel}</span>
          <button
            onClick={() => editorRef.current && printDocument(title || 'Document', editorRef.current.innerHTML)}
            disabled={loading}
            className="text-xs text-gray-400 hover:text-gray-700 transition flex items-center gap-1 disabled:opacity-40"
            title="Print / Save as PDF">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm1-4h4v2h-4v-2z" />
            </svg>
            Print
          </button>
          <button
            onClick={() => void save()}
            disabled={loading || status === 'saving'}
            className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition disabled:opacity-50">
            {status === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Conflict banner */}
      {conflict && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-amber-800">
            This file changed since you opened it. Saving now would overwrite the newer version.
          </p>
          <button onClick={() => void reloadLatest()}
            className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium px-3 py-1.5 rounded transition shrink-0">
            Reload latest
          </button>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-gray-100 rounded-lg w-2/3" />
          <div className="h-96 bg-gray-100 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-800 truncate">{title || 'Untitled'}</h1>
            {format && <span className="text-[10px] font-bold text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 shrink-0">{format}</span>}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <Toolbar onCommand={runCommand} />
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={markDirty}
              className="prose-doc min-h-[55vh] max-w-none px-5 py-4 text-sm text-gray-800 focus:outline-none leading-relaxed"
            />
          </div>
          <p className="text-xs text-gray-400 px-1">
            Changes are saved back into the {format || 'original'} file when you click Save. Complex layouts
            and fonts may simplify — the editor keeps text, headings, lists, links and tables.
          </p>
        </>
      )}
    </div>
  )
}
