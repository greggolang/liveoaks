import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

type LinkItem = { to: string; label: string }
type Section = { heading: string; links: LinkItem[] }

const sections: Section[] = [
  {
    heading: 'Content',
    links: [
      { to: '/events', label: 'Events' },
      { to: '/announcements', label: 'News' },
      { to: '/documents', label: 'Documents' },
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
      { to: '/admin/dues', label: 'Dues' },
    ],
  },
  {
    heading: 'System',
    links: [
      { to: '/admin/settings', label: 'Settings' },
      { to: '/admin/resets', label: 'Password Resets' },
      { to: '/admin/test-email', label: 'Test Email' },
      { to: '/admin/log', label: 'Activity Log' },
    ],
  },
]

export default function Admin() {
  const { isBoard } = useAuth()
  if (!isBoard) return <Navigate to="/" replace />

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Admin Panel</h1>
      <div className="flex gap-8">
        <nav className="w-44 shrink-0 space-y-4">
          {sections.map(section => (
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
