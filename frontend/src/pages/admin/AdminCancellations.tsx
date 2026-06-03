import { useEffect, useState } from 'react'
import { parseDate } from '../../utils/dates'
import { api } from '../../api/client'

interface Cancellation {
  id: string
  court_name: string
  match_type: string
  start_time: string
  end_time: string
  owner_name: string
  reason: string
  cancelled_by_name: string
  cancelled_at: string
}

type Period = 'today' | 'week' | 'month' | 'year' | 'custom'

function dateRange(period: Period, cf: string, ct: string) {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  if (period === 'today') return { from: fmt(today), to: fmt(today) }
  if (period === 'week') {
    const mon = new Date(today); mon.setDate(today.getDate() - today.getDay() + 1)
    return { from: fmt(mon), to: fmt(today) }
  }
  if (period === 'month') return { from: fmt(today).slice(0, 8) + '01', to: fmt(today) }
  if (period === 'year') return { from: fmt(today).slice(0, 5) + '01-01', to: fmt(today) }
  return { from: cf, to: ct }
}

const MATCH_LABELS: Record<string, string> = {
  singles: 'Singles', doubles: 'Doubles', casual: 'Hit Session',
  ball_machine: 'Ball Machine', teaching_pro: 'Teaching Pro',
}

export default function AdminCancellations() {
  const [period, setPeriod] = useState<Period>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [rows, setRows] = useState<Cancellation[]>([])
  const [loading, setLoading] = useState(false)

  const { from, to } = dateRange(period, customFrom, customTo)

  const load = async () => {
    if (period === 'custom' && (!customFrom || !customTo)) return
    setLoading(true)
    try {
      const data = await api.cancellations.list(from, to) as Cancellation[]
      setRows(data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [period, customFrom, customTo])

  // Breakdown by reason
  const reasonBreakdown = rows.reduce<Record<string, number>>((acc, r) => {
    const key = r.reason || 'No reason given'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const reasonRows = Object.entries(reasonBreakdown).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Cancelled Bookings</h2>

      {/* Period filter */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center gap-2">
        {(['today','week','month','year','custom'] as Period[]).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition ${period === p ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : p === 'year' ? 'This Year' : 'Custom'}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            <span className="text-gray-400 text-sm">to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: 'Total Cancellations', value: rows.length },
          { label: 'Distinct Reasons', value: reasonRows.length },
          { label: 'Period', value: `${from} – ${to}` },
        ].map(c => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="text-2xl font-bold text-gray-800">{c.value}</div>
            <div className="text-xs text-gray-500 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Breakdown by reason */}
      {reasonRows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Breakdown by Reason</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Reason</th>
                  <th className="px-4 py-3 text-right">Count</th>
                  <th className="px-4 py-3 text-right">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reasonRows.map(([reason, count]) => (
                  <tr key={reason} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{reason}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{count}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">
                      {rows.length ? Math.round((count / rows.length) * 100) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cancellation list */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Cancellations ({rows.length})</h3>
        </div>
        {loading ? (
          <p className="px-5 py-6 text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Cancelled</th>
                  <th className="px-4 py-3 text-left">Booking Slot</th>
                  <th className="px-4 py-3 text-left">Court</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Member</th>
                  <th className="px-4 py-3 text-left">Cancelled By</th>
                  <th className="px-4 py-3 text-left">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">No cancellations in this period.</td></tr>
                ) : rows.map(r => {
                  const cancelledAt = new Date(r.cancelled_at)
                  const start = parseDate(r.start_time)
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">
                        {cancelledAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {', '}
                        {cancelledAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">
                        {start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' '}
                        {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 text-sm">{r.court_name}</td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{MATCH_LABELS[r.match_type] ?? r.match_type}</td>
                      <td className="px-4 py-2.5 text-gray-800 text-sm">{r.owner_name}</td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{r.cancelled_by_name}</td>
                      <td className="px-4 py-2.5 text-gray-700 text-xs">
                        {r.reason || <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
