import { useEffect, useState } from 'react'
import { api } from '../api/client'

interface GuestPass { id: string; guest_name: string; guest_email?: string; visit_date: string; notes?: string; fee: number; source: string }
interface Court { id: number; name: string; number: number }

export default function GuestPasses() {
  const [guests, setGuests] = useState<GuestPass[]>([])
  const [courts, setCourts] = useState<Court[]>([])
  const [form, setForm] = useState({ guest_name: '', guest_email: '', court_id: '', visit_date: new Date().toISOString().split('T')[0], notes: '' })
  const [showForm, setShowForm] = useState(false)

  const load = () => api.guests.myGuests().then(d => setGuests(d as GuestPass[]))
  useEffect(() => {
    load()
    api.courts.list().then(d => setCourts(d as Court[]))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await api.guests.log({ ...form, court_id: form.court_id ? parseInt(form.court_id) : null })
    setForm({ guest_name: '', guest_email: '', court_id: '', visit_date: new Date().toISOString().split('T')[0], notes: '' })
    setShowForm(false); load()
  }

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [f]: e.target.value }))

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Guest Passes</h1>
        <button onClick={() => setShowForm(s => !s)}
          className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition">
          {showForm ? 'Cancel' : '+ Log Guest'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Guest Name</label>
              <input value={form.guest_name} onChange={set('guest_name')} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Guest Email</label>
              <input type="email" value={form.guest_email} onChange={set('guest_email')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Court</label>
              <select value={form.court_id} onChange={set('court_id')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">Any court</option>
                {courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" value={form.visit_date} onChange={set('visit_date')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
          <button type="submit" className="bg-green-700 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition">
            Log Guest
          </button>
        </form>
      )}

      {guests.length === 0 ? (
        <p className="text-gray-400 text-sm">No guests logged yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Guest</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Fee</th>
                <th className="px-4 py-3 text-left">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {guests.map(g => (
                <tr key={g.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{g.guest_name}</div>
                    {g.guest_email && <div className="text-xs text-gray-400">{g.guest_email}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(g.visit_date).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {g.fee > 0
                      ? <span className="text-xs font-semibold text-orange-700">${g.fee.toFixed(2)}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{g.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}
