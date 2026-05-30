import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const links = [
  { to: '/admin/users', label: 'Members' },
  { to: '/admin/dues', label: 'Dues' },
  { to: '/admin/waitlist', label: 'Waitlist' },
  { to: '/admin/guests', label: 'Guest Passes' },
  { to: '/admin/settings', label: 'Settings' },
  { to: '/admin/resets', label: 'Password Resets' },
  { to: '/admin/log', label: 'Activity Log' },
]

export default function Admin() {
  const { isBoard } = useAuth()
  if (!isBoard) return <Navigate to="/" replace />

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Admin Panel</h1>
      <div className="flex gap-8">
        <nav className="w-44 shrink-0 space-y-1">
          {links.map(l => (
            <NavLink key={l.to} to={l.to}
              className={({ isActive }) =>
                `block px-4 py-2 rounded-lg text-sm font-medium transition ${isActive ? 'bg-green-100 text-green-800' : 'text-gray-600 hover:bg-gray-100'}`}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex-1 min-w-0"><Outlet /></div>
      </div>
    </div>
  )
}
