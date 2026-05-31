import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'

const GUEST_FEE_SETTINGS = [
  { key: 'guest_participation_enabled', label: 'Allow guest participation',       hint: 'Guests can be added to court bookings.', type: 'boolean' as const },
  { key: 'guest_fee_peak',              label: 'Guest fee — peak hours ($)',       hint: 'Fee charged per guest during peak hours.' },
  { key: 'guest_fee_offpeak',           label: 'Guest fee — off-peak hours ($)',   hint: 'Fee charged per guest outside peak hours.' },
  { key: 'peak_hours_start',            label: 'Peak hours start',                 hint: 'e.g. 08:00 — when peak pricing begins.', type: 'time' as const },
  { key: 'peak_hours_end',              label: 'Peak hours end',                   hint: 'e.g. 18:00 — when peak pricing ends.',   type: 'time' as const },
]
const GUEST_FEE_KEYS = new Set(GUEST_FEE_SETTINGS.map(s => s.key))

const LABELS: Record<string, string> = {
  club_name:                    'Club Name',
  dues_amount:                  'Annual Dues Amount ($)',
  dues_period:                  'Dues Period',
  session_timeout_minutes:      'Auto Logout (minutes, 0 = off)',
}

type BSType = 'text' | 'boolean' | 'time'
type BookingSection = {
  heading: string
  settings: { key: string; label: string; hint: string; type?: BSType; enforced?: boolean }[]
}

const BOOKING_SECTIONS: BookingSection[] = [
  {
    heading: 'Court Limits',
    settings: [
      { key: 'booking_max_per_day',         label: 'Max reservations per member per day',   hint: '1 = one booking per day. Increase to allow multiple.',                                    enforced: true },
      { key: 'booking_max_minutes_per_day',  label: 'Max minutes per member per day',        hint: 'Total court time a member may book in a single day. Leave blank for no limit.',          enforced: true },
      { key: 'booking_max_courts_per_week',  label: 'Max courts per member per week',        hint: 'Max number of court sessions per member in a calendar week. Leave blank for no limit.',  enforced: true },
      { key: 'booking_max_per_week',         label: 'Max reservations per member per week',  hint: 'Max total bookings per member per week. Leave blank for no limit.',                       enforced: true },
      { key: 'booking_max_family_per_day',   label: 'Max courts per family per day',         hint: 'Combined daily limit across all family members. Leave blank for no limit.' },
      { key: 'booking_max_duration_hours',   label: 'Max booking duration (hours)',          hint: 'Longest single reservation allowed. Leave blank for no limit.' },
    ],
  },
  {
    heading: 'Time Rules',
    settings: [
      { key: 'booking_max_days_ahead',     label: 'Max days ahead a court can be booked',         hint: 'How far in advance members may book. Enforced on save.',                     enforced: true },
      { key: 'booking_open_time',          label: 'Time next reservation day opens',               hint: 'e.g. 06:00 — when tomorrow\'s slots become bookable. Leave blank for midnight.', type: 'time' },
      { key: 'booking_min_gap_minutes',    label: 'Min gap between a member\'s bookings (minutes)', hint: 'Prevents back-to-back "sandwich" reservations on the same court. Set to 30 to require a 30-min gap. 0 = disabled.', enforced: true },
      { key: 'booking_cancel_hours',            label: 'Min hours notice to cancel',              hint: 'Members must cancel at least this many hours before the booking starts. Admins and board can always cancel. Leave blank to allow any-time cancellation.', enforced: true },
      { key: 'withdrawal_min_notice_hours',     label: 'Min hours notice to withdraw from a match', hint: 'Players cannot remove themselves within this many hours of a booking\'s start. Default 0.5 (30 min). Set to 0 to disable.', enforced: true },
    ],
  },
  {
    heading: 'Player / Sub Rules',
    settings: [
      { key: 'booking_allow_sub',      label: 'Allow rostered players to sub out',      hint: 'A player on a reservation can be replaced by another player.', type: 'boolean' },
      { key: 'booking_allow_any_sub',  label: 'Allow any player to sub another',        hint: 'Any rostered player may swap without host approval.',          type: 'boolean' },
    ],
  },
]

