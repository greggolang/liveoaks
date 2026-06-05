import { useEffect, useState } from 'react'
import { parseDate } from '../../utils/dates'
import { api } from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'

const HOURS = Array.from({ length: 24 }, (_, i) => i * 0.5 + 8)

function fmt12(slot: number) {
  const h = Math.floor(slot) % 12 || 12
  const m = slot % 1 === 0.5 ? '30' : '00'
  return `${h}:${m} ${Math.floor(slot) < 12 ? 'AM' : 'PM'}`
}

function slotToTime(slot: number): string {
  const h = Math.floor(slot)
  const m = slot % 1 === 0.5 ? '30' : '00'
  return `${String(h).padStart(2, '0')}:${m}`
}

interface LBEvent {
  id: string; title: string; description: string; start_time: string; end_time?: string
  max_players: number; confirmed: number; waitlisted: number; invited: number; declined: number
}
interface Invitation {
  id: string; event_id: string; user_id: string; name: string; email: string; usta_ranking: string
  status: string; position?: number; invited_at: string; responded_at?: string
}
interface PreviewMember { user_id: string; name: string; email: string; usta_ranking: string }

const USTA_LEVELS = ['2.5', '3.0', '3.5', '4.0', '4.5', '5.0']
const STATUS_COLORS: Record<string, string> = {
  confirmed:  'bg-green-100 text-green-700',
  waitlisted: 'bg-yellow-100 text-yellow-800',
  invited:    'bg-blue-100 text-blue-700',
  declined:   'bg-gray-100 text-gray-500',
  cancelled:  'bg-red-100 text-red-500',
}

