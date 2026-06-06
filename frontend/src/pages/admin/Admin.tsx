import { useEffect } from 'react'
import { Link, NavLink, Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

type LinkItem = { to: string; label: string; section?: string }
type Section = {
  heading: string
  desc: string
  icon: React.ReactNode
  color: string
  links: LinkItem[]
}

const Icon = ({ d, className = 'w-5 h-5' }: { d: string; className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={d} />
  </svg>
)

const ICONS = {
  users: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  accounting: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  billing: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  trophy: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z',
  feedback: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
  board: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  clubhouse: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  settings: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
}

const sections: Section[] = [
  {
    heading: 'Members',
    desc: 'Users, events, waitlist, and access control',
    icon: <Icon d={ICONS.users} />,
    color: 'blue',
    links: [
      { to: '/admin/users', label: 'Members', section: 'members' },
      { to: '/admin/events', label: 'Events', section: 'events_admin' },
      { to: '/admin/usta-teams', label: 'USTA Teams', section: 'usta_teams' },
      { to: '/admin/announcements', label: 'Announcements', section: 'announcements' },
      { to: '/admin/member-requests', label: 'New Member Requests', section: 'member_requests' },
      { to: '/admin/waitlist', label: 'Waitlist', section: 'waitlist' },
      { to: '/admin/polls', label: 'Membership Polls', section: 'polls' },
      { to: '/admin/page-access', label: 'Page Access' },
    ],
  },
  {
    heading: 'Accounting',
    desc: 'P&L reports and enforcement rules',
    icon: <Icon d={ICONS.accounting} />,
    color: 'green',
    links: [
      { to: '/admin/accounting', label: 'P&L', section: 'accounting' },
      { to: '/admin/financial-rules', label: 'Enforcement Rules', section: 'financial_rules' },
    ],
  },
  {
    heading: 'Billing',
    desc: 'Pro shop, dues, taxes, and receipts',
    icon: <Icon d={ICONS.billing} />,
    color: 'emerald',
    links: [
      { to: '/admin/pro-shop', label: 'Pro Shop', section: 'pro_shop' },
      { to: '/admin/taxes', label: 'Taxes', section: 'taxes' },
      { to: '/admin/dues', label: 'Dues', section: 'dues' },
      { to: '/admin/receipts', label: 'Receipts', section: 'receipts' },
      { to: '/admin/kiosk-purchases', label: 'Kiosk Purchases', section: 'kiosk_purchases' },
    ],
  },
  {
    heading: 'Bookings',
    desc: 'Courts, blocks, cancellations, and ball tracking',
    icon: <Icon d={ICONS.calendar} />,
    color: 'violet',
    links: [
      { to: '/admin/bookings', label: 'All Bookings', section: 'bookings_admin' },
      { to: '/admin/court-blocks', label: 'Court Blocks', section: 'court_blocks' },
      { to: '/admin/cancellations', label: 'Cancellations', section: 'cancellations' },
      { to: '/admin/ball-tracking', label: 'Ball Tracking', section: 'ball_tracking' },
      { to: '/admin/teaching-pro', label: 'Teaching Pro', section: 'teaching_pro' },
      { to: '/admin/booking-docs', label: 'How Bookings Work' },
    ],
  },
  {
    heading: 'Games',
    desc: 'Fantasy tennis, ladder, and LiveBall',
    icon: <Icon d={ICONS.trophy} />,
    color: 'amber',
    links: [
      { to: '/admin/fantasy', label: 'Fantasy Tennis Pool', section: 'fantasy' },
      { to: '/admin/tennis-challenge-ladder', label: 'Tennis Challenge Ladder', section: 'tennis_challenge_ladder' },
      { to: '/admin/liveball', label: 'LiveBall Events', section: 'liveball' },
    ],
  },
  {
    heading: 'Feedback',
    desc: 'Site ideas, bugs, and club Q&A',
    icon: <Icon d={ICONS.feedback} />,
    color: 'pink',
    links: [
      { to: '/admin/feedback', label: 'Site Ideas and Bugs', section: 'feedback' },
      { to: '/admin/club-questions', label: 'Club Q&A' },
    ],
  },
  {
    heading: 'Board',
    desc: 'Meetings, communications, and notes',
    icon: <Icon d={ICONS.board} />,
    color: 'indigo',
    links: [
      { to: '/admin/board-meetings', label: 'Board Meetings', section: 'board_meetings' },
      { to: '/admin/board-communications', label: 'Communications', section: 'board_communications' },
      { to: '/admin/notes', label: 'Notes', section: 'notes' },
    ],
  },
  {
    heading: 'Clubhouse',
    desc: 'Appliances and sensor monitoring',
    icon: <Icon d={ICONS.clubhouse} />,
    color: 'teal',
    links: [
      { to: '/admin/appliances', label: 'Appliances', section: 'appliances' },
      { to: '/admin/yolink', label: 'YoLink Sensors', section: 'yolink' },
    ],
  },
  {
    heading: 'System',
    desc: 'Content, settings, email, permissions, and logs',
    icon: <Icon d={ICONS.settings} />,
    color: 'gray',
    links: [
      { to: '/admin/content', label: 'Main Site Content', section: 'content' },
      { to: '/files', label: 'Files', section: 'files' },
      { to: '/photos', label: 'Images', section: 'photos' },
      { to: '/admin/mail', label: 'Mail Accounts' },
      { to: '/admin/broadcast', label: 'Broadcast Email', section: 'broadcast' },
      { to: '/admin/settings', label: 'Settings', section: 'settings' },
      { to: '/admin/email-templates', label: 'Email Templates', section: 'email_templates' },
      { to: '/admin/permissions', label: 'Admin Permissions' },
      { to: '/admin/member-permissions', label: 'Member Permissions' },
      { to: '/admin/passwords', label: 'Password Vault', section: 'password_vault' },
      { to: '/admin/communication-test', label: 'Test Communications', section: 'communication_test' },
      { to: '/admin/log', label: 'Activity Log', section: 'activity_log' },
      { to: '/admin/resets', label: 'Password Resets', section: 'password_resets' },
    ],
  },
]

const ADMIN_ONLY_LINKS = new Set([
  '/admin/mail', '/admin/permissions', '/admin/member-permissions', '/admin/page-access',
])

const COLOR_MAP: Record<string, { icon: string; card: string; badge: string }> = {
  blue:    { icon: 'text-blue-600',   card: 'bg-blue-50 border-blue-100',   badge: 'bg-blue-100 text-blue-700' },
  green:   { icon: 'text-green-600',  card: 'bg-green-50 border-green-100', badge: 'bg-green-100 text-green-700' },
  emerald: { icon: 'text-emerald-600',card: 'bg-emerald-50 border-emerald-100', badge: 'bg-emerald-100 text-emerald-700' },
  violet:  { icon: 'text-violet-600', card: 'bg-violet-50 border-violet-100', badge: 'bg-violet-100 text-violet-700' },
  amber:   { icon: 'text-amber-600',  card: 'bg-amber-50 border-amber-100', badge: 'bg-amber-100 text-amber-700' },
  pink:    { icon: 'text-pink-600',   card: 'bg-pink-50 border-pink-100',   badge: 'bg-pink-100 text-pink-700' },
  indigo:  { icon: 'text-indigo-600', card: 'bg-indigo-50 border-indigo-100', badge: 'bg-indigo-100 text-indigo-700' },
  teal:    { icon: 'text-teal-600',   card: 'bg-teal-50 border-teal-100',   badge: 'bg-teal-100 text-teal-700' },
  gray:    { icon: 'text-gray-500',   card: 'bg-gray-50 border-gray-200',   badge: 'bg-gray-100 text-gray-600' },
}

export default function Admin() {
  const { isBoard, isAdmin, canSeeAdmin, canAccessAdmin } = useAuth()
  const { pathname } = useLocation()
  const isIndex = pathname === '/admin' || pathname === '/admin/'

  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  if (!canAccessAdmin) return <Navigate to="/" replace />

  const visibleSections = sections.map(s => ({
    ...s,
    links: s.links.filter(l => {
      if (ADMIN_ONLY_LINKS.has(l.to)) return isAdmin
      if (l.section) return canSeeAdmin(l.section)
      return isBoard
    }),
  })).filter(s => s.links.length > 0)

  const activeSection = visibleSections.find(s =>
    s.links.some(l => pathname === l.to || pathname.startsWith(l.to + '/')))

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {!isIndex && (
          <Link to="/admin"
            className="md:hidden inline-flex items-center gap-1.5 text-sm font-medium text-green-700 hover:text-green-900 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Menu
          </Link>
        )}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-green-700 flex items-center justify-center shrink-0">
            <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{width:'18px',height:'18px'}}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 4a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">Admin Panel</h1>
            {activeSection && !isIndex && (
              <p className="text-xs text-gray-400 leading-none mt-0.5">{activeSection.heading}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar — desktop only */}
        <nav className="hidden md:flex flex-col gap-0.5 w-52 shrink-0">
          {visibleSections.map(section => {
            const colors = COLOR_MAP[section.color]
            const isSectionActive = section.links.some(l => pathname === l.to || pathname.startsWith(l.to + '/'))
            return (
              <div key={section.heading} className="mb-3">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg mb-1 ${isSectionActive ? colors.card + ' border' : ''}`}>
                  <span className={`${colors.icon} shrink-0`} style={{width:16,height:16,display:'flex'}}>
                    {section.icon}
                  </span>
                  <span className={`text-[11px] font-bold uppercase tracking-widest ${isSectionActive ? colors.icon : 'text-gray-400'}`}>
                    {section.heading}
                  </span>
                </div>
                <div className="space-y-0.5 pl-1">
                  {section.links.map(l => (
                    <NavLink key={l.to} to={l.to}
                      className={({ isActive }) =>
                        `block px-3 py-1.5 rounded-lg text-sm transition font-medium ${
                          isActive
                            ? 'bg-green-700 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}>
                      {l.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        {/* Main content area */}
        <div className="flex-1 min-w-0">
          {isIndex ? (
            <>
              {/* Mobile: accordion list */}
              <nav className="md:hidden space-y-2">
                {visibleSections.map(section => {
                  const colors = COLOR_MAP[section.color]
                  return (
                    <div key={section.heading} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      <div className={`flex items-center gap-3 px-4 py-3 border-b border-gray-100`}>
                        <div className={`w-8 h-8 rounded-lg ${colors.badge} flex items-center justify-center shrink-0`}>
                          <span className={colors.icon}>{section.icon}</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-800">{section.heading}</span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {section.links.map(l => (
                          <Link key={l.to} to={l.to}
                            className="flex items-center justify-between pl-6 pr-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition">
                            {l.label}
                            <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </nav>

              {/* Desktop: section card grid */}
              <div className="hidden md:grid grid-cols-2 xl:grid-cols-3 gap-4">
                {visibleSections.map(section => {
                  const colors = COLOR_MAP[section.color]
                  const firstLink = section.links[0]
                  return (
                    <Link key={section.heading} to={firstLink.to}
                      className="group bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 transition-all duration-150 flex flex-col gap-3">
                      <div className="flex items-start justify-between">
                        <div className={`w-10 h-10 rounded-xl ${colors.badge} flex items-center justify-center`}>
                          <span className={`${colors.icon} w-5 h-5`}>{section.icon}</span>
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
                          {section.links.length} {section.links.length === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 group-hover:text-green-700 transition">{section.heading}</h3>
                        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{section.desc}</p>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-auto">
                        {section.links.slice(0, 4).map(l => (
                          <span key={l.to} className="text-[11px] bg-gray-50 border border-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                            {l.label}
                          </span>
                        ))}
                        {section.links.length > 4 && (
                          <span className="text-[11px] text-gray-400 px-1">+{section.links.length - 4} more</span>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </div>
  )
}
