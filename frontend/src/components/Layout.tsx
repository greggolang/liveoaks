import { useEffect, useState } from 'react'
import { Link, useNavigate, NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api/client'
import { APP_VERSION } from '../version'

type BugState = 'idle' | 'sending' | 'done' | 'error'

const ICONS = {
  home:     'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  sun:      'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z',
  ticket:   'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z',
  tag:      'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
  users:    'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  heart:    'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  chat:     'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  mail:     'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  folder:   'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
  star:     'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
  chart:    'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  trophy:   'M5 3h14M6 3v5a6 6 0 0012 0V3M5 8H3a2 2 0 002 4m14-4h2a2 2 0 01-2 4M9 21h6m-3-4v4',
  cog:      'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
  info:     'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  bug:      'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  logout:   'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
}

type NavEntry = { to: string; label: string; icon: string; badge?: number }

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, hasPermission, isAdmin, isBoard } = useAuth()
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
    api.mail.myAccount()
      .then(d => setHasMailAccount(!!d))
      .catch(() => {})

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
    } catch { setBugState('error') }
  }

  const initials = `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`.toUpperCase()

  const groups: { key: string; heading?: string; items: NavEntry[] }[] = [
    {
      key: 'main', items: [
        { to: '/dashboard', label: 'Dashboard', icon: ICONS.home },
        ...(hasPermission('bookings') ? [{ to: '/bookings?tab=grid', label: 'Book a Court', icon: ICONS.calendar }] : []),
        { to: '/conditions', label: 'Conditions', icon: ICONS.sun },
        { to: '/scores', label: 'Scores', icon: ICONS.trophy },
        ...(hasPermission('pro_shop') ? [{ to: '/pro-shop', label: 'Pro Shop', icon: ICONS.tag }] : []),
        ...(hasPermission('directory') ? [{ to: '/directory', label: 'Directory', icon: ICONS.users }] : []),
        { to: '/club-info', label: 'Club Info', icon: ICONS.info },
      ],
    },
    {
      key: 'community', heading: 'Community', items: [
        ...(hasPermission('friends') ? [{ to: '/friends', label: 'Friends', icon: ICONS.heart }] : []),
        { to: '/messages', label: 'Messages', icon: ICONS.chat, badge: unreadMessages || undefined },
        ...(hasMailAccount ? [{ to: '/email', label: 'Email', icon: ICONS.mail }] : []),
      ],
    },
    {
      key: 'board', heading: isAdmin ? 'Admin' : 'Board Members', items: [
        ...(isAdmin ? [{ to: '/admin', label: 'Admin', icon: ICONS.cog }] : []),
        ...(!isAdmin && isBoard ? [{ to: '/board', label: 'Board', icon: ICONS.star }] : []),
      ],
    },
    {
      key: 'games', heading: 'Games', items: [
        ...((hasPermission('fantasy') && showFantasy) ? [{ to: '/fantasy', label: 'Fantasy Pool', icon: ICONS.star }] : []),
        ...((hasPermission('ladder') && showLadder) ? [{ to: '/ladder', label: 'Ladder', icon: ICONS.chart }] : []),
      ],
    },
  ].filter(g => g.items.length > 0)

  const item = (it: NavEntry) => (
    <NavLink key={it.to} to={it.to} end={it.to === '/dashboard'}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
          isActive ? 'bg-white/15 text-white' : 'text-green-100 hover:bg-white/10 hover:text-white'
        }`}>
      <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={it.icon} />
      </svg>
      <span className="flex-1">{it.label}</span>
      {it.badge ? (
        <span className="bg-red-500 text-white text-[10px] font-bold min-w-[1.15rem] h-[1.15rem] rounded-full flex items-center justify-center px-1 leading-none">
          {it.badge > 99 ? '99+' : it.badge}
        </span>
      ) : null}
    </NavLink>
  )

  const sidebarBody = (
    <>
      {/* Logo */}
      <div className="px-4 py-4 border-b border-green-600/50 shrink-0" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <Link to="/dashboard" className="flex items-center gap-2.5">
          {clubLogo
            ? <img src={clubLogo} alt="Club logo" className="h-9 w-auto object-contain" />
            : <img src="/lota-logo.png" alt="LOTA crest" className="h-9 w-9 rounded-full bg-white/95 p-0.5" />}
          <span className="text-lg font-bold tracking-wide font-serif">LOTA Portal</span>
        </Link>
        <div className="flex items-center gap-2 mt-1.5 pl-0.5">
          <span className="text-green-300 text-[11px]">v{APP_VERSION}</span>
          {bookingCountdown !== null && (
            <span className="text-green-400 text-[11px] tabular-nums" title="Bookings auto-refresh">↻ {bookingCountdown}s</span>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {groups.map(g => (
          <div key={g.key}>
            {g.heading && (
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-green-300/70">{g.heading}</p>
            )}
            <div className="space-y-0.5">{g.items.map(item)}</div>
          </div>
        ))}
      </nav>

      {/* Account */}
      <div className="border-t border-green-600/50 p-3 space-y-0.5 shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <Link to="/profile" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-green-100 hover:bg-white/10 hover:text-white transition">
          <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold shrink-0">{initials || '?'}</span>
          <span className="flex-1 truncate">{user?.first_name} {user?.last_name}</span>
        </Link>
        <button onClick={openBug}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-green-100 hover:bg-white/10 hover:text-white transition">
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICONS.bug} />
          </svg>
          Report a bug
        </button>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-green-100 hover:bg-white/10 hover:text-white transition">
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICONS.logout} />
          </svg>
          Log out
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-60 shrink-0 bg-green-700 text-white sticky top-0 h-screen self-start">
        {sidebarBody}
      </aside>

      {/* Mobile drawer */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMenuOpen(false)} />
          <aside className="fixed inset-y-0 left-0 w-64 bg-green-700 text-white z-50 md:hidden flex flex-col shadow-2xl"
            onClick={() => setMenuOpen(false)}>
            {sidebarBody}
          </aside>
        </>
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 bg-green-700 text-white shadow-md"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => setMenuOpen(true)} aria-label="Open menu" className="p-1 -ml-1">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <Link to="/dashboard" className="flex items-center gap-2">
              {clubLogo
                ? <img src={clubLogo} alt="Club logo" className="h-8 w-auto object-contain" />
                : <img src="/lota-logo.png" alt="LOTA crest" className="h-8 w-8 rounded-full bg-white/95 p-0.5" />}
              <span className="font-serif font-bold tracking-wide">LOTA Portal</span>
            </Link>
            <NavLink to="/messages" aria-label="Messages" className="relative p-1 -mr-1">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICONS.mail} />
              </svg>
              {unreadMessages > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold min-w-[1.1rem] h-[1.1rem] rounded-full flex items-center justify-center px-0.5 leading-none">
                  {unreadMessages > 99 ? '99+' : unreadMessages}
                </span>
              )}
            </NavLink>
          </div>
        </header>

        {updateAvailable && (
          <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 flex items-center justify-between text-sm text-yellow-800">
            <span>A new version is available.</span>
            <button onClick={() => window.location.reload()}
              className="ml-4 px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded text-xs font-semibold transition">
              Refresh
            </button>
          </div>
        )}

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-5 sm:py-8">{children}</main>
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </div>

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
                  <button onClick={submitBug}
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
