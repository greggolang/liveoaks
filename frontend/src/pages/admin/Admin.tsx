import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

// `section` ties a link to a grantable admin section (see backend adminperm
// catalog). Links with a section are shown only to admins or to board members
// granted that section. Links without one (and not in ADMIN_ONLY_LINKS) are
// shown to every board member.
type LinkItem = { to: string; label: string; section?: string }
type Section = { heading: string; links: LinkItem[] }

const sections: Section[] = [
  {
    heading: 'Main Site',
    links: [
      { to: '/admin/content', label: 'Content' },
    ],
  },
  {
    heading: 'Members',
    links: [
      { to: '/admin/users', label: 'Members', section: 'members' },
      { to: '/events', label: 'Events', section: 'events_admin' },
      { to: '/usta-teams', label: 'USTA Teams', section: 'usta_teams' },
      { to: '/announcements', label: 'Announcements', section: 'announcements' },
      { to: '/admin/member-requests', label: 'New Member Requests', section: 'member_requests' },
      { to: '/admin/waitlist', label: 'Waitlist', section: 'waitlist' },
{ to: '/admin/polls', label: 'Membership Polls' },
    ],
  },
  {
    heading: 'Accounting',
    links: [
      { to: '/admin/accounting', label: 'P&L', section: 'accounting' },
      { to: '/admin/financial-rules', label: 'Enforcement Rules', section: 'financial_rules' },
    ],
  },
  {
    heading: 'Billing',
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
    links: [
      { to: '/admin/fantasy', label: 'Fantasy Tennis Pool', section: 'fantasy' },
      { to: '/admin/ladder', label: 'Tennis Ladder', section: 'ladder_admin' },
      { to: '/admin/liveball', label: 'LiveBall Events', section: 'liveball' },
    ],
  },
  {
    heading: 'Feedback',
    links: [
      { to: '/admin/feedback', label: 'Site Ideas', section: 'feedback' },
    ],
  },
  {
    heading: 'Board',
    links: [
      { to: '/admin/board-meetings', label: 'Board Meetings', section: 'board_meetings' },
      { to: '/admin/board-communications', label: 'Communications', section: 'board_communications' },
      { to: '/admin/notes', label: 'Notes', section: 'notes' },
    ],
  },
  {
    heading: 'Clubhouse',
    links: [
      { to: '/admin/appliances', label: 'Appliances', section: 'appliances' },
      { to: '/admin/yolink', label: 'YoLink Sensors', section: 'yolink' },
    ],
  },
  {
    heading: 'System',
    links: [
      { to: '/files', label: 'Files', section: 'files' },
      { to: '/photos', label: 'Photos', section: 'photos' },
      { to: '/admin/mail', label: 'Mail Accounts' },
      { to: '/admin/broadcast', label: 'Broadcast Email', section: 'broadcast' },
      { to: '/admin/settings', label: 'Settings', section: 'settings' },
      { to: '/admin/email-templates', label: 'Email Templates', section: 'email_templates' },
      { to: '/admin/permissions', label: 'Admin Pages' },
      { to: '/admin/passwords', label: 'Password Vault' },
      { to: '/admin/communication-test', label: 'Test Communications', section: 'communication_test' },
      { to: '/admin/log', label: 'Activity Log', section: 'activity_log' },
      { to: '/admin/resets', label: 'Password Resets', section: 'password_resets' },
    ],
  },
]

// Links restricted to full admins regardless of section grants.
const ADMIN_ONLY_LINKS = new Set([
  '/admin/mail', '/admin/passwords', '/admin/permissions',
])

export default function Admin() {
  const { isBoard, isAdmin, canSeeAdmin, canAccessAdmin } = useAuth()
  const { pathname } = useLocation()
  const isIndex = pathname === '/admin' || pathname === '/admin/'
  // Section groups start collapsed; an explicit toggle overrides.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Scroll back to the top whenever the admin sub-page changes — otherwise the
  // layout stays mounted and keeps the previous scroll position, leaving the
  // new page's content scrolled out of view.
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  if (!canAccessAdmin) return <Navigate to="/" replace />

  const visibleSections = sections.map(s => ({
    ...s,
    links: s.links.filter(l => {
      if (ADMIN_ONLY_LINKS.has(l.to)) return isAdmin
      if (l.section) return canSeeAdmin(l.section)
      return isBoard // ungated links — board members only (hidden from granted non-board users)
    }),
  })).filter(s => s.links.length > 0)

  // The group containing the current page is open by default; everything else
  // is collapsed until clicked.
  const activeHeading = visibleSections.find(s =>
    s.links.some(l => pathname === l.to || pathname.startsWith(l.to + '/')))?.heading
  const isOpen = (h: string) => expanded[h] ?? (h === activeHeading)
  const toggleGroup = (h: string) => setExpanded(e => ({ ...e, [h]: !isOpen(h) }))

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        {!isIndex && (
          <Link to="/admin"
            className="md:hidden inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:text-green-900">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Menu
          </Link>
        )}
        <h1 className="text-2xl font-bold text-gray-800">Admin Panel</h1>
      </div>
      <div className="flex flex-col md:flex-row gap-4 md:gap-8">
        {/* Desktop: sidebar (always visible) */}
        <nav className="hidden md:block w-44 shrink-0 space-y-1">
          {visibleSections.map(section => (
            <div key={section.heading}>
              <button onClick={() => toggleGroup(section.heading)}
                className="w-full flex items-center justify-between px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition">
                {section.heading}
                <svg className={`w-3.5 h-3.5 transition-transform ${isOpen(section.heading) ? 'rotate-90' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {isOpen(section.heading) && (
                <div className="space-y-0.5 mt-0.5 mb-2">
                  {section.links.map(l => (
                    <NavLink key={l.to} to={l.to}
                      className={({ isActive }) =>
                        `block px-4 py-2 rounded-lg text-sm font-medium transition ${isActive ? 'bg-green-100 text-green-800' : 'text-gray-600 hover:bg-gray-100'}`}>
                      {l.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="flex-1 min-w-0">
          {isIndex ? (
            <>
              {/* Mobile: the full menu is the landing screen */}
              <nav className="md:hidden space-y-2">
                {visibleSections.map(section => (
                  <div key={section.heading} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <button onClick={() => toggleGroup(section.heading)}
                      className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 active:bg-gray-100">
                      {section.heading}
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen(section.heading) ? 'rotate-90' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    {isOpen(section.heading) && (
                      <div className="border-t border-gray-100 divide-y divide-gray-100">
                        {section.links.map(l => (
                          <Link key={l.to} to={l.to}
                            className="flex items-center justify-between pl-6 pr-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100">
                            {l.label}
                            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </nav>
              {/* Desktop: the sidebar is alongside, so just prompt */}
              <p className="hidden md:block text-gray-400 text-sm text-center py-16">Select a section from the menu.</p>
            </>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </div>
  )
}
