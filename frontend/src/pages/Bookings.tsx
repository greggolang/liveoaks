import { useEffect, useState, useCallback } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface Court { id: number; name: string; number: number; has_ball_machine?: boolean }
interface Booking {
  id: string; user_id: string; court_id: number
  start_time: string; end_time: string; notes?: string
  match_type?: string; players_needed?: number
  players?: string[]
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
  { value: 'singles',      label: 'Singles',      ballMachineOnly: false },
  { value: 'doubles',      label: 'Doubles',      ballMachineOnly: false },
  { value: 'casual',       label: 'Hit Session',  ballMachineOnly: false },
  { value: 'ball_machine', label: 'Ball Machine', ballMachineOnly: true  },
]

// Fixed roster capacity per match type (excluding the host)
const PLAYERS_BY_TYPE: Record<string, number> = {
  casual:       1,
  singles:      1,
  doubles:      3,
  ball_machine: 0,
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8) // 8am–7pm (last slot ends by 8pm)
const DURATIONS = [{ label: '1 hr', hours: 1 }, { label: '1½ hr', hours: 1.5 }]

function fmt12(hour: number) {
  const h = hour % 12 || 12
  return `${h}:00 ${hour < 12 ? 'AM' : 'PM'}`
}

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return localDateStr(d)
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  })
}

