import { useEffect, useState } from 'react'
import { parseDate } from '../../utils/dates'
import { api, BoardMinutes } from '../../api/client'

interface Meeting {
  id: string
  title: string
  description?: string
  start_time: string
  end_time?: string
  location?: string
  pending: number
  accepted: number
  declined: number
}

interface RSVP {
  first_name: string
  last_name: string
  role: string
  status: string
  responded_at?: string
}

const ROLE_LABELS: Record<string, string> = {
  president: 'President', vice_president: 'Vice President', secretary: 'Secretary',
  treasurer: 'Treasurer', billing: 'Billing', membership: 'Membership',
  usta: 'USTA', entertainment: 'Entertainment', house_grounds: 'House & Grounds',
  admin: 'Admin',
}

const emptyMinutes = {
  called_to_order: '', adjourned_at: '',
  attendees_present: '', attendees_absent: '',
  prev_minutes_approved: false,
  treasurer_report: '', old_business: '', new_business: '',
  action_items: '', additional_notes: '', submitted_by: '',
}

export default function AdminBoardMeetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', start_time: '', end_time: '', location: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [rosterFor, setRosterFor] = useState<string | null>(null)
  const [roster, setRoster] = useState<RSVP[]>([])
  const [rosterLoading, setRosterLoading] = useState(false)

  // Minutes state
  const [minutesFor, setMinutesFor] = useState<string | null>(null)
  const [minutesData, setMinutesData] = useState<BoardMinutes | null>(null)
  const [minutesForm, setMinutesForm] = useState(emptyMinutes)
  const [minutesLoading, setMinutesLoading] = useState(false)
  const [minutesSaving, setMinutesSaving] = useState(false)
  const [minutesPublishing, setMinutesPublishing] = useState(false)
  const [minutesError, setMinutesError] = useState('')

  const load = () => api.boardMeetings.admin.list().then(d => setMeetings(d as Meeting[]))

  useEffect(() => { load() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const result = await api.boardMeetings.admin.create(form) as { id: string; invited: number }
      setSuccessMsg(`Board meeting created — ${result.invited} board member${result.invited !== 1 ? 's' : ''} invited.`)
      setShowForm(false)
      setForm({ title: '', description: '', start_time: '', end_time: '', location: '' })
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Cancel "${title}"? This will remove the meeting and all RSVP records.`)) return
    await api.boardMeetings.admin.delete(id)
    setRosterFor(null)
    if (minutesFor === id) setMinutesFor(null)
    load()
  }

  const loadRoster = async (id: string) => {
    if (rosterFor === id) { setRosterFor(null); return }
    setMinutesFor(null)
    setRosterLoading(true)
    try {
      const data = await api.boardMeetings.admin.roster(id) as RSVP[]
      setRoster(data)
      setRosterFor(id)
    } finally {
      setRosterLoading(false)
    }
  }

  const openMinutes = async (id: string) => {
    if (minutesFor === id) { setMinutesFor(null); return }
    setRosterFor(null)
    setMinutesFor(id)
    setMinutesError('')
    setMinutesLoading(true)
    try {
      const data = await api.boardMeetings.admin.getMinutes(id)
      if (data) {
        setMinutesData(data)
        setMinutesForm({
          called_to_order:        data.called_to_order      ?? '',
          adjourned_at:           data.adjourned_at         ?? '',
          attendees_present:      data.attendees_present    ?? '',
          attendees_absent:       data.attendees_absent     ?? '',
          prev_minutes_approved:  data.prev_minutes_approved,
          treasurer_report:       data.treasurer_report     ?? '',
          old_business:           data.old_business         ?? '',
          new_business:           data.new_business         ?? '',
          action_items:           data.action_items         ?? '',
          additional_notes:       data.additional_notes     ?? '',
          submitted_by:           data.submitted_by         ?? '',
        })
      } else {
        setMinutesData(null)
        setMinutesForm(emptyMinutes)
      }
    } finally {
      setMinutesLoading(false)
    }
  }

  const saveMinutes = async () => {
    if (!minutesFor) return
    setMinutesSaving(true)
    setMinutesError('')
    try {
      const saved = await api.boardMeetings.admin.saveMinutes(minutesFor, minutesForm)
      setMinutesData(saved)
      setSuccessMsg('Minutes saved as draft.')
    } catch (err: any) {
      setMinutesError(err.message || 'Could not save minutes.')
    } finally {
      setMinutesSaving(false)
    }
  }

  const publishMinutes = async () => {
    if (!minutesFor) return
    if (!confirm('Publish these minutes? All active members will receive a dashboard notification.')) return
    setMinutesPublishing(true)
    setMinutesError('')
    try {
      const res = await api.boardMeetings.admin.publishMinutes(minutesFor)
      const refreshed = await api.boardMeetings.admin.getMinutes(minutesFor)
      setMinutesData(refreshed)
      setSuccessMsg(`Minutes published — ${res.notified} member${res.notified !== 1 ? 's' : ''} notified.`)
    } catch (err: any) {
      setMinutesError(err.message || 'Could not publish minutes.')
    } finally {
      setMinutesPublishing(false)
    }
  }

  const fmt = (iso: string) => parseDate(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit',
  })

  const now = new Date()
  const upcoming = meetings.filter(m => parseDate(m.start_time) >= now)
  const past = meetings.filter(m => parseDate(m.start_time) < now)

  const mf = (field: keyof typeof emptyMinutes) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setMinutesForm(f => ({ ...f, [field]: e.target.value }))

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Board Meetings</h2>
          <p className="text-xs text-gray-400 mt-0.5">Schedule meetings, collect RSVPs, and record minutes.</p>
        </div>
        <button
          onClick={() => { setShowForm(s => !s); setError(''); setSuccessMsg('') }}
          className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition">
          {showForm ? 'Cancel' : '+ Schedule Meeting'}
        </button>
      </div>

      {successMsg && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
          <span>✓ {successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="text-green-600 hover:text-green-800 ml-4">✕</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-blue-900 text-sm">Schedule Board Meeting</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Meeting Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required
                placeholder="e.g. June Board Meeting"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date &amp; Start Time *</label>
              <input type="datetime-local" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End Time (optional)</label>
              <input type="datetime-local" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="e.g. Clubhouse, 123 Main St"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Agenda / Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4}
                placeholder="Meeting agenda, topics to discuss…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2 rounded-lg text-sm transition disabled:opacity-50">
              {saving ? 'Scheduling…' : 'Schedule & Invite Board'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">Cancel</button>
          </div>
          <p className="text-xs text-gray-400">All active board members will receive an email invitation with Accept / Decline links.</p>
        </form>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Upcoming</h3>
          <div className="space-y-3">
            {upcoming.map(m => (
              <MeetingCard key={m.id} meeting={m} past={false}
                onRoster={() => loadRoster(m.id)}
                onDelete={() => handleDelete(m.id, m.title)}
                onMinutes={() => openMinutes(m.id)}
                rosterOpen={rosterFor === m.id}
                roster={rosterFor === m.id ? roster : []}
                rosterLoading={rosterLoading && rosterFor === m.id}
                minutesOpen={minutesFor === m.id}
                minutesData={minutesFor === m.id ? minutesData : null}
                minutesLoading={minutesLoading && minutesFor === m.id}
                minutesForm={minutesForm}
                minutesSaving={minutesSaving}
                minutesPublishing={minutesPublishing}
                minutesError={minutesError}
                onMf={mf}
                onTogglePrevApproved={() => setMinutesForm(f => ({ ...f, prev_minutes_approved: !f.prev_minutes_approved }))}
                onSaveMinutes={saveMinutes}
                onPublishMinutes={publishMinutes}
                fmt={fmt}
              />
            ))}
          </div>
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Past</h3>
          <div className="space-y-3">
            {past.map(m => (
              <MeetingCard key={m.id} meeting={m} past={true}
                onRoster={() => loadRoster(m.id)}
                onDelete={() => handleDelete(m.id, m.title)}
                onMinutes={() => openMinutes(m.id)}
                rosterOpen={rosterFor === m.id}
                roster={rosterFor === m.id ? roster : []}
                rosterLoading={rosterLoading && rosterFor === m.id}
                minutesOpen={minutesFor === m.id}
                minutesData={minutesFor === m.id ? minutesData : null}
                minutesLoading={minutesLoading && minutesFor === m.id}
                minutesForm={minutesForm}
                minutesSaving={minutesSaving}
                minutesPublishing={minutesPublishing}
                minutesError={minutesError}
                onMf={mf}
                onTogglePrevApproved={() => setMinutesForm(f => ({ ...f, prev_minutes_approved: !f.prev_minutes_approved }))}
                onSaveMinutes={saveMinutes}
                onPublishMinutes={publishMinutes}
                fmt={fmt}
              />
            ))}
          </div>
        </div>
      )}

      {meetings.length === 0 && !showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-400 text-sm">
          No board meetings scheduled yet.
        </div>
      )}
    </div>
  )
}

type MfFn = (field: keyof typeof emptyMinutes) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void

function MeetingCard({ meeting: m, past, onRoster, onDelete, onMinutes,
  rosterOpen, roster, rosterLoading,
  minutesOpen, minutesData, minutesLoading, minutesForm, minutesSaving, minutesPublishing, minutesError,
  onMf, onTogglePrevApproved, onSaveMinutes, onPublishMinutes, fmt,
}: {
  meeting: Meeting; past: boolean
  onRoster: () => void; onDelete: () => void; onMinutes: () => void
  rosterOpen: boolean; roster: RSVP[]; rosterLoading: boolean
  minutesOpen: boolean; minutesData: BoardMinutes | null; minutesLoading: boolean
  minutesForm: typeof emptyMinutes
  minutesSaving: boolean; minutesPublishing: boolean; minutesError: string
  onMf: MfFn
  onTogglePrevApproved: () => void
  onSaveMinutes: () => void; onPublishMinutes: () => void
  fmt: (iso: string) => string
}) {
  const total = m.pending + m.accepted + m.declined

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold text-gray-800">{m.title}</span>
            {!past && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Upcoming</span>}
            {past && minutesData?.published_at && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Minutes Published</span>
            )}
            {past && minutesData && !minutesData.published_at && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Minutes Draft</span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            📅 {fmt(m.start_time)}
            {m.end_time && <> – {parseDate(m.end_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</>}
          </p>
          {m.location && <p className="text-sm text-gray-500 mt-0.5">📍 {m.location}</p>}
          {total > 0 && (
            <div className="flex gap-3 mt-2 text-xs">
              <span className="text-green-700 font-medium">✓ {m.accepted} accepted</span>
              <span className="text-yellow-600 font-medium">⏳ {m.pending} pending</span>
              <span className="text-gray-400">✗ {m.declined} declined</span>
            </div>
          )}
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          <button onClick={onRoster}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${rosterOpen ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {rosterOpen ? 'Hide RSVPs' : 'RSVPs'}
          </button>
          {past && (
            <button onClick={onMinutes}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${minutesOpen ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {minutesOpen ? 'Hide Minutes' : 'Minutes'}
            </button>
          )}
          {!past && (
            <button onClick={onDelete}
              className="text-xs text-red-400 hover:text-red-600 px-2 py-1.5 transition">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* RSVP Roster */}
      {rosterOpen && (
        <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
          {rosterLoading ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : roster.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No board members have been invited yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(['accepted', 'invited', 'declined'] as const).map(status => {
                const group = roster.filter(r => r.status === status)
                if (group.length === 0) return null
                const label = status === 'accepted' ? '✓ Accepted' : status === 'invited' ? '⏳ Pending' : '✗ Declined'
                const color = status === 'accepted' ? 'text-green-700' : status === 'invited' ? 'text-yellow-700' : 'text-gray-400'
                return (
                  <div key={status}>
                    <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${color}`}>{label}</p>
                    <div className="space-y-1">
                      {group.map((r, i) => (
                        <div key={i} className="text-sm text-gray-700">
                          {r.first_name} {r.last_name}
                          <span className="ml-1.5 text-xs text-gray-400 capitalize">{ROLE_LABELS[r.role] ?? r.role}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Meeting Minutes Form */}
      {minutesOpen && (
        <div className="border-t border-gray-100 bg-indigo-50/40 px-5 py-5">
          {minutesLoading ? (
            <p className="text-xs text-gray-400 animate-pulse">Loading minutes…</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-indigo-900">Meeting Minutes</h4>
                {minutesData?.published_at && (
                  <span className="text-xs text-green-700 font-medium">
                    ✓ Published {parseDate(minutesData.published_at).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Called to Order</label>
                  <input value={minutesForm.called_to_order} onChange={onMf('called_to_order')}
                    placeholder="e.g. 7:00 PM" disabled={!!minutesData?.published_at}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-100 disabled:text-gray-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Adjourned</label>
                  <input value={minutesForm.adjourned_at} onChange={onMf('adjourned_at')}
                    placeholder="e.g. 9:15 PM" disabled={!!minutesData?.published_at}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-100 disabled:text-gray-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Members Present</label>
                  <textarea value={minutesForm.attendees_present} onChange={onMf('attendees_present')} rows={3}
                    placeholder="Names of those present…" disabled={!!minutesData?.published_at}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-100 disabled:text-gray-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Members Absent</label>
                  <textarea value={minutesForm.attendees_absent} onChange={onMf('attendees_absent')} rows={3}
                    placeholder="Names of those absent…" disabled={!!minutesData?.published_at}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-100 disabled:text-gray-500" />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={minutesForm.prev_minutes_approved}
                  onChange={onTogglePrevApproved} disabled={!!minutesData?.published_at}
                  className="w-4 h-4 accent-indigo-600" />
                <span className="text-sm text-gray-700">Previous meeting minutes approved</span>
              </label>

              {(['treasurer_report', 'old_business', 'new_business', 'action_items', 'additional_notes'] as const).map(field => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-600 mb-1 capitalize">
                    {field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </label>
                  <textarea value={minutesForm[field] as string} onChange={onMf(field)} rows={3}
                    disabled={!!minutesData?.published_at}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-100 disabled:text-gray-500" />
                </div>
              ))}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Submitted By (Secretary)</label>
                <input value={minutesForm.submitted_by} onChange={onMf('submitted_by')}
                  placeholder="Secretary's name" disabled={!!minutesData?.published_at}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-100 disabled:text-gray-500" />
              </div>

              {minutesError && <p className="text-red-600 text-xs">{minutesError}</p>}

              {!minutesData?.published_at && (
                <div className="flex gap-3 pt-1">
                  <button onClick={onSaveMinutes} disabled={minutesSaving}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
                    {minutesSaving ? 'Saving…' : 'Save Draft'}
                  </button>
                  {minutesData && (
                    <button onClick={onPublishMinutes} disabled={minutesPublishing}
                      className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
                      {minutesPublishing ? 'Publishing…' : 'Publish to Members'}
                    </button>
                  )}
                </div>
              )}
              {!minutesData?.published_at && (
                <p className="text-xs text-gray-400">Save a draft first, then publish when ready. Publishing sends a dashboard notification to all active members.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
