import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, CollabDocSummary, CollabEditor } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { parseDate } from '../utils/dates'

// ── Print ────────────────────────────────────────────────────────────────────
function printDocument(title: string, html: string) {
  const win = window.open('', '_blank', 'width=820,height=700')
  if (!win) return
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title.replace(/</g, '&lt;')}</title>
  <style>
    body{font-family:Georgia,serif;max-width:680px;margin:40px auto;color:#111;line-height:1.65;font-size:14px}
    h1{font-size:1.75em;font-weight:bold;margin:0 0 .15em}
    h2{font-size:1.3em;font-weight:bold;margin:1.4em 0 .3em}
    h3{font-size:1.1em;font-weight:bold;margin:1.2em 0 .25em}
    p{margin:.5em 0}
    ul,ol{margin:.5em 0;padding-left:1.5em}
    a{color:#111;text-decoration:underline}
    table{border-collapse:collapse;width:100%;margin:1em 0}
    th,td{border:1px solid #ccc;padding:.35em .6em;text-align:left}
    th{background:#f4f4f4;font-weight:bold}
    blockquote{border-left:3px solid #ccc;margin:1em 0 1em .5em;padding-left:1em;color:#555}
    hr{border:none;border-top:1px solid #ddd;margin:1.5em 0}
    svg{max-width:100%;height:auto}
    .print-header{border-bottom:1px solid #ddd;padding-bottom:.6em;margin-bottom:1.2em}
    .print-date{font-size:.78em;color:#888;margin-top:.15em}
    @media print{body{margin:0}}
  </style>
</head>
<body>
<div class="print-header">
  <h1>${title.replace(/</g, '&lt;')}</h1>
  <p class="print-date">Liveoaks Tennis Club · ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
</div>
${html}
</body>
</html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 350)
}

// ── Export helpers ────────────────────────────────────────────────────────────
function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'document'
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function buildHtmlPage(title: string, html: string): string {
  const safeTitle = title.replace(/</g, '&lt;')
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <style>
    body{font-family:Georgia,serif;max-width:680px;margin:40px auto;color:#111;line-height:1.65;font-size:14px}
    h1{font-size:1.75em;font-weight:bold;margin:0 0 .15em}
    h2{font-size:1.3em;font-weight:bold;margin:1.4em 0 .3em}
    h3{font-size:1.1em;font-weight:bold;margin:1.2em 0 .25em}
    p{margin:.5em 0}ul,ol{margin:.5em 0;padding-left:1.5em}
    a{color:#111;text-decoration:underline}
    table{border-collapse:collapse;width:100%;margin:1em 0}
    th,td{border:1px solid #ccc;padding:.35em .6em;text-align:left}
    th{background:#f4f4f4;font-weight:bold}
    blockquote{border-left:3px solid #ccc;margin:1em 0 1em .5em;padding-left:1em;color:#555}
    hr{border:none;border-top:1px solid #ddd;margin:1.5em 0}
    svg{max-width:100%;height:auto}
  </style>
</head>
<body>
<h1>${safeTitle}</h1>
${html}
</body>
</html>`
}

function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  function convert(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as Element
    const tag = el.tagName.toUpperCase()
    const inner = () => Array.from(el.childNodes).map(convert).join('')
    switch (tag) {
      case 'SVG': return ''
      case 'H1': { const t = inner().trim(); return `\n# ${t}\n\n` }
      case 'H2': { const t = inner().trim(); return `\n## ${t}\n\n` }
      case 'H3': { const t = inner().trim(); return `\n### ${t}\n\n` }
      case 'P': return `${inner().trim()}\n\n`
      case 'BR': return '  \n'
      case 'HR': return '\n---\n\n'
      case 'STRONG': case 'B': return `**${inner()}**`
      case 'EM': case 'I': return `*${inner()}*`
      case 'U': return `__${inner()}__`
      case 'S': return `~~${inner()}~~`
      case 'A': { const href = el.getAttribute('href') ?? ''; const t = inner(); return href ? `[${t}](${href})` : t }
      case 'UL': return '\n' + Array.from(el.children).filter(c => c.tagName === 'LI')
        .map(li => `- ${Array.from(li.childNodes).map(convert).join('').trim()}`).join('\n') + '\n\n'
      case 'OL': return '\n' + Array.from(el.children).filter(c => c.tagName === 'LI')
        .map((li, i) => `${i + 1}. ${Array.from(li.childNodes).map(convert).join('').trim()}`).join('\n') + '\n\n'
      case 'LI': return ''
      case 'BLOCKQUOTE': return inner().split('\n').map(l => `> ${l}`).join('\n').trimEnd() + '\n\n'
      case 'CODE': return `\`${inner()}\``
      case 'PRE': return `\`\`\`\n${el.textContent ?? ''}\n\`\`\`\n\n`
      case 'TABLE': {
        const rows = Array.from(el.querySelectorAll('tr'))
        if (!rows.length) return ''
        const lines: string[] = []
        rows.forEach((row, i) => {
          const cells = Array.from(row.querySelectorAll('th, td'))
            .map(c => (c.textContent ?? '').trim().replace(/\|/g, '\\|'))
          lines.push('| ' + cells.join(' | ') + ' |')
          if (i === 0) lines.push('| ' + cells.map(() => '---').join(' | ') + ' |')
        })
        return '\n' + lines.join('\n') + '\n\n'
      }
      default: return inner()
    }
  }
  return convert(doc.body).replace(/\n{3,}/g, '\n\n').trim()
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('svg').forEach(s => s.remove())
  function convert(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as Element
    const tag = el.tagName.toUpperCase()
    const inner = () => Array.from(el.childNodes).map(convert).join('')
    switch (tag) {
      case 'H1': { const t = inner().trim(); return `\n\n${t}\n${'='.repeat(t.length)}\n\n` }
      case 'H2': { const t = inner().trim(); return `\n\n${t}\n${'-'.repeat(t.length)}\n\n` }
      case 'H3': return `\n${inner().trim()}\n\n`
      case 'P': return `${inner().trim()}\n\n`
      case 'BR': return '\n'
      case 'HR': return '\n' + '-'.repeat(50) + '\n\n'
      case 'LI': return `  * ${inner().trim()}\n`
      case 'UL': case 'OL': return `\n${inner()}\n`
      case 'TABLE': {
        const rows = Array.from(el.querySelectorAll('tr'))
        return '\n' + rows.map(row =>
          Array.from(row.querySelectorAll('th, td')).map(c => (c.textContent ?? '').trim()).join('  |  ')
        ).join('\n') + '\n\n'
      }
      case 'BLOCKQUOTE': return inner().split('\n').map(l => `    ${l}`).join('\n').trimEnd() + '\n\n'
      case 'STRONG': case 'B': return inner().toUpperCase()
      default: return inner()
    }
  }
  return convert(doc.body).replace(/\n{3,}/g, '\n\n').trim()
}

// ── HTML sanitizer ───────────────────────────────────────────────────────────
// Member-authored HTML is rendered into other members' editors, so strip
// anything executable. We keep only the tags the toolbar can produce and drop
// every attribute except safe link/table/SVG ones. No external dependency needed.
const ALLOWED_TAGS = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'H1', 'H2', 'H3',
  'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE', 'HR', 'TABLE', 'THEAD', 'TBODY',
  'TR', 'TH', 'TD', 'SPAN', 'DIV', 'CODE', 'PRE',
  // SVG presentation elements — script, foreignObject, use, image, animate* are
  // blocked by omission so they cannot load external resources or run code.
  'SVG', 'G', 'PATH', 'CIRCLE', 'ELLIPSE', 'RECT', 'LINE', 'POLYLINE', 'POLYGON',
  'TEXT', 'TSPAN', 'DEFS', 'CLIPPATH', 'LINEARGRADIENT', 'RADIALGRADIENT', 'STOP',
])

// SVG presentation attributes (compared lowercase). Values containing url() or
// javascript: are stripped to prevent external-resource loading or script injection.
const SVG_PRES_ATTRS = new Set([
  'viewbox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray',
  'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'fill-opacity',
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'width', 'height', 'transform', 'text-anchor', 'font-size', 'font-weight',
  'font-family', 'points', 'opacity', 'stop-color', 'stop-opacity',
  'gradientunits', 'gradienttransform',
])

const KEEP_ATTRS = new Set(['href', 'colspan', 'rowspan'])
const SVG_UNSAFE_VALUE = /url\s*\(|javascript:/i

function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const clean = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element
        // SVG element tagNames are lowercase in the DOM; HTML are uppercase — normalise.
        if (!ALLOWED_TAGS.has(el.tagName.toUpperCase())) {
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
          } else if (SVG_PRES_ATTRS.has(name)) {
            if (SVG_UNSAFE_VALUE.test(attr.value)) el.removeAttribute(attr.name)
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
  const d = parseDate(s)
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

// ── Export menu ───────────────────────────────────────────────────────────────
function ExportMenu({ title, getHtml }: { title: string; getHtml: () => string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const run = (fn: () => void) => { setOpen(false); fn() }
  const slug = slugify(title)

  const items: { label: string; icon: string; action: () => void }[] = [
    {
      label: 'Print / Save as PDF',
      icon: 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm1-4h4v2h-4v-2z',
      action: () => printDocument(title, getHtml()),
    },
    {
      label: 'Download as HTML',
      icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
      action: () => downloadFile(`${slug}.html`, buildHtmlPage(title, getHtml()), 'text/html;charset=utf-8'),
    },
    {
      label: 'Download as Markdown',
      icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      action: () => downloadFile(`${slug}.md`, htmlToMarkdown(getHtml()), 'text/markdown;charset=utf-8'),
    },
    {
      label: 'Download as Plain Text',
      icon: 'M4 6h16M4 12h16M4 18h7',
      action: () => downloadFile(`${slug}.txt`, htmlToText(getHtml()), 'text/plain;charset=utf-8'),
    },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs text-gray-400 hover:text-gray-700 transition flex items-center gap-1 px-1 py-0.5 rounded"
        title="Export document"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Export
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-xl shadow-lg border border-gray-200 z-30 py-1 overflow-hidden">
          {items.map(item => (
            <button
              key={item.label}
              onClick={() => run(item.action)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-gray-700 hover:bg-gray-50 transition text-left"
            >
              <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
              </svg>
              {item.label}
            </button>
          ))}
        </div>
      )}
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
  // Mirror of the editor's current HTML so a pending save can still persist even
  // if the editor div has already unmounted (e.g. the user renames then navigates).
  const bodyRef = useRef('')

  const setEditorHtml = (html: string) => {
    const clean = sanitizeHtml(html)
    bodyRef.current = clean
    if (editorRef.current) editorRef.current.innerHTML = clean
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
    // Fall back to the mirrored body so a title-only rename still saves even if
    // the editor node has already unmounted (the early-return here used to drop it).
    const body = sanitizeHtml(editorRef.current ? editorRef.current.innerHTML : bodyRef.current)
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
          <ExportMenu
            title={title || 'Untitled document'}
            getHtml={() => editorRef.current?.innerHTML ?? bodyRef.current}
          />
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
          {/* Title — click to rename; the hover/focus border signals it's editable */}
          <div className="flex items-center gap-1.5">
            <input
              value={title}
              onChange={e => { setTitle(e.target.value); titleRef.current = e.target.value; scheduleSave() }}
              onFocus={() => { editingRef.current = true }}
              onBlur={() => { editingRef.current = false; saveNow() }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() } }}
              placeholder="Untitled document"
              aria-label="Document title"
              className="flex-1 min-w-0 text-2xl font-bold text-gray-800 border border-transparent hover:border-gray-200 focus:border-green-400 rounded-lg focus:outline-none px-2 py-1 bg-transparent transition"
            />
            <svg className="w-4 h-4 shrink-0 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>

          {/* Editor */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <Toolbar onCommand={runCommand} />
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={() => { if (editorRef.current) bodyRef.current = editorRef.current.innerHTML; scheduleSave() }}
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

  const rename = async (d: CollabDocSummary) => {
    const name = prompt('Rename document:', d.title)?.trim()
    if (!name || name === d.title) return
    try {
      // Pull the current body + version so we don't clobber content or trip the
      // optimistic-lock check while renaming from the list.
      const full = await api.collabDocs.get(d.id)
      const res = await api.collabDocs.update(d.id, { title: name, body: full.body, version: full.version })
      if (res.status !== 'ok') alert('This document was just changed by someone else — open it to rename.')
    } catch {
      alert('Could not rename the document.')
    } finally {
      load()
    }
  }

  const [exporting, setExporting] = useState<string | null>(null)
  const [listMenuOpen, setListMenuOpen] = useState<string | null>(null)

  const handleListExport = async (d: CollabDocSummary, format: 'print' | 'html' | 'md' | 'txt') => {
    setListMenuOpen(null)
    setExporting(d.id)
    try {
      const full = await api.collabDocs.get(d.id)
      const t = full.title || 'Untitled document'
      const s = slugify(t)
      if (format === 'print') printDocument(t, full.body)
      else if (format === 'html') downloadFile(`${s}.html`, buildHtmlPage(t, full.body), 'text/html;charset=utf-8')
      else if (format === 'md') downloadFile(`${s}.md`, htmlToMarkdown(full.body), 'text/markdown;charset=utf-8')
      else downloadFile(`${s}.txt`, htmlToText(full.body), 'text/plain;charset=utf-8')
    } catch {
      alert('Could not load document for export.')
    } finally {
      setExporting(null)
    }
  }

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
            <div key={d.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition group">
              <button onClick={() => open(d.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
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
              </button>
              {d.active_editors > 0 && (
                <span className="shrink-0 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  {d.active_editors} here now
                </span>
              )}
              {/* Export dropdown for list row */}
              <div className="relative shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                <button
                  onClick={() => setListMenuOpen(listMenuOpen === d.id ? null : d.id)}
                  disabled={exporting === d.id}
                  title="Export"
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition p-1 disabled:opacity-40"
                >
                  {exporting === d.id
                    ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                    : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  }
                </button>
                {listMenuOpen === d.id && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setListMenuOpen(null)} />
                    <div className="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-lg border border-gray-200 z-30 py-1 overflow-hidden">
                      {([
                        ['print', 'Print / Save as PDF', 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm1-4h4v2h-4v-2z'],
                        ['html', 'Download as HTML', 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4'],
                        ['md',   'Download as Markdown', 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'],
                        ['txt',  'Download as Plain Text', 'M4 6h16M4 12h16M4 18h7'],
                      ] as const).map(([fmt, label, icon]) => (
                        <button key={fmt} onClick={() => handleListExport(d, fmt)}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-gray-700 hover:bg-gray-50 transition text-left">
                          <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                          </svg>
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button onClick={() => rename(d)}
                className="shrink-0 text-xs text-gray-400 hover:text-green-700 transition px-1 opacity-0 group-hover:opacity-100 focus:opacity-100">
                Rename
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
