import { useEffect, useState, useCallback } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface Court { id: number; name: string; number: number; has_ball_machine?: boolean }
interface Booking {
  id: string; user_id: string; court_id: number
  start_time: string; end_time: string; notes?: string
  match_type?: string; players_needed?: number
  user: { first_name: string; last_name: string }
  court: { name: string; number: number }
}
interface Selected { courtId: number; hour: number; courtName: string }
interface Friend { id: string; friend_user_id?: string; friend_name: string; friend_email?: string; is_guest: boolean }
interface MatchPlayer { id: string; player_name: string; player_email?: string; is_guest: boolean; is_host: boolean }
interface Invitation { id: string; invitee_name: string; invitee_email: string; status: string; is_guest: boolean }

const MATCH_TYPES = [
  { value: 'singles',      label: 'Singles',            players: [1] },
  { value: 'doubles',      label: 'Doubles',            players: [1, 2, 3] },
  { value: 'ball_machine', label: 'Ball Machine',       players: [0], ballMachineOnly: true },
  { value: 'casual',       label: 'Hit Session',        players: [0] },
]

const HOURS = Array.from({ length: 10 }, (_, i) => i + 8) // 8am–5pm (last slot ends by 6pm)
const DURATIONS = [{ label: '1 hr', hours: 1 }, { label: '1½ hr', hours: 1.5 }]

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
  const [duration, setDuration] = useState(1.5)
  const [notes, setNotes] = useState('')
  const [matchType, setMatchType] = useState('casual')
  const [playersNeeded, setPlayersNeeded] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'grid' | 'mine'>('grid')
  const [myBookings, setMyBookings] = useState<Booking[]>([])
  // Invite state
  const [friends, setFriends] = useState<Friend[]>([])
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]) // friend ids to invite at booking time
  const [confirming, setConfirming] = useState(false)
  const [activeBookingRoster, setActiveBookingRoster] = useState<{ bookingId: string; players: MatchPlayer[]; invitations: Invitation[] } | null>(null)
  const [inviting, setInviting] = useState(false)

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
    api.friends.list().then(d => setFriends(d as Friend[]))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (tab === 'mine') {
      loadMine()
      api.friends.list().then(d => setFriends(d as Friend[]))
    }
  }, [tab])

  const loadRoster = async (bookingId: string) => {
    if (activeBookingRoster?.bookingId === bookingId) {
      setActiveBookingRoster(null)
      return
    }
    const data = await api.invitations.getRoster(bookingId) as any
    setActiveBookingRoster({ bookingId, players: data.players || [], invitations: data.invitations || [] })
  }

  const sendInvite = async (bookingId: string, friend: Friend) => {
    setInviting(true)
    try {
      await api.invitations.send(bookingId, {
        invitee_user_id: friend.friend_user_id || null,
        invitee_name: friend.friend_name,
        invitee_email: friend.friend_email || '',
        is_guest: friend.is_guest,
      })
      await loadRoster(bookingId)
      await loadRoster(bookingId) // reload after toggle
    } finally { setInviting(false) }
  }

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
    setSelectedFriends([])
    setConfirming(false)
    setDuration(1.5)
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
      const booked = await api.bookings.create({
        court_id: selected.courtId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        notes,
        match_type: matchType,
        players_needed: playersNeeded,
      }) as { id: string }

      // Send invitations to selected friends
      if (selectedFriends.length > 0) {
        await Promise.all(
          selectedFriends.map(fid => {
            const f = friends.find(fr => fr.id === fid)
            if (!f) return Promise.resolve()
            return api.invitations.send(booked.id, {
              invitee_user_id: f.friend_user_id || null,
              invitee_name: f.friend_name,
              invitee_email: f.friend_email || '',
              is_guest: f.is_guest,
            })
          })
        )
      }

      setSelected(null)
      setSelectedFriends([])
      setConfirming(false)
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

          {/* Booking panel — Step 1: Configure */}
          {selected && !confirming && (
            <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="font-semibold text-green-800 shrink-0">
                📅 {selected.courtName} · {fmt12(selected.hour)}
              </div>
              <div className="flex flex-wrap gap-2 items-center flex-1">
                <span className="text-sm text-green-700 font-medium">Duration:</span>
                {DURATIONS.map(d => (
                  <button key={d.hours} onClick={() => setDuration(d.hours)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition ${duration === d.hours ? 'bg-green-700 text-white' : 'bg-white border border-green-300 text-green-700 hover:bg-green-100'}`}>
                    {d.label}
                  </button>
                ))}
                <select value={matchType} onChange={e => { setMatchType(e.target.value); setPlayersNeeded(0); setSelectedFriends([]) }}
                  className="border border-green-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white text-green-800">
                  {MATCH_TYPES
                    .filter(m => !m.ballMachineOnly || courts.find(c => c.id === selected.courtId)?.has_ball_machine)
                    .map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                {matchType !== 'casual' && matchType !== 'ball_machine' && (
                  <select value={playersNeeded} onChange={e => { setPlayersNeeded(+e.target.value); setSelectedFriends([]) }}
                    className="border border-green-200 rounded-lg px-2 py-1 text-sm focus:outline-none bg-white text-green-800">
                    {MATCH_TYPES.find(m => m.value === matchType)?.players.map(p => (
                      <option key={p} value={p}>Need {p} player{p !== 1 ? 's' : ''}</option>
                    ))}
                  </select>
                )}
                {friends.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs text-green-700 font-medium">Invite:</span>
                    {friends.map(f => {
                      const picked = selectedFriends.includes(f.id)
                      const limit = matchType !== 'casual' && matchType !== 'ball_machine' && playersNeeded > 0 ? playersNeeded : Infinity
                      const atLimit = selectedFriends.length >= limit && !picked
                      return (
                        <button key={f.id} type="button"
                          onClick={() => setSelectedFriends(s =>
                            picked ? s.filter(x => x !== f.id) : atLimit ? s : [...s, f.id]
                          )}
                          disabled={atLimit}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition
                            ${picked ? 'bg-green-700 text-white' :
                              atLimit ? 'bg-gray-100 text-gray-300 cursor-not-allowed' :
                              'bg-white border border-green-300 text-green-700 hover:bg-green-50'}`}>
                          {picked ? '✓ ' : ''}{f.friend_name}{f.is_guest ? ' (G)' : ''}
                        </button>
                      )
                    })}
                    {selectedFriends.length > 0 && matchType !== 'casual' && matchType !== 'ball_machine' && playersNeeded > 0 && (
                      <span className="text-xs text-green-600">{selectedFriends.length}/{playersNeeded} selected</span>
                    )}
                  </div>
                )}
                <input value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Notes (optional)" maxLength={80}
                  className="border border-green-200 rounded-lg px-3 py-1 text-sm flex-1 min-w-32 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setSelected(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition">
                  Cancel
                </button>
                <button onClick={() => setConfirming(true)}
                  className="px-5 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-semibold transition">
                  Review Booking →
                </button>
              </div>
            </div>
          )}

          {/* Booking panel — Step 2: Confirm */}
          {selected && confirming && (() => {
            const start = new Date(`${date}T${String(selected.hour).padStart(2, '0')}:00:00`)
            const end = new Date(start.getTime() + duration * 60 * 60 * 1000)
            const invitedFriends = friends.filter(f => selectedFriends.includes(f.id))
            return (
              <div className="mb-4 bg-white border-2 border-green-500 rounded-xl shadow-md overflow-hidden">
                <div className="bg-green-700 text-white px-5 py-3">
                  <h3 className="font-bold text-base">Confirm Your Booking</h3>
                  <p className="text-green-200 text-xs mt-0.5">Please review the details below before confirming.</p>
                </div>
                <div className="p-5 space-y-3">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div>
                      <span className="text-gray-500 text-xs uppercase tracking-wide">Court</span>
                      <p className="font-semibold text-gray-800 mt-0.5">
                        {selected.courtName}
                        {courts.find(c => c.id === selected.courtId)?.has_ball_machine && (
                          <span className="ml-1 text-xs text-green-600">🤖</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs uppercase tracking-wide">Date</span>
                      <p className="font-semibold text-gray-800 mt-0.5">{formatDate(date)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs uppercase tracking-wide">Time</span>
                      <p className="font-semibold text-gray-800 mt-0.5">
                        {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – {end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs uppercase tracking-wide">Duration</span>
                      <p className="font-semibold text-gray-800 mt-0.5">{duration === 1 ? '1 hour' : '1½ hours'}</p>
                    </div>
                    {matchType !== 'casual' && (
                      <div>
                        <span className="text-gray-500 text-xs uppercase tracking-wide">Match Type</span>
                        <p className="font-semibold text-gray-800 mt-0.5">
                          {matchType === 'ball_machine' ? '🤖 Ball Machine'
                            : `${matchType.charAt(0).toUpperCase() + matchType.slice(1)} — need ${playersNeeded} more player${playersNeeded !== 1 ? 's' : ''}`}
                        </p>
                      </div>
                    )}
                    {notes && (
                      <div className="col-span-2">
                        <span className="text-gray-500 text-xs uppercase tracking-wide">Notes</span>
                        <p className="font-semibold text-gray-800 mt-0.5">{notes}</p>
                      </div>
                    )}
                  </div>

                  {invitedFriends.length > 0 && (
                    <div className="border-t border-gray-100 pt-3">
                      <span className="text-gray-500 text-xs uppercase tracking-wide">Invitations will be sent to</span>
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {invitedFriends.map(f => (
                          <span key={f.id} className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-1 rounded-full">
                            ✉️ {f.friend_name}{f.is_guest ? ' (Guest)' : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {error && <p className="text-red-600 text-sm">{error}</p>}

                  <div className="flex gap-3 pt-2 border-t border-gray-100">
                    <button onClick={() => setConfirming(false)}
                      className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition">
                      ← Back
                    </button>
                    <button onClick={handleBook} disabled={loading}
                      className="flex-1 px-5 py-2.5 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-bold transition disabled:opacity-50">
                      {loading ? 'Booking…' : invitedFriends.length > 0 ? `Confirm & Send ${invitedFriends.length} Invite${invitedFriends.length !== 1 ? 's' : ''}` : 'Confirm Booking'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}

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
                        const isBallMachine = booking.match_type === 'ball_machine'
                        return (
                          <td key={c.id} className="px-2 py-1 align-top">
                            <div className={`rounded-lg px-2 py-2 h-10 flex items-center justify-between gap-1 ${isMe ? 'bg-green-600 text-white' : 'bg-green-100 text-green-800'}`}>
                              {showDetails && (
                                <>
                                  <span className="text-xs font-medium truncate">
                                    {isBallMachine ? '🤖' : ''}{isMe ? ' Me' : ` ${booking.user.first_name} ${booking.user.last_name[0]}.`}
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
            <div className="space-y-4">
              {myBookings.map(b => {
                const start = new Date(b.start_time)
                const end = new Date(b.end_time)
                const durationMins = (end.getTime() - start.getTime()) / 60000
                const isActive = activeBookingRoster?.bookingId === b.id
                const roster = isActive ? activeBookingRoster : null
                const alreadyInvited = (email: string) => roster?.invitations.some(i => i.invitee_email === email && i.status !== 'declined')
                const alreadyJoined = (email: string) => roster?.players.some(p => p.player_email === email)

                return (
                  <div key={b.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="p-5 flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-green-700 font-bold text-lg">
                          {b.court.number}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-800 flex items-center gap-2">
                            {b.court.name}
                            {b.match_type && b.match_type !== 'casual' && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full capitalize">{b.match_type}</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600">
                            {start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ·{' '}
                            {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} –{' '}
                            {end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {durationMins >= 60 ? `${durationMins / 60} hr${durationMins > 60 ? 's' : ''}` : `${durationMins} min`}
                            {b.notes && ` · ${b.notes}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-3 items-center shrink-0">
                        <button onClick={() => loadRoster(b.id)}
                          className={`text-sm px-3 py-1.5 rounded-lg font-medium transition ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          👥 {isActive ? 'Hide' : 'Roster & Invite'}
                        </button>
                        <button onClick={() => handleCancel(b.id)}
                          className="text-red-400 hover:text-red-600 text-sm font-medium transition">
                          Cancel
                        </button>
                      </div>
                    </div>

                    {isActive && roster && (
                      <div className="border-t border-gray-100 p-5 bg-gray-50 grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* Roster */}
                        <div>
                          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Match Roster</h3>
                          <div className="space-y-2">
                            {roster.players.map(p => (
                              <div key={p.id} className="flex items-center gap-2 text-sm">
                                <span className="w-5 h-5 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs">✓</span>
                                <span className="font-medium text-gray-800">{p.player_name}</span>
                                {p.is_host && <span className="text-xs text-gray-400">(Host)</span>}
                                {p.is_guest && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 rounded">Guest</span>}
                              </div>
                            ))}
                            {roster.invitations.filter(i => i.status === 'pending').map(i => (
                              <div key={i.id} className="flex items-center gap-2 text-sm">
                                <span className="w-5 h-5 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center text-xs">⏳</span>
                                <span className="text-gray-600">{i.invitee_name}</span>
                                {i.is_guest && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 rounded">Guest</span>}
                                <button onClick={() => api.invitations.cancel(i.id).then(() => loadRoster(b.id))}
                                  className="text-xs text-red-400 hover:text-red-600 ml-auto">✕</button>
                              </div>
                            ))}
                            {roster.invitations.filter(i => i.status === 'declined').map(i => (
                              <div key={i.id} className="flex items-center gap-2 text-sm text-gray-400">
                                <span className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-xs">✗</span>
                                <span>{i.invitee_name} <span className="text-xs">declined</span></span>
                              </div>
                            ))}
                            {(b.players_needed || 0) > 0 && (() => {
                              const open = (b.players_needed! + 1) - roster.players.length
                              return open > 0 ? Array.from({ length: open }).map((_, i) => (
                                <div key={`open-${i}`} className="flex items-center gap-2 text-sm text-gray-400 italic">
                                  <span className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-xs">○</span>
                                  Open Spot
                                </div>
                              )) : null
                            })()}
                          </div>
                        </div>

                        {/* Invite */}
                        <div>
                          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Invite from Friends</h3>
                          {friends.length === 0 ? (
                            <p className="text-xs text-gray-400">
                              <a href="/friends" className="text-green-700 hover:underline">Add friends</a> to invite them quickly.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {friends.map(f => {
                                const email = f.friend_email || ''
                                const joined = alreadyJoined(email)
                                const invited = alreadyInvited(email)
                                return (
                                  <button key={f.id}
                                    onClick={() => !invited && !joined && !inviting && sendInvite(b.id, f)}
                                    disabled={invited || joined || inviting}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition
                                      ${joined ? 'bg-green-100 text-green-700 cursor-default' :
                                        invited ? 'bg-yellow-50 text-yellow-600 border border-yellow-200 cursor-default' :
                                        'bg-white border border-gray-200 text-gray-700 hover:border-green-400 hover:text-green-700 cursor-pointer'}`}>
                                    {joined ? '✓ ' : invited ? '⏳ ' : '+ '}{f.friend_name}
                                    {f.is_guest && <span className="ml-1 opacity-50 text-xs">(G)</span>}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
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
