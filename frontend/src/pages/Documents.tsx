import { useEffect, useState } from 'react'
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

interface FolderFormState { name: string; sortOrder: string; roles: string[] }
const emptyFolderForm = (): FolderFormState => ({ name: '', sortOrder: '0', roles: [] })

export default function Documents() {
  const { isBoard } = useAuth()

  // Member view: folders + docs
  const [folders, setFolders] = useState<DocFolder[]>([])

  // Board admin view: folder management
  const [adminFolders, setAdminFolders] = useState<DocFolder[]>([])
  const [showFolderForm, setShowFolderForm] = useState(false)
  const [folderForm, setFolderForm] = useState<FolderFormState>(emptyFolderForm())
  const [folderSaving, setFolderSaving] = useState(false)
  const [folderError, setFolderError] = useState('')
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)

  // Upload
  const [uploadFolderId, setUploadFolderId] = useState('')
  const [showUploadFor, setShowUploadFor] = useState<string | null>(null)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const loadFolders = () => api.documents.list().then(d => setFolders(d))
  const loadAdminFolders = () => api.documents.folders.adminList().then(d => setAdminFolders(d))

  useEffect(() => {
    loadFolders()
    if (isBoard) loadAdminFolders()
  }, [isBoard])

  // ── Folder CRUD ───────────────────────────────────────────────────────────

  const openCreateFolder = () => {
    setEditingFolderId(null)
    setFolderForm(emptyFolderForm())
    setFolderError('')
    setShowFolderForm(true)
  }

  const openEditFolder = (f: DocFolder) => {
    setEditingFolderId(f.id)
    setFolderForm({ name: f.name, sortOrder: String(f.sort_order), roles: [...f.roles] })
    setFolderError('')
    setShowFolderForm(true)
  }

  const saveFolder = async () => {
    if (!folderForm.name.trim()) { setFolderError('Name is required'); return }
    setFolderSaving(true); setFolderError('')
    try {
      const payload = { name: folderForm.name.trim(), sort_order: parseInt(folderForm.sortOrder) || 0, roles: folderForm.roles }
      if (editingFolderId) {
        await api.documents.folders.update(editingFolderId, payload)
      } else {
        await api.documents.folders.create(payload)
      }
      setShowFolderForm(false)
      setEditingFolderId(null)
      await Promise.all([loadFolders(), loadAdminFolders()])
    } catch (e: any) { setFolderError(e.message || 'Save failed') }
    finally { setFolderSaving(false) }
  }

  const deleteFolder = async (id: string, name: string, docCount: number) => {
    const msg = docCount > 0
      ? `Delete "${name}"? Its ${docCount} document${docCount !== 1 ? 's' : ''} will become unfiled.`
      : `Delete folder "${name}"?`
    if (!confirm(msg)) return
    await api.documents.folders.delete(id)
    await Promise.all([loadFolders(), loadAdminFolders()])
  }

  const toggleRole = (role: string) =>
    setFolderForm(f => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role]
    }))

  // ── Document upload ───────────────────────────────────────────────────────

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile || !uploadTitle.trim() || !uploadFolderId) return
    setUploading(true); setUploadError('')
    try {
      await api.documents.upload(uploadTitle.trim(), uploadFolderId, uploadFile)
      setUploadTitle(''); setUploadFile(null); setShowUploadFor(null); setUploadFolderId('')
      await loadFolders()
    } catch (e: any) { setUploadError(e.message || 'Upload failed') }
    finally { setUploading(false) }
  }

  const handleDelete = async (docId: string) => {
    if (!confirm('Delete this document?')) return
    await api.documents.delete(docId)
    await loadFolders()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Files</h1>
        {isBoard && (
          <button onClick={openCreateFolder}
            className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
            + New Folder
          </button>
        )}
      </div>

      {/* ── Folder form (create / edit) ── */}
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
            <label className="block text-xs font-medium text-gray-600 mb-2">
              Who can see this folder?
            </label>
            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input type="checkbox"
                checked={folderForm.roles.length === 0}
                onChange={() => setFolderForm(f => ({ ...f, roles: [] }))}
                className="w-4 h-4 accent-green-600" />
              <span className="text-sm text-gray-700 font-medium">All members</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pl-1">
              {ROLES.map(r => (
                <label key={r.key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox"
                    checked={folderForm.roles.includes(r.key)}
                    onChange={() => toggleRole(r.key)}
                    className="w-3.5 h-3.5 accent-green-600" />
                  <span className="text-xs text-gray-600">{r.label}</span>
                </label>
              ))}
            </div>
            {folderForm.roles.length > 0 && (
              <p className="text-xs text-blue-600 mt-2">
                Only the selected roles (plus admin) will see this folder.
              </p>
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

      {/* ── Board: folder list with management ── */}
      {isBoard && !showFolderForm && adminFolders.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100">
          <p className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Folders</p>
          {adminFolders.map(f => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-3">
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{f.name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <FolderPermissionBadges roles={f.roles} />
                  <span className="text-xs text-gray-400">{f.doc_count ?? 0} doc{(f.doc_count ?? 0) !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <button onClick={() => openEditFolder(f)}
                className="text-xs text-blue-500 hover:text-blue-700 font-medium shrink-0 transition">
                Edit
              </button>
              <button onClick={() => deleteFolder(f.id, f.name, f.doc_count ?? 0)}
                className="text-xs text-red-400 hover:text-red-600 shrink-0 transition">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Document folders ── */}
      {folders.length === 0 ? (
        <p className="text-gray-400 text-sm">No folders yet.</p>
      ) : (
        folders.map(folder => (
          <div key={folder.id}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
                <h2 className="text-sm font-semibold text-gray-700">{folder.name}</h2>
                {isBoard && <FolderPermissionBadges roles={folder.roles} />}
              </div>
              {isBoard && (
                <button
                  onClick={() => {
                    setUploadFolderId(folder.id)
                    setShowUploadFor(folder.id)
                    setUploadTitle('')
                    setUploadFile(null)
                    setUploadError('')
                  }}
                  className="text-xs text-green-700 hover:text-green-900 font-medium transition">
                  + Upload
                </button>
              )}
            </div>

            {/* Upload form for this folder */}
            {isBoard && showUploadFor === folder.id && (
              <form onSubmit={handleUpload}
                className="bg-green-50 border border-green-200 rounded-xl p-4 mb-3 space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
                    <input value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} required autoFocus
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">File *</label>
                    <input type="file" required onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                      className="w-full text-sm text-gray-500 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-green-100 file:text-green-700 hover:file:bg-green-200" />
                  </div>
                </div>
                {uploadError && <p className="text-red-500 text-xs">{uploadError}</p>}
                <div className="flex gap-2">
                  <button type="submit" disabled={uploading}
                    className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition disabled:opacity-50">
                    {uploading ? 'Uploading…' : 'Upload'}
                  </button>
                  <button type="button" onClick={() => setShowUploadFor(null)}
                    className="text-sm text-gray-400 hover:text-gray-600 px-3 transition">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* Documents in this folder */}
            {(folder.docs ?? []).length === 0 ? (
              <p className="text-xs text-gray-400 italic pl-1 mb-4">No documents in this folder.</p>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100 mb-4">
                {(folder.docs ?? []).map((doc: DocFile) => (
                  <div key={doc.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <a href={`/uploads/documents/${doc.filename}`} target="_blank" rel="noreferrer"
                        className="font-medium text-green-700 hover:underline text-sm">
                        📄 {doc.title}
                      </a>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(doc.created_at).toLocaleDateString()}</p>
                    </div>
                    {isBoard && (
                      <button onClick={() => handleDelete(doc.id)}
                        className="text-red-400 hover:text-red-600 text-xs transition">
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
