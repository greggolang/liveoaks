import { useEffect, useState } from 'react'
import { api } from '../../api/client'

interface Entry { id: string; first_name: string; last_name: string; email: string; phone?: string; notes?: string; status: string; created_at: string }

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  contacted: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
}

export default function AdminWaitlist() {
  const [entries, setEntries] = useState<Entry[]>([])
  const load = () => api.waitlist.list().then(d => setEntries(d as Entry[]))
  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">Waitlist</h2>
        <span className="text-sm text-gray-400">{entries.length} entries</span>
      </div>

      {entries.length === 0 ? (
        <p className="text-gray-400 text-sm">No one on the waitlist.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Contact</th>
                <th className="px-4 py-3 text-left">Notes</th>
                <th className="px-4 py-3 text-left">Applied</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map(w => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{w.first_name} {w.last_name}</td>
                  <td className="px-4 py-3">
                    <div className="text-gray-600">{w.email}</div>
                    {w.phone && <div className="text-xs text-gray-400">{w.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{w.notes ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(w.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <select value={w.status} onChange={async e => { await api.waitlist.updateStatus(w.id, e.target.value); load() }}
                      className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLOR[w.status]}`}>
                      <option value="pending">Pending</option>
                      <option value="contacted">Contacted</option>
                      <option value="accepted">Accepted</option>
                      <option value="declined">Declined</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={async () => { if (confirm('Remove from waitlist?')) { await api.waitlist.delete(w.id); load() } }}
                      className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
