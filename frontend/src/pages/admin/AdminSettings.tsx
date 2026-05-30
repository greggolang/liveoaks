import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'

const LABELS: Record<string, string> = {
  club_name:                    'Club Name',
  booking_max_days_ahead:       'Max Days to Book Ahead',
  booking_max_duration_hours:   'Max Booking Duration (hours)',
  dues_amount:                  'Annual Dues Amount ($)',
  dues_period:                  'Dues Period',
  session_timeout_minutes:      'Auto Logout (minutes, 0 = off)',
}

// Keys managed elsewhere — hide from this page
const HIDDEN_KEYS = new Set(['smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from'])

export default function AdminSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const load = () => api.admin.settings().then(d => setSettings(d as Record<string, string>))
  useEffect(() => { load() }, [])

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
    </div>
  )
}
