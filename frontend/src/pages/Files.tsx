import { useEffect, useState, useCallback, useMemo } from 'react'
import { api, DocFolder, DocFile } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { parseDate } from '../utils/dates'

const ROLES: { key: string; label: string }[] = [
  { key: 'member',         label: 'Member' },
  { key: 'president',      label: 'President' },
  { key: 'vice_president', label: 'Vice President' },
  { key: 'secretary',      label: 'Secretary' },
  { key: 'treasurer',      label: 'Treasurer' },
  { key: 'entertainment',  label: 'Entertainment' },
  { key: 'house_grounds',  label: 'House & Grounds' },
  { key: 'billing',        label: 'Billing' },
  { key: 'membership',     label: 'Membership' },
  { key: 'usta',           label: 'USTA' },
  { key: 'games',          label: 'Games Admin' },
  { key: 'pro',            label: 'Pro' },
]

const FILE_EXT_CONFIG: Record<string, { label: string; color: string }> = {
  pdf:  { label: 'PDF',  color: '#ef4444' },
  doc:  { label: 'DOC',  color: '#3b82f6' },
  docx: { label: 'DOC',  color: '#3b82f6' },
  xls:  { label: 'XLS',  color: '#16a34a' },
  xlsx: { label: 'XLS',  color: '#16a34a' },
  csv:  { label: 'CSV',  color: '#16a34a' },
  ppt:  { label: 'PPT',  color: '#f97316' },
  pptx: { label: 'PPT',  color: '#f97316' },
  jpg:  { label: 'IMG',  color: '#9333ea' },
  jpeg: { label: 'IMG',  color: '#9333ea' },
  png:  { label: 'IMG',  color: '#9333ea' },
  gif:  { label: 'IMG',  color: '#9333ea' },
  webp: { label: 'IMG',  color: '#9333ea' },
  svg:  { label: 'SVG',  color: '#9333ea' },
  zip:  { label: 'ZIP',  color: '#ca8a04' },
  rar:  { label: 'ZIP',  color: '#ca8a04' },
  '7z': { label: 'ZIP',  color: '#ca8a04' },
  txt:  { label: 'TXT',  color: '#6b7280' },
  mp4:  { label: 'VID',  color: '#db2777' },
  mov:  { label: 'VID',  color: '#db2777' },
}

const PRINTABLE_EXTS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'txt', 'csv'])

function printDoc(filename: string) {
  const url = `/uploads/documents/${filename}`
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none;visibility:hidden;'
  iframe.src = url
  document.body.appendChild(iframe)
  iframe.onload = () => {
    try { iframe.contentWindow?.print() }
    finally { setTimeout(() => iframe.remove(), 60000) }
  }
}

function relativeDate(dateStr: string): string {
  const d = parseDate(dateStr)
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return d.toLocaleDateString()
}

// ── File type icon (document silhouette) ─────────────────────────────────────
function FileIcon({ filename, size = 'sm' }: { filename: string; size?: 'sm' | 'lg' }) {
  const ext = (filename.split('.').pop() ?? '').toLowerCase()
  const cfg = FILE_EXT_CONFIG[ext] ?? { label: ext ? ext.toUpperCase().slice(0, 4) : 'FILE', color: '#9ca3af' }
  const w = size === 'lg' ? 48 : 28
  const h = size === 'lg' ? 56 : 34
  const fs = size === 'lg' ? 9 : 7
  return (
    <div className="relative shrink-0 flex items-center justify-center" style={{ width: w, height: h }}>
      <svg viewBox="0 0 28 34" className="absolute inset-0 w-full h-full" fill="none">
        <path d="M2 2 H18 L26 10 V32 a2 2 0 01-2 2 H4 a2 2 0 01-2-2 V4 a2 2 0 012-2z"
          fill={cfg.color} fillOpacity="0.12" stroke={cfg.color} strokeOpacity="0.45" strokeWidth="1.5" />
        <path d="M18 2 V10 H26" stroke={cfg.color} strokeOpacity="0.45" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <span className="relative z-10 font-black tracking-widest leading-none mt-3" style={{ fontSize: fs, color: cfg.color }}>
        {cfg.label}
      </span>
    </div>
  )
}

