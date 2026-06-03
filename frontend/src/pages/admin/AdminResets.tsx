import { useEffect, useState } from 'react'
import { parseDate } from '../../utils/dates'
import { api } from '../../api/client'

interface Reset {
  token: string
  first_name: string
  last_name: string
  email: string
  expires_at: string
}

export default function AdminResets() {
  const [resets, setResets] = useState<Reset[]>([])
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    api.admin.passwordResets().then(d => setResets(d as Reset[]))
  }, [])

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/reset-password?token=${token}`
    navigator.clipboard.writeText(url)
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-1">Password Reset Requests</h2>
      <p className="text-sm text-gray-500 mb-4">Reset emails are sent automatically. Use these links as a fallback if a member didn't receive theirs.</p>

      {resets.length === 0 ? (
        <p className="text-gray-400 text-sm">No pending reset requests.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Member</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Expires</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {resets.map(r => (
                <tr key={r.token} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{r.first_name} {r.last_name}</td>
                  <td className="px-4 py-3 text-gray-500">{r.email}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{parseDate(r.expires_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => copyLink(r.token)}
                      className={`px-3 py-1 rounded text-xs font-medium transition ${copied === r.token ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                      {copied === r.token ? 'Copied!' : 'Copy Link'}
                    </button>
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
