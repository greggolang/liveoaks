import { useEffect, useState } from 'react'
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
    </div>
  )
}
