import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api/client'

interface Booking {
  id: string; court_id: number; start_time: string; end_time: string
  user: { first_name: string; last_name: string }
  court: { name: string; number: number }
}
interface Court { id: number; name: string; number: number; has_ball_machine?: boolean }
type SubmitState = 'idle' | 'sending' | 'done' | 'error'

interface Announcement {
  id: string; title: string; body: string; created_at: string
  author: { first_name: string; last_name: string }
}

const HOURS = Array.from({ length: 10 }, (_, i) => i + 8) // 8am–5pm (last slot ends by 6pm)

export default function Dashboard() {
  const { user } = useAuth()
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [idea, setIdea] = useState('')
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [courts, setCourts] = useState<Court[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  useEffect(() => {
    api.courts.list().then(d => setCourts(d as Court[]))
    api.announcements.list().then(d => setAnnouncements((d as Announcement[]).slice(0, 3)))
  }, [])

  useEffect(() => {
    api.bookings.list(date).then(d => setBookings(d as Booking[]))
  }, [date])

  const getBooking = (courtId: number, hour: number) =>
    bookings.find(b => {
      const start = new Date(b.start_time).getHours()
      const end = new Date(b.end_time).getHours()
      return b.court_id === courtId && hour >= start && hour < end
    })

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">
          Welcome back, {user?.first_name}!
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">Here's today's court availability.</p>
      </div>

      {/* Court availability */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-700">Court Availability</h2>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <Link
              to="/bookings"
              className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition"
            >
              Book a Court
            </Link>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-gray-500 text-xs font-medium w-20">Time</th>
                {courts.map(c => (
                  <th key={c.id} className="px-4 py-3 text-center text-gray-700 font-semibold">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HOURS.map(hour => (
                <tr key={hour} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2 text-gray-400 text-xs font-medium whitespace-nowrap">
                    {hour % 12 || 12}{hour < 12 ? 'am' : 'pm'}
                  </td>
                  {courts.map(c => {
                    const b = getBooking(c.id, hour)
                    return (
                      <td key={c.id} className="px-2 py-1 text-center">
                        {b ? (
                          <div className="bg-green-100 border border-green-300 rounded px-2 py-1 text-xs text-green-800 font-medium">
                            {b.user.first_name} {b.user.last_name[0]}.
                          </div>
                        ) : c.has_ball_machine ? (
                          <div className="text-lg leading-none">🤖</div>
                        ) : (
                          <div className="text-gray-200 text-xs">—</div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-2 flex gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-green-100 border border-green-300 rounded" /> Booked
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-white border border-gray-200 rounded" /> Available
          </span>
        </div>
      </div>

      {/* Site feedback */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-700 mb-1">Got an idea for the site?</h2>
        <p className="text-xs text-gray-400 mb-3">Suggestions go straight to the admin team.</p>
        {submitState === 'done' ? (
          <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
            <span>✓</span> Thanks — your idea was sent!
            <button onClick={() => { setSubmitState('idle'); setIdea('') }}
              className="ml-2 text-xs text-gray-400 hover:text-gray-600">Submit another</button>
          </div>
        ) : (
          <form onSubmit={async e => {
            e.preventDefault()
            if (!idea.trim()) return
            setSubmitState('sending')
            try {
              await api.feedback.submit(idea.trim())
              setSubmitState('done')
            } catch {
              setSubmitState('error')
            }
          }} className="flex gap-2 items-start">
            <textarea
              value={idea}
              onChange={e => { setIdea(e.target.value); if (submitState === 'error') setSubmitState('idle') }}
              placeholder="Describe your idea or request…"
              maxLength={1000}
              rows={2}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button type="submit" disabled={submitState === 'sending' || !idea.trim()}
              className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50 shrink-0">
              {submitState === 'sending' ? 'Sending…' : 'Send'}
            </button>
          </form>
        )}
        {submitState === 'error' && (
          <p className="text-red-500 text-xs mt-1">Something went wrong — please try again.</p>
        )}
      </div>

      {/* Latest announcements */}
      {announcements.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Latest News</h2>
          <div className="space-y-3">
            {announcements.map(a => (
              <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold text-gray-800">{a.title}</h3>
                <p className="text-gray-600 text-sm mt-1 line-clamp-2">{a.body}</p>
                <p className="text-gray-400 text-xs mt-2">
                  {a.author.first_name} {a.author.last_name} · {new Date(a.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