const BOOKING_KEYS = new Set(BOOKING_SECTIONS.flatMap(s => s.settings.map(x => x.key)))

// Keys managed elsewhere or in dedicated sections — hide from the generic list
const HIDDEN_KEYS = new Set([
  ...BOOKING_KEYS,
  ...GUEST_FEE_KEYS,
  'camera_url',
  'timezone',
  'weather_lat', 'weather_lon', 'weather_zip',
  'smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from',
  'google_email_president','google_email_vice_president','google_email_secretary',
  'google_email_treasurer','google_email_billing','google_email_entertainment','google_email_house_grounds',
  'google_email_usta','google_email_admin',
  'google_pass_president','google_pass_vice_president','google_pass_secretary',
  'google_pass_treasurer','google_pass_billing','google_pass_entertainment','google_pass_house_grounds',
  'google_pass_usta','google_pass_admin',
])

const GOOGLE_ROLE_KEYS: { emailKey: string; passKey: string; label: string }[] = [
  { emailKey: 'google_email_president',     passKey: 'google_pass_president',     label: 'President' },
  { emailKey: 'google_email_vice_president', passKey: 'google_pass_vice_president', label: 'Vice President' },
  { emailKey: 'google_email_secretary',      passKey: 'google_pass_secretary',      label: 'Secretary' },
  { emailKey: 'google_email_treasurer',      passKey: 'google_pass_treasurer',      label: 'Treasurer' },
  { emailKey: 'google_email_billing',        passKey: 'google_pass_billing',        label: 'Billing' },
  { emailKey: 'google_email_entertainment',  passKey: 'google_pass_entertainment',  label: 'Entertainment' },
  { emailKey: 'google_email_house_grounds',  passKey: 'google_pass_house_grounds',  label: 'House & Grounds' },
  { emailKey: 'google_email_usta',           passKey: 'google_pass_usta',           label: 'USTA' },
  { emailKey: 'google_email_admin',          passKey: 'google_pass_admin',          label: 'Administrator' },
]

