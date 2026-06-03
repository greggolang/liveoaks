import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { parseDate } from '../../utils/dates'

interface Guest { id: string; guest_name: string; guest_email?: string; member_first_name: string; member_last_name: string; visit_date: string; notes?: string; fee: number; source: string }

export default function AdminGuests() {
  const [guests, setGuests] = useState<Guest[]>([])
  useEffect(() => { api.guests.adminList().then(d => setGuests(d as Guest[])) }, [])

  const totalFees = guests.reduce((sum, g) => sum + (g.fee ?? 0), 0)
  const pendingFees = guests.filter(g => g.fee > 0)

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">Guest Passes</h2>
        <span className="text-sm text-gray-400">{guests.length} total</span>
      </div>

      {pendingFees.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-5 py-3 mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-orange-800">Guest Fees Pending</p>
            <p className="text-xs text-orange-600 mt-0.5">{pendingFees.length} guest visit{pendingFees.length !== 1 ? 's' : ''} with fees to be collected on next quarterly dues</p>
          </div>
          <p className="text-lg font-bold text-orange-700">${totalFees.toFixed(2)}</p>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Guest</th>
              <th className="px-4 py-3 text-left">Member</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Fee</th>
              <th className="px-4 py-3 text-left">Source</th>
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
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{parseDate(g.visit_date).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  {g.fee > 0
                    ? <span className="text-xs font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">${g.fee.toFixed(2)}</span>
                    : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-4 py-3">
                  {g.source === 'booking'
                    ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Booking</span>
                    : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Manual</span>}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{g.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
