import { useEffect, useState } from 'react'
import { api, FinancialRule } from '../../api/client'

const ALL_ACTIONS = [
  { value: 'block_bookings', label: 'Block court bookings', color: 'text-red-700 bg-red-50 border-red-200' },
  { value: 'block_kiosk', label: 'Block kiosk purchases', color: 'text-orange-700 bg-orange-50 border-orange-200' },
  { value: 'dashboard_warning', label: 'Show member dashboard warning', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { value: 'email_reminder', label: 'Include in email reminders', color: 'text-blue-700 bg-blue-50 border-blue-200' },
]

const CONDITION_LABELS: Record<string, string> = {
  unpaid_dues: 'Member has unpaid dues past the grace period',
  any_outstanding_balance: 'Member has any outstanding balance past the grace period (dues, kiosk tab, or charges)',
}

const emptyForm = { name: '', condition: 'unpaid_dues', grace_days: 30, actions: ['block_bookings', 'dashboard_warning'] }

export default function AdminFinancialRules() {
  const [rules, setRules] = useState<FinancialRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState(emptyForm)
  const [addError, setAddError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<FinancialRule>>({})
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    api.finance.rules().then(d => { setRules(d); setLoading(false) }).catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const toggleEnabled = async (rule: FinancialRule) => {
    await api.finance.updateRule(rule.id, { ...rule, enabled: !rule.enabled })
    load()
  }

  const startEdit = (rule: FinancialRule) => {
    setEditingId(rule.id)
    setEditForm({ name: rule.name, enabled: rule.enabled, condition: rule.condition, grace_days: rule.grace_days, actions: [...rule.actions] })
  }

  const saveEdit = async () => {
    if (!editingId) return
    setSaving(true)
    try {
      await api.finance.updateRule(editingId, editForm)
      setEditingId(null)
      load()
    } finally { setSaving(false) }
  }

  const deleteRule = async (id: string, name: string) => {
    if (!confirm(`Delete rule "${name}"?`)) return
    await api.finance.deleteRule(id)
    load()
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError('')
    if (!addForm.name.trim()) { setAddError('Name is required.'); return }
    if (addForm.actions.length === 0) { setAddError('Select at least one action.'); return }
    setSaving(true)
    try {
      await api.finance.createRule(addForm)
      setShowAdd(false)
      setAddForm(emptyForm)
      load()
    } catch (err: any) {
      setAddError(err.message)
    } finally { setSaving(false) }
  }

  const toggleAction = (actions: string[], action: string): string[] =>
    actions.includes(action) ? actions.filter(a => a !== action) : [...actions, action]

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Financial Enforcement Rules</h2>
          <p className="text-sm text-gray-500 mt-0.5">Configure when members are automatically restricted based on their account standing.</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition">
          + Add Rule
        </button>
      </div>

      {/* How it works */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-sm text-blue-800">
        <p className="font-medium mb-1">How enforcement works</p>
        <ul className="space-y-0.5 text-blue-700 list-disc list-inside">
          <li>Rules are checked in real-time when a member books a court or makes a kiosk purchase.</li>
          <li>The grace period is how many days past the due date before the rule kicks in.</li>
          <li>Members can view their balance on their dashboard. Use <strong>Send Reminders</strong> in Accounting to email them.</li>
          <li>Admins and board members are never blocked by enforcement rules.</li>
        </ul>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-12 text-sm">Loading…</p>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <div key={rule.id} className={`bg-white border rounded-xl shadow-sm transition ${rule.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
              {editingId === rule.id ? (
                /* Edit mode */
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Rule Name</label>
                      <input value={editForm.name ?? ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Condition</label>
                      <select value={editForm.condition} onChange={e => setEditForm(f => ({ ...f, condition: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                        <option value="unpaid_dues">Unpaid dues</option>
                        <option value="any_outstanding_balance">Any outstanding balance</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Grace Period (days after due date)</label>
                      <input type="number" min="0" value={editForm.grace_days ?? 0}
                        onChange={e => setEditForm(f => ({ ...f, grace_days: parseInt(e.target.value) || 0 }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                    <div className="flex items-center gap-2 pt-5">
                      <input type="checkbox" id={`edit-enabled-${rule.id}`} checked={editForm.enabled ?? false}
                        onChange={e => setEditForm(f => ({ ...f, enabled: e.target.checked }))}
                        className="w-4 h-4 rounded accent-green-600" />
                      <label htmlFor={`edit-enabled-${rule.id}`} className="text-sm font-medium text-gray-700">Rule enabled</label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">Actions when triggered</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {ALL_ACTIONS.map(a => (
                        <label key={a.value} className="flex items-start gap-2 cursor-pointer">
                          <input type="checkbox"
                            checked={(editForm.actions ?? []).includes(a.value)}
                            onChange={() => setEditForm(f => ({ ...f, actions: toggleAction(f.actions ?? [], a.value) }))}
                            className="w-4 h-4 rounded accent-green-600 mt-0.5" />
                          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${a.color}`}>{a.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveEdit} disabled={saving}
                      className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-5 py-1.5 rounded-lg transition disabled:opacity-50">
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <div className="p-5 flex items-start gap-4">
                  <button onClick={() => toggleEnabled(rule)}
                    className={`w-10 h-6 rounded-full transition shrink-0 mt-0.5 ${rule.enabled ? 'bg-green-600' : 'bg-gray-300'}`}>
                    <span className={`block w-4 h-4 bg-white rounded-full shadow mx-1 transition-transform ${rule.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800">{rule.name}</span>
                      {!rule.enabled && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">disabled</span>}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{CONDITION_LABELS[rule.condition] ?? rule.condition}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Grace period: {rule.grace_days} day{rule.grace_days !== 1 ? 's' : ''}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(rule.actions ?? []).map(a => {
                        const def = ALL_ACTIONS.find(x => x.value === a)
                        return def ? (
                          <span key={a} className={`text-xs px-2 py-0.5 rounded border font-medium ${def.color}`}>{def.label}</span>
                        ) : null
                      })}
                    </div>
                  </div>
                  <div className="flex gap-3 shrink-0">
                    <button onClick={() => startEdit(rule)} className="text-xs text-blue-500 hover:text-blue-700 font-medium">Edit</button>
                    <button onClick={() => deleteRule(rule.id, rule.name)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {rules.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p className="font-medium">No rules configured.</p>
              <p className="text-sm mt-1">Add a rule to start enforcing financial requirements.</p>
            </div>
          )}
        </div>
      )}

      {/* Add Rule Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
          <form onSubmit={handleAdd} onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-800">Add Enforcement Rule</h2>
              <button type="button" onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Rule Name *</label>
              <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} required
                placeholder="e.g. Overdue Annual Dues"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Condition *</label>
                <select value={addForm.condition} onChange={e => setAddForm(f => ({ ...f, condition: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                  <option value="unpaid_dues">Unpaid dues</option>
                  <option value="any_outstanding_balance">Any outstanding balance</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Grace Period (days)</label>
                <input type="number" min="0" value={addForm.grace_days}
                  onChange={e => setAddForm(f => ({ ...f, grace_days: parseInt(e.target.value) || 0 }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Actions when triggered *</label>
              <div className="grid grid-cols-1 gap-2">
                {ALL_ACTIONS.map(a => (
                  <label key={a.value} className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox"
                      checked={addForm.actions.includes(a.value)}
                      onChange={() => setAddForm(f => ({ ...f, actions: toggleAction(f.actions, a.value) }))}
                      className="w-4 h-4 rounded accent-green-600 mt-0.5" />
                    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${a.color}`}>{a.label}</span>
                  </label>
                ))}
              </div>
            </div>
            {addError && <p className="text-sm text-red-600">{addError}</p>}
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={saving}
                className="bg-green-700 hover:bg-green-800 text-white font-semibold px-6 py-2 rounded-lg text-sm transition disabled:opacity-50">
                {saving ? 'Adding…' : 'Add Rule'}
              </button>
              <button type="button" onClick={() => setShowAdd(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
