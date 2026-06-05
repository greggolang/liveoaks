import { useEffect, useState } from 'react'
import { api, PhotoFolder, PhotoFile } from '../api/client'
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

function PermBadges({ roles }: { roles: string[] }) {
  if (roles.length === 0) return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">All members</span>
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map(r => (
        <span key={r} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
          {ROLES.find(x => x.key === r)?.label ?? r}
        </span>
      ))}
    </div>
  )
}

interface FolderFormState { name: string; sortOrder: string; roles: string[] }
const emptyForm = (): FolderFormState => ({ name: '', sortOrder: '0', roles: [] })

export default function PhotoGallery() {
  const { isBoard } = useAuth()

  const [folders, setFolders] = useState<PhotoFolder[]>([])
  const [adminFolders, setAdminFolders] = useState<PhotoFolder[]>([])
  const [selected, setSelected] = useState<PhotoFile | null>(null)

  // Folder management
  const [showFolderForm, setShowFolderForm] = useState(false)
  const [folderForm, setFolderForm] = useState<FolderFormState>(emptyForm())
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [folderSaving, setFolderSaving] = useState(false)
  const [folderError, setFolderError] = useState('')

  // Upload
  const [showUploadFor, setShowUploadFor] = useState<string | null>(null)
  const [uploadFolderId, setUploadFolderId] = useState('')
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadDesc, setUploadDesc] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const loadFolders = () => api.photos.list().then(d => setFolders(d))
  const loadAdminFolders = () => api.photos.folders.adminList().then(d => setAdminFolders(d))

  useEffect(() => {
    loadFolders()
    if (isBoard) loadAdminFolders()
  }, [isBoard])

  // ── Folder CRUD ───────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingFolderId(null); setFolderForm(emptyForm()); setFolderError(''); setShowFolderForm(true)
  }

  const openEdit = (f: PhotoFolder) => {
    setEditingFolderId(f.id)
    setFolderForm({ name: f.name, sortOrder: String(f.sort_order), roles: [...f.roles] })
    setFolderError(''); setShowFolderForm(true)
  }

  const saveFolder = async () => {
    if (!folderForm.name.trim()) { setFolderError('Name is required'); return }
    setFolderSaving(true); setFolderError('')
    try {
      const payload = { name: folderForm.name.trim(), sort_order: parseInt(folderForm.sortOrder) || 0, roles: folderForm.roles }
      if (editingFolderId) await api.photos.folders.update(editingFolderId, payload)
      else await api.photos.folders.create(payload)
      setShowFolderForm(false); setEditingFolderId(null)
      await Promise.all([loadFolders(), loadAdminFolders()])
    } catch (e: any) { setFolderError(e.message || 'Save failed') }
    finally { setFolderSaving(false) }
  }

  const deleteFolder = async (id: string, name: string, count: number) => {
    const msg = count > 0
      ? `Delete "${name}"? Its ${count} photo${count !== 1 ? 's' : ''} will become unfiled.`
      : `Delete folder "${name}"?`
    if (!confirm(msg)) return
    await api.photos.folders.delete(id)
    await Promise.all([loadFolders(), loadAdminFolders()])
  }

  const toggleRole = (role: string) =>
    setFolderForm(f => ({
      ...f, roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role]
    }))

  // ── Upload ────────────────────────────────────────────────────────────────

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile || !uploadTitle.trim() || !uploadFolderId) return
    setUploading(true); setUploadError('')
    try {
      await api.photos.upload(uploadTitle.trim(), uploadDesc, uploadFolderId, uploadFile)
      setUploadTitle(''); setUploadDesc(''); setUploadFile(null); setShowUploadFor(null)
      await loadFolders()
    } catch (e: any) { setUploadError(e.message || 'Upload failed') }
    finally { setUploading(false) }
  }

  const handleDelete = async (photoId: string) => {
    if (!confirm('Delete this photo?')) return
    await api.photos.delete(photoId)
    await loadFolders()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Images</h1>
        {isBoard && (
          <button onClick={openCreate}
            className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
            + New Folder
          </button>
        )}
      </div>

      {/* Folder form */}
      {isBoard && showFolderForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-700">{editingFolderId ? 'Edit Folder' : 'New Folder'}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Folder Name *</label>
              <input value={folderForm.name} onChange={e => setFolderForm(f => ({ ...f, name: e.target.value }))}
                autoFocus placeholder="e.g. Club Events"
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

      {/* Board: folder management list */}
      {isBoard && !showFolderForm && adminFolders.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100">
          <p className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Folders</p>
          {adminFolders.map(f => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-3">
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{f.name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <PermBadges roles={f.roles} />
                  <span className="text-xs text-gray-400">{f.photo_count ?? 0} photo{(f.photo_count ?? 0) !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <button onClick={() => openEdit(f)} className="text-xs text-blue-500 hover:text-blue-700 font-medium shrink-0 transition">Edit</button>
              <button onClick={() => deleteFolder(f.id, f.name, f.photo_count ?? 0)} className="text-xs text-red-400 hover:text-red-600 shrink-0 transition">Delete</button>
            </div>
          ))}
        </div>
      )}

      {/* Photo folders */}
      {folders.length === 0 ? (
        <p className="text-gray-400 text-sm">No folders yet.</p>
      ) : folders.map(folder => (
        <div key={folder.id} className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h2 className="text-sm font-semibold text-gray-700">{folder.name}</h2>
              {isBoard && <PermBadges roles={folder.roles} />}
            </div>
            {isBoard && (
              <button onClick={() => { setUploadFolderId(folder.id); setShowUploadFor(folder.id); setUploadTitle(''); setUploadDesc(''); setUploadFile(null); setUploadError('') }}
                className="text-xs text-green-700 hover:text-green-900 font-medium transition">
                + Upload Photo
              </button>
            )}
          </div>

          {/* Upload form */}
          {isBoard && showUploadFor === folder.id && (
            <form onSubmit={handleUpload}
              className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
                  <input value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} required autoFocus
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Caption</label>
                  <input value={uploadDesc} onChange={e => setUploadDesc(e.target.value)}
                    placeholder="Optional description"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Photo *</label>
                  <input type="file" accept="image/*" required onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
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

          {/* Photo grid */}
          {(folder.photos ?? []).length === 0 ? (
            <p className="text-xs text-gray-400 italic">No photos in this folder.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {(folder.photos ?? []).map((p: PhotoFile) => (
                <div key={p.id} className="group relative cursor-pointer" onClick={() => setSelected(p)}>
                  <img src={`/uploads/photos/${p.filename}`} alt={p.title}
                    className="w-full h-40 object-cover rounded-xl border border-gray-200 shadow-sm group-hover:opacity-90 transition" />
                  <div className="mt-1 text-xs text-gray-600 font-medium truncate">{p.title}</div>
                  {isBoard && (
                    <button
                      onClick={async e => { e.stopPropagation(); await handleDelete(p.id) }}
                      className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition">
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Lightbox */}
      {selected && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelected(null)}>
          <div className="max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <img src={`/uploads/photos/${selected.filename}`} alt={selected.title}
              className="w-full rounded-xl shadow-2xl max-h-[80vh] object-contain" />
            <div className="text-white text-center mt-3">
              <div className="font-semibold">{selected.title}</div>
              {selected.description && <div className="text-sm text-gray-300 mt-0.5">{selected.description}</div>}
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white text-sm mt-2 transition">✕ Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
