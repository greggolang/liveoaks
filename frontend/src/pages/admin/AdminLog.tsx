import { useEffect, useState } from 'react'
import { api } from '../../api/client'

interface Entry {
  id: string
  event: string
  details?: string
  ip?: string
  created_at: string
  actor: string
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  login:                    { label: 'Login',             color: 'bg-green-100 text-green-700' },
  login_failed:             { label: 'Failed Login',      color: 'bg-red-100 text-red-700' },
  password_reset_requested: { label: 'Reset Requested',   color: 'bg-yellow-100 text-yellow-700' },
  password_reset_completed: { label: 'Password Reset',    color: 'bg-blue-100 text-blue-700' },
  booking_created:          { label: 'Booking Created',   color: 'bg-green-100 text-green-700' },
  booking_cancelled:        { label: 'Booking Cancelled', color: 'bg-orange-100 text-orange-700' },
  user_status_changed:      { label: 'Status Changed',    color: 'bg-purple-100 text-purple-700' },
  user_role_changed:        { label: 'Role Changed',      color: 'bg-purple-100 text-purple-700' },
}

export default function AdminLog() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [filter, setFilter] = useState('')

  useEffect(() => {
    api.admin.activityLog().then(d => setEntries(d as Entry[]))
  }, [])

  const filtered = filter
    ? entries.filter(e => e.event === filter)
    : entries

  const eventTypes = [...new Set(entries.map(e => e.event))]

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">Activity Log</h2>
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
          <option value="">All events</option>
          {eventTypes.map(t => (
            <option key={t} value={t}>{EVENT_LABELS[t]?.label ?? t}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-400 text-sm">No log entries yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">Event</th>
                <th className="px-4 py-3 text-left">Actor</th>
                <th className="px-4 py-3 text-left">Details</th>
                <th className="px-4 py-3 text-left">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(e => {
                const meta = EVENT_LABELS[e.event] ?? { label: e.event, color: 'bg-gray-100 text-gray-700' }
                return (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.color}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{e.actor}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{e.details ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{e.ip ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
