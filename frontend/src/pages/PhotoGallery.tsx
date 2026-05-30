import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface Photo { id: string; title: string; filename: string; description?: string; created_at: string }

export default function PhotoGallery() {
  const { isBoard } = useAuth()
  const [photos, setPhotos] = useState<Photo[]>([])
  const [selected, setSelected] = useState<Photo | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const load = () => api.photos.list().then(d => setPhotos(d as Photo[]))
  useEffect(() => { load() }, [])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !title) return
    setUploading(true)
    try {
      await api.photos.upload(title, description, file)
      setTitle(''); setDescription(''); setFile(null); setShowForm(false); load()
    } finally { setUploading(false) }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Photo Gallery</h1>
        {isBoard && (
          <button onClick={() => setShowForm(s => !s)}
            className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition">
            {showForm ? 'Cancel' : '+ Upload Photo'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleUpload} className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Photo</label>
            <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} required
              className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-100 file:text-green-700 hover:file:bg-green-200" />
          </div>
          <button type="submit" disabled={uploading}
            className="bg-green-700 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition disabled:opacity-50">
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </form>
      )}

      {photos.length === 0 ? (
        <p className="text-gray-400 text-sm">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map(p => (
            <div key={p.id} className="group relative cursor-pointer" onClick={() => setSelected(p)}>
              <img src={`/uploads/photos/${p.filename}`} alt={p.title}
                className="w-full h-40 object-cover rounded-xl border border-gray-200 shadow-sm group-hover:opacity-90 transition" />
              <div className="mt-1 text-xs text-gray-600 font-medium truncate">{p.title}</div>
              {isBoard && (
                <button onClick={async e => { e.stopPropagation(); await api.photos.delete(p.id); load() }}
                  className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition">
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <img src={`/uploads/photos/${selected.filename}`} alt={selected.title} className="w-full rounded-xl shadow-2xl" />
            <div className="text-white text-center mt-3">
              <div className="font-semibold">{selected.title}</div>
              {selected.description && <div className="text-sm text-gray-300">{selected.description}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
