import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface Document { id: string; title: string; filename: string; original_name: string; category: string; created_at: string }

const CATEGORIES = ['general', 'bylaws', 'minutes', 'rules', 'forms']

export default function Documents() {
  const { isBoard } = useAuth()
  const [docs, setDocs] = useState<Document[]>([])
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('general')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const load = () => api.documents.list().then(d => setDocs(d as Document[]))
  useEffect(() => { load() }, [])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !title) return
    setUploading(true)
    try {
      await api.documents.upload(title, category, file)
      setTitle(''); setCategory('general'); setFile(null); setShowForm(false); load()
    } finally { setUploading(false) }
  }

  const grouped = CATEGORIES.reduce((acc, cat) => {
    const items = docs.filter(d => d.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {} as Record<string, Document[]>)

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Documents</h1>
        {isBoard && (
          <button onClick={() => setShowForm(s => !s)}
            className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition">
            {showForm ? 'Cancel' : '+ Upload Document'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleUpload} className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">File (PDF, DOC, etc.)</label>
              <input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} required
                className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-100 file:text-green-700 hover:file:bg-green-200" />
            </div>
          </div>
          <button type="submit" disabled={uploading}
            className="bg-green-700 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition disabled:opacity-50">
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </form>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100">
            {items.map(doc => (
              <div key={doc.id} className="flex justify-between items-center px-4 py-3">
                <div>
                  <a href={`/uploads/documents/${doc.filename}`} target="_blank" rel="noreferrer"
                    className="font-medium text-green-700 hover:underline text-sm">
                    📄 {doc.title}
                  </a>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(doc.created_at).toLocaleDateString()}</p>
                </div>
                {isBoard && (
                  <button onClick={async () => { await api.documents.delete(doc.id); load() }}
                    className="text-red-400 hover:text-red-600 text-xs">Delete</button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {docs.length === 0 && <p className="text-gray-400 text-sm">No documents yet.</p>}
    </div>
  )
}
