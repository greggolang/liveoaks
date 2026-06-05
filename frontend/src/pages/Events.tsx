import { useEffect, useState } from 'react'
import { parseDate } from '../utils/dates'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface Event {
  id: string; title: string; description?: string; start_time: string
  end_time?: string; event_type: string; location?: string
  signup_enabled?: boolean; signup_deadline?: string; max_players?: number
}
interface EmailTemplate { id: string; name: string; subject: string }
interface Member { id: string; first_name: string; last_name: string; email: string }

const TYPE_COLORS: Record<string, string> = {
  red_blue:        'bg-red-100 text-red-700',
  liveball:        'bg-blue-100 text-blue-700',
  christmas_party: 'bg-green-100 text-green-700',
  social_event:    'bg-pink-100 text-pink-700',
}
const TYPE_LABELS: Record<string, string> = {
  red_blue:        'Red/Blue',
  liveball:        'LiveBall',
  christmas_party: 'Christmas Party',
  social_event:    'Social Event',
}

export default function Events() {
  const { isBoard } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', start_time: '', end_time: '', event_type: 'red_blue', location: '' })
  const [error, setError] = useState('')

  const load = () => api.events.list().then(d => setEvents(d as Event[]))
  useEffect(() => {
    load()
    if (isBoard) {
      api.emailTemplates.list().then(d => setTemplates(d as EmailTemplate[]))
      api.members.directory().then(d => setMembers((d as any[]).map(m => ({
        id: m.id, first_name: m.first_name, last_name: m.last_name, email: m.email,
      }))))
    }
  }, [])

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [f]: e.target.value }))

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    try {
      await api.events.create(form)
      setForm({ title: '', description: '', start_time: '', end_time: '', event_type: 'red_blue', location: '' })
      setShowForm(false); load()
    } catch (err: any) { setError(err.message) }
  }

  const upcoming = events.filter(e => parseDate(e.start_time) >= new Date())
  const past = events.filter(e => parseDate(e.start_time) < new Date())

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Events</h1>
        {isBoard && (
          <button onClick={() => setShowForm(s => !s)}
            className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition">
            {showForm ? 'Cancel' : '+ New Event'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input value={form.title} onChange={set('title')} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
              <input type="datetime-local" value={form.start_time} onChange={set('start_time')} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End (optional)</label>
              <input type="datetime-local" value={form.end_time} onChange={set('end_time')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={form.event_type} onChange={set('event_type')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="red_blue">Red/Blue</option>
                <option value="liveball">LiveBall</option>
                <option value="christmas_party">Christmas Party</option>
                <option value="social_event">Social Event</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input value={form.location} onChange={set('location')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={form.description} onChange={set('description')} rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" className="bg-green-700 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition">
            Create Event
          </button>
        </form>
      )}

      <EventList title="Upcoming" events={upcoming} isBoard={isBoard} templates={templates} members={members}
        onDelete={async id => { await api.events.delete(id); load() }}
        onToggleSignup={load} />
      {past.length > 0 && <EventList title="Past" events={past} isBoard={isBoard} templates={templates} members={members}
        onDelete={async id => { await api.events.delete(id); load() }}
        onToggleSignup={load} />}
    </div>
  )
}

function EventList({ title, events, isBoard, templates, members, onDelete, onToggleSignup }: {
  title: string; events: Event[]; isBoard: boolean; templates: EmailTemplate[]
  members: Member[]
  onDelete: (id: string) => void; onToggleSignup: () => void
}) {
  const [emailPanelId, setEmailPanelId] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState('event_announcement')
  const [recipientMode, setRecipientMode] = useState<'all' | 'select'>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Member[]>([])
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ sent: number; subject: string } | null>(null)

  if (events.length === 0) return null

  const toggleSignup = async (ev: Event) => {
    await api.signups.toggleSignup(ev.id, { signup_enabled: !ev.signup_enabled })
    onToggleSignup()
  }

  const openEmail = (id: string) => {
    if (id === emailPanelId) { setEmailPanelId(null); return }
    setEmailPanelId(id)
    setSendResult(null)
    setRecipientMode('all')
    setSearch('')
    setSelected([])
  }

  const toggleMember = (m: Member) => {
    setSelected(s => s.some(x => x.id === m.id) ? s.filter(x => x.id !== m.id) : [...s, m])
  }

  const sendEmail = async (eventId: string) => {
    setSending(true)
    setSendResult(null)
    try {
      const userIds = recipientMode === 'select' ? selected.map(m => m.id) : undefined
      const res = await api.events.sendEmail(eventId, selectedTemplate, userIds) as { sent: number; subject: string }
      setSendResult(res)
    } finally { setSending(false) }
  }

  const filtered = search.length >= 1
    ? members.filter(m =>
        `${m.first_name} ${m.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
        m.email.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 20)
    : []

  const canSend = recipientMode === 'all' || selected.length > 0

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-gray-700 mb-3">{title}</h2>
      <div className="space-y-3">
        {events.map(ev => (
          <div key={ev.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-5">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[ev.event_type] ?? 'bg-gray-100 text-gray-700'}`}>
                      {TYPE_LABELS[ev.event_type] ?? ev.event_type}
                    </span>
                    {ev.signup_enabled && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✏️ Sign-Up Open</span>
                    )}
                  </div>
                  <h3 className="font-semibold text-gray-800">{ev.title}</h3>
                  <p className="text-sm text-green-700 mt-0.5">
                    {parseDate(ev.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {ev.end_time && ` – ${parseDate(ev.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                  </p>
                  {ev.location && <p className="text-xs text-gray-400 mt-0.5">📍 {ev.location}</p>}
                  {ev.description && <p className="text-sm text-gray-600 mt-2">{ev.description}</p>}
                </div>
                <div className="flex flex-col items-end gap-2 ml-2 sm:ml-4 shrink-0">
                  {isBoard && (
                    <>
                      {ev.signup_enabled && (
                        <Link to={`/admin/events/${ev.id}/signups`}
                          className="text-xs text-blue-600 hover:underline font-medium">View Sign-Ups →</Link>
                      )}
                      <button onClick={() => openEmail(ev.id)}
                        className={`text-xs px-2 py-1 rounded-lg font-medium transition ${emailPanelId === ev.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        ✉️ Send Email
                      </button>
                      <button onClick={() => onDelete(ev.id)} className="text-red-400 hover:text-red-600 text-xs">Delete</button>
                    </>
                  )}
                </div>
              </div>
              {ev.signup_enabled && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3">
                  <Link to={`/events/${ev.id}/signup`}
                    className="bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-green-800 transition">
                    Sign Up for This Event
                  </Link>
                  {ev.signup_deadline && (
                    <span className="text-xs text-orange-600">
                      Deadline: {parseDate(ev.signup_deadline).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Send email panel */}
            {isBoard && emailPanelId === ev.id && (
              <div className="border-t border-gray-100 bg-blue-50 px-5 py-4 space-y-4">
                <p className="text-sm font-semibold text-gray-700">Send Event Email</p>

                {/* Template */}
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-600 shrink-0">Template:</label>
                  <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    {templates.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                    {templates.length === 0 && <option value="event_announcement">event_announcement (default)</option>}
                  </select>
                </div>

                {/* Recipient mode toggle */}
                <div className="flex gap-3">
                  {(['all', 'select'] as const).map(mode => (
                    <button key={mode} type="button"
                      onClick={() => { setRecipientMode(mode); setSearch(''); if (mode === 'all') setSelected([]) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                        recipientMode === mode
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                      }`}>
                      {mode === 'all' ? `All Active Members (${members.length})` : 'Select Specific Members'}
                    </button>
                  ))}
                </div>

                {/* Member picker */}
                {recipientMode === 'select' && (
                  <div className="space-y-2">
                    {/* Selected chips */}
                    {selected.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selected.map(m => (
                          <span key={m.id}
                            className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full">
                            {m.first_name} {m.last_name}
                            <button type="button" onClick={() => toggleMember(m)}
                              className="opacity-60 hover:opacity-100 leading-none">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    {selected.length === 0 && (
                      <p className="text-xs text-gray-400 italic">No members selected yet — search below.</p>
                    )}

                    {/* Search */}
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search by name or email…"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                    {filtered.length > 0 && (
                      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white max-h-48 overflow-y-auto">
                        {filtered.map(m => {
                          const picked = selected.some(x => x.id === m.id)
                          return (
                            <div key={m.id}
                              className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition">
                              <div>
                                <div className="text-sm font-medium text-gray-800">{m.first_name} {m.last_name}</div>
                                <div className="text-xs text-gray-400">{m.email}</div>
                              </div>
                              <button type="button" onClick={() => toggleMember(m)}
                                className={`text-xs font-medium px-2.5 py-1 rounded-lg transition ${
                                  picked
                                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}>
                                {picked ? '✓ Added' : '+ Add'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Send button */}
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={() => sendEmail(ev.id)} disabled={sending || !canSend}
                    className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold px-5 py-2 rounded-lg transition disabled:opacity-50">
                    {sending
                      ? 'Sending…'
                      : recipientMode === 'all'
                        ? `Send to All Members (${members.length})`
                        : `Send to ${selected.length} Member${selected.length !== 1 ? 's' : ''}`}
                  </button>
                  {recipientMode === 'select' && selected.length === 0 && (
                    <p className="text-xs text-gray-400">Select at least one member to send.</p>
                  )}
                </div>

                {sendResult && (
                  <p className="text-sm text-green-700 font-medium">
                    ✓ Sent to {sendResult.sent} member{sendResult.sent !== 1 ? 's' : ''} — "{sendResult.subject}"
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
