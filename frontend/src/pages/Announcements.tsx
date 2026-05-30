import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface Announcement {
  id: string; title: string; body: string; created_at: string
  author: { first_name: string; last_name: string }
}

export default function Announcements() {
  const { isBoard } = useAuth()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [form, setForm] = useState({ title: '', body: '', send_email: false })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const load = () => api.announcements.list().then(d => setAnnouncements(d as Announcement[]))
  useEffect(() => { load() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.announcements.create(form)
      setForm({ title: '', body: '', send_email: false })
      setShowForm(false)
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this announcement?')) return
    await api.announcements.delete(id)
    load()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Announcements</h1>
        {isBoard && (
          <button onClick={() => setShowForm(s => !s)}
            className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition">
            {showForm ? 'Cancel' : '+ New Announcement'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} required rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <input type="checkbox" id="send_email" checked={form.send_email}
              onChange={e => setForm(f => ({ ...f, send_email: e.target.checked }))}
              className="w-4 h-4 mt-0.5 text-green-600 rounded cursor-pointer" />
            <label htmlFor="send_email" className="cursor-pointer">
              <div className="text-sm font-medium text-blue-800">📧 Email to all active members</div>
              <div className="text-xs text-blue-600 mt-0.5">
                If unchecked, the announcement will only appear on the dashboard.
              </div>
            </label>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="bg-green-700 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition disabled:opacity-50">
            {loading ? 'Posting...' : form.send_email ? 'Post & Email Members' : 'Post Announcement'}
          </button>
        </form>
      )}

      {announcements.length === 0 ? (
        <p className="text-gray-400 text-sm">No announcements yet.</p>
      ) : (
        <div className="space-y-4">
          {announcements.map(a => (
            <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex justify-between items-start">
                <h2 className="font-semibold text-gray-800 text-lg">{a.title}</h2>
                {isBoard && (
                  <button onClick={() => handleDelete(a.id)}
                    className="text-red-400 hover:text-red-600 text-xs font-medium ml-4">
                    Delete
                  </button>
                )}
              </div>
              <p className="text-gray-600 text-sm mt-2 whitespace-pre-wrap">{a.body}</p>
              <p className="text-gray-400 text-xs mt-3">
                {a.author.first_name} {a.author.last_name} · {new Date(a.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
