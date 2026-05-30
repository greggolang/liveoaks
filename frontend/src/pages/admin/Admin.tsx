import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function Admin() {
  const { isBoard } = useAuth()
  if (!isBoard) return <Navigate to="/" replace />

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Admin Panel</h1>
      <div className="flex gap-8">
        <nav className="w-44 shrink-0 space-y-1">
          <NavLink to="/admin/users"
            className={({ isActive }) =>
              `block px-4 py-2 rounded-lg text-sm font-medium transition ${isActive ? 'bg-green-100 text-green-800' : 'text-gray-600 hover:bg-gray-100'}`}>
            Members
          </NavLink>
          <NavLink to="/admin/settings"
            className={({ isActive }) =>
              `block px-4 py-2 rounded-lg text-sm font-medium transition ${isActive ? 'bg-green-100 text-green-800' : 'text-gray-600 hover:bg-gray-100'}`}>
            Settings
          </NavLink>
          <NavLink to="/admin/resets"
            className={({ isActive }) =>
              `block px-4 py-2 rounded-lg text-sm font-medium transition ${isActive ? 'bg-green-100 text-green-800' : 'text-gray-600 hover:bg-gray-100'}`}>
            Password Resets
          </NavLink>
        </nav>
        <div className="flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
