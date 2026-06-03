import { useEffect, useState } from 'react'
import { parseDate } from '../../utils/dates'
import { api } from '../../api/client'

interface Booking {
  id: string; user_id: string; court_id: number
  start_time: string; end_time: string; notes?: string
  match_type?: string; players?: string[]
  user: { first_name: string; last_name: string }
  court: { name: string; number: number }
}
interface Court { id: number; name: string; number: number }
interface Member { id: string; first_name: string; last_name: string; email: string }

const MATCH_TYPES = [
  { value: 'casual',        label: 'Hit Session' },
  { value: 'singles',       label: 'Singles' },
  { value: 'doubles',       label: 'Doubles' },
  { value: 'teaching_pro',  label: 'Teaching Pro' },
  { value: 'ball_machine',  label: 'Ball Machine' },
]

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = Math.floor(i / 2) + 8
  const m = i % 2 === 0 ? '00' : '30'
  const label = `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`
  return { value: `${String(h).padStart(2,'0')}:${m}`, label }
})

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function AdminBookings() {
  const [date, setDate] = useState(todayStr())
  const [bookings, setBookings] = useState<Booking[]>([])
  const [courts, setCourts] = useState<Court[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({
    user_id: '', court_id: '', date: todayStr(), start: '08:00', duration: '1.5', match_type: 'casual', notes: '',
  })
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')

  const load = () => {
    setLoading(true)
    api.bookings.list(date).then(d => setBookings(d as Booking[])).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [date])

  useEffect(() => {
    api.courts.list().then(d => setCourts(d as Court[]))
    api.members.directory().then(d => setMembers((d as any[]).map(m => ({
      id: m.id, first_name: m.first_name, last_name: m.last_name, email: m.email,
    }))))
  }, [])

  const handleCancel = async (id: string, name: string) => {
    if (!confirm(`Cancel ${name}'s booking?`)) return
    await api.bookings.delete(id)
    load()
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError('')
    setCreating(true)
    try {
      const durationHrs = parseFloat(createForm.duration)
      const [h, m] = createForm.start.split(':').map(Number)
      const start = new Date(`${createForm.date}T${createForm.start}:00`)
      const end = new Date(start.getTime() + durationHrs * 3600000)
      await api.bookings.adminCreate({
        user_id: createForm.user_id,
        court_id: parseInt(createForm.court_id),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        match_type: createForm.match_type,
        notes: createForm.notes,
        players_needed: 0,
      })
      setShowCreate(false)
      setCreateForm({ user_id: '', court_id: '', date: todayStr(), start: '08:00', duration: '1.5', match_type: 'casual', notes: '' })
      setMemberSearch('')
      if (createForm.date === date) load()
    } catch (err: any) {
      setCreateError(err.message)
    } finally { setCreating(false) }
  }

  // Group bookings by court for utilization display
  const slotCount = 24 // 8am–8pm in 30min slots
  const utilization = courts.map(c => {
    const courtBookings = bookings.filter(b => b.court_id === c.id)
    const bookedSlots = courtBookings.reduce((sum, b) => {
      const mins = (parseDate(b.end_time).getTime() - parseDate(b.start_time).getTime()) / 60000
      return sum + Math.ceil(mins / 30)
    }, 0)
    return { court: c, bookings: courtBookings, pct: Math.round((bookedSlots / slotCount) * 100) }
  })

  const filteredMembers = memberSearch.length >= 1
    ? members.filter(m =>
        `${m.first_name} ${m.last_name}`.toLowerCase().includes(memberSearch.toLowerCase()) ||
        m.email.toLowerCase().includes(memberSearch.toLowerCase())
      ).slice(0, 8)
    : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Court Bookings</h2>
        <button onClick={() => { setShowCreate(s => !s); setCreateError('') }}
          className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
          {showCreate ? 'Cancel' : '+ Create Booking'}
        </button>
      </div>

      {/* Create booking panel */}
      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
          <p className="font-semibold text-gray-700 text-sm">Create Booking for Member</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Member picker */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Member *</label>
              <div className="relative">
                <input
                  value={memberSearch}
                  onChange={e => { setMemberSearch(e.target.value); setCreateForm(f => ({ ...f, user_id: '' })) }}
                  placeholder="Search member by name or email…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                {createForm.user_id && (
                  <span className="absolute right-3 top-2 text-xs text-green-700 font-medium">✓ Selected</span>
                )}
              </div>
              {filteredMembers.length > 0 && !createForm.user_id && (
                <div className="border border-gray-200 rounded-lg mt-1 divide-y divide-gray-100 bg-white max-h-36 overflow-y-auto shadow">
                  {filteredMembers.map(m => (
                    <div key={m.id} onClick={() => { setCreateForm(f => ({ ...f, user_id: m.id })); setMemberSearch(`${m.first_name} ${m.last_name}`) }}
                      className="px-3 py-2 hover:bg-gray-50 cursor-pointer">
                      <div className="text-sm font-medium text-gray-800">{m.first_name} {m.last_name}</div>
                      <div className="text-xs text-gray-400">{m.email}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Court */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Court *</label>
              <select value={createForm.court_id} onChange={e => setCreateForm(f => ({ ...f, court_id: e.target.value }))} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">Select court…</option>
                {courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {/* Date */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
              <input type="date" value={createForm.date} onChange={e => setCreateForm(f => ({ ...f, date: e.target.value }))} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            {/* Start time */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Time *</label>
              <select value={createForm.start} onChange={e => setCreateForm(f => ({ ...f, start: e.target.value }))} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </div>
            {/* Duration */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Duration</label>
              <select value={createForm.duration} onChange={e => setCreateForm(f => ({ ...f, duration: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="1">1 hour</option>
                <option value="1.5">1½ hours</option>
              </select>
            </div>
            {/* Match type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select value={createForm.match_type} onChange={e => setCreateForm(f => ({ ...f, match_type: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                {MATCH_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {/* Notes */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
              <input value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. Pro lesson, clinic…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
          {createError && <p className="text-red-600 text-sm">{createError}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={creating || !createForm.user_id || !createForm.court_id}
              className="bg-green-700 hover:bg-green-800 text-white font-semibold px-5 py-2 rounded-lg text-sm transition disabled:opacity-50">
              {creating ? 'Creating…' : 'Create Booking'}
            </button>
            <button type="button" onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Date picker + utilization */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          <button onClick={() => setDate(todayStr())}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
            Today
          </button>
          {loading && <span className="text-xs text-gray-400">Loading…</span>}
        </div>

        {/* Court utilization bars */}
        {courts.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            {utilization.map(({ court, bookings: cb, pct }) => (
              <div key={court.id} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-gray-700">{court.name}</span>
                  <span className="text-gray-400">{cb.length} booking{cb.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${pct}%` }} />
                </div>
                <div className="text-xs text-gray-400">{pct}% utilized</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bookings table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {bookings.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400">No bookings on this date.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">Court</th>
                <th className="px-4 py-3 text-left">Member</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Players</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bookings
                .sort((a, b) => parseDate(a.start_time).getTime() - parseDate(b.start_time).getTime())
                .map(b => {
                  const start = parseDate(b.start_time)
                  const end = parseDate(b.end_time)
                  const dMins = (end.getTime() - start.getTime()) / 60000
                  const matchLabel = b.match_type === 'ball_machine' ? '🤖 Ball Machine'
                    : b.match_type === 'singles' ? 'Singles'
                    : b.match_type === 'doubles' ? 'Doubles'
                    : b.match_type === 'teaching_pro' ? 'Teaching Pro'
                    : 'Hit Session'
                  return (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                        {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        {' – '}
                        {end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        <span className="ml-2 text-xs text-gray-400">{dMins >= 60 ? `${dMins/60}h` : `${dMins}m`}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{b.court.name}</td>
                      <td className="px-4 py-3 text-gray-800">{b.user.first_name} {b.user.last_name}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{matchLabel}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {(b.players ?? []).length > 0
                          ? (b.players ?? []).map(p => p.split(' ')[0]).join(', ')
                          : <span className="text-gray-300 italic">Solo</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleCancel(b.id, `${b.user.first_name} ${b.user.last_name}`)}
                          className="text-xs text-red-400 hover:text-red-600 font-medium transition">
                          Cancel
                        </button>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
