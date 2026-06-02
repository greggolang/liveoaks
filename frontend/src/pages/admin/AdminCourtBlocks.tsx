import { useEffect, useState } from 'react'
import { api } from '../../api/client'

interface Court { id: number; name: string; number: number }
interface CourtBlock {
  id: string
  court_id: number | null
  reason: string
  block_type: 'recurring_weekly' | 'one_time'
  day_of_week?: number
  start_time?: string
  end_time?: string
  one_time_start?: string
  one_time_end?: string
  active: boolean
  created_at: string
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const TIME_OPTS: { value: string; label: string }[] = []
for (let h = 6; h <= 20; h++) {
  for (const m of ['00', '30']) {
    if (h === 20 && m === '30') break
    const label = `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`
    TIME_OPTS.push({ value: `${String(h).padStart(2, '0')}:${m}`, label })
  }
}

function fmtTime(t?: string) {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

function fmtDateTime(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function scheduleLabel(b: CourtBlock): string {
  if (b.block_type === 'recurring_weekly') {
    const day = b.day_of_week !== undefined ? DAYS[b.day_of_week] : '?'
    return `Every ${day}, ${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}`
  }
  return `${fmtDateTime(b.one_time_start)} – ${fmtDateTime(b.one_time_end)}`
}

function todayLocalStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AdminCourtBlocks() {
  const [blocks, setBlocks] = useState<CourtBlock[]>([])
  const [courts, setCourts] = useState<Court[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    court_id: '',
    reason: 'Court Washing',
    block_type: 'recurring_weekly' as 'recurring_weekly' | 'one_time',
    day_of_week: '2',   // Tuesday default
    start_time: '07:00',
    end_time: '09:00',
    one_time_date: todayLocalStr(),
    one_time_start_time: '07:00',
    one_time_end_time: '09:00',
  })

  const load = () =>
    api.courtBlocks.listAdmin().then(d => setBlocks(d as CourtBlock[]))

  useEffect(() => {
    load()
    api.courts.list().then(d => setCourts(d as Court[]))
  }, [])

  const resetForm = () => {
    setForm({
      court_id: '', reason: 'Court Washing', block_type: 'recurring_weekly',
      day_of_week: '2', start_time: '07:00', end_time: '09:00',
      one_time_date: todayLocalStr(), one_time_start_time: '07:00', one_time_end_time: '09:00',
    })
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        court_id: form.court_id ? parseInt(form.court_id) : null,
        reason: form.reason.trim() || 'Court Washing',
        block_type: form.block_type,
      }
      if (form.block_type === 'recurring_weekly') {
        payload.day_of_week = parseInt(form.day_of_week)
        payload.start_time = form.start_time
        payload.end_time = form.end_time
      } else {
        payload.one_time_start = `${form.one_time_date}T${form.one_time_start_time}:00`
        payload.one_time_end = `${form.one_time_date}T${form.one_time_end_time}:00`
      }
      await api.courtBlocks.create(payload)
      await load()
      resetForm()
      setShowForm(false)
    } catch (e: any) {
      setError(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Delete maintenance block "${label}"?`)) return
    await api.courtBlocks.delete(id)
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Court Maintenance Blocks</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Block court time for maintenance (e.g. court washing). Members cannot book during blocked windows.
          </p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(s => !s) }}
          className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
          + Add Block
        </button>
      </div>

      {/* ── Add form ── */}
      {showForm && (
        <form onSubmit={handleSubmit}
          className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-700">New Maintenance Block</h2>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Reason */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
              <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Court Washing"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>

            {/* Court */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Court</label>
              <select value={form.court_id} onChange={e => setForm(f => ({ ...f, court_id: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">All courts</option>
                {courts.map(c => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Block type toggle */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Schedule Type</label>
            <div className="flex gap-2">
              {(['recurring_weekly', 'one_time'] as const).map(t => (
                <button key={t} type="button"
                  onClick={() => setForm(f => ({ ...f, block_type: t }))}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition border ${form.block_type === t
                    ? 'bg-green-700 text-white border-green-700'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                  {t === 'recurring_weekly' ? 'Weekly Recurring' : 'One-time'}
                </button>
              ))}
            </div>
          </div>

          {/* Weekly recurring fields */}
          {form.block_type === 'recurring_weekly' && (
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Day of Week</label>
                <select value={form.day_of_week} onChange={e => setForm(f => ({ ...f, day_of_week: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                  {DAYS.map((d, i) => (
                    <option key={i} value={String(i)}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Start Time</label>
                <select value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                  {TIME_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">End Time</label>
                <select value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                  {TIME_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* One-time fields */}
          {form.block_type === 'one_time' && (
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                <input type="date" value={form.one_time_date}
                  onChange={e => setForm(f => ({ ...f, one_time_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Start Time</label>
                <select value={form.one_time_start_time}
                  onChange={e => setForm(f => ({ ...f, one_time_start_time: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                  {TIME_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">End Time</label>
                <select value={form.one_time_end_time}
                  onChange={e => setForm(f => ({ ...f, one_time_end_time: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                  {TIME_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-5 py-2 rounded-lg transition disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Block'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="text-sm text-gray-400 hover:text-gray-600 px-3 transition">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── Block list ── */}
      {blocks.length === 0 ? (
        <p className="text-gray-400 text-sm">No maintenance blocks configured.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Court</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Schedule</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {blocks.map(b => {
                const courtName = b.court_id == null
                  ? 'All courts'
                  : courts.find(c => c.id === b.court_id)?.name ?? `Court ${b.court_id}`
                const label = scheduleLabel(b)
                return (
                  <tr key={b.id}>
                    <td className="px-4 py-3 font-medium text-gray-700">{courtName}</td>
                    <td className="px-4 py-3 text-gray-600">{label}</td>
                    <td className="px-4 py-3 text-gray-600">{b.reason}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        b.block_type === 'recurring_weekly'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-orange-100 text-orange-700'
                      }`}>
                        {b.block_type === 'recurring_weekly' ? `Weekly · ${DAY_SHORT[b.day_of_week ?? 0]}` : 'One-time'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleDelete(b.id, label)}
                        className="text-xs text-red-400 hover:text-red-600 font-medium transition">
                        Delete
                      </button>
                    </td>
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
