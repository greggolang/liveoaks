import { useEffect, useState } from 'react'
import { api } from '../api/client'

interface Due { id: string; amount: number; due_date: string; paid_at?: string; status: string }

export default function MyDues() {
  const [dues, setDues] = useState<Due[]>([])
  useEffect(() => { api.dues.myDues().then(d => setDues(d as Due[])) }, [])

  const statusColor: Record<string, string> = {
    paid: 'bg-green-100 text-green-700',
    unpaid: 'bg-yellow-100 text-yellow-700',
    waived: 'bg-gray-100 text-gray-500',
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">My Dues</h1>
      {dues.length === 0 ? (
        <p className="text-gray-400 text-sm">No dues on record.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Due Date</th>
                <th className="px-4 py-3 text-left">Amount</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dues.map(d => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{new Date(d.due_date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-medium">${d.amount.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[d.status]}`}>{d.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{d.paid_at ? new Date(d.paid_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}