export default function AdminSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [showPass, setShowPass] = useState<Record<string, boolean>>({})
  const [cameraURL, setCameraURL] = useState('')
  const [cameraSaved, setCameraSaved] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const load = () => api.admin.settings().then(d => {
    const s = d as Record<string, string>
    setSettings(s)
    if (s['camera_url']) setCameraURL(s['camera_url'])
  })
  useEffect(() => { load() }, [])

  const saveCamera = async () => {
    setCameraError('')
    try {
      await api.camera.updateURL(cameraURL)
      setCameraSaved(true)
      setTimeout(() => setCameraSaved(false), 2000)
    } catch (e: unknown) {
      setCameraError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  // Cancellation reasons
  const [cancelReasons, setCancelReasons] = useState<{ id: string; reason: string }[]>([])
  const [newReason, setNewReason] = useState('')
  const [addingReason, setAddingReason] = useState(false)
  useEffect(() => {
    api.bookings.cancelReasons.list()
      .then(d => setCancelReasons(d as { id: string; reason: string }[]))
      .catch(() => {})
  }, [])
  const addReason = async () => {
    if (!newReason.trim()) return
    setAddingReason(true)
    try {
      const d = await api.bookings.cancelReasons.create(newReason.trim()) as { id: string; reason: string }
      setCancelReasons(prev => [...prev, d])
      setNewReason('')
    } finally { setAddingReason(false) }
  }
  const removeReason = async (id: string) => {
    await api.bookings.cancelReasons.delete(id)
    setCancelReasons(prev => prev.filter(r => r.id !== id))
  }

  // Bylaws PDF state
  const [bylawsUploadedAt, setBylawsUploadedAt] = useState<string | null>(null)
  const [bylawsFile, setBylawsFile] = useState<File | null>(null)
  const [bylawsState, setBylawsState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [bylawsError, setBylawsError] = useState('')
  const bylawsRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.bylaws.meta().then(d => setBylawsUploadedAt(d.uploaded_at))
  }, [])

  const uploadBylaws = async () => {
    if (!bylawsFile) return
    setBylawsState('uploading')
    setBylawsError('')
    try {
      const result = await api.bylaws.upload(bylawsFile)
      setBylawsUploadedAt(result.uploaded_at)
      setBylawsFile(null)
      if (bylawsRef.current) bylawsRef.current.value = ''
      setBylawsState('done')
      setTimeout(() => setBylawsState('idle'), 3000)
    } catch (e: unknown) {
      setBylawsError(e instanceof Error ? e.message : 'Upload failed')
      setBylawsState('error')
    }
  }

  const save = async (key: string) => {
    await api.admin.updateSetting(key, settings[key])
    setSaved(s => ({ ...s, [key]: true }))
    setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2000)
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-4">Club Settings</h2>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-5">
        {Object.entries(settings).filter(([key]) => !HIDDEN_KEYS.has(key)).map(([key, value]) => (
          <div key={key} className="flex items-center gap-4">
            <label className="w-56 text-sm font-medium text-gray-700 shrink-0">
              {LABELS[key] || key}
            </label>
            <input
              value={settings[key]}
              onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button onClick={() => save(key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${saved[key] ? 'bg-green-100 text-green-700' : 'bg-green-700 text-white hover:bg-green-800'}`}>
              {saved[key] ? 'Saved!' : 'Save'}
            </button>
          </div>
        ))}
      </div>

      {/* Timezone */}
      <h2 className="text-xl font-bold text-gray-800 mt-8 mb-1">Club Timezone</h2>
      <p className="text-sm text-gray-500 mb-4">Used to format times in all email notifications.</p>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-4">
          <label className="w-56 text-sm font-medium text-gray-700 shrink-0">Timezone</label>
          <input
            value={settings['timezone'] ?? 'America/Los_Angeles'}
            onChange={e => setSettings(s => ({ ...s, timezone: e.target.value }))}
            placeholder="America/Los_Angeles"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button onClick={() => save('timezone')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition shrink-0 ${saved['timezone'] ? 'bg-green-100 text-green-700' : 'bg-green-700 text-white hover:bg-green-800'}`}>
            {saved['timezone'] ? 'Saved!' : 'Save'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2 ml-[calc(224px+1rem)]">
          IANA timezone name — e.g. <span className="font-mono">America/Los_Angeles</span>, <span className="font-mono">America/New_York</span>, <span className="font-mono">America/Chicago</span>
        </p>
      </div>

      {/* Weather Location */}
      <h2 className="text-xl font-bold text-gray-800 mt-8 mb-1">Weather Location</h2>
      <p className="text-sm text-gray-500 mb-4">US zip code used for the weather forecast on the dashboard and booking page.</p>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-4">
          <label className="w-56 text-sm font-medium text-gray-700 shrink-0">Zip Code</label>
          <input
            value={settings['weather_zip'] ?? ''}
            onChange={e => setSettings(s => ({ ...s, weather_zip: e.target.value }))}
            placeholder="91030"
            maxLength={5}
            className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button onClick={() => save('weather_zip')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition shrink-0 ${saved['weather_zip'] ? 'bg-green-100 text-green-700' : 'bg-green-700 text-white hover:bg-green-800'}`}>
            {saved['weather_zip'] ? 'Saved!' : 'Save'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2 ml-[calc(224px+1rem)]">5-digit US zip code. Coordinates are looked up automatically.</p>
      </div>

      {/* Booking System */}
      <h2 className="text-xl font-bold text-gray-800 mt-8 mb-1">Booking System</h2>
      <p className="text-sm text-gray-500 mb-4">Rules that govern when and how members can reserve courts.</p>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100">
        {BOOKING_SECTIONS.map(section => (
          <div key={section.heading} className="p-6 space-y-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{section.heading}</p>
            {section.settings.map(({ key, label, hint, type, enforced }) => (
          <div key={key}>
            <div className="flex items-center gap-4">
              <label className="w-56 text-sm font-medium text-gray-700 shrink-0 flex items-center gap-1.5">
                {label}
                {enforced && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-normal">enforced</span>}
              </label>
              {type === 'boolean' ? (
                <select value={settings[key] ?? 'true'}
                  onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : type === 'time' ? (
                <input type="time" value={settings[key] ?? ''}
                  onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              ) : (
                <input value={settings[key] ?? ''}
                  onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              )}
              <button onClick={() => save(key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition shrink-0 ${saved[key] ? 'bg-green-100 text-green-700' : 'bg-green-700 text-white hover:bg-green-800'}`}>
                {saved[key] ? 'Saved!' : 'Save'}
              </button>
            </div>
            {hint && <p className="text-xs text-gray-400 mt-1 ml-[calc(224px+1rem)]">{hint}</p>}
          </div>
            ))}
          </div>
        ))}
      </div>

      {/* Live Camera */}
      <h2 className="text-xl font-bold text-gray-800 mt-8 mb-1">Live Camera</h2>
      <p className="text-sm text-gray-500 mb-4">RTSP stream URL for the court camera. Changes take effect immediately — no restart required.</p>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-4">
          <label className="w-56 text-sm font-medium text-gray-700 shrink-0">RTSP Stream URL</label>
          <input
            value={cameraURL}
            onChange={e => setCameraURL(e.target.value)}
            placeholder="rtsp://user:pass@ip/stream"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button onClick={saveCamera}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition shrink-0 ${cameraSaved ? 'bg-green-100 text-green-700' : 'bg-green-700 text-white hover:bg-green-800'}`}>
            {cameraSaved ? 'Saved!' : 'Save'}
          </button>
        </div>
        {cameraError && <p className="text-red-500 text-xs mt-2 ml-[calc(224px+1rem)]">{cameraError}</p>}
        <p className="text-xs text-gray-400 mt-2 ml-[calc(224px+1rem)]">URL must start with <span className="font-mono">rtsp://</span>. The stream is also auto-restarted if the camera goes offline.</p>
      </div>

      {/* Guest Fees */}
      <h2 className="text-xl font-bold text-gray-800 mt-8 mb-1">Guest Fees</h2>
      <p className="text-sm text-gray-500 mb-4">Fee charged per guest added to a court booking. Peak vs. off-peak is determined by the booking's start time.</p>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-5">
        {GUEST_FEE_SETTINGS.map(({ key, label, hint, type }) => (
          <div key={key}>
            <div className="flex items-center gap-4">
              <label className="w-56 text-sm font-medium text-gray-700 shrink-0">{label}</label>
              {type === 'boolean' ? (
                <select value={settings[key] ?? 'true'}
                  onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : type === 'time' ? (
                <input type="time" value={settings[key] ?? ''}
                  onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              ) : (
                <input value={settings[key] ?? ''}
                  onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              )}
              <button onClick={() => save(key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition shrink-0 ${saved[key] ? 'bg-green-100 text-green-700' : 'bg-green-700 text-white hover:bg-green-800'}`}>
                {saved[key] ? 'Saved!' : 'Save'}
              </button>
            </div>
            {hint && <p className="text-xs text-gray-400 mt-1 ml-[calc(224px+1rem)]">{hint}</p>}
          </div>
        ))}
      </div>

      {/* Google Workspace role email mapping */}
      <h2 className="text-xl font-bold text-gray-800 mt-8 mb-2">Google Workspace — Role Mailboxes</h2>
      <p className="text-sm text-gray-500 mb-4">
        Map each board role to its Google Workspace email address. Board members with that role will be able
        to read, compose, and send email from the matching mailbox — and browse its Drive — without needing
        the Gmail password. Requires <span className="font-medium">GOOGLE_SA_JSON</span> set on the server.
      </p>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-6">
        {GOOGLE_ROLE_KEYS.map(({ emailKey, passKey, label }) => (
          <div key={emailKey} className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">{label}</p>
            {/* Email */}
            <div className="flex items-center gap-3">
              <label className="w-24 text-xs text-gray-500 shrink-0">Email</label>
              <input
                value={settings[emailKey] ?? ''}
                onChange={e => setSettings(s => ({ ...s, [emailKey]: e.target.value }))}
                placeholder="role@yourclub.org"
                type="email"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button onClick={() => save(emailKey)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition shrink-0 ${saved[emailKey] ? 'bg-green-100 text-green-700' : 'bg-green-700 text-white hover:bg-green-800'}`}>
                {saved[emailKey] ? 'Saved!' : 'Save'}
              </button>
            </div>
            {/* Password */}
            <div className="flex items-center gap-3">
              <label className="w-24 text-xs text-gray-500 shrink-0">Password</label>
              <div className="flex-1 flex items-center gap-2">
                <input
                  value={settings[passKey] ?? ''}
                  onChange={e => setSettings(s => ({ ...s, [passKey]: e.target.value }))}
                  placeholder="mailbox password"
                  type={showPass[passKey] ? 'text' : 'password'}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => ({ ...s, [passKey]: !s[passKey] }))}
                  className="text-xs text-gray-400 hover:text-gray-600 transition shrink-0 px-2">
                  {showPass[passKey] ? 'Hide' : 'Show'}
                </button>
              </div>
              <button onClick={() => save(passKey)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition shrink-0 ${saved[passKey] ? 'bg-green-100 text-green-700' : 'bg-green-700 text-white hover:bg-green-800'}`}>
                {saved[passKey] ? 'Saved!' : 'Save'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="text-xl font-bold text-gray-800 mt-8 mb-4">Association Bylaws PDF</h2>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-gray-600">Current version:</span>
          {bylawsUploadedAt
            ? <span className="text-sm font-medium text-gray-800">
                Uploaded {new Date(bylawsUploadedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            : <span className="text-sm text-gray-400 italic">Using original (embedded in app)</span>
          }
        </div>
        <div className="flex items-center gap-3">
          <input
            ref={bylawsRef}
            type="file"
            accept=".pdf"
            onChange={e => setBylawsFile(e.target.files?.[0] ?? null)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700"
          />
          <button
            onClick={uploadBylaws}
            disabled={!bylawsFile || bylawsState === 'uploading'}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 shrink-0 ${
              bylawsState === 'done'
                ? 'bg-green-100 text-green-700'
                : 'bg-green-700 text-white hover:bg-green-800'
            }`}
          >
            {bylawsState === 'uploading' ? 'Uploading…' : bylawsState === 'done' ? 'Updated!' : 'Upload PDF'}
          </button>
        </div>
        {bylawsState === 'error' && (
          <p className="text-red-500 text-xs mt-2">{bylawsError}</p>
        )}
        <p className="text-xs text-gray-400 mt-3">
          Uploading replaces the version members see and download on the Bylaws page.
        </p>
      </div>

      {/* Cancellation Reasons */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mt-6">
        <h3 className="font-semibold text-gray-800 mb-1">Booking Cancellation Reasons</h3>
        <p className="text-sm text-gray-500 mb-4">
          These canned reasons appear in the cancellation modal so members can quickly pick one.
          Members can also type a custom reason.
        </p>
        <div className="space-y-2 mb-4">
          {cancelReasons.length === 0 && (
            <p className="text-sm text-gray-400 italic">No reasons defined yet.</p>
          )}
          {cancelReasons.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
              <span className="text-sm text-gray-700">{r.reason}</span>
              <button onClick={() => removeReason(r.id)}
                className="text-gray-300 hover:text-red-500 transition text-sm shrink-0">
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newReason}
            onChange={e => setNewReason(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addReason()}
            placeholder="Add a reason…"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button onClick={addReason} disabled={addingReason || !newReason.trim()}
            className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 transition disabled:opacity-50">
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
