import { useEffect, useState } from 'react'
import { Link, useNavigate, NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api/client'
import { APP_VERSION } from '../version'

type BugState = 'idle' | 'sending' | 'done' | 'error'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin, isBoard } = useAuth()
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [bugOpen, setBugOpen] = useState(false)
  const [bugText, setBugText] = useState('')
  const [bugState, setBugState] = useState<BugState>('idle')
  const [showFantasy, setShowFantasy] = useState(false)
  const [showLadder, setShowLadder] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)

  useEffect(() => {
    api.fantasy.tournaments()
      .then((d: any) => setShowFantasy((d as any[]).some((t: any) => t.status === 'open' || t.status === 'locked')))
      .catch(() => {})
    api.ladder.list()
      .then((d: any) => setShowLadder((d as any[]).some((l: any) => l.status === 'open')))
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
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-green-700 text-white shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
              {clubLogo
                ? <img src={clubLogo} alt="Club logo" className="h-9 w-auto object-contain" />
                : <span className="text-lg font-bold tracking-wide">🎾 Liveoaks TC</span>
              }
              <span className="text-green-300 text-xs font-normal">v{APP_VERSION}</span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-5 text-sm font-medium flex-wrap justify-end">
              <NavLink to="/bookings?tab=grid" className={navLink}>Book a Court</NavLink>
              <NavLink to="/events" className={navLink}>Events</NavLink>
              <NavLink to="/pro-shop" className={navLink}>Pro Shop</NavLink>
              <NavLink to="/directory" className={navLink}>Directory</NavLink>
              <span className="w-px h-4 bg-green-600" />
              <NavLink to="/friends" className={navLink}>Friends</NavLink>
              <NavLink to="/messages" title="Messages" className={({ isActive }) =>
                `relative hover:text-green-200 transition ${isActive ? 'text-white' : 'text-green-100'}`}>
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
              {showFantasy && <NavLink to="/fantasy" className={navLink}>Fantasy Pool</NavLink>}
              {showLadder && <NavLink to="/ladder" className={navLink}>Ladder</NavLink>}
              {isBoard && <NavLink to="/email" className={navLink}>Email</NavLink>}
              {isBoard && <NavLink to="/admin" className={navLink}>Admin</NavLink>}
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
                ['/bookings?tab=grid', 'Book a Court'],
                ['/events', 'Events'],
                ['/pro-shop', 'Pro Shop'],
                ['/directory', 'Directory'],
                ['/friends', 'Friends'],
                ['/messages', unreadMessages > 0 ? `Messages (${unreadMessages})` : 'Messages'],
                ...(showFantasy ? [['/fantasy', 'Fantasy Pool']] : []),
                ...(showLadder ? [['/ladder', 'Ladder']] : []),
                ...(isBoard ? [['/email', 'Email'], ['/admin', 'Admin']] : []),
              ].map(([to, label]) => (
                <Link key={to} to={to} onClick={() => setMenuOpen(false)}
                  className="text-green-100 hover:text-white">{label}</Link>
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

      <main className="max-w-7xl mx-auto px-4 py-5 sm:py-8">{children}</main>

      {/* Bug report modal */}
      {bugOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeBug} />
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
