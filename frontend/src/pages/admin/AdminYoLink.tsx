import { useEffect, useState } from 'react'
import { api } from '../../api/client'

interface Device {
  id: string
  name: string
  type: string
  model: string | null
  state: Record<string, unknown>
  alerts_enabled: boolean
  last_seen_at: string | null
  created_at: string
}

interface Alert {
  id: string
  device_id: string
  device_name: string
  event_type: string
  raw_event: string
  created_at: string
}

type Tab = 'devices' | 'alerts' | 'settings'

const deviceIcon: Record<string, string> = {
  DoorSensor: '🚪',
  LeakSensor: '💧',
  THSensor: '🌡',
  MotionSensor: '👁',
  Siren: '🔔',
}

function iconFor(type: string) {
  return deviceIcon[type] ?? '📡'
}

export default function AdminYoLink() {
  const [tab, setTab] = useState<Tab>('devices')
  const [devices, setDevices] = useState<Device[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [configClientId, setConfigClientId] = useState('')
  const [configSecretKey, setConfigSecretKey] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const loadDevices = () => api.yolink.listDevices().then(d => setDevices(d as Device[]))
  const loadAlerts = () => api.yolink.listAlerts().then(a => setAlerts(a as Alert[]))

  useEffect(() => {
    loadDevices()
    loadAlerts()
    api.yolink.getConfig().then((c: any) => setConfigClientId(c.client_id ?? ''))
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await api.yolink.syncDevices()
      await loadDevices()
    } catch (e: any) {
      alert(e.message ?? 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.yolink.updateConfig(configClientId, configSecretKey)
      setConfigSecretKey('')
      alert('Credentials saved. YoLink connection will restart.')
    } catch (e: any) {
      alert(e.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleAlerts = async (device: Device) => {
    await api.yolink.updateDevice(device.id, { name: device.name, alerts_enabled: !device.alerts_enabled })
    loadDevices()
  }

  const startEdit = (device: Device) => {
    setEditId(device.id)
    setEditName(device.name)
  }

  const saveEdit = async (device: Device) => {
    await api.yolink.updateDevice(device.id, { name: editName, alerts_enabled: device.alerts_enabled })
    setEditId(null)
    loadDevices()
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'devices', label: 'Devices' },
    { key: 'alerts', label: 'Alert History' },
    { key: 'settings', label: 'Credentials' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">YoLink Sensors</h2>
        {tab === 'devices' && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-green-800 transition disabled:opacity-50"
          >
            {syncing ? 'Syncing…' : 'Sync Devices'}
          </button>
        )}
      </div>

      <div className="flex gap-1 mb-5">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              tab === t.key ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'devices' && (
        <>
          {devices.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              <p className="mb-2">No devices found.</p>
              <p>Enter your YoLink credentials in the Credentials tab, then click Sync Devices.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Device</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-left">Last Seen</th>
                      <th className="px-4 py-3 text-left">Alerts</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {devices.map(d => (
                      <tr key={d.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{iconFor(d.type)}</span>
                            <div>
                              {editId === d.id ? (
                                <input
                                  value={editName}
                                  onChange={e => setEditName(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(d); if (e.key === 'Escape') setEditId(null) }}
                                  className="border border-green-400 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                                  autoFocus
                                />
                              ) : (
                                <div className="font-medium text-gray-800">{d.name}</div>
                              )}
                              <div className="text-xs text-gray-400">{d.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {d.type}
                          {d.model && <span className="text-xs text-gray-400 ml-1">({d.model})</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {d.last_seen_at
                            ? new Date(d.last_seen_at).toLocaleString()
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleToggleAlerts(d)}
                            className={`text-xs font-medium px-2 py-0.5 rounded-full transition ${
                              d.alerts_enabled
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            {d.alerts_enabled ? 'On' : 'Off'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {editId === d.id ? (
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => saveEdit(d)} className="text-xs text-green-700 font-medium hover:text-green-900">Save</button>
                              <button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => startEdit(d)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Rename</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'alerts' && (
        <>
          {alerts.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-12">No alerts recorded yet.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Time</th>
                      <th className="px-4 py-3 text-left">Device</th>
                      <th className="px-4 py-3 text-left">Event</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {alerts.map(a => (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                          {new Date(a.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-800">{a.device_name}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            a.event_type.toLowerCase().includes('leak') || a.event_type.toLowerCase().includes('open')
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {a.event_type}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'settings' && (
        <div className="max-w-md">
          <p className="text-sm text-gray-500 mb-4">
            Get your Client ID and Secret Key from the YoLink app under{' '}
            <strong>Account → Advanced → Client ID &amp; Secret Key</strong>.
          </p>
          <form onSubmit={handleSaveConfig} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client ID</label>
              <input
                type="text"
                value={configClientId}
                onChange={e => setConfigClientId(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="UA_xxxxxxxxxxxx"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Secret Key <span className="text-gray-400 font-normal">(leave blank to keep existing)</span>
              </label>
              <input
                type="password"
                value={configSecretKey}
                onChange={e => setConfigSecretKey(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-green-700 text-white font-medium py-2 rounded-lg text-sm hover:bg-green-800 transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Credentials'}
            </button>
          </form>
          <div className="mt-5 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-xs text-yellow-800">
            <strong>After saving:</strong> The server will reconnect to YoLink automatically.
            Use Sync Devices on the Devices tab to pull your device list.
            Alerts will be sent to all board members via email and in-app notification.
          </div>
        </div>
      )}
    </div>
  )
}
