import { useEffect, useState } from 'react'
import { api } from '../../api/client'

type Purchase = {
  id: string; user_id: string; member_name: string
  item_name: string; item_price: number; quantity: number; total: number
  notes?: string; created_at: string
}

function fmtDate(ts: string) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function AdminKioskPurchases() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.kiosk.adminPurchases()
      .then(d => setPurchases(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = purchases.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return p.member_name.toLowerCase().includes(q) || p.item_name.toLowerCase().includes(q)
  })

  // Totals
  const grandTotal = filtered.reduce((s, p) => s + p.total, 0)

  // Group by member for summary
  const byMember: Record<string, { name: string; total: number; count: number }> = {}
  filtered.forEach(p => {
    if (!byMember[p.user_id]) byMember[p.user_id] = { name: p.member_name, total: 0, count: 0 }
    byMember[p.user_id].total += p.total
    byMember[p.user_id].count += p.quantity
  })
  const memberTotals = Object.values(byMember).sort((a, b) => b.total - a.total)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Kiosk Purchases</h2>
          <p className="text-sm text-gray-500 mt-0.5">Pro shop charges recorded on the club iPad</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Total outstanding</p>
          <p className="text-2xl font-bold text-green-700">${grandTotal.toFixed(2)}</p>
        </div>
      </div>

      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Filter by member or item…"
        className="mb-5 w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      />

      {/* Per-member summary */}
      {memberTotals.length > 0 && (
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {memberTotals.map(m => (
            <button key={m.name} onClick={() => setSearch(m.name)}
              className="bg-white border border-gray-200 rounded-xl p-3 text-left hover:border-green-400 transition">
              <p className="font-semibold text-gray-800 text-sm truncate">{m.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{m.count} item{m.count !== 1 ? 's' : ''}</p>
              <p className="text-green-700 font-bold mt-1">${m.total.toFixed(2)}</p>
            </button>
          ))}
        </div>
      )}

      {/* Transaction log */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Member</th>
                <th className="px-4 py-3 text-left">Item</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No purchases found.</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(p.created_at)}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    <button onClick={() => setSearch(p.member_name)}
                      className="hover:text-green-700 transition text-left">
                      {p.member_name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{p.item_name}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{p.quantity}</td>
                  <td className="px-4 py-3 text-right text-gray-600">${p.item_price.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800">${p.total.toFixed(2)}</td>
                </tr>
              ))}
              {filtered.length > 0 && (
                <tr className="bg-gray-50 font-bold">
                  <td colSpan={5} className="px-4 py-3 text-right text-gray-700 text-sm">Grand Total</td>
                  <td className="px-4 py-3 text-right text-green-700">${grandTotal.toFixed(2)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
