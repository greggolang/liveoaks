import { useEffect, useState, useCallback } from 'react'
import { api, DocFolder, DocFile } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

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

function FolderPermissionBadges({ roles }: { roles: string[] }) {
  if (roles.length === 0) return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">All members</span>
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map(r => (
        <span key={r} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full capitalize">
          {ROLES.find(x => x.key === r)?.label ?? r}
        </span>
      ))}
    </div>
  )
}

function flattenFolders(folders: DocFolder[], prefix = ''): { id: string; label: string }[] {
  const result: { id: string; label: string }[] = []
  for (const f of folders) {
    result.push({ id: f.id, label: prefix + f.name })
    if (f.children?.length) result.push(...flattenFolders(f.children, prefix + f.name + ' / '))
  }
  return result
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

const FILE_TYPE_MAP: Record<string, { label: string; cls: string }> = {
  pdf:  { label: 'PDF',  cls: 'bg-red-100 text-red-700' },
  doc:  { label: 'DOC',  cls: 'bg-blue-100 text-blue-700' },
  docx: { label: 'DOC',  cls: 'bg-blue-100 text-blue-700' },
  xls:  { label: 'XLS',  cls: 'bg-green-100 text-green-700' },
  xlsx: { label: 'XLS',  cls: 'bg-green-100 text-green-700' },
  csv:  { label: 'CSV',  cls: 'bg-green-100 text-green-700' },
  ppt:  { label: 'PPT',  cls: 'bg-orange-100 text-orange-700' },
  pptx: { label: 'PPT',  cls: 'bg-orange-100 text-orange-700' },
  jpg:  { label: 'IMG',  cls: 'bg-purple-100 text-purple-700' },
  jpeg: { label: 'IMG',  cls: 'bg-purple-100 text-purple-700' },
  png:  { label: 'IMG',  cls: 'bg-purple-100 text-purple-700' },
  gif:  { label: 'IMG',  cls: 'bg-purple-100 text-purple-700' },
  webp: { label: 'IMG',  cls: 'bg-purple-100 text-purple-700' },
  svg:  { label: 'SVG',  cls: 'bg-purple-100 text-purple-700' },
  zip:  { label: 'ZIP',  cls: 'bg-yellow-100 text-yellow-700' },
  rar:  { label: 'ZIP',  cls: 'bg-yellow-100 text-yellow-700' },
  '7z': { label: 'ZIP',  cls: 'bg-yellow-100 text-yellow-700' },
  txt:  { label: 'TXT',  cls: 'bg-gray-100 text-gray-600' },
  mp4:  { label: 'VID',  cls: 'bg-pink-100 text-pink-700' },
  mov:  { label: 'VID',  cls: 'bg-pink-100 text-pink-700' },
}

function FileTypeBadge({ filename }: { filename: string }) {
  const ext = (filename.split('.').pop() ?? '').toLowerCase()
  const c = FILE_TYPE_MAP[ext] ?? { label: ext ? ext.toUpperCase().slice(0, 4) : 'FILE', cls: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`inline-flex items-center justify-center w-10 h-8 rounded text-xs font-bold shrink-0 tracking-wide ${c.cls}`}>
      {c.label}
    </span>
  )
}

function FileRow({ doc, isBoard, onDelete }: { doc: DocFile; isBoard: boolean; onDelete: (id: string) => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition group">
      <FileTypeBadge filename={doc.filename} />
      <div className="flex-1 min-w-0">
        <a href={`/uploads/documents/${doc.filename}`} target="_blank" rel="noreferrer"
          className="font-medium text-gray-800 hover:text-green-700 text-sm transition block truncate">
          {doc.title}
        </a>
        <p className="text-xs text-gray-400 mt-0.5">{new Date(doc.created_at).toLocaleDateString()}</p>
      </div>
      <a href={`/uploads/documents/${doc.filename}`} target="_blank" rel="noreferrer"
        title="Open file"
        className="shrink-0 p-1 text-gray-300 hover:text-green-600 transition opacity-0 group-hover:opacity-100 rounded">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
      {isBoard && (
        <button onClick={() => onDelete(doc.id)}
          className="shrink-0 text-xs text-red-400 hover:text-red-600 transition opacity-0 group-hover:opacity-100 px-1">
          Delete
        </button>
      )}
    </div>
  )
}