export default function Bookings() {
  const { user, isBoard, bookingMaxDaysAhead } = useAuth()
  const today = localDateStr(new Date())
  const [date, setDate] = useState(today)
  const [courts, setCourts] = useState<Court[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [selected, setSelected] = useState<Selected | null>(null)
  const [duration, setDuration] = useState(1.5)
  const [matchType, setMatchType] = useState('casual')
  const [playersNeeded, setPlayersNeeded] = useState(PLAYERS_BY_TYPE['casual'])
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
  const [rosterMap, setRosterMap] = useState<Record<string, { players: MatchPlayer[]; invitations: Invitation[] }>>({})
  const [inviting, setInviting] = useState(false)
  // Directory — loaded once at mount, used for all member searches
  const [directory, setDirectory] = useState<{id: string; first_name: string; last_name: string; email: string}[]>([])
  // Direct players at booking creation time
  const [directPlayers, setDirectPlayers] = useState<DirectPlayer[]>([])
  const [bookingSearchMode, setBookingSearchMode] = useState<'member' | 'guest' | null>(null)
  const [bookingSearchQuery, setBookingSearchQuery] = useState('')
  const [bookingSearchResults, setBookingSearchResults] = useState<{id: string; first_name: string; last_name: string; email: string}[]>([])
  const [bookingGuestForm, setBookingGuestForm] = useState({ name: '', email: '' })
  // Add player directly (roster panel)
  const [addPlayerMode, setAddPlayerMode] = useState<'member' | 'guest' | null>(null)
  const [addPlayerQuery, setAddPlayerQuery] = useState('')
  const [addPlayerResults, setAddPlayerResults] = useState<{id: string; first_name: string; last_name: string; email: string}[]>([])
  const [guestAddForm, setGuestAddForm] = useState({ name: '', email: '' })
  const [addingPlayer, setAddingPlayer] = useState(false)
  const [bookingDetail, setBookingDetail] = useState<Booking | null>(null)
  const [editingBooking, setEditingBooking] = useState(false)
  const [editForm, setEditForm] = useState({ matchType: 'casual', playersNeeded: 0, duration: 1.5, courtId: 0 })
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')
  const [showTutorial, setShowTutorial] = useState(false)

  const load = useCallback(() => {
    api.bookings.list(date).then(d => setBookings(d as Booking[]))
  }, [date])

  const loadMine = async () => {
    const data = await api.bookings.list()
    const mine = (data as Booking[]).filter(b =>
      b.user_id === user?.id && new Date(b.start_time) >= new Date()
    )
    setMyBookings(mine)
    const map: Record<string, { players: MatchPlayer[]; invitations: Invitation[] }> = {}
    await Promise.all(mine.map(async b => {
      try {
        const d = await api.invitations.getRoster(b.id) as any
        map[b.id] = { players: d.players || [], invitations: d.invitations || [] }
      } catch {}
    }))
    setRosterMap(map)
  }

  useEffect(() => {
    api.courts.list().then(d => setCourts(d as Court[]))
    api.friends.list().then(d => setFriends(d as Friend[]))
    api.groups.list().then(d => setFriendGroups(d as FriendGroup[]))
    api.members.directory().then(d => setDirectory((d as any[]).map(m => ({ id: m.id, first_name: m.first_name, last_name: m.last_name, email: m.email }))))
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-load roster when the user opens their own booking in the grid detail panel
  useEffect(() => {
    if (bookingDetail && bookingDetail.user_id === user?.id) {
      refreshRoster(bookingDetail.id)
    }
  }, [bookingDetail?.id])

  useEffect(() => {
    if (bookingSearchMode !== 'member') return
    if (bookingSearchQuery.length < 2) { setBookingSearchResults([]); return }
    const q = bookingSearchQuery.toLowerCase()
    setBookingSearchResults(
      directory.filter(m =>
        m.id !== user?.id &&
        (`${m.first_name} ${m.last_name}`.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
      ).slice(0, 20)
    )
  }, [bookingSearchQuery, bookingSearchMode, directory, user?.id])
  useEffect(() => {
    if (tab === 'mine') {
      loadMine()
      api.friends.list().then(d => setFriends(d as Friend[]))
      api.groups.list().then(d => setFriendGroups(d as FriendGroup[]))
    }
  }, [tab])

  // Load rosters for my bookings whenever the grid booking list changes
  useEffect(() => {
    bookings.filter(b => b.user_id === user?.id).forEach(b => {
      api.invitations.getRoster(b.id).then((d: any) => {
        setRosterMap(prev => ({
          ...prev,
          [b.id]: { players: d.players || [], invitations: d.invitations || [] },
        }))
      }).catch(() => {})
    })
  }, [bookings])

  const refreshRoster = async (bookingId: string) => {
    const data = await api.invitations.getRoster(bookingId) as any
    const players = data.players || []
    const invitations = data.invitations || []
    setActiveBookingRoster({ bookingId, players, invitations })
    setRosterMap(prev => ({ ...prev, [bookingId]: { players, invitations } }))
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

  const searchPlayers = (q: string) => {
    setAddPlayerQuery(q)
    if (q.length < 2) { setAddPlayerResults([]); return }
    const lower = q.toLowerCase()
    setAddPlayerResults(
      directory.filter(m =>
        m.id !== user?.id &&
        (`${m.first_name} ${m.last_name}`.toLowerCase().includes(lower) || m.email.toLowerCase().includes(lower))
      ).slice(0, 20)
    )
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

  const openEdit = (b: Booking) => {
    const dHours = (new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 3600000
    const mt = b.match_type ?? 'casual'
    setEditForm({
      matchType: mt,
      playersNeeded: PLAYERS_BY_TYPE[mt] ?? 0,
      duration: dHours <= 1 ? 1 : 1.5,
      courtId: b.court_id,
    })
    setEditError('')
    setEditingBooking(true)
    setAddPlayerMode(null)
    setAddPlayerQuery('')
    setAddPlayerResults([])
    refreshRoster(b.id)
  }

  const saveEdit = async (b: Booking) => {
    setEditLoading(true)
    setEditError('')
    try {
      const newEnd = new Date(new Date(b.start_time).getTime() + editForm.duration * 3600000)
      await api.bookings.update(b.id, {
        match_type: editForm.matchType,
        players_needed: editForm.playersNeeded,
        end_time: newEnd.toISOString(),
        court_id: editForm.courtId,
      })
      setEditingBooking(false)
      setBookingDetail(null)
      load()
      loadMine()
    } catch (err: any) {
      setEditError(err.message)
    } finally {
      setEditLoading(false)
    }
  }

  const isPast = (hour: number) => {
    const slotTime = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`)
    return slotTime < new Date()
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800">Court Bookings</h1>
          <button
            onClick={() => setShowTutorial(true)}
            title="How to book a court"
            className="w-6 h-6 rounded-full bg-gray-200 hover:bg-green-100 hover:text-green-700 text-gray-500 text-xs font-bold transition flex items-center justify-center shrink-0">
            ?
          </button>
        </div>
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
          {(() => {
            const maxDate = localDateStr(new Date(new Date().setDate(new Date().getDate() + bookingMaxDaysAhead)))
            const atMax = date >= maxDate
            return (
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
                  <input type="date" value={date} min={today} max={maxDate}
                    onChange={e => setDate(e.target.value <= maxDate ? e.target.value : maxDate)}
                    className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
                </div>
                <button onClick={() => !atMax && setDate(d => addDays(d, 1))}
                  disabled={atMax}
                  className={`flex items-center gap-1 transition text-sm font-medium ${atMax ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:text-green-700'}`}>
                  Next →
                </button>
              </div>
            )
          })()}

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
                <select value={matchType} onChange={e => { setMatchType(e.target.value); setPlayersNeeded(PLAYERS_BY_TYPE[e.target.value] ?? 0); setSelectedFriends([]); setDirectPlayers([]); setBookingSearchMode(null); setBookingSearchQuery(''); setBookingSearchResults([]) }}
                  className="border border-green-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white text-green-800">
                  {MATCH_TYPES
                    .filter(m => !m.ballMachineOnly || courts.find(c => c.id === selected.courtId)?.has_ball_machine)
                    .map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                {/* ── Player limits (hidden for ball machine — solo only) ── */}
                {matchType !== 'ball_machine' && (() => {
                  const maxAdditional = PLAYERS_BY_TYPE[matchType] ?? 0
                  const totalAdded = selectedFriends.length + directPlayers.length
                  const spotsLeft = Math.max(0, maxAdditional - totalAdded)
                  return (<>
                    {friends.length > 0 && maxAdditional > 0 && (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-xs text-green-700 font-medium">Invite:</span>
                        {friends.map(f => {
                          const picked = selectedFriends.includes(f.id)
                          const atLimit = spotsLeft === 0 && !picked
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
                        {totalAdded > 0 && (
                          <span className="text-xs text-green-600">{totalAdded}/{maxAdditional} added</span>
                        )}
                      </div>
                    )}
                    {/* Group invite */}
                    {maxAdditional > 0 && playersNeeded > 0 && (() => {
                      const matchingGroups = friendGroups.filter(g => g.members.length === spotsLeft)
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
                                  ${allPicked ? 'bg-green-700 text-white' : 'bg-white border border-green-300 text-green-700 hover:bg-green-50'}`}>
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
                        spotsLeft === 0
                          ? <span className="text-xs text-gray-400 italic self-center">Booking is full</span>
                          : <>
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
                  </>)
                })()}
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
                    </div>
                    {bookingSearchResults.length > 0 && (
                      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white max-h-36 overflow-y-auto">
                        {bookingSearchResults.map(m => {
                          const already = directPlayers.some(p => p.userId === m.id)
                          const full = selectedFriends.length + directPlayers.length >= (PLAYERS_BY_TYPE[matchType] ?? 0)
                          return (
                            <div key={m.id} className="flex items-center justify-between px-3 py-1.5">
                              <div>
                                <div className="text-xs font-medium text-gray-800">{m.first_name} {m.last_name}</div>
                                <div className="text-xs text-gray-400">{m.email}</div>
                              </div>
                              <button type="button"
                                disabled={already || full}
                                onClick={() => {
                                  if (already) return
                                  setDirectPlayers(s => [...s, { name: `${m.first_name} ${m.last_name}`, email: m.email, userId: m.id, isGuest: false }])
                                  setBookingSearchQuery('')
                                  setBookingSearchResults([])
                                  setBookingSearchMode(null)
                                }}
                                className="text-xs bg-blue-700 text-white px-2 py-0.5 rounded hover:bg-blue-800 transition disabled:opacity-40">
                                {already ? '✓' : full ? 'Full' : 'Add'}
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
                  <div className="w-full flex flex-col gap-2">
                    <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                      ⚠️ A <strong>$5.00 guest fee</strong> will be added to your next quarterly dues for each guest.
                    </p>
                    <div className="flex flex-wrap gap-2 items-center">
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
                  </div>
                )}
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
            const canEdit = isMe || isBoard
            const isBallMachine = b.match_type === 'ball_machine'
            const matchLabel = isBallMachine ? '🤖 Ball Machine'
              : b.match_type === 'singles' ? 'Singles'
              : b.match_type === 'doubles' ? 'Doubles'
              : b.match_type === 'casual' ? 'Hit Session'
              : b.match_type || 'Hit Session'
            return (
              <div className="mb-4 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-800 text-sm">
                    {editingBooking ? 'Edit Booking' : 'Booking Details'}
                  </h3>
                  <button onClick={() => { setBookingDetail(null); setEditingBooking(false) }}
                    className="text-gray-400 hover:text-gray-600 transition text-lg leading-none">×</button>
                </div>

                {editingBooking ? (
                  /* ── Edit mode ── */
                  <div className="px-5 py-4 space-y-4">
                    {/* Read-only context */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm pb-3 border-b border-gray-100">
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide">Date</p>
                        <p className="font-semibold text-gray-800 mt-0.5">{bStart.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide">Start Time</p>
                        <p className="font-semibold text-gray-800 mt-0.5">{bStart.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                      </div>
                    </div>

                    {/* Court */}
                    {(() => {
                      const newEnd = new Date(bStart.getTime() + editForm.duration * 3600000)
                      const available = courts.filter(c =>
                        c.id === b.court_id ||
                        !bookings.some(bk =>
                          bk.id !== b.id &&
                          bk.court_id === c.id &&
                          new Date(bk.start_time) < newEnd &&
                          new Date(bk.end_time) > bStart
                        )
                      )
                      return (
                        <div>
                          <p className="text-xs font-medium text-gray-600 mb-2">Court</p>
                          <div className="flex flex-wrap gap-2">
                            {available.map(c => (
                              <button key={c.id} type="button"
                                onClick={() => {
                                  const mt = editForm.matchType === 'ball_machine' && !c.has_ball_machine ? 'casual' : editForm.matchType
                                  setEditForm(f => ({ ...f, courtId: c.id, matchType: mt, playersNeeded: PLAYERS_BY_TYPE[mt] ?? 0 }))
                                }}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${editForm.courtId === c.id ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                {c.name}
                                {c.id === b.court_id && editForm.courtId !== c.id && (
                                  <span className="ml-1.5 text-xs opacity-60">current</span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Duration */}
                    <div>
                      <p className="text-xs font-medium text-gray-600 mb-2">Duration</p>
                      <div className="flex gap-2">
                        {DURATIONS.map(d => (
                          <button key={d.hours} type="button" onClick={() => setEditForm(f => ({ ...f, duration: d.hours }))}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${editForm.duration === d.hours ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Match type */}
                    <div>
                      <p className="text-xs font-medium text-gray-600 mb-2">Match Type</p>
                      <div className="flex flex-wrap gap-2">
                        {MATCH_TYPES
                          .filter(m => !m.ballMachineOnly || courts.find(c => c.id === editForm.courtId)?.has_ball_machine)
                          .map(m => (
                            <button key={m.value} type="button"
                              onClick={() => setEditForm(f => ({ ...f, matchType: m.value, playersNeeded: PLAYERS_BY_TYPE[m.value] ?? 0 }))}
                              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${editForm.matchType === m.value ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                              {m.label}
                            </button>
                          ))}
                      </div>
                    </div>


                    {/* Players — roster management */}
                    {editForm.matchType !== 'ball_machine' && (() => {
                      const maxCap: Record<string, number> = { casual: 2, singles: 2, doubles: 4, ball_machine: 1 }
                      const cap = maxCap[editForm.matchType] ?? 2
                      const roster = activeBookingRoster?.bookingId === b.id ? activeBookingRoster : null
                      const full = roster !== null && roster.players.length >= cap
                      return (
                        <div>
                          <p className="text-xs font-medium text-gray-600 mb-2">
                            Players <span className="font-normal text-gray-400">({roster ? `${roster.players.length}/${cap}` : '…'})</span>
                          </p>

                          {/* Current roster */}
                          {roster && (
                            <div className="space-y-1.5 mb-3 border border-gray-100 rounded-lg p-3 bg-gray-50">
                              {roster.players.map(p => (
                                <div key={p.id} className="flex items-center gap-2 text-sm">
                                  <span className="w-5 h-5 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs shrink-0">✓</span>
                                  <span className="font-medium text-gray-800 truncate">{p.player_name}</span>
                                  {p.is_host && <span className="text-xs text-gray-400 shrink-0">(Host)</span>}
                                  {p.is_guest && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 rounded shrink-0">Guest</span>}
                                  {!p.is_host && (
                                    <button onClick={() => removePlayer(b.id, p.id)}
                                      className="ml-auto text-xs text-red-400 hover:text-red-600 shrink-0 transition">
                                      Remove
                                    </button>
                                  )}
                                </div>
                              ))}
                              {roster.invitations.filter(i => i.status === 'pending').map(i => (
                                <div key={i.id} className="flex items-center gap-2 text-sm">
                                  <span className="w-5 h-5 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center text-xs shrink-0">⏳</span>
                                  <span className="text-gray-500 truncate">{i.invitee_name}</span>
                                  {i.is_guest && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 rounded shrink-0">Guest</span>}
                                  <button onClick={() => api.invitations.cancel(i.id).then(() => refreshRoster(b.id))}
                                    className="ml-auto text-xs text-red-400 hover:text-red-600 shrink-0 transition">
                                    Cancel
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Invite friends */}
                          {friends.length > 0 && !full && addPlayerMode === null && (
                            <div className="mb-2">
                              <p className="text-xs text-gray-500 mb-1.5">Invite via email:</p>
                              <div className="flex flex-wrap gap-1.5">
                                {friends.map(f => {
                                  const email = f.friend_email || ''
                                  const joined = roster?.players.some(p => p.player_email === email)
                                  const invited = roster?.invitations.some(i => i.invitee_email === email && i.status !== 'declined')
                                  return (
                                    <button key={f.id}
                                      onClick={() => !invited && !joined && !inviting && sendInvite(b.id, f)}
                                      disabled={invited || joined || inviting}
                                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition
                                        ${joined ? 'bg-green-100 text-green-700 cursor-default' :
                                          invited ? 'bg-yellow-50 text-yellow-600 border border-yellow-200 cursor-default' :
                                          'bg-white border border-gray-200 text-gray-700 hover:border-green-400 hover:text-green-700'}`}>
                                      {joined ? '✓ ' : invited ? '⏳ ' : '✉️ '}{f.friend_name}
                                      {f.is_guest && <span className="ml-1 opacity-50">(G)</span>}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* Add directly */}
                          {!full && addPlayerMode === null && (
                            <div className="flex gap-2">
                              <button onClick={() => setAddPlayerMode('member')}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-700 hover:border-blue-400 hover:text-blue-700 transition">
                                + Member
                              </button>
                              <button onClick={() => setAddPlayerMode('guest')}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-700 hover:border-orange-400 hover:text-orange-700 transition">
                                + Guest
                              </button>
                            </div>
                          )}
                          {full && (
                            <p className="text-xs text-gray-400 italic">Booking is full ({roster!.players.length}/{cap} players).</p>
                          )}

                          {/* Member search */}
                          {addPlayerMode === 'member' && (
                            <div className="space-y-1.5">
                              <input
                                value={addPlayerQuery}
                                onChange={e => searchPlayers(e.target.value)}
                                placeholder="Search by name or email…"
                                autoFocus
                                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                              />
                              {addPlayerResults.length > 0 && (
                                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white max-h-36 overflow-y-auto">
                                  {addPlayerResults.map(m => (
                                    <div key={m.id} className="flex items-center justify-between px-3 py-1.5">
                                      <div>
                                        <div className="text-xs font-medium text-gray-800">{m.first_name} {m.last_name}</div>
                                        <div className="text-xs text-gray-400">{m.email}</div>
                                      </div>
                                      <button
                                        onClick={() => addMemberPlayer(b.id, m.id)}
                                        disabled={addingPlayer || roster?.players.some(p => p.player_email === m.email)}
                                        className="text-xs bg-green-700 text-white px-2 py-1 rounded hover:bg-green-800 transition disabled:opacity-50">
                                        {roster?.players.some(p => p.player_email === m.email) ? '✓' : 'Add'}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <button onClick={() => { setAddPlayerMode(null); setAddPlayerQuery(''); setAddPlayerResults([]) }}
                                className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                            </div>
                          )}

                          {/* Guest form */}
                          {addPlayerMode === 'guest' && (
                            <form onSubmit={e => addGuestPlayer(e, b.id)} className="space-y-2">
                              <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                                ⚠️ A <strong>$5.00 guest fee</strong> will be added to your next quarterly dues.
                              </p>
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
                      )
                    })()}

                    {editError && <p className="text-red-600 text-sm">{editError}</p>}

                    <div className="flex gap-3 pt-1">
                      <button onClick={() => saveEdit(b)} disabled={editLoading}
                        className="px-5 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50">
                        {editLoading ? 'Saving…' : 'Save Changes'}
                      </button>
                      <button onClick={() => { setEditingBooking(false); setAddPlayerMode(null); setAddPlayerQuery(''); setAddPlayerResults([]) }}
                        className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                        Back
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── View mode ── */
                  <>
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
                    </div>
                    {/* Roster — shown for host's own bookings */}
                    {isMe && !isBallMachine && (() => {
                      const roster = rosterMap[b.id]
                      if (!roster) return (
                        <div className="px-5 pb-3 text-xs text-gray-400">Loading players…</div>
                      )
                      const pending  = roster.invitations.filter(i => i.status === 'pending')
                      const declined = roster.invitations.filter(i => i.status === 'declined')
                      if (roster.players.length === 0 && pending.length === 0) return null
                      return (
                        <div className="px-5 pb-3 border-t border-gray-100 pt-3 space-y-1.5">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Players</p>
                          {roster.players.map(p => (
                            <div key={p.id} className="flex items-center gap-2 text-sm">
                              <span className="w-5 h-5 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs shrink-0">✓</span>
                              <span className="font-medium text-gray-800">{p.player_name}</span>
                              {p.is_host && <span className="text-xs text-gray-400">(Host)</span>}
                              {p.is_guest && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 rounded">Guest</span>}
                            </div>
                          ))}
                          {pending.map(i => (
                            <div key={i.id} className="flex items-center gap-2 text-sm">
                              <span className="w-5 h-5 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center text-xs shrink-0">⏳</span>
                              <span className="text-gray-600">{i.invitee_name}</span>
                              <span className="text-xs text-yellow-600 font-medium">Invited</span>
                            </div>
                          ))}
                          {declined.map(i => (
                            <div key={i.id} className="flex items-center gap-2 text-sm text-gray-400">
                              <span className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-xs shrink-0">✗</span>
                              <span>{i.invitee_name}</span>
                              <span className="text-xs">declined</span>
                            </div>
                          ))}
                        </div>
                      )
                    })()}

                    {canEdit && (
                      <div className="px-5 pb-4 flex items-center gap-4">
                        <button onClick={() => openEdit(b)}
                          className="text-sm text-green-700 hover:text-green-900 font-medium transition">
                          Edit booking
                        </button>
                        <span className="text-gray-200">|</span>
                        <button onClick={() => { handleCancel(b.id); setBookingDetail(null) }}
                          className="text-sm text-red-500 hover:text-red-700 font-medium transition">
                          Cancel this booking
                        </button>
                      </div>
                    )}
                  </>
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
                        const extraPlayers = (booking.players ?? []).slice(1)
                        return (
                          <td key={c.id} className="px-2 py-1 align-top">
                            {showDetails ? (
                              <div
                                onClick={() => setBookingDetail(bookingDetail?.id === booking.id ? null : booking)}
                                className={`rounded-lg px-2 py-1.5 flex flex-col gap-0.5 cursor-pointer hover:opacity-90 transition ${isMe ? 'bg-green-600 text-white' : 'bg-green-100 text-green-800'}`}>
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
                                {(() => {
                                  const r = isMe ? rosterMap[booking.id] : null
                                  const pending = r?.invitations.filter(i => i.status === 'pending') ?? []
                                  const showPlayers = extraPlayers.length > 0 || pending.length > 0
                                  if (!showPlayers) return null
                                  return (
                                    <div className={`text-xs mt-0.5 pt-0.5 border-t space-y-0.5 ${isMe ? 'border-green-500' : 'border-green-200'}`}>
                                      {extraPlayers.map((name, i) => (
                                        <div key={i} className="truncate leading-tight">{name.split(' ')[0]}</div>
                                      ))}
                                      {pending.map(inv => (
                                        <div key={inv.id} className="truncate leading-tight text-yellow-300">
                                          ⏳ {inv.invitee_name.split(' ')[0]}
                                        </div>
                                      ))}
                                    </div>
                                  )
                                })()}
                              </div>
                            ) : (
                              <div className={`rounded h-7 ${isMe ? 'bg-green-600' : 'bg-green-100'}`} />
                            )}
                          </td>
                        )
                      }

                      return (
                        <td key={c.id} className="px-2 py-1 align-top">
                          <button
                            onClick={() => !past && handleSlotClick(c.id, hour, c.name)}
                            disabled={past}
                            className={`w-full h-14 rounded-lg border transition text-xs font-medium
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
                          </div>
                          {/* Compact roster status */}
                          {rosterMap[b.id] && b.match_type !== 'ball_machine' && (() => {
                            const r = rosterMap[b.id]
                            const pending = r.invitations.filter(i => i.status === 'pending')
                            const declined = r.invitations.filter(i => i.status === 'declined')
                            return (
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {r.players.map(p => (
                                  <span key={p.id} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium
                                    ${p.is_host ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                    ✓ {p.player_name.split(' ')[0]}{p.is_host ? ' (you)' : ''}
                                  </span>
                                ))}
                                {pending.map(i => (
                                  <span key={i.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 font-medium">
                                    ⏳ {i.invitee_name.split(' ')[0]}
                                  </span>
                                ))}
                                {declined.map(i => (
                                  <span key={i.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-medium">
                                    ✗ {i.invitee_name.split(' ')[0]}
                                  </span>
                                ))}
                              </div>
                            )
                          })()}
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
                          {(() => {
                            const maxPlayers: Record<string, number> = { casual: 2, singles: 2, doubles: 4, ball_machine: 1 }
                            const cap = maxPlayers[b.match_type ?? 'casual'] ?? 2
                            const full = roster !== null && roster.players.length >= cap
                            if (full) {
                              return (
                                <p className="text-xs text-gray-400 italic">
                                  Booking is full ({roster!.players.length}/{cap} players).
                                </p>
                              )
                            }
                            return null
                          })()}
                          {addPlayerMode === null && (() => {
                            const maxPlayers: Record<string, number> = { casual: 2, singles: 2, doubles: 4, ball_machine: 1 }
                            const cap = maxPlayers[b.match_type ?? 'casual'] ?? 2
                            const full = roster !== null && roster.players.length >= cap
                            if (full) return null
                            return (
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
                            )
                          })()}

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
                              <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                                ⚠️ A <strong>$5.00 guest fee</strong> will be added to your next quarterly dues for each guest.
                              </p>
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

      {showTutorial && <BookingTutorial onClose={() => setShowTutorial(false)} />}
    </div>
  )
}

const TUTORIAL_STEPS = [
  {
    icon: '📅',
    title: 'Pick a Date',
    body: 'Use the ← Prev / Next → arrows to browse days, or click Today to jump back. You can also type a date directly into the date field. Courts can be booked up to the number of days ahead set by the admin.',
  },
  {
    icon: '🟩',
    title: 'Choose an Open Slot',
    body: 'The grid shows every court across the top and hours down the side (8 AM – 8 PM). White cells are available — click one to start a booking. Gray cells are in the past. Green cells are already taken.',
  },
  {
    icon: '⏱',
    title: 'Set Duration & Match Type',
    body: 'After clicking a slot, choose 1 hour or 1½ hours. Then select your match type: Hit Session (casual solo or informal play), Singles (1v1), Doubles (2v2), or Ball Machine (Court 3 only).',
  },
  {
    icon: '👥',
    title: 'Add Players (Optional)',
    body: 'You can invite friends by email or add them directly to your roster. Use "Invite" to send an email invite they can accept or decline. Use "Add Directly" to place a member or guest on the roster immediately without waiting for a response.',
  },
  {
    icon: '✅',
    title: 'Review & Confirm',
    body: 'Click "Review Booking →" to see a full summary — court, date, time, duration, match type, and any players. If everything looks right, click Confirm to lock in the reservation.',
  },
  {
    icon: '🔍',
    title: 'View Booking Details',
    body: 'Click any booked slot on the grid to see full details: who booked it, the time range, duration, and match type. You can cancel your own bookings from the detail panel.',
  },
  {
    icon: '📋',
    title: 'My Bookings Tab',
    body: 'Switch to "My Bookings" to see all your upcoming reservations in one place. From there you can manage your roster, send additional invites, add players, and cancel bookings.',
  },
  {
    icon: '🚫',
    title: 'Cancellations',
    body: 'To cancel, click the ✕ on a booked cell in the grid, use the "Cancel this booking" link in the detail panel, or click Cancel on the booking card in the My Bookings tab.',
  },
]

function BookingTutorial({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const current = TUTORIAL_STEPS[step]
  const isLast = step === TUTORIAL_STEPS.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-green-700 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base">How to Book a Court</h2>
            <p className="text-green-200 text-xs mt-0.5">Step {step + 1} of {TUTORIAL_STEPS.length}</p>
          </div>
          <button onClick={onClose} className="text-green-200 hover:text-white transition text-xl leading-none">×</button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-green-100">
          <div
            className="h-1 bg-green-600 transition-all duration-300"
            style={{ width: `${((step + 1) / TUTORIAL_STEPS.length) * 100}%` }}
          />
        </div>

        {/* Step content */}
        <div className="px-6 py-6">
          <div className="flex items-start gap-4">
            <span className="text-4xl shrink-0">{current.icon}</span>
            <div>
              <h3 className="font-bold text-gray-800 text-lg mb-2">{current.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{current.body}</p>
            </div>
          </div>
        </div>

        {/* Step dots */}
        <div className="flex justify-center gap-1.5 pb-2">
          {TUTORIAL_STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`w-2 h-2 rounded-full transition ${i === step ? 'bg-green-600' : 'bg-gray-200 hover:bg-gray-300'}`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-30 disabled:cursor-not-allowed">
            ← Back
          </button>
          {isLast ? (
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-bold transition">
              Done — Let's Book!
            </button>
          ) : (
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex-1 px-4 py-2.5 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-bold transition">
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
