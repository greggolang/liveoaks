import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

type LinkItem = { to: string; label: string }
type Section = { heading: string; links: LinkItem[] }

const sections: Section[] = [
  {
    heading: 'Content',
    links: [
      { to: '/events', label: 'Events' },
      { to: '/announcements', label: 'Announcements' },
      { to: '/admin/pro-shop', label: 'Pro Shop' },
      { to: '/documents', label: 'Files' },
      { to: '/photos', label: 'Photos' },
      { to: '/usta-teams', label: 'USTA Teams' },
      { to: '/club-info', label: 'About' },
    ],
  },
  {
    heading: 'Members',
    links: [
      { to: '/admin/users', label: 'Members' },
      { to: '/admin/waitlist', label: 'Waitlist' },
      { to: '/admin/guests', label: 'Guest Passes' },
    ],
  },
  {
    heading: 'Billing',
    links: [
      { to: '/admin/accounting', label: 'Accounting / P&L' },
      { to: '/admin/financial-rules', label: 'Enforcement Rules' },
      { to: '/admin/dues', label: 'Dues' },
      { to: '/admin/receipts', label: 'Receipts' },
      { to: '/admin/kiosk-purchases', label: 'Kiosk Purchases' },
    ],
  },
  {
    heading: 'Bookings',
    links: [
      { to: '/admin/bookings', label: 'All Bookings' },
      { to: '/admin/court-blocks', label: 'Court Blocks' },
      { to: '/admin/cancellations', label: 'Cancellations' },
      { to: '/admin/ball-tracking', label: 'Ball Tracking' },
      { to: '/admin/teaching-pro', label: 'Teaching Pro' },
      { to: '/admin/booking-docs', label: 'How Bookings Work' },
    ],
  },
  {
    heading: 'Games',
    links: [
      { to: '/admin/fantasy', label: 'Fantasy Tennis Pool' },
      { to: '/admin/ladder', label: 'Tennis Ladder' },
      { to: '/admin/liveball', label: 'LiveBall Events' },
    ],
  },
  {
    heading: 'Feedback',
    links: [
      { to: '/admin/feedback', label: 'Site Ideas' },
    ],
  },
  {
    heading: 'Board',
    links: [
      { to: '/admin/board-meetings', label: 'Board Meetings' },
      { to: '/admin/board-communications', label: 'Communications' },
      { to: '/admin/notes', label: 'Notes' },
    ],
  },
  {
    heading: 'Clubhouse',
    links: [
      { to: '/admin/appliances', label: 'Appliances' },
      { to: '/admin/yolink', label: 'YoLink Sensors' },
    ],
  },
  {
    heading: 'System',
    links: [
      { to: '/admin/mail', label: 'Mail Accounts' },
      { to: '/admin/broadcast', label: 'Broadcast Email' },
      { to: '/admin/settings', label: 'Settings' },
      { to: '/admin/email-templates', label: 'Email Templates' },
      { to: '/admin/permissions', label: 'Permissions' },
      { to: '/admin/resets', label: 'Password Resets' },
      { to: '/admin/passwords', label: 'Password Vault' },
      { to: '/admin/test-email', label: 'Test Email' },
      { to: '/admin/log', label: 'Activity Log' },
    ],
  },
]

const ADMIN_ONLY_LINKS = new Set(['/admin/mail', '/admin/passwords'])

export default function Admin() {
  const { isBoard, isAdmin } = useAuth()
  if (!isBoard) return <Navigate to="/" replace />

  const visibleSections = sections.map(s => ({
    ...s,
    links: s.links.filter(l => !ADMIN_ONLY_LINKS.has(l.to) || isAdmin),
  })).filter(s => s.links.length > 0)

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Admin Panel</h1>
      <div className="flex flex-col md:flex-row gap-4 md:gap-8">
        {/* Mobile: horizontal scrolling pill strip */}
        <nav className="md:hidden flex overflow-x-auto gap-1 pb-2 -mx-1 px-1">
          {visibleSections.flatMap(s => s.links).map(l => (
            <NavLink key={l.to} to={l.to}
              className={({ isActive }) =>
                `whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition shrink-0
                 ${isActive ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        {/* Desktop: sidebar */}
        <nav className="hidden md:block w-44 shrink-0 space-y-4">
          {visibleSections.map(section => (
            <div key={section.heading}>
              <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                {section.heading}
              </p>
              <div className="space-y-0.5">
                {section.links.map(l => (
                  <NavLink key={l.to} to={l.to}
                    className={({ isActive }) =>
                      `block px-4 py-2 rounded-lg text-sm font-medium transition ${isActive ? 'bg-green-100 text-green-800' : 'text-gray-600 hover:bg-gray-100'}`}>
                    {l.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="flex-1 min-w-0"><Outlet /></div>
      </div>
    </div>
  )
}