interface FolderFormState {
  name: string; sortOrder: string; roles: string[]; parentId: string
}
const emptyFolderForm = (): FolderFormState => ({ name: '', sortOrder: '0', roles: [], parentId: '' })

interface FolderNodeProps {
  folder: DocFolder
  depth: number
  isBoard: boolean
  showUploadFor: string | null
  uploadFolderId: string
  uploadTitle: string
  uploadFiles: File[]
  uploading: boolean
  uploadError: string
  uploadProgress: number
  uploadCurrent: number
  uploadTotal: number
  onUploadOpen: (folderId: string) => void
  onUploadCancel: () => void
  onUploadTitleChange: (v: string) => void
  onUploadFileChange: (files: File[]) => void
  onUploadSubmit: (e: React.FormEvent) => void
  onDelete: (docId: string) => void
}

function FolderNode({
  folder, depth, isBoard,
  showUploadFor, uploadFolderId, uploadTitle, uploadFiles, uploading, uploadError,
  uploadProgress, uploadCurrent, uploadTotal,
  onUploadOpen, onUploadCancel, onUploadTitleChange, onUploadFileChange, onUploadSubmit, onDelete,
}: FolderNodeProps) {
  const [open, setOpen] = useState(depth === 0)
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (!isBoard) return
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return
    onUploadOpen(folder.id)
    onUploadFileChange(files)
  }, [isBoard, folder.id, onUploadOpen, onUploadFileChange])

  const docs = folder.docs ?? []
  const children = folder.children ?? []

  return (
    <div style={{ marginLeft: depth * 20 }}>
      {/* Folder header */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-80 transition">
          <span className="text-gray-400 w-4 shrink-0 text-xs">{open ? '▾' : '▸'}</span>
          <svg className={`w-4 h-4 shrink-0 transition-colors ${open ? 'text-yellow-400' : 'text-yellow-500'}`} fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
          </svg>
          <h2 className={`font-semibold text-gray-700 ${depth === 0 ? 'text-sm' : 'text-xs'}`}>{folder.name}</h2>
          {isBoard && <FolderPermissionBadges roles={folder.roles} />}
          {!open && docs.length > 0 && (
            <span className="text-xs text-gray-400 ml-1">{docs.length} file{docs.length !== 1 ? 's' : ''}</span>
          )}
        </button>
        {isBoard && open && showUploadFor !== folder.id && (
          <button onClick={() => onUploadOpen(folder.id)}
            className="text-xs text-green-700 hover:text-green-900 font-medium transition shrink-0 ml-2">
            + Upload
          </button>
        )}
      </div>

      {open && (
        <div
          className={`ml-6 rounded-xl transition-all ${dragOver ? 'ring-2 ring-green-400 ring-offset-1 bg-green-50' : ''}`}
          onDragOver={isBoard ? (e) => { e.preventDefault(); setDragOver(true) } : undefined}
          onDragLeave={isBoard ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) } : undefined}
          onDrop={isBoard ? handleDrop : undefined}>

          {/* Upload form */}
          {isBoard && showUploadFor === folder.id && (
            <form onSubmit={onUploadSubmit}
              className="bg-green-50 border border-green-200 rounded-xl p-4 mb-3 space-y-3">
              <div
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-default ${dragOver ? 'border-green-500 bg-green-100' : 'border-green-300 bg-white'}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); onUploadFileChange(Array.from(e.dataTransfer.files)) }}>
                <svg className="w-6 h-6 text-gray-300 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <p className="text-xs text-gray-400 mb-2">Drag files here, or choose below</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <label className="cursor-pointer inline-flex items-center text-xs text-green-700 hover:text-green-900 font-medium border border-green-300 rounded px-3 py-1.5 bg-white transition">
                    Select Files
                    <input type="file" multiple className="sr-only"
                      onChange={e => onUploadFileChange(Array.from(e.target.files ?? []))} />
                  </label>
                  <label className="cursor-pointer inline-flex items-center text-xs text-green-700 hover:text-green-900 font-medium border border-green-300 rounded px-3 py-1.5 bg-white transition">
                    Upload Folder
                    <input
                      ref={ref => ref && ref.setAttribute('webkitdirectory', '')}
                      type="file" multiple className="sr-only"
                      onChange={e => onUploadFileChange(Array.from(e.target.files ?? []))} />
                  </label>
                </div>
              </div>

              {uploadFiles.length === 1 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
                  <input value={uploadTitle} onChange={e => onUploadTitleChange(e.target.value)} required autoFocus
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              )}

              {uploadFiles.length > 1 && (
                <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 max-h-40 overflow-y-auto space-y-1">
                  <p className="text-xs font-medium text-gray-700 mb-1.5">{uploadFiles.length} files selected — filenames used as titles</p>
                  {uploadFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <FileTypeBadge filename={f.name} />
                      <p className="text-xs text-gray-500 truncate">{f.webkitRelativePath || f.name}</p>
                    </div>
                  ))}
                </div>
              )}

              {uploadFiles.length === 0 && (
                <p className="text-xs text-gray-400 italic">No files selected yet.</p>
              )}

              {uploadError && <p className="text-red-500 text-xs">{uploadError}</p>}

              <div className="flex gap-2">
                <button type="submit" disabled={uploading || uploadFiles.length === 0}
                  className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition disabled:opacity-50">
                  {uploading ? 'Uploading…' : uploadFiles.length > 1 ? `Upload ${uploadFiles.length} files` : 'Upload'}
                </button>
                <button type="button" onClick={onUploadCancel}
                  className="text-sm text-gray-400 hover:text-gray-600 px-3 transition">
                  Cancel
                </button>
              </div>

              {uploading && (
                <div className="space-y-1">
                  {uploadTotal > 1 && (
                    <p className="text-xs text-gray-500">File {uploadCurrent} of {uploadTotal}</p>
                  )}
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-green-600 rounded-full transition-all duration-150"
                      style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <p className="text-xs text-gray-400 text-right">{uploadProgress}%</p>
                </div>
              )}
            </form>
          )}

          {/* Drag hint for empty folders (board only) */}
          {isBoard && showUploadFor !== folder.id && docs.length === 0 && children.length === 0 && (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-5 mb-3 text-center">
              <p className="text-xs text-gray-400">Empty folder — drop files here or use <span className="font-medium text-green-700">+ Upload</span></p>
            </div>
          )}

          {/* File list */}
          {docs.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100 mb-3">
              {docs.map((doc: DocFile) => (
                <FileRow key={doc.id} doc={doc} isBoard={isBoard} onDelete={onDelete} />
              ))}
            </div>
          )}

          {docs.length === 0 && children.length === 0 && !isBoard && (
            <p className="text-xs text-gray-400 italic mb-3">No files.</p>
          )}

          {/* Child folders */}
          {children.map(child => (
            <FolderNode key={child.id} folder={child} depth={depth + 1}
              isBoard={isBoard}
              showUploadFor={showUploadFor} uploadFolderId={uploadFolderId}
              uploadTitle={uploadTitle} uploadFiles={uploadFiles}
              uploading={uploading} uploadError={uploadError}
              uploadProgress={uploadProgress} uploadCurrent={uploadCurrent} uploadTotal={uploadTotal}
              onUploadOpen={onUploadOpen} onUploadCancel={onUploadCancel}
              onUploadTitleChange={onUploadTitleChange} onUploadFileChange={onUploadFileChange}
              onUploadSubmit={onUploadSubmit} onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Admin folder row ─────────────────────────────────────────────────────────
function AdminFolderRow({
  folder, depth, onEdit, onDelete,
}: {
  folder: DocFolder; depth: number
  onEdit: (f: DocFolder) => void
  onDelete: (id: string, name: string, docCount: number) => void
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3" style={{ paddingLeft: 16 + depth * 20 }}>
        <svg className="w-4 h-4 text-yellow-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800">{folder.name}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <FolderPermissionBadges roles={folder.roles} />
            <span className="text-xs text-gray-400">{folder.doc_count ?? 0} file{(folder.doc_count ?? 0) !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <button onClick={() => onEdit(folder)} className="text-xs text-blue-500 hover:text-blue-700 font-medium shrink-0 transition">Edit</button>
        <button onClick={() => onDelete(folder.id, folder.name, folder.doc_count ?? 0)}
          className="text-xs text-red-400 hover:text-red-600 shrink-0 transition">Delete</button>
      </div>
      {(folder.children ?? []).map(child => (
        <AdminFolderRow key={child.id} folder={child} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function Files() {
  const { isBoard } = useAuth()

  const [folders, setFolders] = useState<DocFolder[]>([])
  const [adminFolders, setAdminFolders] = useState<DocFolder[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const [showFolderForm, setShowFolderForm] = useState(false)
  const [folderForm, setFolderForm] = useState<FolderFormState>(emptyFolderForm())
  const [folderSaving, setFolderSaving] = useState(false)
  const [folderError, setFolderError] = useState('')
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)

  const [showUploadFor, setShowUploadFor] = useState<string | null>(null)
  const [uploadFolderId, setUploadFolderId] = useState('')
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadCurrent, setUploadCurrent] = useState(0)
  const [uploadTotal, setUploadTotal] = useState(0)

  const loadFolders = () => api.documents.list().then(d => setFolders(d))
  const loadAdminFolders = () => api.documents.folders.adminList().then(d => setAdminFolders(d))

  useEffect(() => {
    loadFolders()
    if (isBoard) loadAdminFolders()
  }, [isBoard])

  const flatFolders = flattenFolders(adminFolders).filter(f => f.id !== editingFolderId)
  const searchResults = searchQuery.trim() ? searchFiles(folders, searchQuery.trim()) : null

  // ── Folder CRUD ──────────────────────────────────────────────────────────────
  const openCreateFolder = () => {
    setEditingFolderId(null); setFolderForm(emptyFolderForm()); setFolderError(''); setShowFolderForm(true)
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
      const payload = {
        name: folderForm.name.trim(),
        sort_order: parseInt(folderForm.sortOrder) || 0,
        roles: folderForm.roles,
        parent_id: folderForm.parentId || null,
      }
      if (editingFolderId) {
        await api.documents.folders.update(editingFolderId, payload)
      } else {
        await api.documents.folders.create(payload)
      }
      setShowFolderForm(false); setEditingFolderId(null)
      await Promise.all([loadFolders(), loadAdminFolders()])
    } catch (e: any) { setFolderError(e.message || 'Save failed') }
    finally { setFolderSaving(false) }
  }

  const deleteFolder = async (id: string, name: string, docCount: number) => {
    const msg = docCount > 0
      ? `Delete "${name}"? Its ${docCount} file${docCount !== 1 ? 's' : ''} will become unfiled.`
      : `Delete folder "${name}"?`
    if (!confirm(msg)) return
    await api.documents.folders.delete(id)
    await Promise.all([loadFolders(), loadAdminFolders()])
  }

  const toggleRole = (role: string) =>
    setFolderForm(f => ({
      ...f, roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role]
    }))

  // ── Upload ───────────────────────────────────────────────────────────────────
  const handleUploadFileChange = (files: File[]) => {
    setUploadFiles(files)
    if (files.length === 1) setUploadTitle(files[0].name.replace(/\.[^.]+$/, ''))
    else setUploadTitle('')
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (uploadFiles.length === 0 || !uploadFolderId) return
    if (uploadFiles.length === 1 && !uploadTitle.trim()) { setUploadError('Title is required'); return }
    setUploading(true); setUploadError(''); setUploadProgress(0)
    setUploadCurrent(0); setUploadTotal(uploadFiles.length)
    try {
      if (uploadFiles.length === 1) {
        setUploadCurrent(1)
        await api.documents.upload(uploadTitle.trim(), uploadFolderId, uploadFiles[0], pct => setUploadProgress(pct))
      } else {
        for (let i = 0; i < uploadFiles.length; i++) {
          setUploadCurrent(i + 1)
          const file = uploadFiles[i]
          const title = file.name.replace(/\.[^.]+$/, '') || file.name
          await api.documents.upload(title, uploadFolderId, file, pct =>
            setUploadProgress(Math.round(((i + pct / 100) / uploadFiles.length) * 100))
          )
        }
      }
      setUploadTitle(''); setUploadFiles([]); setShowUploadFor(null); setUploadFolderId('')
      setUploadProgress(0); setUploadCurrent(0); setUploadTotal(0)
      await loadFolders()
    } catch (e: any) { setUploadError(e.message || 'Upload failed') }
    finally { setUploading(false) }
  }

  const handleDelete = async (docId: string) => {
    if (!confirm('Delete this file?')) return
    await api.documents.delete(docId)
    await loadFolders()
  }

  const openUpload = (folderId: string) => {
    setUploadFolderId(folderId); setShowUploadFor(folderId)
    setUploadTitle(''); setUploadFiles([]); setUploadError('')
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Files</h1>
        {isBoard && (
          <button onClick={openCreateFolder}
            className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
            + New Folder
          </button>
        )}
      </div>

      {/* Search bar */}
      {folders.length > 0 && (
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search files…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-9 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold">
              ✕
            </button>
          )}
        </div>
      )}

      {/* Search results */}
      {searchResults !== null && (
        searchResults.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">No files match "{searchQuery}".</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100">
            <p className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </p>
            {searchResults.map(({ doc, folderPath }) => (
              <div key={doc.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition group">
                <FileTypeBadge filename={doc.filename} />
                <div className="flex-1 min-w-0">
                  <a href={`/uploads/documents/${doc.filename}`} target="_blank" rel="noreferrer"
                    className="font-medium text-gray-800 hover:text-green-700 text-sm transition block truncate">
                    {doc.title}
                  </a>
                  <p className="text-xs text-gray-400 mt-0.5">{folderPath} · {new Date(doc.created_at).toLocaleDateString()}</p>
                </div>
                <a href={`/uploads/documents/${doc.filename}`} target="_blank" rel="noreferrer"
                  title="Open file"
                  className="shrink-0 p-1 text-gray-300 hover:text-green-600 transition opacity-0 group-hover:opacity-100 rounded">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
                {isBoard && (
                  <button onClick={() => handleDelete(doc.id)}
                    className="shrink-0 text-xs text-red-400 hover:text-red-600 transition opacity-0 group-hover:opacity-100 px-1">
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Folder form + tree (hidden while searching) */}
      {searchResults === null && (
        <>
          {/* Folder form */}
          {isBoard && showFolderForm && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
              <h2 className="font-semibold text-gray-700">{editingFolderId ? 'Edit Folder' : 'New Folder'}</h2>
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
                <select value={folderForm.parentId}
                  onChange={e => setFolderForm(f => ({ ...f, parentId: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="">— Top level —</option>
                  {flatFolders.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Who can see this folder?</label>
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input type="checkbox" checked={folderForm.roles.length === 0}
                    onChange={() => setFolderForm(f => ({ ...f, roles: [] }))}
                    className="w-4 h-4 accent-green-600" />
                  <span className="text-sm text-gray-700 font-medium">All members</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pl-1">
                  {ROLES.map(r => (
                    <label key={r.key} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={folderForm.roles.includes(r.key)}
                        onChange={() => toggleRole(r.key)} className="w-3.5 h-3.5 accent-green-600" />
                      <span className="text-xs text-gray-600">{r.label}</span>
                    </label>
                  ))}
                </div>
                {folderForm.roles.length > 0 && (
                  <p className="text-xs text-blue-600 mt-2">Only the selected roles (plus admin) will see this folder.</p>
                )}
              </div>

              {folderError && <p className="text-red-500 text-xs">{folderError}</p>}
              <div className="flex gap-2">
                <button onClick={saveFolder} disabled={folderSaving}
                  className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-5 py-2 rounded-lg transition disabled:opacity-50">
                  {folderSaving ? 'Saving…' : editingFolderId ? 'Save Changes' : 'Create Folder'}
                </button>
                <button onClick={() => { setShowFolderForm(false); setEditingFolderId(null) }}
                  className="text-sm text-gray-400 hover:text-gray-600 px-3 transition">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Admin folder management panel */}
          {isBoard && !showFolderForm && adminFolders.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100">
              <p className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Folders</p>
              {adminFolders.map(f => (
                <AdminFolderRow key={f.id} folder={f} depth={0} onEdit={openEditFolder} onDelete={deleteFolder} />
              ))}
            </div>
          )}

          {/* Folder tree */}
          {folders.length === 0 ? (
            <p className="text-gray-400 text-sm">No folders yet.</p>
          ) : (
            <div className="space-y-4">
              {folders.map(folder => (
                <FolderNode key={folder.id} folder={folder} depth={0}
                  isBoard={isBoard}
                  showUploadFor={showUploadFor} uploadFolderId={uploadFolderId}
                  uploadTitle={uploadTitle} uploadFiles={uploadFiles}
                  uploading={uploading} uploadError={uploadError}
                  uploadProgress={uploadProgress} uploadCurrent={uploadCurrent} uploadTotal={uploadTotal}
                  onUploadOpen={openUpload}
                  onUploadCancel={() => setShowUploadFor(null)}
                  onUploadTitleChange={setUploadTitle}
                  onUploadFileChange={handleUploadFileChange}
                  onUploadSubmit={handleUpload}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
