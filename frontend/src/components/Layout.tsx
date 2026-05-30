import { useState } from 'react'
import { Link, useNavigate, NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { APP_VERSION } from '../version'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin, isBoard } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = async () => { await logout(); navigate('/login') }

  const navLink = ({ isActive }: { isActive: boolean }) =>
    `hover:text-green-200 transition text-sm ${isActive ? 'text-white font-semibold' : 'text-green-100'}`

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-green-700 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Link to="/dashboard" className="text-lg font-bold tracking-wide shrink-0">
              🎾 Liveoaks TC
              <span className="ml-2 text-green-300 text-xs font-normal tracking-normal">v{APP_VERSION}</span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-5 text-sm font-medium flex-wrap justify-end">
              <NavLink to="/bookings" className={navLink}>Book Court</NavLink>
              <NavLink to="/directory" className={navLink}>Directory</NavLink>
              <NavLink to="/guests" className={navLink}>Guests</NavLink>
              <NavLink to="/friends" className={navLink}>Friends</NavLink>
              {isBoard && <NavLink to="/admin" className={navLink}>Admin</NavLink>}
              <div className="flex items-center gap-2 ml-2 pl-2 border-l border-green-600">
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
                ['/bookings', 'Book Court'],
                ['/directory', 'Directory'], ['/guests', 'Guests'], ['/friends', 'Friends'],
                ...(isBoard ? [['/admin', 'Admin']] : []),
              ].map(([to, label]) => (
                <Link key={to} to={to} onClick={() => setMenuOpen(false)}
                  className="text-green-100 hover:text-white">{label}</Link>
              ))}
              <button onClick={handleLogout} className="text-left text-green-200 hover:text-white mt-1">Logout</button>
            </div>
          )}
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
