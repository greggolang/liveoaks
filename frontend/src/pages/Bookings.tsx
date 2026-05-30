import { useEffect, useState, useCallback } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface Court { id: number; name: string; number: number; has_ball_machine?: boolean }
interface Booking {
  id: string; user_id: string; court_id: number
  start_time: string; end_time: string; notes?: string
  user: { first_name: string; last_name: string }
  court: { name: string; number: number }
}
interface Selected { courtId: number; hour: number; courtName: string }

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7) // 7am–8pm
const DURATIONS = [{ label: '1 hr', hours: 1 }, { label: '1½ hr', hours: 1.5 }, { label: '2 hr', hours: 2 }]

function fmt12(hour: number) {
  const h = hour % 12 || 12
  return `${h}:00 ${hour < 12 ? 'AM' : 'PM'}`
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  })
}

export default function Bookings() {
  const { user, isBoard } = useAuth()
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [courts, setCourts] = useState<Court[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [selected, setSelected] = useState<Selected | null>(null)
  const [duration, setDuration] = useState(1)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'grid' | 'mine'>('grid')
  const [myBookings, setMyBookings] = useState<Booking[]>([])

  const load = useCallback(() => {
    api.bookings.list(date).then(d => setBookings(d as Booking[]))
  }, [date])

  const loadMine = () => {
    api.bookings.list().then(d =>
      setMyBookings((d as Booking[]).filter(b =>
        b.user_id === user?.id && new Date(b.start_time) >= new Date()
      ))
    )
  }

  useEffect(() => {
    api.courts.list().then(d => setCourts(d as Court[]))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (tab === 'mine') loadMine() }, [tab])

  const getBooking = (courtId: number, hour: number): Booking | null => {
    return bookings.find(b => {
      if (b.court_id !== courtId) return false
      const start = new Date(b.start_time)
      const end = new Date(b.end_time)
      const slotStart = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`)
      const slotEnd = new Date(`${date}T${String(hour + 1).padStart(2, '0')}:00:00`)
      return start < slotEnd && end > slotStart
    }) ?? null
  }

  const isFirstHour = (b: Booking, hour: number): boolean => {
    return new Date(b.start_time).getHours() === hour
  }

  const handleSlotClick = (courtId: number, hour: number, courtName: string) => {
    const booking = getBooking(courtId, hour)
    if (booking) return
    setSelected({ courtId, hour, courtName })
    setDuration(1)
    setNotes('')
    setError('')
  }

  const handleBook = async () => {
    if (!selected) return
    setLoading(true)
    setError('')
    try {
      const start = new Date(`${date}T${String(selected.hour).padStart(2, '0')}:00:00`)
      const end = new Date(start.getTime() + duration * 60 * 60 * 1000)
      await api.bookings.create({
        court_id: selected.courtId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        notes,
      })
      setSelected(null)
      load()
      loadMine()
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
    loadMine()
  }

  const isPast = (hour: number) => {
    const slotTime = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`)
    return slotTime < new Date()
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Court Bookings</h1>
        <div className="flex gap-2">
          <button onClick={() => setTab('grid')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'grid' ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Book a Court
          </button>
          <button onClick={() => setTab('mine')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'mine' ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            My Bookings
          </button>
        </div>
      </div>

      {tab === 'grid' && (
        <>
          {/* Date navigation */}
          <div className="flex items-center justify-between mb-4 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
            <button onClick={() => setDate(d => addDays(d, -1))}
              className="flex items-center gap-1 text-gray-600 hover:text-green-700 transition text-sm font-medium">
              ← Prev
            </button>
            <div className="flex items-center gap-3">
              <button onClick={() => setDate(today)}
                className={`text-xs px-3 py-1 rounded-full font-medium transition ${date === today ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                Today
              </button>
              <span className="font-semibold text-gray-800 text-sm sm:text-base">{formatDate(date)}</span>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
            </div>
            <button onClick={() => setDate(d => addDays(d, 1))}
              className="flex items-center gap-1 text-gray-600 hover:text-green-700 transition text-sm font-medium">
              Next →
            </button>
          </div>

          {/* Booking panel */}
          {selected && (
            <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="font-semibold text-green-800 shrink-0">
                📅 {selected.courtName} · {fmt12(selected.hour)}
                {courts.find(c => c.id === selected.courtId)?.has_ball_machine && (
                  <span className="ml-2 text-xs font-normal text-green-600">🤖 Ball Machine available</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 items-center flex-1">
                <span className="text-sm text-green-700 font-medium">Duration:</span>
                {DURATIONS.map(d => (
                  <button key={d.hours} onClick={() => setDuration(d.hours)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition ${duration === d.hours ? 'bg-green-700 text-white' : 'bg-white border border-green-300 text-green-700 hover:bg-green-100'}`}>
                    {d.label}
                  </button>
                ))}
                <input value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Notes (optional)" maxLength={80}
                  className="border border-green-200 rounded-lg px-3 py-1 text-sm flex-1 min-w-32 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
              </div>
              <div className="flex gap-2 shrink-0">
                {error && <span className="text-red-600 text-xs self-center">{error}</span>}
                <button onClick={() => setSelected(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition">
                  Cancel
                </button>
                <button onClick={handleBook} disabled={loading}
                  className="px-5 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50">
                  {loading ? 'Booking…' : 'Confirm'}
                </button>
              </div>
            </div>
          )}

          {/* Grid */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="w-16 py-3 px-3 text-gray-400 text-xs font-medium text-left border-b border-gray-100">Time</th>
                  {courts.map(c => (
                    <th key={c.id} className="py-3 px-2 text-center font-semibold text-gray-700 border-b border-gray-100">
                      {c.name}
                      {c.has_ball_machine && (
                        <div className="text-xs font-normal text-green-600 mt-0.5">🤖 Ball Machine</div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HOURS.map(hour => (
                  <tr key={hour} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 px-3 text-xs text-gray-400 font-medium whitespace-nowrap align-top pt-3">
                      {fmt12(hour)}
                    </td>
                    {courts.map(c => {
                      const booking = getBooking(c.id, hour)
                      const isMe = booking?.user_id === user?.id
                      const past = isPast(hour)
                      const isSelectedSlot = selected?.courtId === c.id && selected?.hour === hour

                      if (booking) {
                        const showDetails = isFirstHour(booking, hour)
                        return (
                          <td key={c.id} className="px-2 py-1 align-top">
                            <div className={`rounded-lg px-2 py-2 h-10 flex items-center justify-between gap-1 ${isMe ? 'bg-green-600 text-white' : 'bg-green-100 text-green-800'}`}>
                              {showDetails && (
                                <>
                                  <span className="text-xs font-medium truncate">
                                    {isMe ? '✓ Me' : `${booking.user.first_name} ${booking.user.last_name[0]}.`}
                                  </span>
                                  {(isMe || isBoard) && (
                                    <button onClick={() => handleCancel(booking.id)}
                                      className={`text-xs shrink-0 hover:opacity-70 transition ${isMe ? 'text-green-200' : 'text-green-600'}`}>
                                      ✕
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        )
                      }

                      return (
                        <td key={c.id} className="px-2 py-1 align-top">
                          <button
                            onClick={() => !past && handleSlotClick(c.id, hour, c.name)}
                            disabled={past}
                            className={`w-full h-10 rounded-lg border transition text-xs font-medium
                              ${past ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed' :
                                isSelectedSlot ? 'bg-green-100 border-green-400 text-green-700 ring-2 ring-green-400' :
                                'bg-white border-gray-200 text-gray-400 hover:bg-green-50 hover:border-green-300 hover:text-green-700 cursor-pointer'
                              }`}>
                            {!past && !isSelectedSlot && <span className="opacity-0 group-hover:opacity-100">+</span>}
                            {isSelectedSlot && '✓'}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 bg-white border border-gray-200 rounded inline-block"></span>
              Available — click to book
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 bg-green-100 rounded inline-block"></span>
              Booked by member
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 bg-green-600 rounded inline-block"></span>
              My booking
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 bg-gray-50 border border-gray-100 rounded inline-block"></span>
              Past / unavailable
            </span>
          </div>
        </>
      )}

      {tab === 'mine' && (
        <div>
          <h2 className="text-lg font-semibold text-gray-700 mb-4">My Upcoming Bookings</h2>
          {myBookings.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center shadow-sm">
              <p className="text-gray-400 text-sm mb-3">You have no upcoming bookings.</p>
              <button onClick={() => setTab('grid')}
                className="bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition">
                Book a Court
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {myBookings.map(b => {
                const start = new Date(b.start_time)
                const end = new Date(b.end_time)
                const durationMins = (end.getTime() - start.getTime()) / 60000
                return (
                  <div key={b.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-green-700 font-bold text-lg">
                        {b.court.number}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-800">{b.court.name}</div>
                        <div className="text-sm text-gray-600">
                          {start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ·{' '}
                          {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} –{' '}
                          {end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {durationMins >= 60 ? `${durationMins / 60} hour${durationMins > 60 ? 's' : ''}` : `${durationMins} minutes`}
                          {b.notes && ` · ${b.notes}`}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => handleCancel(b.id)}
                      className="text-red-400 hover:text-red-600 text-sm font-medium transition">
                      Cancel
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
