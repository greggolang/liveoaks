import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface Event {
  id: string; title: string; description?: string; start_time: string
  end_time?: string; event_type: string; location?: string
  signup_enabled?: boolean; signup_deadline?: string; max_players?: number
}

const TYPE_COLORS: Record<string, string> = {
  general: 'bg-blue-100 text-blue-700',
  usta: 'bg-purple-100 text-purple-700',
  social: 'bg-pink-100 text-pink-700',
  tournament: 'bg-orange-100 text-orange-700',
}

export default function Events() {
  const { isBoard } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', start_time: '', end_time: '', event_type: 'general', location: '' })
  const [error, setError] = useState('')

  const load = () => api.events.list().then(d => setEvents(d as Event[]))
  useEffect(() => { load() }, [])

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [f]: e.target.value }))

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    try {
      await api.events.create(form)
      setForm({ title: '', description: '', start_time: '', end_time: '', event_type: 'general', location: '' })
      setShowForm(false); load()
    } catch (err: any) { setError(err.message) }
  }

  const upcoming = events.filter(e => new Date(e.start_time) >= new Date())
  const past = events.filter(e => new Date(e.start_time) < new Date())

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Events</h1>
        {isBoard && (
          <button onClick={() => setShowForm(s => !s)}
            className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition">
            {showForm ? 'Cancel' : '+ New Event'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input value={form.title} onChange={set('title')} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
              <input type="datetime-local" value={form.start_time} onChange={set('start_time')} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End (optional)</label>
              <input type="datetime-local" value={form.end_time} onChange={set('end_time')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={form.event_type} onChange={set('event_type')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="general">General</option>
                <option value="usta">USTA Match</option>
                <option value="social">Social</option>
                <option value="tournament">Tournament</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input value={form.location} onChange={set('location')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={form.description} onChange={set('description')} rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" className="bg-green-700 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition">
            Create Event
          </button>
        </form>
      )}

      <EventList title="Upcoming" events={upcoming} isBoard={isBoard}
        onDelete={async id => { await api.events.delete(id); load() }}
        onToggleSignup={load} />
      {past.length > 0 && <EventList title="Past" events={past} isBoard={isBoard}
        onDelete={async id => { await api.events.delete(id); load() }}
        onToggleSignup={load} />}
    </div>
  )
}

function EventList({ title, events, isBoard, onDelete, onToggleSignup }: {
  title: string; events: Event[]; isBoard: boolean
  onDelete: (id: string) => void; onToggleSignup: () => void
}) {
  if (events.length === 0) return null

  const toggleSignup = async (ev: Event) => {
    await api.signups.toggleSignup(ev.id, { signup_enabled: !ev.signup_enabled })
    onToggleSignup()
  }

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-gray-700 mb-3">{title}</h2>
      <div className="space-y-3">
        {events.map(ev => (
          <div key={ev.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[ev.event_type] ?? 'bg-gray-100 text-gray-700'}`}>
                    {ev.event_type.toUpperCase()}
                  </span>
                  {ev.signup_enabled && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✏️ Sign-Up Open</span>
                  )}
                </div>
                <h3 className="font-semibold text-gray-800">{ev.title}</h3>
                <p className="text-sm text-green-700 mt-0.5">
                  {new Date(ev.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {ev.end_time && ` – ${new Date(ev.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                </p>
                {ev.location && <p className="text-xs text-gray-400 mt-0.5">📍 {ev.location}</p>}
                {ev.description && <p className="text-sm text-gray-600 mt-2">{ev.description}</p>}
              </div>
              <div className="flex flex-col items-end gap-2 ml-4 shrink-0">
                {isBoard && (
                  <>
                    <button onClick={() => toggleSignup(ev)}
                      className={`text-xs px-2 py-1 rounded-lg font-medium transition ${ev.signup_enabled ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                      {ev.signup_enabled ? 'Close Sign-Up' : 'Open Sign-Up'}
                    </button>
                    {ev.signup_enabled && (
                      <Link to={`/admin/events/${ev.id}/signups`}
                        className="text-xs text-blue-600 hover:underline font-medium">View Sign-Ups →</Link>
                    )}
                    <button onClick={() => onDelete(ev.id)} className="text-red-400 hover:text-red-600 text-xs">Delete</button>
                  </>
                )}
              </div>
            </div>
            {ev.signup_enabled && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3">
                <Link to={`/events/${ev.id}/signup`}
                  className="bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-green-800 transition">
                  Sign Up for This Event
                </Link>
                {ev.signup_deadline && (
                  <span className="text-xs text-orange-600">
                    Deadline: {new Date(ev.signup_deadline).toLocaleDateString()}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
