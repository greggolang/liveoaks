import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api, MemberMessage, Poll } from '../api/client'
import { WeatherData, AirQualityData, weatherIcon, weatherLabel, courtCondition, conditionColors, dayLabel, aqiLabel, aqiColor, aqiEmoji } from '../utils/weather'

interface InviteResponse {
  id: string
  invitee_name: string
  status: 'accepted' | 'declined'
  court_name: string
  start_time: string
}

interface Booking {
  id: string; court_id: number; start_time: string; end_time: string
  match_type?: string; players_needed?: number; notes?: string
  invites_pending?: number; invites_declined?: number
  user: { first_name: string; last_name: string }
  court: { name: string; number: number }
  players?: string[]
}
interface PendingInvite {
  id: string; token: string; court_name: string
  start_time: string; end_time: string; inviter_name: string
}
interface SentPending {
  id: string; booking_id: string; invitee_name: string; court_name: string
  start_time: string; sent_at: string
}
interface InviteResponseAlert {
  id: string; booking_id: string; invitee_name: string; status: 'accepted' | 'declined'
  court_name: string; start_time: string
}
interface Dues {
  id: string; amount: number; due_date: string; status: string; paid_at?: string
}
interface Event {
  id: string; title: string; start_time: string; event_type: string
  signup_enabled?: boolean
}
type SubmitState = 'idle' | 'sending' | 'done' | 'error'

interface Announcement {
  id: string; title: string; body: string; created_at: string
  author_first_name: string; author_last_name: string
  require_confirmation: boolean; confirmed: boolean
}

function readKey(userId: string) { return `news_read_${userId}` }

function loadRead(userId: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(readKey(userId)) || '[]')) }
  catch { return new Set() }
}

function saveRead(userId: string, ids: Set<string>) {
  localStorage.setItem(readKey(userId), JSON.stringify([...ids]))
}

// Parses "Court available: Court 1 on Tuesday, June 2, 8:00 AM – …" into a bookings URL.
function courtAlertBookUrl(message: string): string | null {
  if (!message.startsWith('Court available:')) return null
  const courtMatch = message.match(/^Court available: (.+?) on /)
  const dateMatch  = message.match(/\bon \w+, (\w+ \d+),/)
  const timeMatch  = message.match(/, (\d+:\d+ (?:AM|PM)) –/)
  if (!dateMatch) return null

  const now = new Date()
  let d = new Date(`${dateMatch[1]} ${now.getFullYear()}`)
  if (isNaN(d.getTime())) return null
  if (d < now) d = new Date(`${dateMatch[1]} ${now.getFullYear() + 1}`)

  const params = new URLSearchParams({ tab: 'grid', date: d.toISOString().slice(0, 10) })
  if (courtMatch) params.set('court', courtMatch[1])
  if (timeMatch) {
    const t = timeMatch[1].match(/^(\d+):(\d+) (AM|PM)$/)
    if (t) {
      let h = parseInt(t[1])
      if (t[3] === 'PM' && h !== 12) h += 12
      if (t[3] === 'AM' && h === 12) h = 0
      params.set('start', `${String(h).padStart(2, '0')}:${t[2]}`)
    }
  }
  return `/bookings?${params}`
}

