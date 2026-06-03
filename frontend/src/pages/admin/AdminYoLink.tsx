import { useEffect, useState } from 'react'
import { parseDate } from '../../utils/dates'
import { api, YoLinkRule } from '../../api/client'

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

type Tab = 'devices' | 'rules' | 'alerts' | 'settings'

const ROLE_OPTIONS: [string, string][] = [
  ['member', 'Member'], ['president', 'President'], ['vice_president', 'Vice President'],
  ['secretary', 'Secretary'], ['treasurer', 'Treasurer'], ['billing', 'Billing'],
  ['membership', 'Membership'], ['usta', 'USTA'], ['entertainment', 'Entertainment'],
  ['house_grounds', 'House & Grounds'], ['games', 'Games'], ['pro', 'Pro'],
]

const emptyRule = (): Partial<YoLinkRule> => ({
  name: '', enabled: true, priority: 100,
  device_id: null, device_type: null, event_contains: null, state_equals: null,
  active_start_time: null, active_end_time: null, active_days: null,
  cooldown_minutes: null, stop_processing: false, notes: null,
  recipient_scope: 'board', recipient_role: null, recipient_user_id: null,
  notify_dashboard: true, notify_email: false, notify_sms: false,
  alert_type: 'warning', message_template: null,
})

const DAYS: { bit: number; label: string; short: string }[] = [
  { bit: 1,  label: 'Sunday',    short: 'Su' },
  { bit: 2,  label: 'Monday',    short: 'Mo' },
  { bit: 4,  label: 'Tuesday',   short: 'Tu' },
  { bit: 8,  label: 'Wednesday', short: 'We' },
  { bit: 16, label: 'Thursday',  short: 'Th' },
  { bit: 32, label: 'Friday',    short: 'Fr' },
  { bit: 64, label: 'Saturday',  short: 'Sa' },
]

function activeDaysLabel(mask: number | null): string {
  if (!mask) return ''
  if (mask === 127) return 'Every day'
  if (mask === 62)  return 'Mon–Fri'
  if (mask === 65)  return 'Weekends'
  return DAYS.filter(d => mask & d.bit).map(d => d.short).join(' ')
}

