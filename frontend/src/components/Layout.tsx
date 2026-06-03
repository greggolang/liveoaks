import { useEffect, useState } from 'react'
import { Link, useNavigate, NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api/client'
import { APP_VERSION } from '../version'

type BugState = 'idle' | 'sending' | 'done' | 'error'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, hasPermission, isAdmin } = useAuth()
  const [clubLogo, setClubLogo] = useState('')

  useEffect(() => {
    fetch('/api/session-config')
      .then(r => r.json())
      .then(d => { if (d.club_logo) setClubLogo(d.club_logo) })
      .catch(() => {})
    const handler = (e: Event) => setClubLogo((e as CustomEvent<string>).detail)
    window.addEventListener('club-logo-changed', handler)
    return () => window.removeEventListener('club-logo-changed', handler)
  }, [])
  const navigate = useNavigate()
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    const check = () =>
      api.version.get()
        .then(d => { if (d.version !== 'dev' && d.version !== APP_VERSION) setUpdateAvailable(true) })
        .catch(() => {})
    const id = setInterval(check, 2 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const [bookingCountdown, setBookingCountdown] = useState<number | null>(null)
  useEffect(() => {
    const handler = (e: Event) => setBookingCountdown((e as CustomEvent<number | null>).detail)
    window.addEventListener('booking-countdown', handler)
    return () => window.removeEventListener('booking-countdown', handler)
  }, [])

  const [menuOpen, setMenuOpen] = useState(false)
  const [bugOpen, setBugOpen] = useState(false)
  const [bugText, setBugText] = useState('')
  const [bugState, setBugState] = useState<BugState>('idle')
  const [showFantasy, setShowFantasy] = useState(false)
  const [showLadder, setShowLadder] = useState(false)
  const [showDocuments, setShowDocuments] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [hasMailAccount, setHasMailAccount] = useState(false)

  useEffect(() => {
    api.fantasy.tournaments()
      .then((d: any) => setShowFantasy((d as any[]).some((t: any) => t.status === 'open' || t.status === 'locked')))
      .catch(() => {})
    api.ladder.list()
      .then((d: any) => setShowLadder((d as any[]).some((l: any) => l.status === 'open')))
      .catch(() => {})
    api.documents.list()
      .then((d: any[]) => setShowDocuments(d.length > 0))
      .catch(() => {})
    // Show the Email link only to users who have a mailbox assigned.
    api.mail.myAccount()
      .then(d => setHasMailAccount(!!d))
      .catch(() => {})

    // Poll unread message count every 60 seconds
    const fetchUnread = () =>
      api.messages.unreadCount().then(d => setUnreadMessages(d.count)).catch(() => {})
    fetchUnread()
    const interval = setInterval(fetchUnread, 60000)
    return () => clearInterval(interval)
  }, [])

  const handleLogout = async () => { await logout(); navigate('/login') }

  const openBug = () => { setBugOpen(true); setBugText(''); setBugState('idle') }
  const closeBug = () => { setBugOpen(false) }

  const submitBug = async () => {
    if (!bugText.trim()) return
    setBugState('sending')
    try {
      await api.feedback.submit(bugText.trim(), 'bug', window.location.pathname)
      setBugState('done')
    } catch {
      setBugState('error')
    }
  }

  const navLink = ({ isActive }: { isActive: boolean }) =>
    `hover:text-green-200 transition text-sm ${isActive ? 'text-white font-semibold' : 'text-green-100'}`

  return (
    <div className="min-h-screen bg-gray-50 w-full">
      {/* paddingTop: env(safe-area-inset-top) pulls nav content below the iOS status bar.
           The nav's green background fills the status bar area behind it (black-translucent mode). */}
      <nav className="bg-green-700 text-white shadow-md sticky top-0 z-40"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
              {clubLogo
                ? <img src={clubLogo} alt="Club logo" className="h-9 w-auto object-contain" />
                : <>
                    <img src="/lota-logo.png" alt="Live Oaks Tennis Association crest"
                         className="h-9 w-9 rounded-full bg-white/95 p-0.5" />
                    <span className="hidden sm:inline text-lg font-bold tracking-wide font-serif">LOTA Portal</span>
                  </>
              }
              <span className="text-green-300 text-xs font-normal">v{APP_VERSION}</span>
              {bookingCountdown !== null && (
                <span className="text-green-400 text-xs tabular-nums" title="Bookings auto-refresh">↻ {bookingCountdown}s</span>
              )}
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-5 text-sm font-medium flex-wrap justify-end">
              {hasPermission('bookings') && <NavLink to="/bookings?tab=grid" className={navLink}>Book a Court</NavLink>}
              {hasPermission('events') && <NavLink to="/events" className={navLink}>Events</NavLink>}
              {hasPermission('pro_shop') && <NavLink to="/pro-shop" className={navLink}>Pro Shop</NavLink>}
              {hasPermission('directory') && <NavLink to="/directory" className={navLink}>Directory</NavLink>}
              <span className="w-px h-4 bg-green-600" />
              {hasPermission('friends') && <NavLink to="/friends" className={navLink}>Friends</NavLink>}
              {hasMailAccount && <NavLink to="/email" className={navLink}>Email</NavLink>}
              {hasPermission('documents') && showDocuments && <NavLink to="/files" className={navLink}>Files</NavLink>}
              {hasPermission('fantasy') && showFantasy && <NavLink to="/fantasy" className={navLink}>Fantasy Pool</NavLink>}
              {hasPermission('ladder') && showLadder && <NavLink to="/ladder" className={navLink}>Ladder</NavLink>}
              {isAdmin && <NavLink to="/admin" className={navLink}>Admin</NavLink>}
              <button onClick={openBug}
                title="Report a bug"
                className="text-green-200 hover:text-white transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <div className="flex items-center gap-2 pl-2 border-l border-green-600">
                {/* Member-to-member messaging is available to every member — no permission gate. */}
                <NavLink to="/messages" title="Messages" className={({ isActive }) =>
                  `relative hover:text-green-200 transition ${isActive ? 'text-white' : 'text-green-200'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  {unreadMessages > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold min-w-[1.1rem] h-[1.1rem] rounded-full flex items-center justify-center px-0.5 leading-none">
                      {unreadMessages > 99 ? '99+' : unreadMessages}
                    </span>
                  )}
                </NavLink>
                <Link to="/profile" className="text-green-200 hover:text-white text-xs transition">
                  {user?.first_name}
                </Link>
                <button onClick={handleLogout}
                  className="bg-green-800 hover:bg-green-900 px-3 py-1 rounded text-xs transition">
                  Logout
                </button>
              </div>
            </div>

            {/* Mobile hamburger */}
            <button className="md:hidden" onClick={() => setMenuOpen(o => !o)}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {menuOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
          </div>

          {/* Mobile menu */}
          {menuOpen && (
            <div className="md:hidden mt-3 pb-2 border-t border-green-600 flex flex-col gap-2 pt-3 text-sm">
              {[
                hasPermission('bookings')  && ['/bookings?tab=grid', 'Book a Court'],
                hasPermission('events')    && ['/events', 'Events'],
                hasPermission('pro_shop')  && ['/pro-shop', 'Pro Shop'],
                hasPermission('directory') && ['/directory', 'Directory'],
                hasPermission('friends')   && ['/friends', 'Friends'],
                hasMailAccount             && ['/email', 'Email'],
                ['/messages', unreadMessages > 0 ? `Messages (${unreadMessages})` : 'Messages'],
                hasPermission('documents') && showDocuments && ['/files', 'Files'],
                hasPermission('fantasy')   && showFantasy   && ['/fantasy', 'Fantasy Pool'],
                hasPermission('ladder')    && showLadder    && ['/ladder', 'Ladder'],
                isAdmin             && ['/admin', 'Admin'],
              ].filter((x): x is string[] => Boolean(x)).map(([to, label]) => (
                <Link key={to as string} to={to as string} onClick={() => setMenuOpen(false)}
                  className="text-green-100 hover:text-white">{label as string}</Link>
              ))}
              <button onClick={() => { setMenuOpen(false); openBug() }}
                className="text-left text-green-200 hover:text-white">
                Report a Bug
              </button>
              <button onClick={handleLogout} className="text-left text-green-200 hover:text-white mt-1">Logout</button>
            </div>
          )}
        </div>
      </nav>

      {updateAvailable && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 flex items-center justify-between text-sm text-yellow-800">
          <span>A new version is available.</span>
          <button
            onClick={() => window.location.reload()}
            className="ml-4 px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded text-xs font-semibold transition">
            Refresh
          </button>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-5 sm:py-8">{children}</main>
      {/* Spacer so content is never hidden behind the iPhone home indicator */}
      <div style={{ height: 'env(safe-area-inset-bottom)' }} />

      {/* Bug report modal */}
      {bugOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-800">Report a Bug</h2>
              <button onClick={closeBug} className="text-gray-400 hover:text-gray-600 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {bugState === 'done' ? (
              <div className="text-center py-4">
                <div className="text-green-600 text-3xl mb-2">✓</div>
                <p className="text-gray-700 font-medium">Bug reported — thanks!</p>
                <p className="text-gray-400 text-sm mt-1">The admin team will look into it.</p>
                <button onClick={closeBug}
                  className="mt-4 px-5 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-medium transition">
                  Close
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-3">Describe what happened and how to reproduce it.</p>
                <textarea
                  value={bugText}
                  onChange={e => setBugText(e.target.value)}
                  placeholder="e.g. Clicking 'Book Court' on Tuesday shows an error…"
                  rows={4}
                  maxLength={1000}
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                {bugState === 'error' && (
                  <p className="text-red-500 text-xs mt-1">Something went wrong — please try again.</p>
                )}
                <div className="flex gap-3 mt-4">
                  <button onClick={closeBug}
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
                    Cancel
                  </button>
                  <button
                    onClick={submitBug}
                    disabled={!bugText.trim() || bugState === 'sending'}
                    className="flex-1 px-4 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50">
                    {bugState === 'sending' ? 'Sending…' : 'Send Report'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
