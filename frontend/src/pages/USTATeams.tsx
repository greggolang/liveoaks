import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface Team { id: string; name: string; level: string; gender: string; description?: string; members: string[] }

const GENDER_LABEL: Record<string, string> = { women: "Women's", men: "Men's", mixed: "Mixed" }

export default function USTATeams() {
  const { isAdmin } = useAuth()
  const [teams, setTeams] = useState<Team[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', level: '3.5', gender: 'women', description: '' })

  const load = () => api.usta.list().then(d => setTeams(d as Team[]))
  useEffect(() => { load() }, [])

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [f]: e.target.value }))

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await api.usta.create(form)
    setForm({ name: '', level: '3.5', gender: 'women', description: '' })
    setShowForm(false); load()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">USTA Teams</h1>
        {isAdmin && (
          <button onClick={() => setShowForm(s => !s)}
            className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition">
            {showForm ? 'Cancel' : '+ New Team'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Team Name</label>
              <input value={form.name} onChange={set('name')} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Level (NTRP)</label>
              <select value={form.level} onChange={set('level')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                {['2.5','3.0','3.5','4.0','4.5','5.0'].map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
              <select value={form.gender} onChange={set('gender')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="women">Women's</option>
                <option value="men">Men's</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
            <div className="col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={form.description} onChange={set('description')} rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
          <button type="submit" className="bg-green-700 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition">
            Create Team
          </button>
        </form>
      )}

      {teams.length === 0 ? (
        <p className="text-gray-400 text-sm">No USTA teams yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {teams.map(t => (
            <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-gray-800">{t.name}</h3>
                  <p className="text-sm text-green-700">{GENDER_LABEL[t.gender]} · NTRP {t.level}</p>
                </div>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  {t.members.length} player{t.members.length !== 1 ? 's' : ''}
                </span>
              </div>
              {t.description && <p className="text-sm text-gray-500 mt-2">{t.description}</p>}
              {t.members.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {t.members.map(m => (
                    <span key={m} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{m}</span>
                  ))}
                </div>
              )}
              {isAdmin && (
                <button onClick={async () => { await api.usta.delete(t.id); load() }}
                  className="text-red-400 hover:text-red-600 text-xs mt-3 block">Delete</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
