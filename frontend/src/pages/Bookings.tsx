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
interface GroupMember { friend_id: string; friend_name: string; friend_email?: string; is_guest: boolean }
interface FriendGroup { id: string; name: string; members: GroupMember[] }
interface DirectPlayer { name: string; email: string; userId?: string; isGuest: boolean }
interface MatchPlayer { id: string; player_name: string; player_email?: string; is_guest: boolean; is_host: boolean }
interface Invitation { id: string; invitee_name: string; invitee_email: string; status: string; is_guest: boolean }

const MATCH_TYPES = [
  { value: 'singles',      label: 'Singles',            players: [1] },
  { value: 'doubles',      label: 'Doubles',            players: [1, 2, 3] },
  { value: 'casual',       label: 'Hit Session',        players: [0] },
  { value: 'ball_machine', label: 'Ball Machine',       players: [0], ballMachineOnly: true },
]

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8) // 8am–7pm (last slot ends by 8pm)
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
  const [friendGroups, setFriendGroups] = useState<FriendGroup[]>([])
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]) // friend ids to invite at booking time
  const [confirming, setConfirming] = useState(false)
  const [activeBookingRoster, setActiveBookingRoster] = useState<{ bookingId: string; players: MatchPlayer[]; invitations: Invitation[] } | null>(null)
  const [inviting, setInviting] = useState(false)
  // Direct players at booking creation time
  const [directPlayers, setDirectPlayers] = useState<DirectPlayer[]>([])
  const [bookingSearchMode, setBookingSearchMode] = useState<'member' | 'guest' | null>(null)
  const [bookingSearchQuery, setBookingSearchQuery] = useState('')
  const [bookingSearchResults, setBookingSearchResults] = useState<{id: string; first_name: string; last_name: string; email: string}[]>([])
  const [bookingSearching, setBookingSearching] = useState(false)
  const [bookingGuestForm, setBookingGuestForm] = useState({ name: '', email: '' })
  // Add player directly (roster panel)
  const [addPlayerMode, setAddPlayerMode] = useState<'member' | 'guest' | null>(null)
  const [addPlayerQuery, setAddPlayerQuery] = useState('')
  const [addPlayerResults, setAddPlayerResults] = useState<{id: string; first_name: string; last_name: string; email: string}[]>([])
  const [addPlayerSearching, setAddPlayerSearching] = useState(false)
  const [guestAddForm, setGuestAddForm] = useState({ name: '', email: '' })
  const [addingPlayer, setAddingPlayer] = useState(false)
  const [bookingDetail, setBookingDetail] = useState<Booking | null>(null)

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
    api.groups.list().then(d => setFriendGroups(d as FriendGroup[]))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (bookingSearchMode !== 'member') return
    if (bookingSearchQuery.length < 2) { setBookingSearchResults([]); return }
    const t = setTimeout(async () => {
      setBookingSearching(true)
      try { setBookingSearchResults(await api.friends.searchMembers(bookingSearchQuery) as any) }
      finally { setBookingSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [bookingSearchQuery, bookingSearchMode])
  useEffect(() => {
    if (tab === 'mine') {
      loadMine()
      api.friends.list().then(d => setFriends(d as Friend[]))
      api.groups.list().then(d => setFriendGroups(d as FriendGroup[]))
    }
  }, [tab])

  const refreshRoster = async (bookingId: string) => {
    const data = await api.invitations.getRoster(bookingId) as any
    setActiveBookingRoster({ bookingId, players: data.players || [], invitations: data.invitations || [] })
  }

  const loadRoster = async (bookingId: string) => {
    if (activeBookingRoster?.bookingId === bookingId) {
      setActiveBookingRoster(null)
      return
    }
    setAddPlayerMode(null); setAddPlayerQuery(''); setAddPlayerResults([])
    await refreshRoster(bookingId)
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
      await refreshRoster(bookingId)
    } finally { setInviting(false) }
  }

  const searchPlayers = async (q: string) => {
    setAddPlayerQuery(q)
    if (q.length < 2) { setAddPlayerResults([]); return }
    setAddPlayerSearching(true)
    try {
      setAddPlayerResults(await api.friends.searchMembers(q) as any)
    } finally { setAddPlayerSearching(false) }
  }

  const addMemberPlayer = async (bookingId: string, userId: string) => {
    setAddingPlayer(true)
    try {
      await api.invitations.addPlayer(bookingId, { user_id: userId, is_guest: false })
      setAddPlayerQuery(''); setAddPlayerResults([])
      await refreshRoster(bookingId)
    } finally { setAddingPlayer(false) }
  }

  const addGuestPlayer = async (e: React.FormEvent, bookingId: string) => {
    e.preventDefault()
    if (!guestAddForm.name.trim()) return
    setAddingPlayer(true)
    try {
      await api.invitations.addPlayer(bookingId, {
        player_name: guestAddForm.name.trim(),
        player_email: guestAddForm.email.trim(),
        is_guest: true,
      })
      setGuestAddForm({ name: '', email: '' }); setAddPlayerMode(null)
      await refreshRoster(bookingId)
    } finally { setAddingPlayer(false) }
  }

  const removePlayer = async (bookingId: string, playerId: string) => {
    await api.invitations.removePlayer(bookingId, playerId)
    await refreshRoster(bookingId)
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
    setBookingDetail(null)
    setSelected({ courtId, hour, courtName })
    setSelectedFriends([])
    setDirectPlayers([])
    setBookingSearchMode(null)
    setBookingSearchQuery('')
    setBookingSearchResults([])
    setBookingGuestForm({ name: '', email: '' })
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

      // Add direct players to the roster immediately
      if (directPlayers.length > 0) {
        await Promise.all(
          directPlayers.map(p =>
            api.invitations.addPlayer(booked.id, {
              user_id: p.userId || null,
              player_name: p.name,
              player_email: p.email,
              is_guest: p.isGuest,
            })
          )
        )
      }

      setSelected(null)
      setSelectedFriends([])
      setDirectPlayers([])
      setBookingSearchMode(null)
      setBookingSearchQuery('')
      setBookingSearchResults([])
      setBookingGuestForm({ name: '', email: '' })
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
                {/* Group invite — show groups whose size exactly fills the open spots */}
                {matchType !== 'casual' && matchType !== 'ball_machine' && playersNeeded > 0 && (() => {
                  const matchingGroups = friendGroups.filter(g => g.members.length === playersNeeded)
                  if (matchingGroups.length === 0) return null
                  return (
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="text-xs text-green-700 font-medium">Groups:</span>
                      {matchingGroups.map(g => {
                        const allPicked = g.members.every(m => selectedFriends.includes(m.friend_id))
                        return (
                          <button key={g.id} type="button"
                            onClick={() => setSelectedFriends(allPicked ? [] : g.members.map(m => m.friend_id))}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium transition
                              ${allPicked
                                ? 'bg-green-700 text-white'
                                : 'bg-white border border-green-300 text-green-700 hover:bg-green-50'}`}>
                            {allPicked ? '✓ ' : ''}{g.name}
                            <span className="ml-1 opacity-70">({g.members.length})</span>
                          </button>
                        )
                      })}
                    </div>
                  )
                })()}
                {/* Add players directly to roster */}
                <div className="w-full flex flex-wrap gap-1.5 items-start pt-1 border-t border-green-100">
                  <span className="text-xs text-green-700 font-medium self-center">Add Directly:</span>
                  {directPlayers.map((p, i) => (
                    <span key={i} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium
                      ${p.isGuest ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                      {p.name}{p.isGuest ? ' (G)' : ''}
                      <button type="button" onClick={() => setDirectPlayers(s => s.filter((_, j) => j !== i))}
                        className="ml-0.5 opacity-60 hover:opacity-100">✕</button>
                    </span>
                  ))}
                  {bookingSearchMode === null && (
                    <>
                      <button type="button" onClick={() => setBookingSearchMode('member')}
                        className="px-2.5 py-1 rounded-full text-xs font-medium bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 transition">
                        + Member
                      </button>
                      <button type="button" onClick={() => setBookingSearchMode('guest')}
                        className="px-2.5 py-1 rounded-full text-xs font-medium bg-white border border-orange-300 text-orange-700 hover:bg-orange-50 transition">
                        + Guest
                      </button>
                    </>
                  )}
                </div>
                {bookingSearchMode === 'member' && (
                  <div className="w-full space-y-1.5">
                    <div className="relative">
                      <input
                        value={bookingSearchQuery}
                        onChange={e => setBookingSearchQuery(e.target.value)}
                        placeholder="Search member by name or email…"
                        autoFocus
                        className="w-full border border-green-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                      />
                      {bookingSearching && <span className="absolute right-2 top-1.5 text-xs text-gray-400">…</span>}
                    </div>
                    {bookingSearchResults.length > 0 && (
                      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white max-h-36 overflow-y-auto">
                        {bookingSearchResults.map(m => {
                          const already = directPlayers.some(p => p.userId === m.id)
                          return (
                            <div key={m.id} className="flex items-center justify-between px-3 py-1.5">
                              <div>
                                <div className="text-xs font-medium text-gray-800">{m.first_name} {m.last_name}</div>
                                <div className="text-xs text-gray-400">{m.email}</div>
                              </div>
                              <button type="button"
                                disabled={already}
                                onClick={() => {
                                  if (already) return
                                  setDirectPlayers(s => [...s, { name: `${m.first_name} ${m.last_name}`, email: m.email, userId: m.id, isGuest: false }])
                                  setBookingSearchQuery('')
                                  setBookingSearchResults([])
                                  setBookingSearchMode(null)
                                }}
                                className="text-xs bg-blue-700 text-white px-2 py-0.5 rounded hover:bg-blue-800 transition disabled:opacity-40">
                                {already ? '✓' : 'Add'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <button type="button" onClick={() => { setBookingSearchMode(null); setBookingSearchQuery(''); setBookingSearchResults([]) }}
                      className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                  </div>
                )}
                {bookingSearchMode === 'guest' && (
                  <div className="w-full flex flex-wrap gap-2 items-center">
                    <input
                      value={bookingGuestForm.name}
                      onChange={e => setBookingGuestForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Guest name *"
                      autoFocus
                      className="border border-green-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 bg-white w-40"
                    />
                    <input
                      type="email"
                      value={bookingGuestForm.email}
                      onChange={e => setBookingGuestForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="Email (optional)"
                      className="border border-green-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 bg-white w-44"
                    />
                    <button type="button"
                      onClick={() => {
                        if (!bookingGuestForm.name.trim()) return
                        setDirectPlayers(s => [...s, { name: bookingGuestForm.name.trim(), email: bookingGuestForm.email.trim(), isGuest: true }])
                        setBookingGuestForm({ name: '', email: '' })
                        setBookingSearchMode(null)
                      }}
                      className="text-xs bg-orange-600 text-white px-3 py-1.5 rounded-lg hover:bg-orange-700 transition">
                      Add Guest
                    </button>
                    <button type="button" onClick={() => { setBookingSearchMode(null); setBookingGuestForm({ name: '', email: '' }) }}
                      className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
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
                      <p className="font-semibold text-gray-800 mt-0.5">{selected.courtName}</p>
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

                  {directPlayers.length > 0 && (
                    <div className="border-t border-gray-100 pt-3">
                      <span className="text-gray-500 text-xs uppercase tracking-wide">Added directly to roster</span>
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {directPlayers.map((p, i) => (
                          <span key={i} className={`text-xs font-medium px-2.5 py-1 rounded-full ${p.isGuest ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
                            ✓ {p.name}{p.isGuest ? ' (Guest)' : ''}
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
                      {loading ? 'Booking…' : (() => {
                        const inv = invitedFriends.length
                        const dir = directPlayers.length
                        if (inv > 0 && dir > 0) return `Confirm, Add ${dir} & Send ${inv} Invite${inv !== 1 ? 's' : ''}`
                        if (inv > 0) return `Confirm & Send ${inv} Invite${inv !== 1 ? 's' : ''}`
                        if (dir > 0) return `Confirm & Add ${dir} Player${dir !== 1 ? 's' : ''}`
                        return 'Confirm Booking'
                      })()}
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Booking detail panel */}
          {bookingDetail && (() => {
            const b = bookingDetail
            const bStart = new Date(b.start_time)
            const bEnd = new Date(b.end_time)
            const dMins = (bEnd.getTime() - bStart.getTime()) / 60000
            const isMe = b.user_id === user?.id
            const isBallMachine = b.match_type === 'ball_machine'
            const matchLabel = isBallMachine ? '🤖 Ball Machine'
              : b.match_type === 'singles' ? 'Singles'
              : b.match_type === 'doubles' ? 'Doubles'
              : b.match_type === 'casual' ? 'Hit Session'
              : b.match_type || 'Hit Session'
            return (
              <div className="mb-4 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-800 text-sm">Booking Details</h3>
                  <button onClick={() => setBookingDetail(null)} className="text-gray-400 hover:text-gray-600 transition text-lg leading-none">×</button>
                </div>
                <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Court</p>
                    <p className="font-semibold text-gray-800 mt-0.5">{b.court.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Date</p>
                    <p className="font-semibold text-gray-800 mt-0.5">{bStart.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Time</p>
                    <p className="font-semibold text-gray-800 mt-0.5">
                      {bStart.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – {bEnd.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Duration</p>
                    <p className="font-semibold text-gray-800 mt-0.5">{dMins >= 60 ? `${dMins / 60} hr${dMins > 60 ? 's' : ''}` : `${dMins} min`}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Type</p>
                    <p className="font-semibold text-gray-800 mt-0.5">{matchLabel}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Booked by</p>
                    <p className="font-semibold text-gray-800 mt-0.5">
                      {isMe ? 'You' : `${b.user.first_name} ${b.user.last_name}`}
                    </p>
                  </div>
                  {b.notes && (
                    <div className="col-span-2">
                      <p className="text-xs text-gray-400 uppercase tracking-wide">Notes</p>
                      <p className="font-semibold text-gray-800 mt-0.5">{b.notes}</p>
                    </div>
                  )}
                </div>
                {(isMe || isBoard) && (
                  <div className="px-5 pb-4">
                    <button
                      onClick={() => { handleCancel(b.id); setBookingDetail(null) }}
                      className="text-sm text-red-500 hover:text-red-700 font-medium transition">
                      Cancel this booking
                    </button>
                  </div>
                )}
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
                        const bStart = new Date(booking.start_time)
                        const bEnd = new Date(booking.end_time)
                        const timeRange = `${bStart.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${bEnd.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                        const matchLabel = isBallMachine ? '🤖 Ball Machine'
                          : booking.match_type === 'singles' ? 'Singles'
                          : booking.match_type === 'doubles' ? 'Doubles'
                          : booking.match_type === 'casual' ? 'Hit Session'
                          : ''
                        return (
                          <td key={c.id} className="px-2 py-1 align-top">
                            <div
                              onClick={() => showDetails && setBookingDetail(bookingDetail?.id === booking.id ? null : booking)}
                              className={`rounded-lg px-2 py-1.5 flex flex-col gap-0.5 ${isMe ? 'bg-green-600 text-white' : 'bg-green-100 text-green-800'} ${showDetails ? 'cursor-pointer hover:opacity-90 transition' : ''}`}>
                              {showDetails && (
                                <>
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-xs font-semibold truncate">
                                      {isBallMachine ? '🤖 Ball Machine' : isMe ? 'Me' : `${booking.user.first_name} ${booking.user.last_name[0]}.`}
                                    </span>
                                    {(isMe || isBoard) && (
                                      <button
                                        onClick={e => { e.stopPropagation(); handleCancel(booking.id) }}
                                        className={`text-xs shrink-0 hover:opacity-70 transition ${isMe ? 'text-green-200' : 'text-green-600'}`}>
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                  <span className={`text-xs truncate ${isMe ? 'text-green-200' : 'text-green-600'}`}>{timeRange}</span>
                                  {matchLabel && !isBallMachine && (
                                    <span className={`text-xs truncate ${isMe ? 'text-green-200' : 'text-green-600'}`}>{matchLabel}</span>
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
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                {b.match_type === 'ball_machine' ? '🤖 Ball Machine'
                                  : b.match_type === 'singles' ? 'Singles'
                                  : b.match_type === 'doubles' ? 'Doubles'
                                  : b.match_type}
                              </span>
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
                      <div className="border-t border-gray-100 p-5 bg-gray-50 grid grid-cols-1 md:grid-cols-3 gap-5">
                        {/* Roster */}
                        <div>
                          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Match Roster</h3>
                          <div className="space-y-2">
                            {roster.players.map(p => (
                              <div key={p.id} className="flex items-center gap-2 text-sm">
                                <span className="w-5 h-5 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs shrink-0">✓</span>
                                <span className="font-medium text-gray-800 truncate">{p.player_name}</span>
                                {p.is_host && <span className="text-xs text-gray-400 shrink-0">(Host)</span>}
                                {p.is_guest && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 rounded shrink-0">Guest</span>}
                                {!p.is_host && (
                                  <button onClick={() => removePlayer(b.id, p.id)}
                                    className="text-xs text-red-400 hover:text-red-600 ml-auto shrink-0">✕</button>
                                )}
                              </div>
                            ))}
                            {roster.invitations.filter(i => i.status === 'pending').map(i => (
                              <div key={i.id} className="flex items-center gap-2 text-sm">
                                <span className="w-5 h-5 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center text-xs shrink-0">⏳</span>
                                <span className="text-gray-600 truncate">{i.invitee_name}</span>
                                {i.is_guest && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 rounded shrink-0">Guest</span>}
                                <button onClick={() => api.invitations.cancel(i.id).then(() => refreshRoster(b.id))}
                                  className="text-xs text-red-400 hover:text-red-600 ml-auto shrink-0">✕</button>
                              </div>
                            ))}
                            {roster.invitations.filter(i => i.status === 'declined').map(i => (
                              <div key={i.id} className="flex items-center gap-2 text-sm text-gray-400">
                                <span className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-xs shrink-0">✗</span>
                                <span className="truncate">{i.invitee_name} <span className="text-xs">declined</span></span>
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

                        {/* Invite from Friends */}
                        <div>
                          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Invite via Email</h3>
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
                                    {joined ? '✓ ' : invited ? '⏳ ' : '✉️ '}{f.friend_name}
                                    {f.is_guest && <span className="ml-1 opacity-50 text-xs">(G)</span>}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>

                        {/* Add Player Directly */}
                        <div>
                          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add Player Directly</h3>
                          {addPlayerMode === null && (
                            <div className="flex gap-2 flex-wrap">
                              <button onClick={() => setAddPlayerMode('member')}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-700 hover:border-green-400 hover:text-green-700 transition">
                                + Search Member
                              </button>
                              <button onClick={() => setAddPlayerMode('guest')}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-700 hover:border-orange-400 hover:text-orange-700 transition">
                                + Add Guest
                              </button>
                            </div>
                          )}

                          {addPlayerMode === 'member' && (
                            <div className="space-y-2">
                              <div className="relative">
                                <input
                                  value={addPlayerQuery}
                                  onChange={e => searchPlayers(e.target.value)}
                                  placeholder="Search by name or email…"
                                  autoFocus
                                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                                />
                                {addPlayerSearching && (
                                  <span className="absolute right-2 top-1.5 text-xs text-gray-400">…</span>
                                )}
                              </div>
                              {addPlayerResults.length > 0 && (
                                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white max-h-40 overflow-y-auto">
                                  {addPlayerResults.map(m => (
                                    <div key={m.id} className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50">
                                      <div>
                                        <div className="text-xs font-medium text-gray-800">{m.first_name} {m.last_name}</div>
                                        <div className="text-xs text-gray-400">{m.email}</div>
                                      </div>
                                      <button
                                        onClick={() => addMemberPlayer(b.id, m.id)}
                                        disabled={addingPlayer || roster.players.some(p => p.player_email === m.email)}
                                        className="text-xs bg-green-700 text-white px-2 py-1 rounded hover:bg-green-800 transition disabled:opacity-50">
                                        {roster.players.some(p => p.player_email === m.email) ? '✓' : 'Add'}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <button onClick={() => { setAddPlayerMode(null); setAddPlayerQuery(''); setAddPlayerResults([]) }}
                                className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                            </div>
                          )}

                          {addPlayerMode === 'guest' && (
                            <form onSubmit={e => addGuestPlayer(e, b.id)} className="space-y-2">
                              <input value={guestAddForm.name} onChange={e => setGuestAddForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="Guest name *" required autoFocus
                                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
                              <input type="email" value={guestAddForm.email} onChange={e => setGuestAddForm(f => ({ ...f, email: e.target.value }))}
                                placeholder="Email (optional)"
                                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
                              <div className="flex gap-2">
                                <button type="submit" disabled={addingPlayer}
                                  className="text-xs bg-green-700 text-white px-3 py-1.5 rounded-lg hover:bg-green-800 transition disabled:opacity-50">
                                  {addingPlayer ? 'Adding…' : 'Add Guest'}
                                </button>
                                <button type="button" onClick={() => { setAddPlayerMode(null); setGuestAddForm({ name: '', email: '' }) }}
                                  className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                              </div>
                            </form>
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
