import { useEffect, useState } from 'react'
import { api } from '../../api/client'

interface Guest { id: string; guest_name: string; guest_email?: string; member_first_name: string; member_last_name: string; visit_date: string; notes?: string }

export default function AdminGuests() {
  const [guests, setGuests] = useState<Guest[]>([])
  useEffect(() => { api.guests.adminList().then(d => setGuests(d as Guest[])) }, [])

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">Guest Passes</h2>
        <span className="text-sm text-gray-400">{guests.length} total</span>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Guest</th>
              <th className="px-4 py-3 text-left">Member</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {guests.map(g => (
              <tr key={g.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800">{g.guest_name}</div>
                  {g.guest_email && <div className="text-xs text-gray-400">{g.guest_email}</div>}
                </td>
                <td className="px-4 py-3 text-gray-600">{g.member_first_name} {g.member_last_name}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(g.visit_date).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{g.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
