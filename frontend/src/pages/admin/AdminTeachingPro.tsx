import { useEffect, useState } from 'react'
import { parseDate } from '../../utils/dates'
import { api } from '../../api/client'

interface Session {
  id: string
  start_time: string; end_time: string
  court: { name: string; number: number }
  user: { first_name: string; last_name: string }
  players: string[]
  notes?: string
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

export default function AdminTeachingPro() {
  const [period, setPeriod] = useState<Period>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(false)

  const { from, to } = dateRange(period, customFrom, customTo)

  const load = async () => {
    if (period === 'custom' && (!customFrom || !customTo)) return
    setLoading(true)
    try {
      const data = await api.teachingPro.list(from, to) as Session[]
      setSessions(data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [period, customFrom, customTo])

  const totalMins = sessions.reduce((sum, s) => {
    return sum + (parseDate(s.end_time).getTime() - parseDate(s.start_time).getTime()) / 60000
  }, 0)
  const totalHours = (totalMins / 60).toFixed(1)

  const proBreakdown = sessions.reduce<Record<string, { name: string; count: number; mins: number }>>((acc, s) => {
    const name = `${s.user.first_name} ${s.user.last_name}`
    if (!acc[name]) acc[name] = { name, count: 0, mins: 0 }
    acc[name].count++
    acc[name].mins += (parseDate(s.end_time).getTime() - parseDate(s.start_time).getTime()) / 60000
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Teaching Pro — Court Time</h2>

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Sessions', value: sessions.length },
          { label: 'Total Court Hours', value: totalHours + ' hrs' },
          { label: 'Active Pros', value: Object.keys(proBreakdown).length },
          { label: 'Period', value: `${from} – ${to}` },
        ].map(c => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="text-2xl font-bold text-gray-800">{c.value}</div>
            <div className="text-xs text-gray-500 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Pro breakdown */}
      {Object.keys(proBreakdown).length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Breakdown by Pro</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Pro</th>
                  <th className="px-4 py-3 text-right">Sessions</th>
                  <th className="px-4 py-3 text-right">Court Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Object.values(proBreakdown).sort((a, b) => b.count - a.count).map(pro => (
                  <tr key={pro.name} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{pro.name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{pro.count}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{(pro.mins / 60).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Session list */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">
            Sessions ({sessions.length})
          </h3>
        </div>
        {loading ? (
          <p className="px-5 py-6 text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Time</th>
                  <th className="px-4 py-3 text-right">Duration</th>
                  <th className="px-4 py-3 text-left">Court</th>
                  <th className="px-4 py-3 text-left">Pro (Host)</th>
                  <th className="px-4 py-3 text-left">Student(s)</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">No teaching sessions in this period.</td></tr>
                ) : sessions.map(s => {
                  const start = parseDate(s.start_time)
                  const end = parseDate(s.end_time)
                  const dMins = (end.getTime() - start.getTime()) / 60000
                  const students = s.players.filter(p => p !== `${s.user.first_name} ${s.user.last_name}`)
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">
                        {start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">
                        {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        {' – '}
                        {end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600 text-xs">
                        {dMins >= 90 ? '1h 30m' : dMins >= 60 ? '1h' : `${dMins}m`}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 text-sm">{s.court.name}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-800 text-sm">
                        {s.user.first_name} {s.user.last_name}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">
                        {students.length > 0 ? students.join(', ') : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{s.notes ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
              {sessions.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 font-semibold text-gray-700 text-sm">
                    <td className="px-4 py-2.5" colSpan={2}>Total</td>
                    <td className="px-4 py-2.5 text-right">{totalHours} hrs</td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
