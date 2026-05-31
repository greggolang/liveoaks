import { useEffect, useState } from 'react'
import { api } from '../../api/client'

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
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function AdminLiveball() {
  const [events, setEvents] = useState<LBEvent[]>([])
  const [selected, setSelected] = useState<LBEvent | null>(null)
  const [tab, setTab] = useState<'roster' | 'invite'>('roster')
  const [invitations, setInvitations] = useState<Invitation[]>([])

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [cForm, setCForm] = useState({ title: '', description: '', start_time: '', end_time: '', max_players: 8 })
  const [cSaving, setCSaving] = useState(false)
  const [cErr, setCErr] = useState('')

  // Invite form
  const [selectedLevels, setSelectedLevels] = useState<string[]>([])
  const [preview, setPreview] = useState<PreviewMember[]>([])
  const [previewing, setPreviewing] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ sent: number; skipped: number } | null>(null)

  useEffect(() => {
    api.liveball.admin.list().then(d => setEvents(d as LBEvent[]))
  }, [])

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
    setCSaving(true); setCErr('')
    try {
      const payload: any = {
        title: cForm.title,
        description: cForm.description,
        start_time: cForm.start_time ? new Date(cForm.start_time).toISOString() : null,
        end_time: cForm.end_time ? new Date(cForm.end_time).toISOString() : null,
        max_players: cForm.max_players,
      }
      if (!payload.start_time) { setCErr('Start date/time required'); setCSaving(false); return }
      await api.liveball.admin.create(payload)
      const updated = await api.liveball.admin.list() as LBEvent[]
      setEvents(updated)
      setShowCreate(false)
      setCForm({ title: '', description: '', start_time: '', end_time: '', max_players: 8 })
    } catch (e: any) { setCErr(e.message) } finally { setCSaving(false) }
  }

  const toggleLevel = (level: string) => {
    setSelectedLevels(ls => ls.includes(level) ? ls.filter(l => l !== level) : [...ls, level])
    setPreview([])
    setSendResult(null)
  }

  const previewInvites = async () => {
    if (!selected || selectedLevels.length === 0) return
    setPreviewing(true)
    try {
      const data = await api.liveball.admin.preview(selected.id, selectedLevels) as PreviewMember[]
      setPreview(data)
    } finally { setPreviewing(false) }
  }

  const sendInvites = async () => {
    if (!selected || selectedLevels.length === 0) return
    setSending(true); setSendResult(null)
    try {
      const result = await api.liveball.admin.sendInvites(selected.id, { usta_levels: selectedLevels }) as any
      setSendResult(result)
      setPreview([])
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
        <button onClick={() => setShowCreate(s => !s)}
          className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
          + New Event
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-gray-700">Create LiveBall Event</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={cForm.title} onChange={e => setCForm(f => ({ ...f, title: e.target.value }))}
              placeholder='Title (e.g. "LiveBall – Mon Jun 2")'
              className="sm:col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start date &amp; time *</label>
              <input type="datetime-local" value={cForm.start_time}
                onChange={e => setCForm(f => ({ ...f, start_time: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End time (optional)</label>
              <input type="datetime-local" value={cForm.end_time}
                onChange={e => setCForm(f => ({ ...f, end_time: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Player spots needed *</label>
              <input type="number" min={2} max={64} value={cForm.max_players}
                onChange={e => setCForm(f => ({ ...f, max_players: +e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <textarea value={cForm.description} onChange={e => setCForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Details for members (optional)" rows={2}
              className="sm:col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          {cErr && <p className="text-red-500 text-xs">{cErr}</p>}
          <div className="flex gap-2">
            <button onClick={createEvent} disabled={cSaving}
              className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
              {cSaving ? 'Creating…' : 'Create Event'}
            </button>
            <button onClick={() => setShowCreate(false)} className="text-sm text-gray-400 hover:text-gray-600 px-3">Cancel</button>
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
                <p className="text-sm text-gray-500">{fmtDT(selected.start_time)}</p>
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
                              {inv.responded_at ? new Date(inv.responded_at).toLocaleDateString() : ''}
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
                            Invited {new Date(inv.invited_at).toLocaleDateString()}
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
                      <button onClick={sendInvites} disabled={sending || preview.length === 0}
                        className="text-sm bg-green-700 hover:bg-green-800 text-white font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
                        {sending ? 'Sending…' : `Send ${preview.length > 0 ? preview.length : ''} Invite${preview.length !== 1 ? 's' : ''}`}
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
                    <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 text-sm font-semibold text-gray-700">
                      Preview — {preview.length} member{preview.length !== 1 ? 's' : ''} will be invited
                    </div>
                    <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                      {preview.map(m => (
                        <div key={m.user_id} className="flex items-center justify-between px-4 py-2">
                          <span className="text-sm text-gray-700">{m.name}</span>
                          <div className="text-xs text-gray-400 flex gap-3">
                            <span>USTA {m.usta_ranking}</span>
                            <span>{m.email}</span>
                          </div>
                        </div>
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
