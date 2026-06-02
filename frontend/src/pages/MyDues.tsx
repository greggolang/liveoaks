import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

const ZELLE_EMAIL = 'billing@liveoakstennis.com'

interface Due { id: string; amount: number; due_date: string; paid_at?: string; status: string }

export default function MyDues() {
  const [dues, setDues] = useState<Due[]>([])
  const [zelleFor, setZelleFor] = useState<Due | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const { user } = useAuth()

  useEffect(() => { api.dues.myDues().then(d => setDues(d as Due[])) }, [])

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const statusColor: Record<string, string> = {
    paid: 'bg-green-100 text-green-700',
    unpaid: 'bg-yellow-100 text-yellow-700',
    waived: 'bg-gray-100 text-gray-500',
  }

  const memo = `Dues – ${user ? `${user.first_name} ${user.last_name}` : ''}`

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
                <th className="px-4 py-3"></th>
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
                  <td className="px-4 py-3">
                    {d.status === 'unpaid' && (
                      <button
                        onClick={() => { setZelleFor(d); setCopied(null) }}
                        className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium px-3 py-1.5 rounded-lg transition"
                      >
                        Pay via Zelle
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {zelleFor && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
          onClick={() => setZelleFor(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-5">
              <h2 className="text-base font-bold text-gray-800">Pay with Zelle</h2>
              <button onClick={() => setZelleFor(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 space-y-3 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Send to</p>
                  <p className="text-sm font-semibold text-gray-800">{ZELLE_EMAIL}</p>
                </div>
                <button
                  onClick={() => copy(ZELLE_EMAIL, 'email')}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  {copied === 'email' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="border-t border-gray-200" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Amount</p>
                  <p className="text-sm font-semibold text-gray-800">${zelleFor.amount.toFixed(2)}</p>
                </div>
                <button
                  onClick={() => copy(zelleFor.amount.toFixed(2), 'amount')}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  {copied === 'amount' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="border-t border-gray-200" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Memo</p>
                  <p className="text-sm font-semibold text-gray-800">{memo}</p>
                </div>
                <button
                  onClick={() => copy(memo, 'memo')}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  {copied === 'memo' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-400 text-center">
              An admin will mark your dues as paid after receiving your payment.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
