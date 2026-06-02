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
  club_name:   'Club Name',
  dues_amount: 'Annual Dues Amount ($)',
  dues_period: 'Dues Period',
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
  'club_logo',
  'camera_url',
  'timezone',
  'session_timeout_minutes', // superseded by session_timeout_days
  'session_timeout_days',    // rendered in its own section below
  'kiosk_enabled',           // rendered in its own section below
  'weather_lat', 'weather_lon', 'weather_zip',
  'smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from',
])

interface Photo { id: string; title: string; filename: string }

export default function AdminSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [showPass, setShowPass] = useState<Record<string, boolean>>({})
  const [cameraURL, setCameraURL] = useState('')
  const [cameraSaved, setCameraSaved] = useState(false)
  const [cameraError, setCameraError] = useState('')

  // Club logo
  const [photos, setPhotos] = useState<Photo[]>([])
  const [logoSaving, setLogoSaving] = useState(false)
  const [logoError, setLogoError] = useState('')

  const load = () => api.admin.settings().then(d => {
    const s = d as Record<string, string>
    setSettings(s)
    if (s['camera_url']) setCameraURL(s['camera_url'])
  })
  useEffect(() => {
    load()
    api.photos.list().then(folders =>
      setPhotos(folders.flatMap(f => (f.photos ?? []).map(p => ({ id: p.id, title: p.title, filename: p.filename }))))
    ).catch(() => {})
  }, [])

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
  const loadReasons = () =>
    api.bookings.cancelReasons.list()
      .then(d => setCancelReasons(d as { id: string; reason: string }[]))
      .catch(() => {})
  useEffect(() => { loadReasons() }, [])
  const addReason = async () => {
    if (!newReason.trim()) return
    setAddingReason(true)
    try {
      await api.bookings.cancelReasons.create(newReason.trim())
      setNewReason('')
      await loadReasons()
    } finally { setAddingReason(false) }
  }
  const removeReason = async (id: string) => {
    await api.bookings.cancelReasons.delete(id)
    await loadReasons()
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

  const currentLogo: string = settings['club_logo'] ?? ''

  const setLogo = async (url: string) => {
    setLogoSaving(true)
    setLogoError('')
    try {
      await api.admin.updateSetting('club_logo', url)
      setSettings(s => ({ ...s, club_logo: url }))
      window.dispatchEvent(new CustomEvent('club-logo-changed', { detail: url }))
    } catch (err: any) {
      setLogoError(err.message || 'Could not save logo')
    } finally { setLogoSaving(false) }
  }

  return (
    <div>

      {/* ── Club Logo ── */}
      <h2 className="text-xl font-bold text-gray-800 mb-1">Club Logo</h2>
      <p className="text-sm text-gray-500 mb-4">
        Select a photo from the gallery to use as the header logo. Upload images in <strong>Admin → Photos</strong> first.
      </p>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4">
        {currentLogo && (
          <div className="flex items-center gap-4">
            <img src={currentLogo} alt="Current logo" className="h-14 w-auto object-contain rounded border border-gray-200 bg-gray-50 p-1" />
            <div>
              <p className="text-sm font-medium text-gray-700">Current logo</p>
              <button
                onClick={() => setLogo('')}
                disabled={logoSaving}
                className="text-xs text-red-500 hover:text-red-700 transition mt-0.5 disabled:opacity-50">
                Remove logo
              </button>
            </div>
          </div>
        )}
        {photos.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No photos uploaded yet. Go to Admin → Photos to upload your logo.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 gap-2">
            {photos.map(p => {
              const url = `/uploads/photos/${p.filename}`
              const active = currentLogo === url
              return (
                <button key={p.id} type="button"
                  onClick={() => setLogo(active ? '' : url)}
                  disabled={logoSaving}
                  title={p.title}
                  className={`relative rounded-lg overflow-hidden border-2 transition ${active ? 'border-green-600 ring-2 ring-green-400' : 'border-gray-200 hover:border-green-400'}`}>
                  <img src={url} alt={p.title} className="w-full h-14 object-cover" />
                  {active && (
                    <div className="absolute inset-0 bg-green-600/20 flex items-center justify-center">
                      <span className="text-green-700 text-lg font-bold">✓</span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
        {logoSaving && <p className="text-xs text-gray-400">Saving…</p>}
        {logoError && <p className="text-xs text-red-500">{logoError}</p>}
      </div>

      <h2 className="text-xl font-bold text-gray-800 mt-8 mb-4">Club Settings</h2>
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

      {/* Session & Security */}
      <h2 className="text-xl font-bold text-gray-800 mt-8 mb-1">Session &amp; Security</h2>
      <p className="text-sm text-gray-500 mb-4">
        Controls how long members stay logged in. Changes take effect on the member's <strong>next login</strong>.
      </p>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-4">
          <label className="w-56 text-sm font-medium text-gray-700 shrink-0">Auto Logout (days)</label>
          <input
            type="number"
            min={0}
            step={1}
            value={settings['session_timeout_days'] ?? '0'}
            onChange={e => setSettings(s => ({ ...s, session_timeout_days: e.target.value }))}
            className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button onClick={() => save('session_timeout_days')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition shrink-0 ${saved['session_timeout_days'] ? 'bg-green-100 text-green-700' : 'bg-green-700 text-white hover:bg-green-800'}`}>
            {saved['session_timeout_days'] ? 'Saved!' : 'Save'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2 ml-[calc(224px+1rem)]">
          <strong>0 = never log out</strong> (recommended). Enter a number of days (e.g. <code className="font-mono">30</code>) to automatically
          log members out after that many days of inactivity. Admins are never automatically logged out.
          The new expiry takes effect on each member's <em>next login</em>.
        </p>
        {(() => {
          const v = parseInt(settings['session_timeout_days'] ?? '0') || 0
          if (v <= 0) return (
            <div className="mt-3 ml-[calc(224px+1rem)] flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 w-fit">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Auto-logout is <strong>off</strong> — members stay logged in indefinitely.
            </div>
          )
          return (
            <div className="mt-3 ml-[calc(224px+1rem)] flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 w-fit">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Members will be logged out after <strong>{v} day{v !== 1 ? 's' : ''}</strong> of inactivity.
            </div>
          )
        })()}
      </div>

      {/* Kiosk */}
      <h2 className="text-xl font-bold text-gray-800 mt-8 mb-1">Pro Shop Kiosk</h2>
      <p className="text-sm text-gray-500 mb-4">
        The kiosk lets members charge pro-shop items to their account from an iPad in the club — no login required.
        Point the iPad's browser to <code className="font-mono bg-gray-100 px-1 py-0.5 rounded text-xs">/kiosk</code>.
      </p>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
        {/* Enable / disable */}
        <div className="flex items-center gap-4">
          <label className="w-56 text-sm font-medium text-gray-700 shrink-0">Kiosk Enabled</label>
          <select
            value={settings['kiosk_enabled'] ?? 'true'}
            onChange={e => setSettings(s => ({ ...s, kiosk_enabled: e.target.value }))}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
            <option value="true">Yes — kiosk is active</option>
            <option value="false">No — show "unavailable" to members</option>
          </select>
          <button onClick={() => save('kiosk_enabled')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition shrink-0 ${saved['kiosk_enabled'] ? 'bg-green-100 text-green-700' : 'bg-green-700 text-white hover:bg-green-800'}`}>
            {saved['kiosk_enabled'] ? 'Saved!' : 'Save'}
          </button>
        </div>
        <p className="text-xs text-gray-400 ml-[calc(224px+1rem)]">
          Disabling this shows a friendly "kiosk unavailable" screen instead of the member picker.
        </p>

        {/* Kiosk URL helper */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-600 mb-2">iPad Setup</p>
          <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <span className="text-xs text-gray-500 flex-1 font-mono select-all">
              {typeof window !== 'undefined' ? window.location.origin : ''}/kiosk
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/kiosk`)}
              className="text-xs text-green-700 font-medium hover:underline shrink-0">
              Copy URL
            </button>
            <a href="/kiosk" target="_blank" rel="noreferrer"
              className="text-xs text-blue-600 font-medium hover:underline shrink-0">
              Open ↗
            </a>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            In Safari on the iPad, open this URL, then tap <strong>Share → Add to Home Screen</strong> to pin it as a full-screen app.
            The page automatically clears any login session so it can't be timed out.
          </p>
        </div>
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
