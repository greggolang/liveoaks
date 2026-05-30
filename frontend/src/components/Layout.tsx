import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin, isBoard } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-green-700 text-white shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold tracking-wide">
            🎾 Liveoaks Tennis Club
          </Link>
          <div className="flex items-center gap-6 text-sm font-medium">
            <Link to="/bookings" className="hover:text-green-200 transition">Book a Court</Link>
            <Link to="/announcements" className="hover:text-green-200 transition">Announcements</Link>
            {isBoard && (
              <Link to="/admin" className="hover:text-green-200 transition">Admin</Link>
            )}
            <div className="flex items-center gap-3 ml-4">
              <span className="text-green-200 text-xs">{user?.first_name} {user?.last_name}</span>
              <button
                onClick={handleLogout}
                className="bg-green-800 hover:bg-green-900 px-3 py-1 rounded text-xs transition"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