export default function Dashboard() {
  const { user, isBoard } = useAuth()
  const navigate = useNavigate()
  const [idea, setIdea] = useState('')
  const [ideaState, setIdeaState] = useState<SubmitState>('idle')
  const [myBookings, setMyBookings] = useState<Booking[]>([])
  const [bookingCountdown, setBookingCountdown] = useState(15)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [airQuality, setAirQuality] = useState<AirQualityData | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [inbox, setInbox] = useState<MemberMessage[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [sentPending, setSentPending] = useState<SentPending[]>([])
  const [responseAlerts, setResponseAlerts] = useState<InviteResponseAlert[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ duration: 1.5, matchType: 'casual', startSlot: 0 })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [dues, setDues] = useState<Dues[]>([])
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([])
  const [cameraURL, setCameraURL] = useState<string | null>(null)
  const [cameraDown, setCameraDown] = useState(false)
  const [adminAlerts, setAdminAlerts] = useState<{ id: string; message: string; type: string }[]>([])
  const [polls, setPolls] = useState<Poll[]>([])
  const [pollVoting, setPollVoting] = useState<string | null>(null)
  const [myBalance, setMyBalance] = useState<{ dues_owed: number; kiosk_tab: number; charges_owed: number; total: number } | null>(null)
  const [showStatement, setShowStatement] = useState(false)
  const [statement, setStatement] = useState<import('../api/client').StatementEntry[] | null>(null)
  const [friends, setFriends] = useState<{id: string; friend_user_id?: string; friend_name: string; friend_email?: string; is_guest: boolean}[]>([])
  const [directory, setDirectory] = useState<{id: string; first_name: string; last_name: string; email: string}[]>([])
  const [invitingFor, setInvitingFor] = useState<{bookingId: string; alertId: string} | null>(null)
  const [inviteSearch, setInviteSearch] = useState('')
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteSent, setInviteSent] = useState(false)
  const [toasts, setToasts] = useState<InviteResponse[]>([])
  const [newFeedback, setNewFeedback] = useState<{id: string; message: string; type: string; created_at: string; first_name: string; last_name: string}[]>([])
  const [liveballInvites, setLiveballInvites] = useState<{id: string; event_id: string; title: string; start_time: string; max_players: number; status: string; token: string; position?: number}[]>([])
  const [liveballResponding, setLiveballResponding] = useState<Set<string>>(new Set())
  const [boardMeetingInvites, setBoardMeetingInvites] = useState<{id: string; event_id: string; token: string; status: string; title: string; start_time: string; end_time?: string; location?: string}[]>([])
  const seenIds = useRef<Set<string>>(new Set())
  const dismissedAlertIds = useRef<Set<string>>(new Set())

  // Persist dismissed response alert IDs across page loads
  const dismissedKey = user?.id ? `response_dismissed_${user.id}` : null
  useEffect(() => {
    if (!dismissedKey) return
    try {
      const saved: string[] = JSON.parse(localStorage.getItem(dismissedKey) || '[]')
      saved.forEach(id => dismissedAlertIds.current.add(id))
    } catch {}
  }, [dismissedKey])

  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  const dismissAlert = (id: string) => {
    dismissedAlertIds.current.add(id)
    setResponseAlerts(prev => prev.filter(ra => ra.id !== id))
    if (dismissedKey) {
      try {
        const saved: string[] = JSON.parse(localStorage.getItem(dismissedKey) || '[]')
        localStorage.setItem(dismissedKey, JSON.stringify([...new Set([...saved, id])]))
      } catch {}
    }
  }

  const checkResponses = useCallback(async () => {
    try {
      const data = await api.invitations.responses() as InviteResponse[]
      const unseen = data.filter(r => !seenIds.current.has(r.id))
      if (unseen.length > 0) {
        unseen.forEach(r => seenIds.current.add(r.id))
        setToasts(prev => [...prev, ...unseen])
      }
    } catch {}
  }, [])

  const refreshAlerts = useCallback(() => {
    api.invitations.pending().then(d => setPendingInvites(d as PendingInvite[])).catch(() => {})
    api.invitations.sentPending().then(d => setSentPending(d as SentPending[])).catch(() => {})
    api.invitations.responses().then(d =>
      setResponseAlerts((d as InviteResponseAlert[]).filter(r => !dismissedAlertIds.current.has(r.id)))
    ).catch(() => {})
    api.memberAlerts.getMyAlerts().then(d => setAdminAlerts(d)).catch(() => {})
  }, [])

  const refreshSlow = useCallback(() => {
    api.messages.inbox().then(d => setInbox(d)).catch(() => {})
    api.liveball.myInvitations().then(d => setLiveballInvites(d as any[])).catch(() => {})
    api.boardMeetings.myInvitations().then(d => setBoardMeetingInvites(d as any[])).catch(() => {})
    api.announcements.list().then(d => setAnnouncements(d as Announcement[])).catch(() => {})
    api.polls.list().then(setPolls).catch(() => {})
  }, [])

  useEffect(() => {
    checkResponses()
    const responseInterval = setInterval(checkResponses, 30000)
    const alertInterval   = setInterval(refreshAlerts, 10000)
    const slowInterval    = setInterval(refreshSlow, 30000)
    return () => { clearInterval(responseInterval); clearInterval(alertInterval); clearInterval(slowInterval) }
  }, [checkResponses, refreshAlerts, refreshSlow])

  // Refresh immediately when the tab becomes visible again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      checkResponses()
      refreshAlerts()
      refreshSlow()
      api.bookings.mine().then(d => setMyBookings(d as Booking[])).catch(() => {})
      setBookingCountdown(15)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [checkResponses, refreshAlerts, refreshSlow])

  useEffect(() => {
    if (!isBoard) return
    const checkCamera = () =>
      api.camera.adminStatus().then(d => setCameraDown(!d.online)).catch(() => {})
    checkCamera()
    const cameraInterval = setInterval(checkCamera, 60000)
    return () => clearInterval(cameraInterval)
  }, [isBoard])

  useEffect(() => {
    if (user?.id) {
      setReadIds(loadRead(user.id))
    }
  }, [user?.id])

  useEffect(() => {
    api.announcements.list().then(d => setAnnouncements(d as Announcement[]))
    api.messages.inbox().then(d => setInbox(d)).catch(() => {})
    api.memberAlerts.getMyAlerts().then(d => setAdminAlerts(d)).catch(() => {})
    api.finance.myBalance().then(d => setMyBalance(d)).catch(() => {})
    api.camera.embedURL().then(d => setCameraURL(d.url)).catch(() => setCameraURL('/camera'))
    api.weather.get().then(d => setWeather(d as WeatherData)).catch(() => {})
    api.weather.airQuality().then(d => setAirQuality(d as AirQualityData)).catch(() => {})
    api.invitations.pending().then(d => setPendingInvites(d as PendingInvite[])).catch(() => {})
    api.liveball.myInvitations().then(d => setLiveballInvites(d as any[])).catch(() => {})
    api.boardMeetings.myInvitations().then(d => setBoardMeetingInvites(d as any[])).catch(() => {})
    if (isBoard) api.feedback.newItems().then(d => setNewFeedback(d as any[])).catch(() => {})
    api.invitations.sentPending().then(d => setSentPending(d as SentPending[])).catch(() => {})
    api.invitations.responses().then(d =>
      setResponseAlerts((d as InviteResponseAlert[]).filter(r => !dismissedAlertIds.current.has(r.id)))
    ).catch(() => {})
    api.dues.myDues().then(d => setDues(d as Dues[])).catch(() => {})
    api.friends.list().then(d => setFriends(d as any[])).catch(() => {})
    api.members.directory().then(d => setDirectory((d as any[]).map(m => ({ id: m.id, first_name: m.first_name, last_name: m.last_name, email: m.email })))).catch(() => {})
    api.events.list().then(d => {
      const now = new Date()
      const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      setUpcomingEvents((d as Event[]).filter(e => {
        const t = new Date(e.start_time)
        return t >= now && t <= in7days
      }))
    }).catch(() => {})
    const refreshBookings = () => api.bookings.mine().then(d => setMyBookings(d as Booking[]))
    refreshBookings()
    const timer = setInterval(() => {
      setBookingCountdown(c => {
        if (c <= 1) { refreshBookings(); return 15 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const openEdit = (b: Booking) => {
    const dHours = (new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 3600000
    const s = new Date(b.start_time)
    const startSlot = s.getHours() + s.getMinutes() / 60
    setEditForm({ duration: dHours <= 1 ? 1 : 1.5, matchType: b.match_type ?? 'casual', startSlot })
    setEditError('')
    setEditingId(b.id)
  }

  const saveEdit = async (b: Booking) => {
    setEditSaving(true)
    setEditError('')
    try {
      const orig = new Date(b.start_time)
      const dateStr = `${orig.getFullYear()}-${String(orig.getMonth()+1).padStart(2,'0')}-${String(orig.getDate()).padStart(2,'0')}`
      const h = Math.floor(editForm.startSlot)
      const m = editForm.startSlot % 1 === 0.5 ? '30' : '00'
      const newStart = new Date(`${dateStr}T${String(h).padStart(2,'0')}:${m}:00`)
      const newEnd = new Date(newStart.getTime() + editForm.duration * 3600000)
      await api.bookings.update(b.id, {
        match_type: editForm.matchType,
        players_needed: 0,
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        court_id: b.court_id,
      })
      setEditingId(null)
      api.bookings.mine().then(d => setMyBookings(d as Booking[]))
    } catch (err: any) {
      setEditError(err.message)
    } finally { setEditSaving(false) }
  }

  const cancelBooking = async (id: string) => {
    if (!confirm('Cancel this booking?')) return
    await api.bookings.delete(id)
    setEditingId(null)
    api.bookings.mine().then(d => setMyBookings(d as Booking[]))
  }

  const markRead = (id: string, requireConfirmation: boolean) => {
    if (!user?.id) return
    if (requireConfirmation) {
      // Server-side: confirm and refresh so the server state drives visibility
      api.announcements.confirmRead(id).then(() => {
        api.announcements.list().then(d => setAnnouncements(d as Announcement[]))
      }).catch(() => {})
    } else {
      // Local-only dismiss for non-confirmation announcements
      const next = new Set(readIds).add(id)
      setReadIds(next)
      saveRead(user.id, next)
    }
  }

  const unread = announcements.filter(a => {
    if (a.require_confirmation) return !a.confirmed
    return !readIds.has(a.id)
  })

  return (
    <div className="space-y-8">
      {/* Invite response toasts */}
      {toasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end">
          {toasts.map(t => (
            <Toast key={t.id} response={t} onDismiss={() => dismissToast(t.id)} />
          ))}
        </div>
      )}
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">
          Welcome back, {user?.first_name}!
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">Here's what's happening at the club.</p>
      </div>

      {/* Member polls — unvoted full-width, voted shrinks to compact right-side cards */}
      {polls.length > 0 && (() => {
        const unvoted = polls.filter(p => !p.has_voted)
        const voted   = polls.filter(p => p.has_voted)
        const pct = (poll: Poll, opt: string) =>
          poll.total_votes === 0 ? 0 : Math.round(((poll.results[opt] ?? 0) / poll.total_votes) * 100)

        const vote = async (pollId: string, option: string) => {
          setPollVoting(pollId)
          try {
            await api.polls.vote(pollId, option)
            api.polls.list().then(setPolls).catch(() => {})
          } catch {}
          setPollVoting(null)
        }

        return (
          <div className="space-y-3">
            {/* Unvoted: full-width vote cards */}
            {unvoted.map(poll => (
              <div key={poll.id} className="bg-white border border-lota-200 rounded-xl shadow-sm px-5 py-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-lota-600">Member Poll</span>
                  <span className="text-xs text-gray-400">· {poll.total_votes} vote{poll.total_votes !== 1 ? 's' : ''} so far · Anonymous</span>
                </div>
                <p className="font-semibold text-gray-800 mb-3">{poll.question}</p>
                <div className="space-y-2">
                  {poll.options.map(opt => (
                    <button key={opt}
                      onClick={() => vote(poll.id, opt)}
                      disabled={pollVoting === poll.id}
                      className="w-full text-left border border-gray-200 hover:border-lota-400 hover:bg-lota-50 rounded-lg px-4 py-2.5 text-sm text-gray-700 transition disabled:opacity-50"
                    >{opt}</button>
                  ))}
                </div>
              </div>
            ))}

            {/* Voted: compact mini-cards aligned to the right */}
            {voted.length > 0 && (
              <div className="flex flex-wrap justify-end gap-2">
                {voted.map(poll => (
                  <div key={poll.id} className="bg-white border border-gray-200 rounded-xl shadow-sm px-3 py-2.5 w-52 shrink-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-semibold text-lota-600">Poll</span>
                      <span className="text-xs text-green-600 font-medium">· Voted ✓</span>
                    </div>
                    <p className="text-xs font-medium text-gray-700 leading-snug line-clamp-2 mb-2">{poll.question}</p>
                    <div className="space-y-1">
                      {poll.options.map(opt => (
                        <div key={opt}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className={`truncate ${poll.my_vote === opt ? 'font-semibold text-lota-700' : 'text-gray-500'}`}>
                              {poll.my_vote === opt ? '✓ ' : ''}{opt}
                            </span>
                            <span className="text-gray-400 ml-1 shrink-0">{pct(poll, opt)}%</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1">
                            <div
                              className={`h-1 rounded-full ${poll.my_vote === opt ? 'bg-lota-500' : 'bg-gray-300'}`}
                              style={{ width: `${pct(poll, opt)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">{poll.total_votes} vote{poll.total_votes !== 1 ? 's' : ''}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* Account balance — click to view full statement */}
      {myBalance && myBalance.total > 0 && (
        <button
          onClick={() => {
            setShowStatement(true)
            if (!statement) api.finance.myStatement().then(d => setStatement(d)).catch(() => setStatement([]))
          }}
          className="w-full flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition text-left"
        >
          <span className="text-2xl shrink-0">💳</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">Account Balance</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {myBalance.dues_owed > 0 && `Dues: $${myBalance.dues_owed.toFixed(2)}`}
              {myBalance.dues_owed > 0 && myBalance.kiosk_tab > 0 && '  ·  '}
              {myBalance.kiosk_tab > 0 && `Kiosk tab: $${myBalance.kiosk_tab.toFixed(2)}`}
              {(myBalance.dues_owed > 0 || myBalance.kiosk_tab > 0) && myBalance.charges_owed > 0 && '  ·  '}
              {myBalance.charges_owed > 0 && `Other charges: $${myBalance.charges_owed.toFixed(2)}`}
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold text-gray-800">${myBalance.total.toFixed(2)}</p>
        </button>
      )}

      {/* Statement modal */}
      {showStatement && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowStatement(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">My Account</h2>
              <button onClick={() => setShowStatement(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
              {statement === null ? (
                <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
              ) : statement.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No transactions found.</p>
              ) : statement.map(e => {
                const isCredit = e.category === 'kiosk_payment'
                const categoryLabel: Record<string, string> = {
                  dues: 'Dues', kiosk: 'Pro Shop', kiosk_payment: 'Payment', charge: 'Charge',
                }
                const statusColor: Record<string, string> = {
                  unpaid: 'text-red-500', paid: 'text-green-600', charged: 'text-gray-500', waived: 'text-gray-400',
                }
                return (
                  <div key={e.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">{e.description}</p>
                      <p className="text-xs text-gray-400">{categoryLabel[e.category] ?? e.category} · {e.date}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-medium ${isCredit ? 'text-green-600' : 'text-gray-800'}`}>
                        {isCredit ? '−' : ''}${e.amount.toFixed(2)}
                      </p>
                      <p className={`text-xs ${statusColor[e.status] ?? 'text-gray-400'}`}>{e.status}</p>
                    </div>
                  </div>
                )
              })}
            </div>
            {myBalance && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
                <p className="text-sm font-semibold text-gray-700">Total Outstanding</p>
                <p className="text-sm font-semibold text-gray-800">${myBalance.total.toFixed(2)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin-sent member alerts */}
      {adminAlerts.length > 0 && (
        <div className="space-y-2">
          {adminAlerts.map(a => {
            const styles: Record<string, string> = {
              info:    'bg-blue-50 border-blue-200 text-blue-800',
              warning: 'bg-amber-50 border-amber-200 text-amber-800',
              danger:  'bg-red-50 border-red-200 text-red-800',
            }
            const icons: Record<string, string> = { info: 'ℹ️', warning: '⚠️', danger: '🚨' }
            const bookUrl = courtAlertBookUrl(a.message)
            const dismiss = () => {
              api.memberAlerts.dismiss(a.id).catch(() => {})
              setAdminAlerts(prev => prev.filter(x => x.id !== a.id))
            }
            return (
              <div key={a.id} className={`flex items-start gap-3 border rounded-xl px-4 py-3 ${styles[a.type] ?? styles.info}`}>
                <span className="text-base shrink-0">{icons[a.type] ?? icons.info}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{a.message}</p>
                  {bookUrl && (
                    <button
                      onClick={() => { dismiss(); navigate(bookUrl) }}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white text-xs font-semibold rounded-lg transition">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Book Now
                    </button>
                  )}
                </div>
                <button
                  onClick={dismiss}
                  className="shrink-0 opacity-40 hover:opacity-70 transition text-lg leading-none"
                  title="Dismiss"
                >✕</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Alerts */}
      {(() => {
        const unpaidDues = dues.filter(d => d.status !== 'paid')
        const soonBooking = myBookings.find(b => {
          const mins = (new Date(b.start_time).getTime() - Date.now()) / 60000
          return mins > 0 && mins <= 120
        })
        const openSpotBookings = myBookings.filter(b =>
          b.match_type && b.match_type !== 'ball_machine' &&
          (b.players_needed ?? 0) > 0 &&
          (b.players ?? []).length < (b.players_needed ?? 0) + 1
        )
        const alerts: React.ReactNode[] = []

        // Board meeting invitations
        boardMeetingInvites.forEach(bm => {
          const start = new Date(bm.start_time)
          const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          const timeStr = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
          if (bm.status === 'invited') {
            alerts.push(
              <div key={`bm-${bm.id}`} className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <span className="text-xl shrink-0">🏛️</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-blue-800">Board Meeting — RSVP requested</p>
                  <p className="text-xs text-blue-600 mt-0.5">{bm.title} · {dateStr} at {timeStr}</p>
                  {bm.location && <p className="text-xs text-blue-500 mt-0.5">📍 {bm.location}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={async () => {
                    await api.boardMeetings.respond(bm.token, 'accept').catch(() => {})
                    setBoardMeetingInvites(p => p.map(x => x.id === bm.id ? { ...x, status: 'accepted' } : x))
                  }}
                    className="text-xs font-semibold bg-blue-700 text-white px-3 py-1.5 rounded-lg hover:bg-blue-800 transition">
                    Accept
                  </button>
                  <button onClick={async () => {
                    await api.boardMeetings.respond(bm.token, 'decline').catch(() => {})
                    setBoardMeetingInvites(p => p.filter(x => x.id !== bm.id))
                  }}
                    className="text-xs font-semibold bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-300 transition">
                    Decline
                  </button>
                </div>
              </div>
            )
          } else if (bm.status === 'accepted') {
            alerts.push(
              <div key={`bm-${bm.id}`} className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <span className="text-xl shrink-0">✅</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-blue-800">You're confirmed for {bm.title}</p>
                  <p className="text-xs text-blue-600 mt-0.5">{dateStr} at {timeStr}{bm.location ? ` · ${bm.location}` : ''}</p>
                </div>
              </div>
            )
          }
        })

        // New feedback alerts (board members only)
        if (isBoard) {
          newFeedback.forEach(fb => {
            const isBug = fb.type === 'bug'
            alerts.push(
              <div key={`fb-${fb.id}`} className={`flex items-start gap-3 rounded-xl px-4 py-3 ${isBug ? 'bg-red-50 border border-red-200' : 'bg-indigo-50 border border-indigo-200'}`}>
                <span className="text-xl shrink-0">{isBug ? '🐛' : '💡'}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${isBug ? 'text-red-800' : 'text-indigo-800'}`}>
                    {isBug ? 'Bug report' : 'Feature request'} from {fb.first_name} {fb.last_name}
                  </p>
                  <p className={`text-xs mt-0.5 line-clamp-2 ${isBug ? 'text-red-600' : 'text-indigo-600'}`}>{fb.message}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <a href="/admin/feedback" className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${isBug ? 'bg-red-700 hover:bg-red-800 text-white' : 'bg-indigo-700 hover:bg-indigo-800 text-white'}`}>
                    View
                  </a>
                  <button onClick={async () => {
                    await api.feedback.updateStatus(fb.id, 'reviewing').catch(() => {})
                    setNewFeedback(p => p.filter(x => x.id !== fb.id))
                  }} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 transition">
                    Dismiss
                  </button>
                </div>
              </div>
            )
          })
        }

        // LiveBall invitations
        liveballInvites.forEach(lb => {
          const start = new Date(lb.start_time)
          const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          const timeStr = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

          if (lb.status === 'invited') {
            const responding = liveballResponding.has(lb.id)
            alerts.push(
              <div key={`lb-${lb.id}`} className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <span className="text-xl shrink-0">🎾</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-green-800">LiveBall invitation — spots filling fast!</p>
                  <p className="text-xs text-green-600 mt-0.5">{lb.title} · {dateStr} at {timeStr}</p>
                  <p className="text-xs text-green-500 mt-0.5">First {lb.max_players} to accept get in.</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    disabled={responding}
                    onClick={async () => {
                      setLiveballResponding(s => new Set([...s, lb.id]))
                      try {
                        await api.liveball.respond(lb.token, 'accept')
                        const fresh = await api.liveball.myInvitations()
                        setLiveballInvites(fresh as any[])
                      } catch {} finally {
                        setLiveballResponding(s => { const n = new Set(s); n.delete(lb.id); return n })
                      }
                    }}
                    className="text-xs font-semibold bg-green-700 text-white px-3 py-1.5 rounded-lg hover:bg-green-800 transition disabled:opacity-50">
                    {responding ? '…' : "I'm In →"}
                  </button>
                  <button
                    disabled={responding}
                    onClick={async () => {
                      setLiveballResponding(s => new Set([...s, lb.id]))
                      try {
                        await api.liveball.respond(lb.token, 'decline')
                        setLiveballInvites(p => p.filter(x => x.id !== lb.id))
                      } catch {} finally {
                        setLiveballResponding(s => { const n = new Set(s); n.delete(lb.id); return n })
                      }
                    }}
                    className="text-xs font-semibold bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-300 transition disabled:opacity-50">
                    Can't Make It
                  </button>
                </div>
              </div>
            )
          } else if (lb.status === 'confirmed') {
            alerts.push(
              <div key={`lb-${lb.id}`} className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <span className="text-xl shrink-0">✅</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-green-800">You're confirmed for {lb.title}!</p>
                  <p className="text-xs text-green-600 mt-0.5">{dateStr} at {timeStr} · Spot #{lb.position ?? ''}</p>
                </div>
              </div>
            )
          } else if (lb.status === 'waitlisted') {
            alerts.push(
              <div key={`lb-${lb.id}`} className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
                <span className="text-xl shrink-0">⏳</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-yellow-800">You're on the waitlist for {lb.title}</p>
                  <p className="text-xs text-yellow-600 mt-0.5">{dateStr} at {timeStr} · We'll email you if a spot opens</p>
                </div>
              </div>
            )
          }
        })

        // Invitations received — need response
        pendingInvites.forEach(inv => {
          const start = new Date(inv.start_time)
          const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          const timeStr = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
          alerts.push(
            <div key={inv.id} className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
              <span className="text-xl shrink-0">🎾</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-blue-800">Match invitation from {inv.inviter_name}</p>
                <p className="text-xs text-blue-600 mt-0.5">{inv.court_name} · {dateStr} at {timeStr}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={async () => {
                  await api.invitations.respond(inv.token, 'accept').catch(() => {})
                  setPendingInvites(p => p.filter(x => x.id !== inv.id))
                  api.bookings.mine().then(d => setMyBookings(d as Booking[]))
                }}
                  className="text-xs font-semibold bg-green-700 text-white px-3 py-1.5 rounded-lg hover:bg-green-800 transition">
                  Accept
                </button>
                <button onClick={async () => {
                  await api.invitations.respond(inv.token, 'decline').catch(() => {})
                  setPendingInvites(p => p.filter(x => x.id !== inv.id))
                }}
                  className="text-xs font-semibold bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-300 transition">
                  Decline
                </button>
              </div>
            </div>
          )
        })

        // Invitations you sent — accepted or declined
        responseAlerts.forEach(r => {
            const start = new Date(r.start_time)
            const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            const timeStr = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            const accepted = r.status === 'accepted'
            alerts.push(
              <div key={r.id} className={`flex items-start gap-3 rounded-xl px-4 py-3 ${accepted ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <span className="text-xl shrink-0">{accepted ? '✅' : '❌'}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${accepted ? 'text-green-800' : 'text-red-800'}`}>
                    {r.invitee_name} {accepted ? 'accepted' : 'declined'} your invitation
                  </p>
                  <p className={`text-xs mt-0.5 ${accepted ? 'text-green-600' : 'text-red-600'}`}>
                    {r.court_name} · {dateStr} at {timeStr}
                  </p>
                  {!accepted && (
                    <div className="mt-2 space-y-2">
                      {invitingFor?.alertId === r.id ? (
                        /* Inline invite picker */
                        <div className="bg-white border border-red-100 rounded-xl p-3 space-y-2">
                          {inviteSent ? (
                            <p className="text-xs text-green-700 font-medium">✓ Invite sent!</p>
                          ) : (<>
                            {/* Friends quick-select */}
                            {friends.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {friends.map(f => (
                                  <button key={f.id} type="button" disabled={inviteSending}
                                    onClick={async () => {
                                      setInviteSending(true)
                                      try {
                                        await api.invitations.send(r.booking_id, {
                                          invitee_user_id: f.friend_user_id || null,
                                          invitee_name: f.friend_name,
                                          invitee_email: f.friend_email || '',
                                          is_guest: f.is_guest,
                                        })
                                        setInviteSent(true)
                                        setSentPending(p => [...p, { id: 'tmp', booking_id: r.booking_id, invitee_name: f.friend_name, court_name: r.court_name, start_time: r.start_time, sent_at: new Date().toISOString() }])
                                      } catch {} finally { setInviteSending(false) }
                                    }}
                                    className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-700 hover:border-red-400 hover:text-red-700 bg-white transition disabled:opacity-50">
                                    {f.friend_name}
                                  </button>
                                ))}
                              </div>
                            )}
                            {/* Member search */}
                            <input
                              value={inviteSearch}
                              onChange={e => setInviteSearch(e.target.value)}
                              placeholder="Search member by name…"
                              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-400"
                            />
                            {inviteSearch.length >= 2 && (
                              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white max-h-32 overflow-y-auto">
                                {directory
                                  .filter(m => `${m.first_name} ${m.last_name}`.toLowerCase().includes(inviteSearch.toLowerCase()) || m.email.toLowerCase().includes(inviteSearch.toLowerCase()))
                                  .slice(0, 8)
                                  .map(m => (
                                    <div key={m.id} className="flex items-center justify-between px-3 py-1.5">
                                      <div>
                                        <div className="text-xs font-medium text-gray-800">{m.first_name} {m.last_name}</div>
                                        <div className="text-xs text-gray-400">{m.email}</div>
                                      </div>
                                      <button type="button" disabled={inviteSending}
                                        onClick={async () => {
                                          setInviteSending(true)
                                          try {
                                            await api.invitations.send(r.booking_id, {
                                              invitee_user_id: m.id,
                                              invitee_name: `${m.first_name} ${m.last_name}`,
                                              invitee_email: m.email,
                                              is_guest: false,
                                            })
                                            setInviteSent(true)
                                            setInviteSearch('')
                                          } catch {} finally { setInviteSending(false) }
                                        }}
                                        className="text-xs bg-red-700 text-white px-2 py-1 rounded hover:bg-red-800 transition disabled:opacity-50">
                                        Invite
                                      </button>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </>)}
                          <button type="button" onClick={() => { setInvitingFor(null); setInviteSearch(''); setInviteSent(false) }}
                            className="text-xs text-gray-400 hover:text-gray-600">Close</button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={async () => {
                            if (!confirm('Cancel this booking?')) return
                            await api.bookings.delete(r.booking_id).catch(() => {})
                            setResponseAlerts(prev => prev.filter(ra => ra.id !== r.id))
                            api.bookings.mine().then(d => setMyBookings(d as Booking[]))
                          }}
                            className="text-xs font-semibold bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded-lg transition">
                            Cancel Booking
                          </button>
                          <button onClick={() => { setInvitingFor({ bookingId: r.booking_id, alertId: r.id }); setInviteSearch(''); setInviteSent(false) }}
                            className="text-xs font-semibold bg-red-700 hover:bg-red-800 text-white px-3 py-1.5 rounded-lg transition">
                            Invite Someone Else →
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {accepted && (
                  <button
                    onClick={() => dismissAlert(r.id)}
                    className="text-green-400 hover:text-green-600 shrink-0 leading-none text-lg mt-0.5"
                    title="Dismiss">
                    ×
                  </button>
                )}
              </div>
            )
          })

        // Invitations you sent — still waiting for a response
        sentPending.forEach(p => {
          const start = new Date(p.start_time)
          const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          const timeStr = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
          alerts.push(
            <div key={`sp-${p.id}`} className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
              <span className="text-xl shrink-0">⏳</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-yellow-800">Waiting for {p.invitee_name} to respond</p>
                <p className="text-xs text-yellow-600 mt-0.5">{p.court_name} · {dateStr} at {timeStr}</p>
              </div>
              <Link to="/bookings" className="text-xs font-semibold text-yellow-700 hover:underline shrink-0 self-center">
                View →
              </Link>
            </div>
          )
        })

        if (soonBooking) {
          const start = new Date(soonBooking.start_time)
          const totalMins = Math.round((start.getTime() - Date.now()) / 60000)
          const hrs = Math.floor(totalMins / 60)
          const mins = totalMins % 60
          const timeUntil = hrs > 0
            ? `${hrs} hr${hrs !== 1 ? 's' : ''}${mins > 0 ? ` ${mins} min` : ''}`
            : `${totalMins} min`
          alerts.push(
            <div key="soon" className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <span className="text-xl shrink-0">⏰</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-800">Court booking in {timeUntil}</p>
                <p className="text-xs text-green-600 mt-0.5">
                  {soonBooking.court.name} · {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
              <Link to="/bookings" className="text-xs font-semibold text-green-700 hover:underline shrink-0 self-center">
                View →
              </Link>
            </div>
          )
        }

        upcomingEvents.forEach(ev => {
          const start = new Date(ev.start_time)
          const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
          alerts.push(
            <div key={ev.id} className="flex items-start gap-3 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
              <span className="text-xl shrink-0">📅</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-purple-800">{ev.title}</p>
                <p className="text-xs text-purple-600 mt-0.5">{dateStr}
                  {ev.signup_enabled && <span className="ml-2 bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-xs font-medium">Sign-ups open</span>}
                </p>
              </div>
              <Link to="/events" className="text-xs font-semibold text-purple-700 hover:underline shrink-0 self-center">
                View →
              </Link>
            </div>
          )
        })

        openSpotBookings.forEach(osb => {
          const start = new Date(osb.start_time)
          const totalSlots = (osb.players_needed ?? 0) + 1
          const confirmedCount = (osb.players ?? []).length
          const openCount = totalSlots - confirmedCount
          const pendingCount = osb.invites_pending ?? 0
          const declinedCount = osb.invites_declined ?? 0
          const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

          // Choose border/background based on urgency
          const needsAction = openCount > 0 && pendingCount === 0
          const borderCls = needsAction
            ? 'bg-red-50 border border-red-200'
            : 'bg-yellow-50 border border-yellow-200'
          const headingCls = needsAction ? 'text-red-800' : 'text-yellow-800'
          const subCls = needsAction ? 'text-red-600' : 'text-yellow-600'
          const linkCls = needsAction ? 'text-red-700' : 'text-yellow-700'
          const icon = needsAction ? '🚨' : '⏳'

          const headline = pendingCount > 0
            ? `⏳ Waiting on ${pendingCount} response${pendingCount !== 1 ? 's' : ''} — ${openCount} open spot${openCount !== 1 ? 's' : ''}`
            : `🚨 ${openCount} unfilled spot${openCount !== 1 ? 's' : ''} — invite needed`

          alerts.push(
            <div key={`os-${osb.id}`} className={`flex items-start gap-3 rounded-xl px-4 py-3 ${borderCls}`}>
              <span className="text-xl shrink-0">{icon}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${headingCls}`}>{headline}</p>
                <p className={`text-xs mt-0.5 ${subCls}`}>
                  {osb.court.name} · {dateStr} · {confirmedCount}/{totalSlots} confirmed
                  {pendingCount > 0 && ` · ${pendingCount} awaiting response`}
                  {declinedCount > 0 && ` · ${declinedCount} declined`}
                </p>
                {declinedCount > 0 && (
                  <p className="text-xs text-red-600 font-medium mt-0.5">
                    {declinedCount} player{declinedCount !== 1 ? 's' : ''} declined — invite replacements from the bookings page
                  </p>
                )}
              </div>
              <Link to="/bookings" className={`text-xs font-semibold hover:underline shrink-0 self-center ${linkCls}`}>
                Manage →
              </Link>
            </div>
          )
        })

        unpaidDues.forEach(d => {
          const overdue = new Date(d.due_date) < new Date()
          alerts.push(
            <div key={d.id} className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <span className="text-xl shrink-0">💳</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-800">
                  {overdue ? 'Overdue dues balance' : 'Dues payment due'} — ${d.amount.toFixed(2)}
                </p>
                <p className="text-xs text-red-600 mt-0.5">
                  {overdue ? 'Was due' : 'Due'} {new Date(d.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <Link to="/dues" className="text-xs font-semibold text-red-700 hover:underline shrink-0 self-center">
                View →
              </Link>
            </div>
          )
        })

        if (alerts.length === 0) return null
        return <div className="space-y-2">{alerts}</div>
      })()}

      {/* Announcements + unread messages */}
      {(() => {
        const unreadMsgs = inbox.filter(m => !m.read_at)
        if (unread.length === 0 && unreadMsgs.length === 0) return null
        type FeedItem =
          | { kind: 'announcement'; data: Announcement; date: string }
          | { kind: 'message'; data: MemberMessage; date: string }
        const feed: FeedItem[] = [
          ...unread.map(a => ({ kind: 'announcement' as const, data: a, date: a.created_at })),
          ...unreadMsgs.map(m => ({ kind: 'message' as const, data: m, date: m.created_at })),
        ].sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())

        return (
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-3">Announcements</h2>
            <div className="space-y-3">
              {feed.map(item => {
                if (item.kind === 'message') {
                  const m = item.data
                  return (
                    <button key={`msg-${m.id}`} type="button"
                      onClick={() => navigate('/messages')}
                      className="w-full text-left bg-white border border-blue-200 rounded-xl p-5 shadow-sm flex gap-4 items-start hover:shadow-md transition-shadow">
                      <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">Message</span>
                          <span className="text-xs text-gray-400">from {m.sender_name}</span>
                        </div>
                        <p className="font-semibold text-gray-800 mt-0.5 truncate">{m.subject}</p>
                        <p className="text-gray-500 text-sm mt-1 line-clamp-2">{m.body}</p>
                        <p className="text-gray-400 text-xs mt-2">{new Date(m.created_at).toLocaleDateString()}</p>
                      </div>
                      <span className="shrink-0 self-center bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                        Unread
                      </span>
                    </button>
                  )
                }
                const a = item.data as Announcement
                return (
                  <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex gap-4 items-start">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-800">{a.title}</h3>
                      <p className="text-gray-600 text-sm mt-1">{a.body}</p>
                      <p className="text-gray-400 text-xs mt-2">
                        {a.author_first_name} {a.author_last_name} · {new Date(a.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {a.require_confirmation ? (
                      <button
                        onClick={() => markRead(a.id, true)}
                        className="shrink-0 bg-green-700 hover:bg-green-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition mt-0.5">
                        Read ✓
                      </button>
                    ) : (
                      <button
                        onClick={() => markRead(a.id, false)}
                        title="Dismiss"
                        className="shrink-0 text-gray-300 hover:text-gray-500 transition mt-0.5"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* My Bookings */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-700">My Upcoming Bookings</h2>
            <span className="text-xs text-gray-400">↻ {bookingCountdown}s</span>
          </div>
          <Link to="/bookings?tab=grid"
            className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition whitespace-nowrap">
            Book a Court
          </Link>
        </div>
        {myBookings.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-center text-sm text-gray-400">
            No upcoming bookings. <Link to="/bookings" className="text-green-700 hover:underline font-medium">Book a court →</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {myBookings.map(b => {
              const start = new Date(b.start_time)
              const end = new Date(b.end_time)
              const isEditing = editingId === b.id
              const matchLabel = b.match_type === 'ball_machine' ? '🤖 Ball Machine'
                : b.match_type === 'singles' ? 'Singles'
                : b.match_type === 'doubles' ? 'Doubles'
                : b.match_type === 'casual' ? 'Hit Session'
                : b.match_type === 'teaching_pro' ? 'Teaching Pro' : null
              const durationMins = Math.round((end.getTime() - start.getTime()) / 60000)
              const durationLabel = durationMins >= 80 ? '1½ hr' : `${durationMins} min`
              const needsRoster = b.match_type && b.match_type !== 'ball_machine' && (b.players_needed ?? 0) > 0
              const totalSlots = (b.players_needed ?? 0) + 1
              const confirmed = (b.players ?? []).length
              const openSpots = needsRoster ? Math.max(0, totalSlots - confirmed) : 0
              const pending = b.invites_pending ?? 0
              const declined = b.invites_declined ?? 0
              const isFull = needsRoster && openSpots === 0

              // Status badge shown next to court name
              const statusBadge = needsRoster ? (
                isFull
                  ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">✓ Good to go</span>
                  : pending > 0
                    ? <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-semibold">⏳ {pending} pending</span>
                    : <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">Need {openSpots} more</span>
              ) : null

              return (
                <div key={b.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  {/* Card row */}
                  <div className="px-4 py-3 flex items-start gap-4">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-green-700 font-bold text-base shrink-0 mt-0.5">
                      {b.court.number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800 text-sm flex items-center gap-1.5 flex-wrap">
                        {b.court.name}
                        {matchLabel && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-normal">
                            {matchLabel}
                          </span>
                        )}
                        {statusBadge}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' · '}
                        {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        {' – '}
                        {end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        {' · '}
                        {durationLabel}
                      </div>
                      {/* Roster */}
                      {needsRoster && (confirmed > 0 || openSpots > 0) && (
                        <div className="flex items-center gap-1 flex-wrap mt-1.5">
                          {(b.players ?? []).map((p, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700">{p}</span>
                          ))}
                          {openSpots > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                              +{openSpots} open
                            </span>
                          )}
                        </div>
                      )}
                      {/* Invite status breakdown */}
                      {needsRoster && !isFull && (pending > 0 || declined > 0) && (
                        <div className="flex items-center gap-2 mt-1 text-xs flex-wrap">
                          <span className="text-gray-400">{confirmed}/{totalSlots} confirmed</span>
                          {pending > 0 && <span className="text-yellow-600 font-medium">{pending} awaiting response</span>}
                          {declined > 0 && <span className="text-red-500 font-medium">{declined} declined</span>}
                        </div>
                      )}
                      {/* Notes */}
                      {b.notes && (
                        <div className="text-xs text-gray-400 mt-1 italic truncate">{b.notes}</div>
                      )}
                    </div>
                    <button
                      onClick={() => isEditing ? setEditingId(null) : openEdit(b)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg transition shrink-0 ${
                        isEditing ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-green-50 text-green-700 hover:bg-green-100'
                      }`}>
                      {isEditing ? 'Close' : 'Edit'}
                    </button>
                  </div>

                  {/* Inline edit panel */}
                  {isEditing && (
                    <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-3">
                      {/* Start time */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-gray-600 w-24 shrink-0">Start Time</span>
                        <select
                          value={editForm.startSlot}
                          onChange={e => setEditForm(f => ({ ...f, startSlot: parseFloat(e.target.value) }))}
                          className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                          {Array.from({ length: 24 }, (_, i) => i * 0.5 + 8)
                            .filter(slot => slot + editForm.duration <= 20)
                            .map(slot => {
                              const h = Math.floor(slot) % 12 || 12
                              const m = slot % 1 === 0.5 ? '30' : '00'
                              const ampm = Math.floor(slot) < 12 ? 'AM' : 'PM'
                              return <option key={slot} value={slot}>{h}:{m} {ampm}</option>
                            })}
                        </select>
                      </div>
                      {/* Duration */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-gray-600 w-24 shrink-0">Duration</span>
                        <div className="flex gap-2">
                          {[{ label: '1 hr', hours: 1 }, { label: '1½ hr', hours: 1.5 }].map(d => (
                            <button key={d.hours} type="button"
                              onClick={() => setEditForm(f => ({ ...f, duration: d.hours }))}
                              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                                editForm.duration === d.hours ? 'bg-green-700 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:border-green-400'
                              }`}>
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Match type */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-gray-600 w-24 shrink-0">Type</span>
                        <select value={editForm.matchType}
                          onChange={e => setEditForm(f => ({ ...f, matchType: e.target.value }))}
                          className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                          <option value="casual">Hit Session</option>
                          <option value="singles">Singles</option>
                          <option value="doubles">Doubles</option>
                          <option value="teaching_pro">Teaching Pro</option>
                          <option value="ball_machine">Ball Machine</option>
                        </select>
                      </div>
                      {editError && <p className="text-red-600 text-xs">{editError}</p>}
                      <div className="flex items-center gap-3 pt-1">
                        <button onClick={() => saveEdit(b)} disabled={editSaving}
                          className="text-xs font-semibold bg-green-700 hover:bg-green-800 text-white px-4 py-1.5 rounded-lg transition disabled:opacity-50">
                          {editSaving ? 'Saving…' : 'Save Changes'}
                        </button>
                        <button onClick={() => cancelBooking(b.id)}
                          className="text-xs font-medium text-red-500 hover:text-red-700 transition">
                          Cancel Booking
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Weather */}
      {weather && <WeatherWidget weather={weather} airQuality={airQuality} />}

      {/* Court Camera */}
      <div>
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-gray-700">Court Camera</h2>
        </div>
        {isBoard && cameraDown && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3 text-sm text-red-700">
            <span className="text-base">⚠️</span>
            <span><strong>Camera offline.</strong> The server has attempted an automatic restart. Check back in a few minutes or contact your system administrator.</span>
          </div>
        )}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {cameraURL ? (
            <iframe
              src={cameraURL + (cameraURL.includes('?') ? '&' : '?') + 'embed=1'}
              title="Court Camera"
              className="w-full aspect-video"
              style={{ border: 'none' }}
              allowFullScreen
            />
          ) : (
            <div className="w-full aspect-video bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
              Loading camera…
            </div>
          )}
        </div>
      </div>

      {/* Feedback */}
      <FeedbackBox
        title="Got an idea for the site?"
        placeholder="Describe your idea or feature request…"
        buttonLabel="Send Idea"
        value={idea}
        onChange={setIdea}
        state={ideaState}
        onSubmit={async () => {
          setIdeaState('sending')
          try { await api.feedback.submit(idea.trim(), 'idea'); setIdeaState('done') }
          catch { setIdeaState('error') }
        }}
        onReset={() => { setIdeaState('idle'); setIdea('') }}
        doneMessage="Thanks — your idea was sent!"
      />
    </div>
  )
}

function WeatherWidget({ weather, airQuality }: { weather: WeatherData; airQuality: AirQualityData | null }) {
  const cur = weather.current
  const daily = weather.daily
  const todayCode = daily.weathercode[0] ?? cur.weathercode
  const todayPrecip = daily.precipitation_probability_max[0] ?? 0
  const condition = courtCondition(todayCode, todayPrecip)
  const aqi = airQuality?.current?.us_aqi ?? null

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Current conditions */}
      <div className="flex items-center gap-4 px-5 py-4 border-b border-gray-100">
        <span className="text-4xl">{weatherIcon(cur.weathercode)}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-800">{Math.round(cur.temperature_2m)}°F</span>
            <span className="text-sm text-gray-500">{weatherLabel(cur.weathercode)}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5 text-xs text-gray-400">
            <span>💨 {Math.round(cur.windspeed_10m)} mph</span>
            <span>💧 {cur.relativehumidity_2m}% humidity</span>
            {todayPrecip > 0 && <span>🌂 {todayPrecip}% rain</span>}
            {aqi !== null && (
              <span className={`font-medium px-1.5 py-0.5 rounded border text-xs ${aqiColor(aqi)}`}>
                {aqiEmoji(aqi)} AQI {aqi} · {aqiLabel(aqi)}
              </span>
            )}
          </div>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${conditionColors[condition]}`}>
          {condition === 'good' ? '✓ Good for tennis' : condition === 'caution' ? '⚠ Play with caution' : '✗ Poor conditions'}
        </span>
      </div>

      {/* 7-day forecast strip */}
      <div className="grid grid-cols-7 divide-x divide-gray-100">
        {daily.time.map((date, i) => {
          const code = daily.weathercode[i]
          const precip = daily.precipitation_probability_max[i]
          const cond = courtCondition(code, precip)
          return (
            <div key={date} className="flex flex-col items-center gap-0.5 py-3 px-1">
              <span className="text-xs font-medium text-gray-500">{dayLabel(date)}</span>
              <span className="text-lg">{weatherIcon(code)}</span>
              <span className="text-xs font-semibold text-gray-700">{Math.round(daily.temperature_2m_max[i])}°</span>
              <span className="text-xs text-gray-400">{Math.round(daily.temperature_2m_min[i])}°</span>
              {precip > 0 && <span className="text-xs text-blue-500">{precip}%</span>}
              <span className={`w-2 h-2 rounded-full mt-0.5 ${cond === 'good' ? 'bg-green-400' : cond === 'caution' ? 'bg-yellow-400' : 'bg-red-400'}`} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FeedbackBox({ title, placeholder, buttonLabel, value, onChange, state, onSubmit, onReset, doneMessage }: {
  title: string; placeholder: string; buttonLabel: string
  value: string; onChange: (v: string) => void
  state: SubmitState; onSubmit: () => void; onReset: () => void
  doneMessage: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <h2 className="text-base font-semibold text-gray-700 mb-1">{title}</h2>
      <p className="text-xs text-gray-400 mb-3">Sent straight to the admin team.</p>
      {state === 'done' ? (
        <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
          <span>✓</span> {doneMessage}
          <button onClick={onReset} className="ml-2 text-xs text-gray-400 hover:text-gray-600">
            Submit another
          </button>
        </div>
      ) : (
        <form onSubmit={e => { e.preventDefault(); if (value.trim()) onSubmit() }}
          className="flex flex-col sm:flex-row gap-2 items-start">
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            maxLength={1000}
            rows={2}
            className="flex-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button type="submit" disabled={state === 'sending' || !value.trim()}
            className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50 sm:shrink-0 w-full sm:w-auto">
            {state === 'sending' ? 'Sending…' : buttonLabel}
          </button>
        </form>
      )}
      {state === 'error' && (
        <p className="text-red-500 text-xs mt-1">Something went wrong — please try again.</p>
      )}
    </div>
  )
}

function Toast({ response, onDismiss }: { response: InviteResponse; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 7000)
    return () => clearTimeout(t)
  }, [])

  const accepted = response.status === 'accepted'
  const date = new Date(response.start_time).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
  const time = new Date(response.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    <div className={`flex items-start gap-3 w-80 rounded-xl shadow-lg border px-4 py-3 text-sm
      ${accepted ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
      <span className="text-xl shrink-0">{accepted ? '✅' : '❌'}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-800">
          {response.invitee_name} {accepted ? 'accepted' : 'declined'}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">{response.court_name} · {date} at {time}</p>
      </div>
      <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600 shrink-0 leading-none">×</button>
    </div>
  )
}
