import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api/client'

interface Announcement {
  id: string
  title: string
  body: string
  created_at: string
  author: { first_name: string; last_name: string }
}

export default function Dashboard() {
  const { user } = useAuth()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  useEffect(() => {
    api.announcements.list().then(d => setAnnouncements((d as Announcement[]).slice(0, 3)))
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-1">
        Welcome back, {user?.first_name}!
      </h1>
      <p className="text-gray-500 mb-8">Here's what's happening at the club.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        <Link to="/bookings"
          className="bg-green-700 text-white rounded-xl p-6 hover:bg-green-800 transition shadow">
          <div className="text-3xl mb-2">🎾</div>
          <div className="font-semibold text-lg">Book a Court</div>
          <div className="text-green-200 text-sm mt-1">Reserve one of our 4 courts</div>
        </Link>
        <Link to="/bookings"
          className="bg-white border border-gray-200 rounded-xl p-6 hover:border-green-400 transition shadow-sm">
          <div className="text-3xl mb-2">📅</div>
          <div className="font-semibold text-lg text-gray-800">My Bookings</div>
          <div className="text-gray-500 text-sm mt-1">View your upcoming reservations</div>
        </Link>
        <Link to="/announcements"
          className="bg-white border border-gray-200 rounded-xl p-6 hover:border-green-400 transition shadow-sm">
          <div className="text-3xl mb-2">📢</div>
          <div className="font-semibold text-lg text-gray-800">Announcements</div>
          <div className="text-gray-500 text-sm mt-1">Club news and updates</div>
        </Link>
      </div>

      <h2 className="text-lg font-semibold text-gray-700 mb-4">Latest Announcements</h2>
      {announcements.length === 0 ? (
        <p className="text-gray-400 text-sm">No announcements yet.</p>
      ) : (
        <div className="space-y-4">
          {announcements.map(a => (
            <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-gray-800">{a.title}</h3>
              <p className="text-gray-600 text-sm mt-1 line-clamp-2">{a.body}</p>
              <p className="text-gray-400 text-xs mt-2">
                {a.author.first_name} {a.author.last_name} · {new Date(a.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
