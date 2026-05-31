import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api/client'
import { WeatherData, weatherIcon, weatherLabel, courtCondition, conditionColors, dayLabel } from '../utils/weather'

interface InviteResponse {
  id: string
  invitee_name: string
  status: 'accepted' | 'declined'
  court_name: string
  start_time: string
}

interface Booking {
  id: string; court_id: number; start_time: string; end_time: string
  match_type?: string
  user: { first_name: string; last_name: string }
  court: { name: string; number: number }
}
type SubmitState = 'idle' | 'sending' | 'done' | 'error'

interface Announcement {
  id: string; title: string; body: string; created_at: string
  author: { first_name: string; last_name: string }
}

function readKey(userId: string) { return `news_read_${userId}` }

function loadRead(userId: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(readKey(userId)) || '[]')) }
  catch { return new Set() }
}

function saveRead(userId: string, ids: Set<string>) {
  localStorage.setItem(readKey(userId), JSON.stringify([...ids]))
}

export default function Dashboard() {
  const { user } = useAuth()
  const [idea, setIdea] = useState('')
  const [ideaState, setIdeaState] = useState<SubmitState>('idle')
  const [myBookings, setMyBookings] = useState<Booking[]>([])
  const [bookingCountdown, setBookingCountdown] = useState(30)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [cameraURL, setCameraURL] = useState<string | null>(null)
  const [toasts, setToasts] = useState<InviteResponse[]>([])
  const seenIds = useRef<Set<string>>(new Set())

  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

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

  useEffect(() => {
    checkResponses()
    const interval = setInterval(checkResponses, 60000)
    return () => clearInterval(interval)
  }, [checkResponses])

  useEffect(() => {
    if (user?.id) setReadIds(loadRead(user.id))
  }, [user?.id])

  useEffect(() => {
    api.announcements.list().then(d => setAnnouncements(d as Announcement[]))
    api.camera.embedURL().then(d => setCameraURL(d.url)).catch(() => setCameraURL('/camera'))
    api.weather.get().then(d => setWeather(d as WeatherData)).catch(() => {})
    const refreshBookings = () => api.bookings.mine().then(d => setMyBookings(d as Booking[]))
    refreshBookings()
    const timer = setInterval(() => {
      setBookingCountdown(c => {
        if (c <= 1) { refreshBookings(); return 30 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const markRead = (id: string) => {
    if (!user?.id) return
    const next = new Set(readIds).add(id)
    setReadIds(next)
    saveRead(user.id, next)
  }

  const unread = announcements.filter(a => !readIds.has(a.id))

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

      {/* Latest News */}
      {unread.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Latest News</h2>
          <div className="space-y-3">
            {unread.map(a => (
              <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex gap-4 items-start">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800">{a.title}</h3>
                  <p className="text-gray-600 text-sm mt-1">{a.body}</p>
                  <p className="text-gray-400 text-xs mt-2">
                    {a.author.first_name} {a.author.last_name} · {new Date(a.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => markRead(a.id)}
                  title="Mark as read"
                  className="shrink-0 text-gray-300 hover:text-gray-500 transition mt-0.5"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { to: '/bookings?tab=grid',  emoji: '🎾', label: 'Book a Court' },
          { to: '/pro-shop',  emoji: '🛍️', label: 'Pro Shop' },
          { to: '/events',    emoji: '📅', label: 'Events' },
          { to: '/directory', emoji: '👥', label: 'Directory' },
        ].map(({ to, emoji, label }) => (
          <Link key={to} to={to}
            className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col items-center gap-2 hover:border-green-300 hover:shadow-md transition text-center">
            <span className="text-2xl">{emoji}</span>
            <span className="text-sm font-medium text-gray-700">{label}</span>
          </Link>
        ))}
      </div>

      {/* Weather */}
      {weather && <WeatherWidget weather={weather} />}

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
              return (
                <div key={b.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm flex items-center gap-4">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-green-700 font-bold text-base shrink-0">
                    {b.court.number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-800 text-sm">{b.court.name}
                      {b.match_type && b.match_type !== 'casual' && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-normal">
                          {b.match_type === 'ball_machine' ? '🤖 Ball Machine'
                            : b.match_type === 'singles' ? 'Singles'
                            : b.match_type === 'doubles' ? 'Doubles'
                            : b.match_type}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {' · '}
                      {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      {' – '}
                      {end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Court Camera */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-700">Court Camera</h2>
          {cameraURL && (
            <a
              href={cameraURL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-green-700 hover:underline"
            >
              Open full screen ↗
            </a>
          )}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {cameraURL ? (
            <iframe
              src={cameraURL}
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

function WeatherWidget({ weather }: { weather: WeatherData }) {
  const cur = weather.current
  const daily = weather.daily
  const todayCode = daily.weathercode[0] ?? cur.weathercode
  const todayPrecip = daily.precipitation_probability_max[0] ?? 0
  const condition = courtCondition(todayCode, todayPrecip)

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