// ── Folder icon ───────────────────────────────────────────────────────────────
function FolderIcon({ open = false, size = 'sm' }: { open?: boolean; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'w-12 h-12' : 'w-4 h-4'
  return (
    <svg className={`${cls} shrink-0`} viewBox="0 0 24 24" fill={open ? '#fbbf24' : '#f59e0b'}>
      <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
    </svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function findFolder(folders: DocFolder[], id: string): DocFolder | null {
  for (const f of folders) {
    if (f.id === id) return f
    const found = findFolder(f.children ?? [], id)
    if (found) return found
  }
  return null
}

function getFolderPath(folders: DocFolder[], id: string, path: DocFolder[] = []): DocFolder[] {
  for (const f of folders) {
    const next = [...path, f]
    if (f.id === id) return next
    const found = getFolderPath(f.children ?? [], id, next)
    if (found.length) return found
  }
  return []
}

function getAncestorIds(folders: DocFolder[], id: string): string[] {
  const path = getFolderPath(folders, id)
  return path.slice(0, -1).map(f => f.id)
}

function searchFiles(folders: DocFolder[], query: string, path = ''): { doc: DocFile; folderPath: string }[] {
  const q = query.toLowerCase()
  const results: { doc: DocFile; folderPath: string }[] = []
  for (const f of folders) {
    const fPath = path ? `${path} › ${f.name}` : f.name
    for (const doc of f.docs ?? []) {
      if (doc.title.toLowerCase().includes(q) || doc.filename.toLowerCase().includes(q))
        results.push({ doc, folderPath: fPath })
    }
    if (f.children?.length) results.push(...searchFiles(f.children, query, fPath))
  }
  return results
}

function flattenFolders(folders: DocFolder[], prefix = ''): { id: string; label: string }[] {
  const result: { id: string; label: string }[] = []
  for (const f of folders) {
    result.push({ id: f.id, label: prefix + f.name })
    if (f.children?.length) result.push(...flattenFolders(f.children, prefix + f.name + ' / '))
  }
  return result
}

// ── Left tree node ────────────────────────────────────────────────────────────
function TreeNode({ folder, depth, selectedId, onSelect, openIds, onToggle }: {
  folder: DocFolder; depth: number; selectedId: string | null
  onSelect: (id: string) => void; openIds: Set<string>; onToggle: (id: string) => void
}) {
  const isSelected = folder.id === selectedId
  const isOpen = openIds.has(folder.id)
  const hasChildren = (folder.children ?? []).length > 0
  return (
    <div>
      <div
        onClick={() => onSelect(folder.id)}
        className={`flex items-center gap-1 py-1 px-2 cursor-pointer rounded-lg text-sm select-none transition-colors ${isSelected ? 'bg-green-100 text-green-800 font-medium' : 'text-gray-700 hover:bg-gray-200'}`}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <button
          onClick={e => { e.stopPropagation(); if (hasChildren) onToggle(folder.id) }}
          className="w-4 h-4 flex items-center justify-center shrink-0 text-gray-400"
        >
          {hasChildren
            ? <svg className={`w-2.5 h-2.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 6 10"><path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
            : null}
        </button>
        <FolderIcon open={isOpen} />
        <span className="truncate leading-5">{folder.name}</span>
      </div>
      {isOpen && hasChildren && (folder.children ?? []).map(child => (
        <TreeNode key={child.id} folder={child} depth={depth + 1}
          selectedId={selectedId} onSelect={onSelect} openIds={openIds} onToggle={onToggle} />
      ))}
    </div>
  )
}

// ── Grid file card ────────────────────────────────────────────────────────────
function FileCard({ doc, isBoard, onDelete, onToggleAI }: {
  doc: DocFile; isBoard: boolean; onDelete: (id: string) => void; onToggleAI: (id: string, next: boolean) => void
}) {
  const ext = (doc.filename.split('.').pop() ?? '').toLowerCase()
  const canPrint = PRINTABLE_EXTS.has(ext)
  const aiReadable = ['pdf', 'txt', 'md', 'markdown', 'csv', 'log'].includes(ext)
  return (
    <div className="group relative flex flex-col items-center gap-1.5 p-3 rounded-lg hover:bg-green-50 cursor-pointer transition-colors">
      <a href={`/uploads/documents/${doc.filename}`} target="_blank" rel="noreferrer"
        className="flex flex-col items-center gap-1.5 w-full">
        <FileIcon filename={doc.filename} size="lg" />
        <span className="text-xs text-center text-gray-700 font-medium leading-tight line-clamp-2 w-full break-words">
          {doc.title}
        </span>
      </a>
      <div className="absolute top-1 right-1 hidden group-hover:flex items-center gap-0.5 bg-white border border-gray-200 rounded shadow-sm px-1 py-0.5">
        {canPrint && (
          <button onClick={() => printDoc(doc.filename)} title="Print" className="p-0.5 text-gray-400 hover:text-gray-700">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm1-4h4v2h-4v-2z" />
            </svg>
          </button>
        )}
        {isBoard && aiReadable && (
          <button onClick={() => onToggleAI(doc.id, !doc.ai_indexed)}
            title={doc.ai_indexed
              ? doc.indexed ? 'Members can ask the AI about this — click to disable' : 'Enabled for members — PDF will be indexed on next Reindex run'
              : 'Enable so members can ask the AI about this file'}
            className={`p-0.5 text-[10px] font-bold ${doc.ai_indexed ? (doc.indexed ? 'text-green-600' : 'text-amber-500') : 'text-gray-300 hover:text-gray-500'}`}>
            ✨
          </button>
        )}
        {isBoard && (
          <button onClick={() => onDelete(doc.id)} title="Delete" className="p-0.5 text-red-400 hover:text-red-600">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

// ── List file row ─────────────────────────────────────────────────────────────
function FileListRow({ doc, isBoard, onDelete, onToggleAI, subtitle }: {
  doc: DocFile; isBoard: boolean; onDelete: (id: string) => void
  onToggleAI: (id: string, next: boolean) => void; subtitle?: string
}) {
  const ext = (doc.filename.split('.').pop() ?? '').toLowerCase()
  const canPrint = PRINTABLE_EXTS.has(ext)
  const aiReadable = ['pdf', 'txt', 'md', 'markdown', 'csv', 'log'].includes(ext)
  const cfg = FILE_EXT_CONFIG[ext] ?? { label: ext.toUpperCase().slice(0, 4) || 'FILE', color: '#9ca3af' }
  return (
    <div className="group flex items-center gap-3 px-3 py-2 hover:bg-green-50 rounded-lg transition-colors">
      <a href={`/uploads/documents/${doc.filename}`} target="_blank" rel="noreferrer"
        className="flex items-center gap-3 flex-1 min-w-0">
        <FileIcon filename={doc.filename} size="sm" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-800 group-hover:text-green-700 transition block truncate">
            {doc.title}
          </span>
          {subtitle && <span className="text-xs text-gray-400 block truncate">{subtitle}</span>}
        </div>
        <span className="text-xs text-gray-400 shrink-0 w-20 text-right hidden sm:block">{relativeDate(doc.created_at)}</span>
        <span className="text-xs shrink-0 w-12 text-right hidden md:block font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
        <svg className="w-3.5 h-3.5 shrink-0 text-gray-300 group-hover:text-green-500 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {canPrint && (
          <button onClick={() => printDoc(doc.filename)} title="Print"
            className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-white transition">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm1-4h4v2h-4v-2z" />
            </svg>
          </button>
        )}
        {isBoard && aiReadable && (
          <button onClick={() => onToggleAI(doc.id, !doc.ai_indexed)}
            title={doc.ai_indexed
              ? doc.indexed ? 'Members can ask the AI about this — click to disable' : 'Enabled for members — PDF will be indexed on next Reindex run'
              : 'Enable so members can ask the AI about this file'}
            className={`text-[10px] px-1 py-0.5 rounded font-bold transition ${doc.ai_indexed ? (doc.indexed ? 'text-green-600' : 'text-amber-500') : 'text-gray-300 hover:text-gray-500'}`}>
            ✨
          </button>
        )}
        {isBoard && (
          <button onClick={() => onDelete(doc.id)} title="Delete"
            className="p-1 text-red-400 hover:text-red-600 rounded hover:bg-white transition">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

// ── Folder item (right panel) ─────────────────────────────────────────────────
function FolderItem({ folder, view, onClick, isBoard, onEdit, onDelete }: {
  folder: DocFolder; view: 'list' | 'grid'
  onClick: () => void; isBoard: boolean
  onEdit: (f: DocFolder) => void; onDelete: (id: string, name: string, count: number) => void
}) {
  const count = folder.doc_count ?? (folder.docs ?? []).length
  if (view === 'grid') {
    return (
      <div onClick={onClick}
        className="group relative flex flex-col items-center gap-1.5 p-3 rounded-lg hover:bg-green-50 cursor-pointer transition-colors">
        <FolderIcon size="lg" />
        <span className="text-xs text-center text-gray-700 font-medium leading-tight line-clamp-2 w-full break-words">
          {folder.name}
        </span>
        {count > 0 && <span className="text-[10px] text-gray-400">{count} item{count !== 1 ? 's' : ''}</span>}
        {isBoard && (
          <div className="absolute top-1 right-1 hidden group-hover:flex items-center gap-0.5 bg-white border border-gray-200 rounded shadow-sm px-1 py-0.5">
            <button onClick={e => { e.stopPropagation(); onEdit(folder) }}
              className="p-0.5 text-green-400 hover:text-green-600">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete(folder.id, folder.name, folder.doc_count ?? 0) }}
              className="p-0.5 text-red-400 hover:text-red-600">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    )
  }
  return (
    <div onClick={onClick}
      className="group flex items-center gap-3 px-3 py-2 hover:bg-green-50 rounded-lg transition-colors cursor-pointer">
      <FolderIcon />
      <span className="text-sm font-medium text-gray-800 group-hover:text-green-700 flex-1 truncate transition">{folder.name}</span>
      {count > 0 && <span className="text-xs text-gray-400 shrink-0 hidden sm:block">{count} item{count !== 1 ? 's' : ''}</span>}
      {isBoard && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={e => { e.stopPropagation(); onEdit(folder) }}
            className="text-xs text-green-500 hover:text-green-700 font-medium px-1.5 py-0.5 rounded hover:bg-white transition">
            Edit
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(folder.id, folder.name, folder.doc_count ?? 0) }}
            className="text-xs text-red-400 hover:text-red-600 font-medium px-1.5 py-0.5 rounded hover:bg-white transition">
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

// ── Folder import helpers ─────────────────────────────────────────────────────

interface FileWithPath {
  file: File
  relativePath: string // e.g. "FolderA/Sub/file.pdf" — just filename if no subfolders
}

function fileEntryToFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

function readDirEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = []
    function batch() {
      reader.readEntries(items => {
        if (items.length === 0) { resolve(all); return }
        all.push(...items)
        batch()
      }, reject)
    }
    batch()
  })
}

async function traverseEntry(entry: FileSystemEntry, basePath: string): Promise<FileWithPath[]> {
  const path = basePath ? `${basePath}/${entry.name}` : entry.name
  if (entry.isFile) {
    const file = await fileEntryToFile(entry as FileSystemFileEntry)
    return [{ file, relativePath: path }]
  }
  if (entry.isDirectory) {
    const children = await readDirEntries((entry as FileSystemDirectoryEntry).createReader())
    const nested = await Promise.all(children.map(c => traverseEntry(c, path)))
    return nested.flat()
  }
  return []
}

async function getDropEntries(dt: DataTransfer): Promise<FileWithPath[]> {
  if (dt.items?.length && (dt.items[0] as any).webkitGetAsEntry) {
    const all: FileWithPath[] = []
    for (let i = 0; i < dt.items.length; i++) {
      const entry = (dt.items[i] as any).webkitGetAsEntry() as FileSystemEntry | null
      if (entry) all.push(...await traverseEntry(entry, ''))
    }
    return all
  }
  return Array.from(dt.files).map(f => ({ file: f, relativePath: f.name }))
}

// ── Folder form state ─────────────────────────────────────────────────────────
interface FolderFormState { name: string; sortOrder: string; roles: string[]; parentId: string }
const emptyFolderForm = (): FolderFormState => ({ name: '', sortOrder: '0', roles: [], parentId: '' })

// ── Main component ────────────────────────────────────────────────────────────
export default function Files() {
  const { isBoard } = useAuth()

  const [folders, setFolders] = useState<DocFolder[]>([])
  const [adminFolders, setAdminFolders] = useState<DocFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')

  // Left panel tree expansion
  const [treeOpenIds, setTreeOpenIds] = useState<Set<string>>(new Set())
  // Selected folder (right panel shows its contents)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Folder CRUD
  const [showFolderForm, setShowFolderForm] = useState(false)
  const [folderForm, setFolderForm] = useState<FolderFormState>(emptyFolderForm())
  const [folderSaving, setFolderSaving] = useState(false)
  const [folderError, setFolderError] = useState('')
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)

  // Upload
  const [showUpload, setShowUpload] = useState(false)
  const [uploadFolderId, setUploadFolderId] = useState('')
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploadEntries, setUploadEntries] = useState<FileWithPath[]>([])
  const [uploadMode, setUploadMode] = useState<'files' | 'folder'>('files')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadCurrent, setUploadCurrent] = useState(0)
  const [uploadTotal, setUploadTotal] = useState(0)
  const [uploadStatus, setUploadStatus] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [loadError, setLoadError] = useState('')

  const loadFolders = useCallback(async () => {
    const d = await api.documents.list()
    setFolders(d); return d
  }, [])

  const loadAdminFolders = useCallback(async () => {
    try {
      const d = await api.documents.folders.adminList()
      setAdminFolders(d)
    } catch { /* non-fatal — admin folder metadata is supplemental */ }
  }, [])

  useEffect(() => {
    const init = async () => {
      try {
        const data = await loadFolders()
        setTreeOpenIds(new Set(data.map(f => f.id)))
      } catch (e: any) {
        setLoadError(e.message || 'Could not load files')
      } finally {
        setLoading(false)
      }
      if (isBoard) loadAdminFolders()
    }
    init()
  }, [isBoard, loadFolders, loadAdminFolders])

  const toggleTree = useCallback((id: string) => {
    setTreeOpenIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }, [])

  const selectFolder = useCallback((id: string) => {
    setSelectedId(id)
    // Expand ancestors in the tree
    setTreeOpenIds(prev => {
      const ancestors = getAncestorIds(folders, id)
      const next = new Set(prev)
      ancestors.forEach(a => next.add(a))
      next.add(id)
      return next
    })
  }, [folders])

  // Current folder contents
  const selectedFolder = selectedId ? findFolder(folders, selectedId) : null
  const breadcrumb = selectedId ? getFolderPath(folders, selectedId) : []

  const currentFolders = selectedFolder ? (selectedFolder.children ?? []) : folders
  const currentDocs: DocFile[] = selectedFolder ? (selectedFolder.docs ?? []) : []

  const sortedDocs = useMemo(() => {
    if (sortBy === 'name') return [...currentDocs].sort((a, b) => a.title.localeCompare(b.title))
    return currentDocs
  }, [currentDocs, sortBy])

  const searchResults = searchQuery.trim() ? searchFiles(folders, searchQuery.trim()) : null

  // Folder CRUD
  const openCreateFolder = () => {
    setEditingFolderId(null)
    setFolderForm({ ...emptyFolderForm(), parentId: selectedId ?? '' })
    setFolderError(''); setShowFolderForm(true)
  }
  const openEditFolder = (f: DocFolder) => {
    setEditingFolderId(f.id)
    setFolderForm({ name: f.name, sortOrder: String(f.sort_order), roles: [...f.roles], parentId: f.parent_id ?? '' })
    setFolderError(''); setShowFolderForm(true)
  }
  const saveFolder = async () => {
    if (!folderForm.name.trim()) { setFolderError('Name is required'); return }
    setFolderSaving(true); setFolderError('')
    try {
      const payload = { name: folderForm.name.trim(), sort_order: parseInt(folderForm.sortOrder) || 0, roles: folderForm.roles, parent_id: folderForm.parentId || null }
      if (editingFolderId) await api.documents.folders.update(editingFolderId, payload)
      else await api.documents.folders.create(payload)
      setShowFolderForm(false); setEditingFolderId(null)
      await loadFolders()
      loadAdminFolders()
    } catch (e: any) { setFolderError(e.message || 'Save failed') }
    finally { setFolderSaving(false) }
  }
  const deleteFolder = async (id: string, name: string, docCount: number) => {
    const msg = docCount > 0 ? `Delete "${name}"? Its ${docCount} file${docCount !== 1 ? 's' : ''} will become unfiled.` : `Delete folder "${name}"?`
    if (!confirm(msg)) return
    await api.documents.folders.delete(id)
    if (selectedId === id) setSelectedId(null)
    await loadFolders()
    loadAdminFolders()
  }
  const toggleRole = (role: string) =>
    setFolderForm(f => ({ ...f, roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role] }))

  // Upload — plain files
  const handlePlainFiles = (files: File[]) => {
    setUploadMode('files')
    setUploadEntries([])
    setUploadFiles(files)
    if (files.length === 1) setUploadTitle(files[0].name.replace(/\.[^.]+$/, ''))
    else setUploadTitle('')
  }

  // Upload — folder picker (webkitdirectory)
  const handleFolderPicker = (fileList: FileList) => {
    const entries: FileWithPath[] = Array.from(fileList).map(f => ({
      file: f,
      relativePath: (f as any).webkitRelativePath || f.name,
    })).filter(e => {
      // Skip hidden files and macOS junk
      const parts = e.relativePath.split('/')
      return !parts.some((p: string) => p.startsWith('.') || p === '__MACOSX')
    })
    setUploadMode('folder')
    setUploadEntries(entries)
    setUploadFiles([])
    setUploadTitle('')
  }

  const resetUpload = () => {
    setUploadFiles([]); setUploadEntries([]); setUploadTitle('')
    setUploadError(''); setUploadProgress(0); setUploadStatus('')
    setUploadMode('files')
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFolderId) { setUploadError('Please select a destination folder'); return }
    if (uploadMode === 'folder') {
      await doFolderUpload(uploadEntries, uploadFolderId)
    } else {
      await doPlainUpload(uploadFiles, uploadFolderId)
    }
  }

  const doPlainUpload = async (files: File[], targetFolderId: string) => {
    if (files.length === 0) return
    if (files.length === 1 && !uploadTitle.trim()) { setUploadError('Title is required'); return }
    setUploading(true); setUploadError(''); setUploadProgress(0)
    setUploadCurrent(0); setUploadTotal(files.length)
    try {
      if (files.length === 1) {
        setUploadCurrent(1)
        await api.documents.upload(uploadTitle.trim(), targetFolderId, files[0], pct => setUploadProgress(pct))
      } else {
        for (let i = 0; i < files.length; i++) {
          setUploadCurrent(i + 1)
          const file = files[i]
          await api.documents.upload(file.name.replace(/\.[^.]+$/, '') || file.name, targetFolderId, file, pct =>
            setUploadProgress(Math.round(((i + pct / 100) / files.length) * 100)))
        }
      }
      resetUpload(); setShowUpload(false)
      await loadFolders()
    } catch (e: any) { setUploadError(e.message || 'Upload failed') }
    finally { setUploading(false) }
  }

  const doFolderUpload = async (entries: FileWithPath[], targetFolderId: string) => {
    if (entries.length === 0) return
    setUploading(true); setUploadError(''); setUploadProgress(0); setUploadStatus('')

    try {
      // Map: relative folder path -> folder ID
      const folderMap = new Map<string, string>()
      folderMap.set('', targetFolderId)

      // Collect all unique subfolder paths
      const folderPaths = new Set<string>()
      for (const { relativePath } of entries) {
        const parts = relativePath.split('/')
        parts.pop() // strip filename
        let cur = ''
        for (const part of parts) {
          cur = cur ? `${cur}/${part}` : part
          if (cur) folderPaths.add(cur)
        }
      }

      // Sort shallowest first so parents exist before children
      const sorted = [...folderPaths].sort((a, b) =>
        a.split('/').length - b.split('/').length || a.localeCompare(b))

      // Create each missing subfolder
      for (const path of sorted) {
        const parts = path.split('/')
        const name = parts[parts.length - 1]
        const parentPath = parts.slice(0, -1).join('/')
        const parentId = folderMap.get(parentPath) ?? targetFolderId
        setUploadStatus(`Creating folder: ${name}`)
        const res = await api.documents.folders.create({
          name,
          sort_order: 0,
          roles: [],
          parent_id: parentId,
        }) as { id: string }
        folderMap.set(path, res.id)
      }

      // Upload files
      const total = entries.length
      setUploadTotal(total)
      for (let i = 0; i < entries.length; i++) {
        const { file, relativePath } = entries[i]
        const parts = relativePath.split('/')
        const filename = parts[parts.length - 1]
        const folderPath = parts.slice(0, -1).join('/')
        const folderId = folderMap.get(folderPath) ?? targetFolderId
        const title = filename.replace(/\.[^.]+$/, '') || filename
        setUploadCurrent(i + 1)
        setUploadStatus(`Uploading: ${relativePath}`)
        await api.documents.upload(title, folderId, file, pct =>
          setUploadProgress(Math.round(((i + pct / 100) / total) * 100)))
      }

      resetUpload(); setShowUpload(false)
      await loadFolders()
      if (isBoard) loadAdminFolders()
    } catch (e: any) { setUploadError(e.message || 'Upload failed') }
    finally { setUploading(false); setUploadStatus('') }
  }
  const handleDelete = async (docId: string) => {
    if (!confirm('Delete this file?')) return
    await api.documents.delete(docId); await loadFolders()
  }
  const handleToggleAI = async (docId: string, next: boolean) => {
    const flip = (fs: DocFolder[]): DocFolder[] => fs.map(f => ({
      ...f,
      docs: (f.docs ?? []).map(d => d.id === docId ? { ...d, ai_indexed: next } : d),
      children: f.children ? flip(f.children) : f.children,
    }))
    setFolders(prev => flip(prev))
    try {
      await api.documents.setAIIndexed(docId, next)
      // Text files are indexed in a background goroutine on the server (~1-2s).
      // Reload after a short delay so the ✨ badge updates to green.
      if (next) setTimeout(() => loadFolders(), 2500)
    }
    catch { await loadFolders() }
  }

  const flatFolders = flattenFolders(adminFolders).filter(f => f.id !== editingFolderId)
  const totalItems = currentFolders.length + sortedDocs.length

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold text-green-800 font-serif">Files</h1>
        {isBoard && (
          <div className="flex items-center gap-2">
            <button onClick={openCreateFolder}
              className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
              + New Folder
            </button>
          </div>
        )}
      </div>

      {/* ── Folder form modal ── */}
      {isBoard && showFolderForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowFolderForm(false); setEditingFolderId(null) }} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 text-base font-serif">{editingFolderId ? 'Edit Folder' : 'New Folder'}</h2>
              <button onClick={() => { setShowFolderForm(false); setEditingFolderId(null) }} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Folder Name *</label>
                <input value={folderForm.name} onChange={e => setFolderForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus placeholder="e.g. Board Minutes"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sort Order</label>
                <input type="number" value={folderForm.sortOrder}
                  onChange={e => setFolderForm(f => ({ ...f, sortOrder: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Parent Folder (optional)</label>
              <select value={folderForm.parentId} onChange={e => setFolderForm(f => ({ ...f, parentId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">— Top level —</option>
                {flatFolders.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Who can see this folder?</label>
              <label className="flex items-center gap-2 mb-2 cursor-pointer">
                <input type="checkbox" checked={folderForm.roles.length === 0} onChange={() => setFolderForm(f => ({ ...f, roles: [] }))} className="w-4 h-4 accent-green-600" />
                <span className="text-sm text-gray-700 font-medium">All members</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pl-1">
                {ROLES.map(r => (
                  <label key={r.key} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={folderForm.roles.includes(r.key)} onChange={() => toggleRole(r.key)} className="w-3.5 h-3.5 accent-green-600" />
                    <span className="text-xs text-gray-600">{r.label}</span>
                  </label>
                ))}
              </div>
            </div>
            {folderError && <p className="text-red-500 text-xs">{folderError}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={saveFolder} disabled={folderSaving}
                className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-5 py-2 rounded-lg transition disabled:opacity-50">
                {folderSaving ? 'Saving…' : editingFolderId ? 'Save Changes' : 'Create Folder'}
              </button>
              <button onClick={() => { setShowFolderForm(false); setEditingFolderId(null) }}
                className="text-sm text-gray-400 hover:text-gray-600 px-3 transition">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Explorer shell ── */}
      <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm"
        style={{ height: 'calc(100vh - 200px)', minHeight: 400 }}>

        {/* Left: folder tree */}
        <div className="w-48 md:w-56 shrink-0 bg-gray-50 border-r border-gray-200 overflow-y-auto py-2 flex flex-col">
          {/* Root node */}
          <button
            onClick={() => setSelectedId(null)}
            className={`flex items-center gap-2 py-1.5 px-3 text-sm font-medium rounded-lg mx-1 transition-colors select-none ${selectedId === null ? 'bg-green-100 text-green-800' : 'text-gray-600 hover:bg-gray-200'}`}>
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            Files
          </button>
          <div className="mt-1 px-1 flex-1">
            {loading ? (
              <div className="space-y-1 px-2 animate-pulse">
                {[1,2,3,4].map(i => <div key={i} className="h-6 bg-gray-200 rounded w-full" />)}
              </div>
            ) : loadError ? (
              <p className="text-xs text-red-400 px-3 py-2">{loadError}</p>
            ) : (
              folders.map(f => (
                <TreeNode key={f.id} folder={f} depth={0}
                  selectedId={selectedId} onSelect={selectFolder}
                  openIds={treeOpenIds} onToggle={toggleTree} />
              ))
            )}
          </div>
        </div>

        {/* Right: content area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-white shrink-0">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-sm min-w-0 flex-1">
              <button onClick={() => setSelectedId(null)} className="text-gray-500 hover:text-green-600 shrink-0 font-medium transition">Files</button>
              {breadcrumb.map((f, i) => (
                <span key={f.id} className="flex items-center gap-1 min-w-0">
                  <svg className="w-3 h-3 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <button
                    onClick={() => setSelectedId(f.id)}
                    className={`truncate transition font-medium ${i === breadcrumb.length - 1 ? 'text-gray-800' : 'text-gray-500 hover:text-green-600'}`}>
                    {f.name}
                  </button>
                </span>
              ))}
            </div>

            {/* Search */}
            <div className="relative hidden sm:block">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" placeholder="Search…" value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 w-36" />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
              )}
            </div>

            {/* Sort */}
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 shrink-0">
              {(['date', 'name'] as const).map(s => (
                <button key={s} onClick={() => setSortBy(s)}
                  className={`text-xs px-2.5 py-1 rounded-md font-medium transition ${sortBy === s ? 'bg-white text-green-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {s === 'date' ? 'Newest' : 'A–Z'}
                </button>
              ))}
            </div>

            {/* View toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 shrink-0">
              <button onClick={() => setViewMode('list')} title="List view"
                className={`p-1 rounded-md transition ${viewMode === 'list' ? 'bg-white shadow-sm text-green-800' : 'text-gray-400 hover:text-gray-600'}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
              <button onClick={() => setViewMode('grid')} title="Grid view"
                className={`p-1 rounded-md transition ${viewMode === 'grid' ? 'bg-white shadow-sm text-green-800' : 'text-gray-400 hover:text-gray-600'}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
            </div>

            {/* Upload button */}
            {isBoard && (
              <button onClick={() => {
                setUploadFolderId(selectedId ?? '')
                setShowUpload(v => !v)
                resetUpload()
              }}
                className="shrink-0 text-xs bg-green-700 hover:bg-green-800 text-white font-medium px-3 py-1.5 rounded-lg transition">
                + Upload
              </button>
            )}
          </div>

          {/* Mobile search */}
          <div className="sm:hidden px-3 pt-2 shrink-0">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" placeholder="Search…" value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400" />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">✕</button>
              )}
            </div>
          </div>

          {/* Upload form */}
          {isBoard && showUpload && (
            <form onSubmit={handleUpload}
              className="border-b border-gray-100 bg-green-50 px-4 py-3 space-y-3 shrink-0"
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={async e => {
                e.preventDefault(); setDragOver(false)
                const entries = await getDropEntries(e.dataTransfer)
                const hasSubfolders = entries.some(en => en.relativePath.includes('/'))
                if (hasSubfolders) {
                  setUploadMode('folder')
                  setUploadEntries(entries.filter(en => {
                    const parts = en.relativePath.split('/')
                    return !parts.some(p => p.startsWith('.') || p === '__MACOSX')
                  }))
                  setUploadFiles([])
                } else {
                  handlePlainFiles(entries.map(en => en.file))
                }
              }}>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Upload to folder *</label>
                <select
                  required
                  value={uploadFolderId}
                  onChange={e => setUploadFolderId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="">— Select a folder —</option>
                  {flattenFolders(folders).map(f => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div className={`border-2 border-dashed rounded-lg p-3 text-center transition-colors ${dragOver ? 'border-green-500 bg-green-100' : 'border-green-300 bg-white'}`}>
                <p className="text-xs text-gray-400 mb-2">Drop files or folders here, or</p>
                <div className="flex gap-2 justify-center flex-wrap">
                  <label className="cursor-pointer text-xs text-green-700 hover:text-green-900 font-medium border border-green-300 rounded px-3 py-1 bg-white transition">
                    Browse files
                    <input type="file" multiple className="sr-only"
                      onChange={e => handlePlainFiles(Array.from(e.target.files ?? []))} />
                  </label>
                  <label className="cursor-pointer text-xs text-green-700 hover:text-green-900 font-medium border border-green-300 rounded px-3 py-1 bg-white transition">
                    Import folder
                    <input type="file" multiple className="sr-only"
                      {...{ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
                      onChange={e => e.target.files?.length && handleFolderPicker(e.target.files)} />
                  </label>
                </div>
              </div>

              {/* Plain files: single title or file count */}
              {uploadMode === 'files' && uploadFiles.length === 1 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
                  <input value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} required autoFocus
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              )}
              {uploadMode === 'files' && uploadFiles.length > 1 && (
                <p className="text-xs text-gray-600 font-medium">{uploadFiles.length} files selected</p>
              )}

              {/* Folder import summary */}
              {uploadMode === 'folder' && uploadEntries.length > 0 && (() => {
                const folderSet = new Set<string>()
                for (const { relativePath } of uploadEntries) {
                  const parts = relativePath.split('/')
                  if (parts.length > 1) folderSet.add(parts[0])
                }
                return (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-800 space-y-0.5">
                    <p className="font-semibold">Folder import ready</p>
                    <p>{uploadEntries.length} file{uploadEntries.length !== 1 ? 's' : ''} in {folderSet.size} top-level folder{folderSet.size !== 1 ? 's' : ''}</p>
                    <p className="text-green-500">Subfolders will be created automatically.</p>
                  </div>
                )
              })()}

              {uploadError && <p className="text-red-500 text-xs">{uploadError}</p>}
              {uploading && (
                <div className="space-y-1">
                  {uploadStatus && <p className="text-xs text-gray-500 truncate">{uploadStatus}</p>}
                  {uploadTotal > 0 && <p className="text-xs text-gray-400">File {uploadCurrent} of {uploadTotal}</p>}
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-green-600 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button type="submit"
                  disabled={uploading || (uploadMode === 'files' ? uploadFiles.length === 0 : uploadEntries.length === 0)}
                  className="bg-green-700 hover:bg-green-800 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition disabled:opacity-50">
                  {uploading
                    ? 'Uploading…'
                    : uploadMode === 'folder'
                      ? `Import ${uploadEntries.length} file${uploadEntries.length !== 1 ? 's' : ''}`
                      : `Upload${uploadFiles.length > 1 ? ` ${uploadFiles.length} files` : ''}`}
                </button>
                <button type="button" onClick={() => { setShowUpload(false); resetUpload() }}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 transition">Cancel</button>
              </div>
            </form>
          )}

          {/* Content area */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-2 animate-pulse">
                {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}
              </div>
            ) : loadError ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <svg className="w-12 h-12 text-red-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <p className="text-red-500 text-sm font-medium mb-1">Failed to load files</p>
                <p className="text-gray-400 text-xs">{loadError}</p>
              </div>
            ) : searchResults !== null ? (
              /* Search results */
              <div className="p-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-2">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
                </p>
                {searchResults.length === 0 ? (
                  <p className="text-sm text-gray-400 py-8 text-center">No files found.</p>
                ) : (
                  searchResults.map(({ doc, folderPath }) => (
                    <FileListRow key={doc.id} doc={doc} isBoard={isBoard} onDelete={handleDelete} onToggleAI={handleToggleAI} subtitle={folderPath} />
                  ))
                )}
              </div>
            ) : currentFolders.length === 0 && sortedDocs.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <svg className="w-16 h-16 text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <p className="text-gray-400 text-sm">
                  {selectedId
                    ? isBoard ? 'Empty folder — use Upload to add files.' : 'No files in this folder.'
                    : isBoard ? 'No folders yet — create one to get started.' : 'No files available.'}
                </p>
              </div>
            ) : viewMode === 'grid' ? (
              /* Grid view */
              <div className="p-4">
                {currentFolders.length > 0 && (
                  <div className="mb-4">
                    {!selectedId && <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Folders</p>}
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1">
                      {currentFolders.map(f => (
                        <FolderItem key={f.id} folder={f} view="grid" onClick={() => selectFolder(f.id)}
                          isBoard={isBoard} onEdit={openEditFolder} onDelete={deleteFolder} />
                      ))}
                    </div>
                  </div>
                )}
                {sortedDocs.length > 0 && (
                  <div>
                    {currentFolders.length > 0 && <div className="border-t border-gray-100 mb-3" />}
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1">
                      {sortedDocs.map(doc => (
                        <FileCard key={doc.id} doc={doc} isBoard={isBoard} onDelete={handleDelete} onToggleAI={handleToggleAI} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* List view */
              <div className="p-2">
                {/* Column headers */}
                <div className="flex items-center gap-3 px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 mb-1">
                  <span className="flex-1">Name</span>
                  <span className="w-20 text-right hidden sm:block">Modified</span>
                  <span className="w-12 text-right hidden md:block">Type</span>
                  <span className="w-16" />
                </div>
                {currentFolders.map(f => (
                  <FolderItem key={f.id} folder={f} view="list" onClick={() => selectFolder(f.id)}
                    isBoard={isBoard} onEdit={openEditFolder} onDelete={deleteFolder} />
                ))}
                {currentFolders.length > 0 && sortedDocs.length > 0 && <div className="border-t border-gray-100 my-1" />}
                {sortedDocs.map(doc => (
                  <FileListRow key={doc.id} doc={doc} isBoard={isBoard} onDelete={handleDelete} onToggleAI={handleToggleAI} />
                ))}
              </div>
            )}
          </div>

          {/* Status bar */}
          {!loading && searchResults === null && (
            <div className="shrink-0 border-t border-gray-100 bg-gray-50 px-4 py-1 flex items-center gap-3 text-xs text-gray-400">
              <span>{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
              {sortedDocs.length > 0 && <span>{sortedDocs.length} file{sortedDocs.length !== 1 ? 's' : ''}</span>}
              {currentFolders.length > 0 && <span>{currentFolders.length} folder{currentFolders.length !== 1 ? 's' : ''}</span>}
              {selectedFolder && <span className="ml-auto truncate">{breadcrumb.map(f => f.name).join(' › ')}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
