import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { ApplianceItem, ApplianceServiceRecord, ApplianceReminder } from '../../api/client'

type Tab = 'service' | 'reminders'

const SERVICE_TYPES = ['maintenance', 'repair', 'inspection', 'cleaning', 'other']
const RECURRENCE_OPTIONS = [
  { label: 'One-time', value: '' },
  { label: 'Monthly (30 days)', value: '30' },
  { label: 'Quarterly (90 days)', value: '90' },
  { label: 'Semi-annual (180 days)', value: '180' },
  { label: 'Annual (365 days)', value: '365' },
]

function fmt(date?: string) {
  if (!date) return ''
  const [y, m, d] = date.split('-')
  return `${m}/${d}/${y}`
}

function isOverdue(due: string) {
  return new Date(due) < new Date(new Date().toDateString())
}

function isDueSoon(due: string) {
  const d = new Date(due)
  const today = new Date(new Date().toDateString())
  const diff = (d.getTime() - today.getTime()) / 86400000
  return diff >= 0 && diff <= 30
}

export default function AdminAppliances() {
  const [appliances, setAppliances] = useState<ApplianceItem[]>([])
  const [selected, setSelected] = useState<ApplianceItem | null>(null)
  const [tab, setTab] = useState<Tab>('service')
  const [records, setRecords] = useState<ApplianceServiceRecord[]>([])
  const [reminders, setReminders] = useState<ApplianceReminder[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Appliance modal
  const [showApplianceModal, setShowApplianceModal] = useState(false)
  const [editingAppliance, setEditingAppliance] = useState<ApplianceItem | null>(null)
  const [appForm, setAppForm] = useState({ name: '', location: '', brand: '', model_number: '', serial_number: '', installed_date: '', notes: '' })
  const [appSaving, setAppSaving] = useState(false)
  const [appError, setAppError] = useState('')

  // Manual upload
  const [manualFile, setManualFile] = useState<File | null>(null)
  const [manualUploading, setManualUploading] = useState(false)

  // Service record modal
  const [showRecordModal, setShowRecordModal] = useState(false)
  const [recForm, setRecForm] = useState({ service_date: '', service_type: 'maintenance', description: '', technician: '', cost: '' })
  const [recSaving, setRecSaving] = useState(false)
  const [recError, setRecError] = useState('')

  // Reminder modal
  const [showReminderModal, setShowReminderModal] = useState(false)
  const [editingReminder, setEditingReminder] = useState<ApplianceReminder | null>(null)
  const [remForm, setRemForm] = useState({ title: '', due_date: '', recurrence_days: '', notes: '' })
  const [remSaving, setRemSaving] = useState(false)
  const [remError, setRemError] = useState('')
  const [sendingId, setSendingId] = useState<string | null>(null)

  useEffect(() => {
    api.appliances.list().then(setAppliances).catch(() => {})
  }, [])

  const selectAppliance = async (a: ApplianceItem) => {
    setSelected(a)
    setTab('service')
    setLoadingDetail(true)
    await Promise.all([
      api.appliances.serviceRecords.list(a.id).then(setRecords).catch(() => setRecords([])),
      api.appliances.reminders.list(a.id).then(setReminders).catch(() => setReminders([])),
    ])
    setLoadingDetail(false)
  }

  const openAddAppliance = () => {
    setEditingAppliance(null)
    setAppForm({ name: '', location: '', brand: '', model_number: '', serial_number: '', installed_date: '', notes: '' })
    setManualFile(null)
    setAppError('')
    setShowApplianceModal(true)
  }

  const openEditAppliance = (a: ApplianceItem) => {
    setEditingAppliance(a)
    setAppForm({
      name: a.name,
      location: a.location ?? '',
      brand: a.brand ?? '',
      model_number: a.model_number ?? '',
      serial_number: a.serial_number ?? '',
      installed_date: a.installed_date ?? '',
      notes: a.notes ?? '',
    })
    setManualFile(null)
    setAppError('')
    setShowApplianceModal(true)
  }

  const saveAppliance = async () => {
    if (!appForm.name.trim()) { setAppError('Name is required'); return }
    setAppSaving(true)
    setAppError('')
    try {
      let saved: ApplianceItem
      if (editingAppliance) {
        saved = await api.appliances.update(editingAppliance.id, appForm)
      } else {
        saved = await api.appliances.create(appForm)
      }

      // Upload manual if selected
      if (manualFile) {
        const form = new FormData()
        form.append('manual', manualFile)
        saved = await api.appliances.uploadManual(saved.id, form)
      }

      setAppliances(prev => editingAppliance
        ? prev.map(a => a.id === saved.id ? saved : a)
        : [...prev, saved].sort((a, b) => a.name.localeCompare(b.name)))
      if (selected?.id === saved.id) setSelected(saved)
      setShowApplianceModal(false)
    } catch (e: any) {
      setAppError(e.message)
    } finally {
      setAppSaving(false)
    }
  }

  const deleteAppliance = async (a: ApplianceItem) => {
    if (!confirm(`Delete "${a.name}"? This will remove all service records and reminders.`)) return
    await api.appliances.delete(a.id).catch(() => {})
    setAppliances(prev => prev.filter(x => x.id !== a.id))
    if (selected?.id === a.id) setSelected(null)
  }

  const removeManual = async () => {
    if (!selected) return
    await api.appliances.deleteManual(selected.id).catch(() => {})
    const updated = { ...selected, manual_filename: undefined, manual_original_name: undefined }
    setSelected(updated)
    setAppliances(prev => prev.map(a => a.id === updated.id ? updated : a))
  }

  const addRecord = async () => {
    if (!selected || !recForm.service_date) { setRecError('Service date is required'); return }
    setRecSaving(true)
    setRecError('')
    try {
      const r = await api.appliances.serviceRecords.create(selected.id, {
        ...recForm,
        cost: recForm.cost ? parseFloat(recForm.cost) : null,
      })
      setRecords(prev => [r, ...prev])
      setShowRecordModal(false)
    } catch (e: any) {
      setRecError(e.message)
    } finally {
      setRecSaving(false)
    }
  }

  const deleteRecord = async (id: string) => {
    if (!selected || !confirm('Delete this service record?')) return
    await api.appliances.serviceRecords.delete(selected.id, id).catch(() => {})
    setRecords(prev => prev.filter(r => r.id !== id))
  }

  const openAddReminder = () => {
    setEditingReminder(null)
    setRemForm({ title: '', due_date: '', recurrence_days: '', notes: '' })
    setRemError('')
    setShowReminderModal(true)
  }

  const openEditReminder = (r: ApplianceReminder) => {
    setEditingReminder(r)
    setRemForm({
      title: r.title,
      due_date: r.due_date,
      recurrence_days: r.recurrence_days?.toString() ?? '',
      notes: r.notes ?? '',
    })
    setRemError('')
    setShowReminderModal(true)
  }

  const saveReminder = async () => {
    if (!selected || !remForm.title || !remForm.due_date) { setRemError('Title and due date are required'); return }
    setRemSaving(true)
    setRemError('')
    const data = {
      ...remForm,
      recurrence_days: remForm.recurrence_days ? parseInt(remForm.recurrence_days) : null,
    }
    try {
      let r: ApplianceReminder
      if (editingReminder) {
        r = await api.appliances.reminders.update(selected.id, editingReminder.id, data)
        setReminders(prev => prev.map(x => x.id === r.id ? r : x).sort((a, b) => a.due_date.localeCompare(b.due_date)))
      } else {
        r = await api.appliances.reminders.create(selected.id, data)
        setReminders(prev => [...prev, r].sort((a, b) => a.due_date.localeCompare(b.due_date)))
      }
      setShowReminderModal(false)
    } catch (e: any) {
      setRemError(e.message)
    } finally {
      setRemSaving(false)
    }
  }

  const deleteReminder = async (applianceId: string, reminderId: string) => {
    if (!confirm('Delete this reminder?')) return
    await api.appliances.reminders.delete(applianceId, reminderId).catch(() => {})
    setReminders(prev => prev.filter(r => r.id !== reminderId))
  }

  const sendReminder = async (applianceId: string, reminderId: string) => {
    setSendingId(reminderId)
    try {
      const res = await api.appliances.reminders.send(applianceId, reminderId)
      setReminders(prev => prev.map(r => r.id === reminderId
        ? { ...r, last_sent_at: new Date().toISOString() } : r))
      alert(`Reminder sent to ${res.sent} board member${res.sent !== 1 ? 's' : ''}.`)
    } catch {
      alert('Failed to send reminder.')
    } finally {
      setSendingId(null)
    }
  }

  const nextReminder = (id: string) => reminders
    .filter(r => r.appliance_id === id || selected?.id === id)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">Appliances & Maintenance</h2>
        <button onClick={openAddAppliance}
          className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
          + Add Appliance
        </button>
      </div>

      <div className="flex gap-4 h-[calc(100vh-220px)]">
        {/* Left: appliance list */}
        <div className="w-56 shrink-0 flex flex-col gap-1.5 overflow-y-auto pr-1">
          {appliances.length === 0 && (
            <p className="text-sm text-gray-400 text-center mt-8">No appliances yet.</p>
          )}
          {appliances.map(a => {
            const overdueCount = reminders.filter(r => r.appliance_id === a.id && isOverdue(r.due_date)).length
            const isActive = selected?.id === a.id
            return (
              <button key={a.id} onClick={() => selectAppliance(a)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition ${isActive ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                <p className={`text-sm font-semibold truncate ${isActive ? 'text-green-800' : 'text-gray-800'}`}>{a.name}</p>
                {a.location && <p className="text-xs text-gray-400 truncate">{a.location}</p>}
                {overdueCount > 0 && (
                  <span className="inline-block mt-1 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                    {overdueCount} overdue
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Right: detail panel */}
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
            Select an appliance to view details
          </div>
        ) : (
          <div className="flex-1 min-w-0 flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-gray-800">{selected.name}</h3>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-500">
                  {selected.location && <span>📍 {selected.location}</span>}
                  {selected.brand && <span>{selected.brand}{selected.model_number ? ` · ${selected.model_number}` : ''}</span>}
                  {selected.serial_number && <span>S/N: {selected.serial_number}</span>}
                  {selected.installed_date && <span>Installed: {fmt(selected.installed_date)}</span>}
                </div>
                {selected.notes && <p className="text-xs text-gray-400 mt-1">{selected.notes}</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => openEditAppliance(selected)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition">
                  Edit
                </button>
                <button onClick={() => deleteAppliance(selected)}
                  className="text-xs px-3 py-1.5 rounded-lg text-red-400 hover:text-red-600 transition">
                  Delete
                </button>
              </div>
            </div>

            {/* Manual */}
            <div className="px-5 py-2.5 border-b border-gray-100 flex items-center gap-3">
              <span className="text-xs font-medium text-gray-500 w-16 shrink-0">Manual</span>
              {selected.manual_filename ? (
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <a href={`/uploads/appliance-manuals/${selected.manual_filename}`}
                    target="_blank" rel="noreferrer"
                    className="text-xs text-green-700 hover:underline truncate">
                    {selected.manual_original_name ?? selected.manual_filename}
                  </a>
                  <button onClick={removeManual} className="text-xs text-gray-400 hover:text-red-500 transition shrink-0">Remove</button>
                </div>
              ) : (
                <label className="cursor-pointer text-xs text-green-700 hover:underline">
                  Upload PDF
                  <input type="file" accept=".pdf,.doc,.docx" className="hidden"
                    onChange={async e => {
                      const f = e.target.files?.[0]
                      if (!f || !selected) return
                      setManualUploading(true)
                      const form = new FormData()
                      form.append('manual', f)
                      try {
                        const updated = await api.appliances.uploadManual(selected.id, form)
                        setSelected(updated)
                        setAppliances(prev => prev.map(a => a.id === updated.id ? updated : a))
                      } finally {
                        setManualUploading(false)
                      }
                    }} />
                </label>
              )}
              {manualUploading && <span className="text-xs text-gray-400">Uploading…</span>}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-5">
              {(['service', 'reminders'] as Tab[]).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`py-2.5 px-1 mr-5 text-sm font-medium border-b-2 transition ${tab === t ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {t === 'service' ? `Service History (${records.length})` : `Reminders (${reminders.length})`}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              {loadingDetail ? (
                <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
              ) : tab === 'service' ? (
                <div>
                  <div className="px-5 py-3 flex justify-end">
                    <button onClick={() => {
                      setRecForm({ service_date: new Date().toISOString().slice(0, 10), service_type: 'maintenance', description: '', technician: '', cost: '' })
                      setRecError('')
                      setShowRecordModal(true)
                    }}
                      className="text-xs bg-green-700 hover:bg-green-800 text-white font-semibold px-3 py-1.5 rounded-lg transition">
                      + Log Service
                    </button>
                  </div>
                  {records.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">No service records yet.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 uppercase tracking-wider bg-gray-50">
                          <th className="text-left px-5 py-2">Date</th>
                          <th className="text-left px-3 py-2">Type</th>
                          <th className="text-left px-3 py-2">Description</th>
                          <th className="text-left px-3 py-2">Technician</th>
                          <th className="text-right px-5 py-2">Cost</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {records.map(r => (
                          <tr key={r.id} className="hover:bg-gray-50">
                            <td className="px-5 py-2.5 text-gray-700 whitespace-nowrap">{fmt(r.service_date)}</td>
                            <td className="px-3 py-2.5 capitalize text-gray-600">{r.service_type}</td>
                            <td className="px-3 py-2.5 text-gray-600">{r.description ?? '—'}</td>
                            <td className="px-3 py-2.5 text-gray-500">{r.technician ?? '—'}</td>
                            <td className="px-5 py-2.5 text-right text-gray-700">
                              {r.cost != null ? `$${r.cost.toFixed(2)}` : '—'}
                            </td>
                            <td className="px-3 py-2.5">
                              <button onClick={() => deleteRecord(r.id)}
                                className="text-gray-300 hover:text-red-500 transition text-base leading-none">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : (
                <div>
                  <div className="px-5 py-3 flex justify-end">
                    <button onClick={openAddReminder}
                      className="text-xs bg-green-700 hover:bg-green-800 text-white font-semibold px-3 py-1.5 rounded-lg transition">
                      + Add Reminder
                    </button>
                  </div>
                  {reminders.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">No reminders set.</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {reminders.map(r => {
                        const overdue = isOverdue(r.due_date)
                        const soon = !overdue && isDueSoon(r.due_date)
                        return (
                          <div key={r.id} className="px-5 py-3 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-gray-800">{r.title}</p>
                                {overdue && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Overdue</span>}
                                {soon && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Due soon</span>}
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">
                                Due {fmt(r.due_date)}
                                {r.recurrence_days && ` · repeats every ${r.recurrence_days} days`}
                                {r.notes && ` · ${r.notes}`}
                              </p>
                              {r.last_sent_at && (
                                <p className="text-xs text-gray-400">Last sent {new Date(r.last_sent_at).toLocaleDateString()}</p>
                              )}
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <button onClick={() => sendReminder(selected.id, r.id)}
                                disabled={sendingId === r.id}
                                className="text-xs px-2.5 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 font-medium transition disabled:opacity-50">
                                {sendingId === r.id ? 'Sending…' : 'Send Now'}
                              </button>
                              <button onClick={() => openEditReminder(r)}
                                className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition">
                                Edit
                              </button>
                              <button onClick={() => deleteReminder(selected.id, r.id)}
                                className="text-gray-300 hover:text-red-500 transition text-base leading-none">✕</button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Appliance modal */}
      {showApplianceModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowApplianceModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">{editingAppliance ? 'Edit Appliance' : 'Add Appliance'}</h2>
              <button onClick={() => setShowApplianceModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input value={appForm.name} onChange={e => setAppForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="HVAC Unit, Washer, etc." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
                  <input value={appForm.location} onChange={e => setAppForm(f => ({ ...f, location: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Clubhouse, Court 3…" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Installed Date</label>
                  <input type="date" value={appForm.installed_date} onChange={e => setAppForm(f => ({ ...f, installed_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Brand</label>
                  <input value={appForm.brand} onChange={e => setAppForm(f => ({ ...f, brand: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Carrier, LG…" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Model #</label>
                  <input value={appForm.model_number} onChange={e => setAppForm(f => ({ ...f, model_number: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Serial #</label>
                <input value={appForm.serial_number} onChange={e => setAppForm(f => ({ ...f, serial_number: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea value={appForm.notes} onChange={e => setAppForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              {!editingAppliance && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Manual (PDF optional)</label>
                  <input type="file" accept=".pdf,.doc,.docx"
                    onChange={e => setManualFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-gray-600" />
                </div>
              )}
              {appError && <p className="text-xs text-red-500">{appError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setShowApplianceModal(false)}
                className="text-sm px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition">
                Cancel
              </button>
              <button onClick={saveAppliance} disabled={appSaving}
                className="text-sm px-4 py-2 rounded-lg bg-green-700 hover:bg-green-800 text-white font-semibold transition disabled:opacity-50">
                {appSaving ? 'Saving…' : editingAppliance ? 'Save Changes' : 'Add Appliance'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Service record modal */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowRecordModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Log Service</h2>
              <button onClick={() => setShowRecordModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                  <input type="date" value={recForm.service_date} onChange={e => setRecForm(f => ({ ...f, service_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                  <select value={recForm.service_type} onChange={e => setRecForm(f => ({ ...f, service_type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                    {SERVICE_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea value={recForm.description} onChange={e => setRecForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="What was done?" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Technician</label>
                  <input value={recForm.technician} onChange={e => setRecForm(f => ({ ...f, technician: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cost ($)</label>
                  <input type="number" min="0" step="0.01" value={recForm.cost} onChange={e => setRecForm(f => ({ ...f, cost: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              {recError && <p className="text-xs text-red-500">{recError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setShowRecordModal(false)}
                className="text-sm px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition">Cancel</button>
              <button onClick={addRecord} disabled={recSaving}
                className="text-sm px-4 py-2 rounded-lg bg-green-700 hover:bg-green-800 text-white font-semibold transition disabled:opacity-50">
                {recSaving ? 'Saving…' : 'Log Service'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reminder modal */}
      {showReminderModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowReminderModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">{editingReminder ? 'Edit Reminder' : 'Add Reminder'}</h2>
              <button onClick={() => setShowReminderModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
                <input value={remForm.title} onChange={e => setRemForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Annual HVAC Service, Filter Replacement…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Due Date *</label>
                  <input type="date" value={remForm.due_date} onChange={e => setRemForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Repeats</label>
                  <select value={remForm.recurrence_days} onChange={e => setRemForm(f => ({ ...f, recurrence_days: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                    {RECURRENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <input value={remForm.notes} onChange={e => setRemForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              {remError && <p className="text-xs text-red-500">{remError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setShowReminderModal(false)}
                className="text-sm px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition">Cancel</button>
              <button onClick={saveReminder} disabled={remSaving}
                className="text-sm px-4 py-2 rounded-lg bg-green-700 hover:bg-green-800 text-white font-semibold transition disabled:opacity-50">
                {remSaving ? 'Saving…' : editingReminder ? 'Save Changes' : 'Add Reminder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