const SCOPE_LABEL: Record<string, string> = {
  all_members: 'All members', board: 'Board', role: 'Role', user: 'Specific user',
}

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

  // Alert rules
  const [rules, setRules] = useState<YoLinkRule[]>([])
  const [ruleForm, setRuleForm] = useState<Partial<YoLinkRule> | null>(null)
  const [ruleSaving, setRuleSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [members, setMembers] = useState<{ id: string; first_name: string; last_name: string }[]>([])

  const loadDevices = () => api.yolink.listDevices().then(d => setDevices(d as Device[]))
  const loadAlerts = () => api.yolink.listAlerts().then(a => setAlerts(a as Alert[]))
  const loadRules = () => api.yolink.listRules().then(setRules)

  useEffect(() => {
    loadDevices()
    loadAlerts()
    loadRules()
    api.members.directory().then((m: any) => setMembers(m as any[])).catch(() => {})
    api.yolink.getConfig().then((c: any) => setConfigClientId(c.client_id ?? ''))
  }, [])

  const memberName = (id: string | null) => {
    const m = members.find(x => x.id === id)
    return m ? `${m.first_name} ${m.last_name}` : 'user'
  }

  const deviceTypes = [...new Set(devices.map(d => d.type).filter(Boolean))].sort()

  const setRF = (patch: Partial<YoLinkRule>) => setRuleForm(f => ({ ...f, ...patch }))

  const saveRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ruleForm?.name?.trim()) return
    setRuleSaving(true)
    try {
      if (ruleForm.id) await api.yolink.updateRule(ruleForm.id, ruleForm)
      else await api.yolink.createRule(ruleForm)
      setRuleForm(null)
      await loadRules()
    } catch (err: any) {
      alert(err.message ?? 'Save failed')
    } finally {
      setRuleSaving(false)
    }
  }

  const toggleRule = async (r: YoLinkRule) => {
    await api.yolink.updateRule(r.id, { ...r, enabled: !r.enabled })
    loadRules()
  }

  const deleteRule = async (r: YoLinkRule) => {
    if (!confirm(`Delete rule "${r.name}"?`)) return
    await api.yolink.deleteRule(r.id)
    loadRules()
  }

  const testRule = async (r: YoLinkRule) => {
    setTestingId(r.id)
    try {
      const res = await api.yolink.testRule(r.id)
      alert(`Test alert for "${r.name}" sent to ${res.recipients} recipient(s) via ${[r.notify_dashboard && 'dashboard', r.notify_email && 'email', r.notify_sms && 'SMS'].filter(Boolean).join(', ') || 'no channels'}.`)
    } catch (err: any) {
      alert(err.message ?? 'Test failed')
    } finally {
      setTestingId(null)
    }
  }

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
    { key: 'rules', label: 'Alert Rules' },
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
                            ? parseDate(d.last_seen_at).toLocaleString()
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

      {tab === 'rules' && (
        <>
          {ruleForm ? (
            <form onSubmit={saveRule} className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4 max-w-2xl">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">{ruleForm.id ? 'Edit Rule' : 'New Rule'}</h3>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={ruleForm.enabled ?? true} onChange={e => setRF({ enabled: e.target.checked })} className="accent-green-600" />
                  Enabled
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rule name</label>
                <input value={ruleForm.name ?? ''} onChange={e => setRF({ name: e.target.value })} required
                  placeholder="e.g. Water leak → text the board"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>

              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">When… (blank = any)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Device</label>
                    <select value={ruleForm.device_id ?? ''} onChange={e => setRF({ device_id: e.target.value || null })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                      <option value="">Any device</option>
                      {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Device type</label>
                    <select value={ruleForm.device_type ?? ''} onChange={e => setRF({ device_type: e.target.value || null })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                      <option value="">Any type</option>
                      {deviceTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Event contains</label>
                    <input value={ruleForm.event_contains ?? ''} onChange={e => setRF({ event_contains: e.target.value || null })}
                      placeholder="e.g. Alert, Open" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">State equals</label>
                    <input value={ruleForm.state_equals ?? ''} onChange={e => setRF({ state_equals: e.target.value || null })}
                      placeholder="e.g. alert, open, normal" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Active from (optional)</label>
                    <input type="time" value={ruleForm.active_start_time ?? ''} onChange={e => setRF({ active_start_time: e.target.value || null })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Active until (optional)</label>
                    <input type="time" value={ruleForm.active_end_time ?? ''} onChange={e => setRF({ active_end_time: e.target.value || null })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                </div>
                {(ruleForm.active_start_time || ruleForm.active_end_time) && (
                  <p className="text-xs text-gray-400 mt-1">
                    Rule only fires between {ruleForm.active_start_time || '?'} and {ruleForm.active_end_time || '?'}.
                    Overnight windows (e.g. 22:00–06:00) are supported.
                  </p>
                )}

                <div className="mt-3">
                  <label className="block text-xs text-gray-500 mb-1">Days of week (blank = any)</label>
                  <div className="flex gap-1 flex-wrap">
                    {DAYS.map(d => {
                      const active = !!((ruleForm.active_days ?? 0) & d.bit)
                      return (
                        <button
                          key={d.bit}
                          type="button"
                          title={d.label}
                          onClick={() => setRF({ active_days: ((ruleForm.active_days ?? 0) ^ d.bit) || null })}
                          className={`w-9 h-9 text-xs font-medium rounded-lg border transition ${
                            active
                              ? 'bg-green-700 text-white border-green-700'
                              : 'bg-white text-gray-500 border-gray-300 hover:border-green-400'
                          }`}
                        >
                          {d.short}
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={() => setRF({ active_days: (ruleForm.active_days ?? 0) === 62 ? null : 62 })}
                      className="px-2 h-9 text-xs text-gray-500 border border-gray-300 rounded-lg hover:border-green-400 transition"
                    >M–F</button>
                    <button
                      type="button"
                      onClick={() => setRF({ active_days: null })}
                      className="px-2 h-9 text-xs text-gray-500 border border-gray-300 rounded-lg hover:border-green-400 transition"
                    >Any</button>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Behaviour</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Priority (lower fires first)</label>
                    <input
                      type="number" min={1} max={999}
                      value={ruleForm.priority ?? 100}
                      onChange={e => setRF({ priority: parseInt(e.target.value) || 100 })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Cooldown (minutes, optional)</label>
                    <input
                      type="number" min={1} placeholder="No cooldown"
                      value={ruleForm.cooldown_minutes ?? ''}
                      onChange={e => setRF({ cooldown_minutes: parseInt(e.target.value) || null })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 mt-3">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={ruleForm.stop_processing ?? false} onChange={e => setRF({ stop_processing: e.target.checked })} className="accent-green-600" />
                    Stop processing lower-priority rules when this fires
                  </label>
                </div>
                <div className="mt-3">
                  <label className="block text-xs text-gray-500 mb-1">Notes (internal, not sent)</label>
                  <input value={ruleForm.notes ?? ''} onChange={e => setRF({ notes: e.target.value || null })}
                    placeholder="Describe what this rule is for…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notify…</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Recipients</label>
                    <select value={ruleForm.recipient_scope ?? 'board'} onChange={e => setRF({ recipient_scope: e.target.value as YoLinkRule['recipient_scope'] })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                      <option value="all_members">All members</option>
                      <option value="board">Board members</option>
                      <option value="role">Specific role</option>
                      <option value="user">Specific user</option>
                    </select>
                  </div>
                  {ruleForm.recipient_scope === 'role' && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Role</label>
                      <select value={ruleForm.recipient_role ?? ''} onChange={e => setRF({ recipient_role: e.target.value || null })}
                        className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                        <option value="">Choose a role…</option>
                        {ROLE_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </div>
                  )}
                  {ruleForm.recipient_scope === 'user' && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Member</label>
                      <select value={ruleForm.recipient_user_id ?? ''} onChange={e => setRF({ recipient_user_id: e.target.value || null })}
                        className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                        <option value="">Choose a member…</option>
                        {members.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-4 mt-3">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={ruleForm.notify_dashboard ?? false} onChange={e => setRF({ notify_dashboard: e.target.checked })} className="accent-green-600" />
                    Dashboard alert
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={ruleForm.notify_email ?? false} onChange={e => setRF({ notify_email: e.target.checked })} className="accent-green-600" />
                    Email
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={ruleForm.notify_sms ?? false} onChange={e => setRF({ notify_sms: e.target.checked })} className="accent-green-600" />
                    SMS
                  </label>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Severity</label>
                  <select value={ruleForm.alert_type ?? 'warning'} onChange={e => setRF({ alert_type: e.target.value as YoLinkRule['alert_type'] })}
                    className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="danger">Danger</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Message (optional)</label>
                  <input value={ruleForm.message_template ?? ''} onChange={e => setRF({ message_template: e.target.value || null })}
                    placeholder="{device}: {event}" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setRuleForm(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={ruleSaving} className="px-5 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 disabled:opacity-50">
                  {ruleSaving ? 'Saving…' : ruleForm.id ? 'Save Rule' : 'Create Rule'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-gray-500">Rules decide who gets notified — and how — when a sensor event arrives.</p>
                <button onClick={() => setRuleForm(emptyRule())} className="bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-green-800 transition shrink-0">+ Add Rule</button>
              </div>
              {rules.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-12">No rules yet. Add one to start sending alerts.</p>
              ) : (
                <div className="space-y-2">
                  {rules.map(r => (
                    <div key={r.id} className={`bg-white border rounded-xl p-4 flex items-start justify-between gap-3 ${r.enabled ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">{r.name}</span>
                          <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${r.alert_type === 'danger' ? 'bg-red-100 text-red-700' : r.alert_type === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{r.alert_type}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          When {[
                            r.device_id ? (devices.find(d => d.id === r.device_id)?.name ?? 'device') : null,
                            r.device_type ? `type ${r.device_type}` : null,
                            r.event_contains ? `event ~ "${r.event_contains}"` : null,
                            r.state_equals ? `state = "${r.state_equals}"` : null,
                          ].filter(Boolean).join(' · ') || 'any event'} → {SCOPE_LABEL[r.recipient_scope]}{r.recipient_role ? ` (${r.recipient_role})` : ''}{r.recipient_scope === 'user' ? ` (${memberName(r.recipient_user_id)})` : ''}
                        </p>
                        {(r.active_start_time || r.active_end_time || r.active_days) && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {[
                              (r.active_start_time || r.active_end_time) ? `${r.active_start_time ?? '?'}–${r.active_end_time ?? '?'}` : null,
                              activeDaysLabel(r.active_days),
                            ].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {[
                            `P${r.priority}`,
                            r.cooldown_minutes ? `cooldown ${r.cooldown_minutes}m` : null,
                            r.stop_processing ? 'stop after' : null,
                            r.last_fired_at ? `last fired ${parseDate(r.last_fired_at).toLocaleString()}` : null,
                          ].filter(Boolean).join(' · ')}
                        </p>
                        {r.notes && <p className="text-xs text-gray-400 italic mt-0.5">{r.notes}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {[r.notify_dashboard && 'Dashboard', r.notify_email && 'Email', r.notify_sms && 'SMS'].filter(Boolean).join(' · ') || 'No channels'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => toggleRule(r)} className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.enabled ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{r.enabled ? 'On' : 'Off'}</button>
                        <button onClick={() => testRule(r)} disabled={testingId === r.id} className="text-xs text-gray-500 hover:text-gray-800 font-medium disabled:opacity-50">{testingId === r.id ? 'Testing…' : 'Test'}</button>
                        <button onClick={() => setRuleForm({ ...r })} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Edit</button>
                        <button onClick={() => deleteRule(r)} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
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
                          {parseDate(a.created_at).toLocaleString()}
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
            Who gets alerted — and whether by dashboard, email, or SMS — is controlled on the Alert Rules tab.
          </div>
        </div>
      )}
    </div>
  )
}