function fmtDT(iso: string) {
  return parseDate(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

interface Court { id: number; name: string; number: number }
interface DayBooking { id: string; court_id: number; start_time: string; end_time: string }

export default function AdminLiveball() {
  const { user } = useAuth()
  const [events, setEvents] = useState<LBEvent[]>([])
  const [selected, setSelected] = useState<LBEvent | null>(null)
  const [tab, setTab] = useState<'roster' | 'invite'>('roster')
  const [invitations, setInvitations] = useState<Invitation[]>([])

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [cForm, setCForm] = useState({ description: '', date: '', time: '', max_players: 8, court_id: 0 })
  const [cSaving, setCSaving] = useState(false)
  const [cErr, setCErr] = useState('')

  // Court/time picker
  const [pickingSlot, setPickingSlot] = useState(false)
  const [pickDate, setPickDate] = useState('')
  const [courts, setCourts] = useState<Court[]>([])
  const [dayBookings, setDayBookings] = useState<DayBooking[]>([])
  const [loadingCourts, setLoadingCourts] = useState(false)

  // Invite form
  const [selectedLevels, setSelectedLevels] = useState<string[]>([])
  const [preview, setPreview] = useState<PreviewMember[]>([])
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())
  const [previewing, setPreviewing] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ sent: number; skipped: number } | null>(null)

  useEffect(() => {
    api.liveball.admin.list().then(d => setEvents(d as LBEvent[]))
    api.courts.list().then(d => setCourts(d as Court[]))
  }, [])

  // Load bookings for the date being browsed in the slot picker
  useEffect(() => {
    if (!pickDate) { setDayBookings([]); return }
    setLoadingCourts(true)
    api.bookings.list(pickDate)
      .then(d => setDayBookings(d as DayBooking[]))
      .catch(() => {})
      .finally(() => setLoadingCourts(false))
  }, [pickDate])

  const isSlotAvailable = (courtId: number, slot: number): boolean => {
    if (!pickDate) return false
    const start = parseDate(`${pickDate}T${slotToTime(slot)}`)
    const end   = new Date(start.getTime() + 90 * 60 * 1000)
    return !dayBookings.some(b =>
      b.court_id === courtId &&
      parseDate(b.start_time) < end &&
      parseDate(b.end_time) > start
    )
  }

  const isPastSlot = (slot: number): boolean => {
    if (!pickDate) return false
    return parseDate(`${pickDate}T${slotToTime(slot)}`) < new Date()
  }

  const loadEvent = async (ev: LBEvent) => {
    setSelected(ev)
    setTab('roster')
    setPreview([])
    setSendResult(null)
    const d: any = await api.liveball.admin.roster(ev.id)
    setInvitations(d.invitations ?? [])
    setSelected(d.event)
  }

  const refreshRoster = async () => {
    if (!selected) return
    const d: any = await api.liveball.admin.roster(selected.id)
    setInvitations(d.invitations ?? [])
    setSelected(d.event)
    setEvents(evs => evs.map(e => e.id === d.event.id ? d.event : e))
  }

  const createEvent = async () => {
    if (!cForm.date || !cForm.time || !cForm.court_id) { setCErr('Pick a court and time slot first'); return }
    setCSaving(true); setCErr('')
    try {
      const startDT = parseDate(`${cForm.date}T${cForm.time}`)
      const endDT   = new Date(startDT.getTime() + 90 * 60 * 1000)

      await api.liveball.admin.create({
        title:       '',
        description: cForm.description,
        start_time:  startDT.toISOString(),
        end_time:    endDT.toISOString(),
        max_players: cForm.max_players,
      })

      if (user) {
        await api.bookings.adminCreate({
          user_id:        user.id,
          court_id:       cForm.court_id,
          start_time:     startDT.toISOString(),
          end_time:       endDT.toISOString(),
          match_type:     'liveball',
          notes:          'LiveBall Event',
          players_needed: 0,
        })
      }

      const updated = await api.liveball.admin.list() as LBEvent[]
      setEvents(updated)
      setShowCreate(false)
      setPickingSlot(false)
      setPickDate('')
      setCForm({ description: '', date: '', time: '', max_players: 8, court_id: 0 })
    } catch (e: any) { setCErr(e.message) } finally { setCSaving(false) }
  }

  const toggleLevel = (level: string) => {
    setSelectedLevels(ls => ls.includes(level) ? ls.filter(l => l !== level) : [...ls, level])
    setPreview([])
    setSelectedMembers(new Set())
    setSendResult(null)
  }

  const previewInvites = async () => {
    if (!selected || selectedLevels.length === 0) return
    setPreviewing(true)
    try {
      const data = await api.liveball.admin.preview(selected.id, selectedLevels) as PreviewMember[]
      setPreview(data)
      setSelectedMembers(new Set(data.map(m => m.user_id)))
    } finally { setPreviewing(false) }
  }

  const toggleMember = (userId: string) => {
    setSelectedMembers(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId); else next.add(userId)
      return next
    })
  }

  const sendInvites = async () => {
    if (!selected || selectedMembers.size === 0) return
    setSending(true); setSendResult(null)
    try {
      const result = await api.liveball.admin.sendInvites(selected.id, { user_ids: [...selectedMembers] }) as any
      setSendResult(result)
      setPreview([])
      setSelectedMembers(new Set())
      await refreshRoster()
    } catch (e: any) { setCErr(e.message) } finally { setSending(false) }
  }

  const removePlayer = async (userId: string) => {
    if (!selected || !confirm('Remove this player? The next waitlisted player will be promoted.')) return
    await api.liveball.admin.removePlayer(selected.id, userId)
    await refreshRoster()
  }

  const cancelEvent = async () => {
    if (!selected || !confirm('Cancel this event? All confirmed and waitlisted players will be notified.')) return
    await api.liveball.admin.cancelEvent(selected.id)
    setEvents(evs => evs.filter(e => e.id !== selected.id))
    setSelected(null)
    setInvitations([])
  }

  const byStatus = (status: string) => invitations.filter(i => i.status === status)
  const confirmed = byStatus('confirmed').sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
  const waitlisted = byStatus('waitlisted').sort((a, b) =>
    (a.responded_at ?? '').localeCompare(b.responded_at ?? ''))
  const pending = byStatus('invited')
  const declined = byStatus('declined')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">LiveBall Events</h1>
          <p className="text-gray-500 text-sm mt-0.5">Invite USTA groups — first to respond gets a spot.</p>
        </div>
        <button onClick={() => {
          setShowCreate(s => !s)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
          className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
          + New Event
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="font-semibold text-gray-700">Create LiveBall Event</h2>

          {/* ── Step 1: Court + time picker ── */}
          {cForm.date && cForm.time && cForm.court_id && !pickingSlot ? (
            /* Selected slot summary chip */
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-800">
                  {courts.find(c => c.id === cForm.court_id)?.name}
                  {' · '}
                  {parseDate(`${cForm.date}T${cForm.time}`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
                <p className="text-xs text-green-600 mt-0.5">
                  {parseDate(`${cForm.date}T${cForm.time}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  {' → '}
                  {new Date(parseDate(`${cForm.date}T${cForm.time}`).getTime() + 90 * 60 * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  {' '}(1½ hours)
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setPickingSlot(true); setCForm(f => ({ ...f, date: '', time: '', court_id: 0 })) }}
                className="text-xs text-green-600 hover:text-green-800 font-medium transition shrink-0">
                Change
              </button>
            </div>
          ) : pickingSlot || !cForm.date ? (
            /* Court grid picker */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Pick a court and time slot</p>
                {(cForm.date || pickDate) && (
                  <button type="button"
                    onClick={() => { setPickingSlot(false); setPickDate('') }}
                    className="text-xs text-gray-400 hover:text-gray-600 transition">
                    Cancel
                  </button>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Date *</label>
                <input type="date" value={pickDate}
                  onChange={e => setPickDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className="w-full sm:w-48 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              {pickDate && (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  {loadingCourts ? (
                    <div className="py-8 text-center text-sm text-gray-400">Loading availability…</div>
                  ) : (
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="w-20 py-2 px-3 text-gray-400 text-xs font-medium text-left">Time</th>
                          {courts.map(c => (
                            <th key={c.id} className="py-2 px-2 text-center text-xs font-semibold text-gray-700">{c.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {HOURS.map(slot => {
                          const past = isPastSlot(slot)
                          return (
                            <tr key={slot} className={`border-b last:border-0 ${slot % 1 === 0 ? 'border-gray-100' : 'border-gray-50'}`}>
                              <td className={`px-3 text-xs font-medium whitespace-nowrap align-middle ${slot % 1 === 0 ? 'py-1 text-gray-400' : 'py-0.5 text-gray-300'}`}>
                                {fmt12(slot)}
                              </td>
                              {courts.map(c => {
                                const available = !past && isSlotAvailable(c.id, slot)
                                return (
                                  <td key={c.id} className="px-1.5 py-0.5 align-top">
                                    <button
                                      type="button"
                                      disabled={!available}
                                      onClick={() => {
                                        setCForm(f => ({ ...f, date: pickDate, time: slotToTime(slot), court_id: c.id }))
                                        setPickingSlot(false)
                                      }}
                                      className={`w-full h-7 rounded border text-xs font-medium transition
                                        ${past
                                          ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'
                                          : available
                                            ? 'bg-white border-gray-200 text-gray-400 hover:bg-green-50 hover:border-green-400 hover:text-green-700 cursor-pointer'
                                            : 'bg-slate-100 border-slate-100 text-slate-400 cursor-not-allowed'
                                        }`}>
                                      {!available && !past ? '–' : ''}
                                    </button>
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                  <div className="flex gap-4 px-3 py-2 border-t border-gray-100 text-xs text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 bg-white border border-gray-200 rounded inline-block" />
                      Available — click to select
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 bg-slate-100 rounded inline-block" />
                      Booked
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* ── Step 2: Spots + description (only shown after court/time is picked) ── */}
          {cForm.date && cForm.time && cForm.court_id && !pickingSlot && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Player spots *</label>
                <input type="number" min={2} max={64} value={cForm.max_players}
                  onChange={e => setCForm(f => ({ ...f, max_players: +e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <textarea value={cForm.description} onChange={e => setCForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Details for members (optional)" rows={2}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          )}

          {cErr && <p className="text-red-500 text-xs">{cErr}</p>}
          <div className="flex gap-2">
            {cForm.date && cForm.time && cForm.court_id && !pickingSlot && (
              <button onClick={createEvent} disabled={cSaving}
                className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
                {cSaving ? 'Creating…' : 'Create Event'}
              </button>
            )}
            <button onClick={() => {
              setShowCreate(false)
              setPickingSlot(false)
              setPickDate('')
              setCForm({ description: '', date: '', time: '', max_players: 8, court_id: 0 })
              setCErr('')
            }}
              className="text-sm text-gray-400 hover:text-gray-600 px-3">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex gap-4 flex-col md:flex-row">
        {/* Event list */}
        <div className="w-full md:w-64 shrink-0 space-y-2">
          {events.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">No LiveBall events yet.</p>
          )}
          {events.map(ev => (
            <button key={ev.id} onClick={() => loadEvent(ev)}
              className={`w-full text-left p-3 rounded-xl border transition ${
                selected?.id === ev.id ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200 hover:border-gray-300'
              }`}>
              <p className="text-sm font-semibold text-gray-800 truncate">{ev.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{fmtDT(ev.start_time)}</p>
              <div className="flex gap-2 mt-1.5 flex-wrap">
                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">{ev.confirmed}/{ev.max_players} confirmed</span>
                {ev.waitlisted > 0 && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">{ev.waitlisted} waitlisted</span>}
                {ev.invited > 0 && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">{ev.invited} pending</span>}
              </div>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        {selected ? (
          <div className="flex-1 min-w-0 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-gray-800">{selected.title}</h2>
                <p className="text-sm text-gray-500">
                  {fmtDT(selected.start_time)}
                  {selected.end_time && (
                    <span className="text-gray-400">
                      {' → '}
                      {parseDate(selected.end_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  )}
                </p>
                {selected.description && <p className="text-xs text-gray-400 mt-0.5">{selected.description}</p>}
              </div>
              <button onClick={cancelEvent}
                className="text-xs text-red-400 hover:text-red-600 shrink-0">Cancel Event</button>
            </div>

            {/* Progress bar */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Roster</span>
                <span className="font-semibold text-green-700">{selected.confirmed} / {selected.max_players} confirmed</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div className="bg-green-600 h-2.5 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (selected.confirmed / selected.max_players) * 100)}%` }} />
              </div>
              <div className="flex gap-4 mt-2 text-xs text-gray-400">
                {selected.waitlisted > 0 && <span>⏳ {selected.waitlisted} on waitlist</span>}
                {selected.invited > 0 && <span>📧 {selected.invited} awaiting response</span>}
                {selected.declined > 0 && <span>✗ {selected.declined} declined</span>}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-gray-200">
              {(['roster', 'invite'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 capitalize transition ${
                    tab === t ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  {t === 'roster' ? 'Roster & Responses' : 'Send Invites'}
                </button>
              ))}
            </div>

            {/* ROSTER TAB */}
            {tab === 'roster' && (
              <div className="space-y-4">
                {/* Confirmed */}
                {confirmed.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-gray-100 bg-green-50 text-sm font-semibold text-green-800">
                      ✅ Confirmed ({confirmed.length}/{selected.max_players})
                    </div>
                    <div className="divide-y divide-gray-50">
                      {confirmed.map(inv => (
                        <div key={inv.id} className="flex items-center justify-between px-4 py-2.5">
                          <div>
                            <span className="text-sm font-medium text-gray-800">
                              #{inv.position} {inv.name}
                            </span>
                            {inv.usta_ranking && <span className="ml-2 text-xs text-gray-400">USTA {inv.usta_ranking}</span>}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400">
                              {inv.responded_at ? parseDate(inv.responded_at).toLocaleDateString() : ''}
                            </span>
                            <button onClick={() => removePlayer(inv.user_id)}
                              className="text-xs text-red-400 hover:text-red-600">Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Waitlisted */}
                {waitlisted.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-gray-100 bg-yellow-50 text-sm font-semibold text-yellow-800">
                      ⏳ Waitlist ({waitlisted.length})
                    </div>
                    <div className="divide-y divide-gray-50">
                      {waitlisted.map((inv, i) => (
                        <div key={inv.id} className="flex items-center justify-between px-4 py-2.5">
                          <div>
                            <span className="text-sm font-medium text-gray-700">#{i + 1} {inv.name}</span>
                            {inv.usta_ranking && <span className="ml-2 text-xs text-gray-400">USTA {inv.usta_ranking}</span>}
                          </div>
                          <button onClick={() => removePlayer(inv.user_id)}
                            className="text-xs text-red-400 hover:text-red-600">Remove</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pending */}
                {pending.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-gray-100 bg-blue-50 text-sm font-semibold text-blue-800">
                      📧 Awaiting Response ({pending.length})
                    </div>
                    <div className="divide-y divide-gray-50">
                      {pending.map(inv => (
                        <div key={inv.id} className="flex items-center justify-between px-4 py-2.5">
                          <div>
                            <span className="text-sm text-gray-700">{inv.name}</span>
                            {inv.usta_ranking && <span className="ml-2 text-xs text-gray-400">USTA {inv.usta_ranking}</span>}
                          </div>
                          <span className="text-xs text-gray-400">
                            Invited {parseDate(inv.invited_at).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Declined */}
                {declined.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-gray-100 text-xs font-semibold text-gray-500">
                      Declined ({declined.length})
                    </div>
                    <div className="divide-y divide-gray-50">
                      {declined.map(inv => (
                        <div key={inv.id} className="flex items-center justify-between px-4 py-2 opacity-60">
                          <span className="text-sm text-gray-600">{inv.name}</span>
                          <span className="text-xs text-gray-400">
                            {inv.usta_ranking ? `USTA ${inv.usta_ranking}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {invitations.length === 0 && (
                  <p className="text-gray-400 text-sm text-center py-8">No invitations sent yet. Go to "Send Invites".</p>
                )}
              </div>
            )}

            {/* INVITE TAB */}
            {tab === 'invite' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
                  <div>
                    <h3 className="font-semibold text-gray-700 mb-1">Select USTA Level(s) to Invite</h3>
                    <p className="text-xs text-gray-400 mb-3">
                      All active members with the selected rating(s) who haven't been invited yet will receive an email.
                      First {selected.max_players} to accept get confirmed — others go to the waitlist.
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {USTA_LEVELS.map(level => (
                        <button key={level} onClick={() => toggleLevel(level)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                            selectedLevels.includes(level)
                              ? 'bg-green-700 text-white border-green-700'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'
                          }`}>
                          USTA {level}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedLevels.length > 0 && (
                    <div className="flex gap-2">
                      <button onClick={previewInvites} disabled={previewing}
                        className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-4 py-2 rounded-lg transition disabled:opacity-50">
                        {previewing ? 'Loading…' : `Preview (${selectedLevels.join(', ')})`}
                      </button>
                      <button onClick={sendInvites} disabled={sending || selectedMembers.size === 0}
                        className="text-sm bg-green-700 hover:bg-green-800 text-white font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
                        {sending ? 'Sending…' : `Send ${selectedMembers.size > 0 ? selectedMembers.size : ''} Invite${selectedMembers.size !== 1 ? 's' : ''}`}
                      </button>
                    </div>
                  )}

                  {sendResult && (
                    <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-sm text-green-700">
                      ✓ Sent <strong>{sendResult.sent}</strong> invite{sendResult.sent !== 1 ? 's' : ''}.
                      {sendResult.skipped > 0 && ` ${sendResult.skipped} already invited.`}
                    </div>
                  )}
                </div>

                {/* Preview list */}
                {preview.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-700">
                        {selectedMembers.size} of {preview.length} member{preview.length !== 1 ? 's' : ''} selected
                      </span>
                      <div className="flex gap-3">
                        <button onClick={() => setSelectedMembers(new Set(preview.map(m => m.user_id)))}
                          className="text-xs font-medium text-green-700 hover:underline">
                          Select all
                        </button>
                        <button onClick={() => setSelectedMembers(new Set())}
                          className="text-xs font-medium text-gray-400 hover:underline">
                          Deselect all
                        </button>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                      {preview.map(m => (
                        <label key={m.user_id} className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gray-50">
                          <input type="checkbox"
                            checked={selectedMembers.has(m.user_id)}
                            onChange={() => toggleMember(m.user_id)}
                            className="rounded border-gray-300 text-green-700 focus:ring-green-600"
                          />
                          <span className="text-sm text-gray-700 flex-1">{m.name}</span>
                          <div className="text-xs text-gray-400 flex gap-3">
                            <span>USTA {m.usta_ranking}</span>
                            <span>{m.email}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {preview.length === 0 && selectedLevels.length > 0 && !previewing && (
                  <p className="text-sm text-gray-400 text-center py-4">
                    Click Preview to see matching members, then Send Invites.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-300 text-sm py-20">
            Select an event to manage it
          </div>
        )}
      </div>
    </div>
  )
}
