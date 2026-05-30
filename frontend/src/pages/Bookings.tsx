import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface Court { id: number; name: string; number: number }
interface Booking {
  id: string; user_id: string; court_id: number; start_time: string; end_time: string
  notes?: string; user: { first_name: string; last_name: string }; court: { name: string; number: number }
}

export default function Bookings() {
  const { user, isBoard } = useAuth()
  const [courts, setCourts] = useState<Court[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [form, setForm] = useState({ court_id: 1, start_time: '', end_time: '', notes: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = () => {
    api.courts.list().then(d => setCourts(d as Court[]))
    api.bookings.list(date).then(d => setBookings(d as Booking[]))
  }

  useEffect(() => { load() }, [date])

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.bookings.create({
        court_id: form.court_id,
        start_time: new Date(`${date}T${form.start_time}`).toISOString(),
        end_time: new Date(`${date}T${form.end_time}`).toISOString(),
        notes: form.notes,
      })
      setForm(f => ({ ...f, start_time: '', end_time: '', notes: '' }))
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this booking?')) return
    await api.bookings.delete(id)
    load()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Court Bookings</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-4 mb-4">
            <label className="text-sm font-medium text-gray-700">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>

          {bookings.length === 0 ? (
            <p className="text-gray-400 text-sm">No bookings for this date.</p>
          ) : (
            <div className="space-y-3">
              {bookings.map(b => (
                <div key={b.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex justify-between items-start">
                  <div>
                    <div className="font-semibold text-gray-800">Court {b.court.number}</div>
                    <div className="text-sm text-gray-600 mt-0.5">
                      {new Date(b.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                      {new Date(b.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {b.user.first_name} {b.user.last_name}
                      {b.notes && ` · ${b.notes}`}
                    </div>
                  </div>
                  {(b.user_id === user?.id || isBoard) && (
                    <button onClick={() => handleCancel(b.id)}
                      className="text-red-500 hover:text-red-700 text-xs font-medium">
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm h-fit">
          <h2 className="font-semibold text-gray-800 mb-4">New Booking</h2>
          <form onSubmit={handleBook} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Court</label>
              <select value={form.court_id} onChange={e => setForm(f => ({ ...f, court_id: +e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                {courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            {error && <p className="text-red-600 text-xs">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-green-700 hover:bg-green-800 text-white font-semibold py-2 rounded-lg text-sm transition disabled:opacity-50">
              {loading ? 'Booking...' : 'Book Court'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
