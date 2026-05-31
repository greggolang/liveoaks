import { useEffect, useState } from 'react'
import { api } from '../../api/client'

type Summary = {
  from: string; to: string
  beginning_inventory: number; purchased: number
  used_bookings: number; used_pro_shop: number; used_other: number
  total_used: number; ending_inventory: number
  period_cost: number; booking_count: number; cost_per_booking: number
  all_time_purchased: number; all_time_used: number; on_hand: number; all_time_cost: number
}
type UsageEvent = { id: string; used_date: string; quantity: number; source: string; user_name?: string; court_name?: string; notes?: string }
type Purchase = { id: string; purchase_date: string; quantity: number; cost_per_can?: number; total_cost?: number; notes?: string; created_at: string }

type Period = 'today' | 'week' | 'month' | 'year' | 'custom'

function dateRange(period: Period, customFrom: string, customTo: string): { from: string; to: string } {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  if (period === 'today') return { from: fmt(today), to: fmt(today) }
  if (period === 'week') {
    const mon = new Date(today); mon.setDate(today.getDate() - today.getDay() + 1)
    return { from: fmt(mon), to: fmt(today) }
  }
  if (period === 'month') return { from: fmt(today).slice(0, 8) + '01', to: fmt(today) }
  if (period === 'year') return { from: fmt(today).slice(0, 5) + '01-01', to: fmt(today) }
  return { from: customFrom, to: customTo }
}

const SOURCE_LABEL: Record<string, string> = { booking: 'Court Booking', pro_shop: 'Pro Shop Sale', manual: 'Manual / Other' }
const SOURCE_COLOR: Record<string, string> = {
  booking: 'bg-green-100 text-green-700',
  pro_shop: 'bg-blue-100 text-blue-700',
  manual: 'bg-gray-100 text-gray-600',
}

export default function AdminBallTracking() {
  const [period, setPeriod] = useState<Period>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [usage, setUsage] = useState<UsageEvent[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [tab, setTab] = useState<'report' | 'inventory'>('report')

  // Purchase form
  const [showPurchaseForm, setShowPurchaseForm] = useState(false)
  const [pForm, setPForm] = useState({ purchase_date: new Date().toISOString().slice(0,10), quantity: '', cost_per_can: '', total_cost: '', notes: '' })
  const [pSaving, setPSaving] = useState(false)
  const [pError, setPError] = useState('')

  // Manual usage form
  const [showUsageForm, setShowUsageForm] = useState(false)
  const [uForm, setUForm] = useState({ used_date: new Date().toISOString().slice(0,10), quantity: '1', source: 'pro_shop', notes: '' })
  const [uSaving, setUSaving] = useState(false)

  const { from, to } = dateRange(period, customFrom, customTo)

  const loadSummary = () => {
    if (period === 'custom' && (!customFrom || !customTo)) return
    api.balls.summary(from, to).then(d => setSummary(d)).catch(() => {})
    api.balls.usageList(from, to).then(d => setUsage(d as UsageEvent[])).catch(() => {})
  }
  const loadPurchases = () => api.balls.purchaseList().then(d => setPurchases(d as Purchase[])).catch(() => {})

  useEffect(() => { loadSummary() }, [period, customFrom, customTo])
  useEffect(() => { loadPurchases() }, [])

  const savePurchase = async (e: React.FormEvent) => {
    e.preventDefault()
    setPError('')
    setPSaving(true)
    try {
      const qty = parseInt(pForm.quantity)
      const cpc = pForm.cost_per_can ? parseFloat(pForm.cost_per_can) : undefined
      const tc = pForm.total_cost ? parseFloat(pForm.total_cost) : undefined
      await api.balls.recordPurchase({ purchase_date: pForm.purchase_date, quantity: qty, cost_per_can: cpc, total_cost: tc, notes: pForm.notes })
      setPForm({ purchase_date: new Date().toISOString().slice(0,10), quantity: '', cost_per_can: '', total_cost: '', notes: '' })
      setShowPurchaseForm(false)
      loadPurchases()
      loadSummary()
    } catch (err: any) { setPError(err.message) }
    finally { setPSaving(false) }
  }

  const saveUsage = async (e: React.FormEvent) => {
    e.preventDefault()
    setUSaving(true)
    try {
      await api.balls.recordUsage({ used_date: uForm.used_date, quantity: parseInt(uForm.quantity), source: uForm.source, notes: uForm.notes })
      setUForm({ used_date: new Date().toISOString().slice(0,10), quantity: '1', source: 'pro_shop', notes: '' })
      setShowUsageForm(false)
      loadSummary()
    } finally { setUSaving(false) }
  }

  const deletePurchase = async (id: string) => {
    if (!confirm('Delete this purchase record?')) return
    await api.balls.deletePurchase(id)
    loadPurchases(); loadSummary()
  }

  const deleteUsage = async (id: string) => {
    if (!confirm('Delete this usage record?')) return
    await api.balls.deleteUsage(id)
    loadSummary()
  }

  const s = summary

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Ball Tracking</h2>
        <div className="flex gap-2">
          <button onClick={() => setTab('report')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${tab === 'report' ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Usage Report
          </button>
          <button onClick={() => setTab('inventory')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${tab === 'inventory' ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Inventory
          </button>
        </div>
      </div>

      {/* All-time summary cards */}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'On Hand', value: `${s.on_hand} cans`, color: s.on_hand > 0 ? 'text-green-700' : 'text-red-600' },
            { label: 'All-Time Purchased', value: `${s.all_time_purchased} cans`, color: 'text-gray-800' },
            { label: 'All-Time Used', value: `${s.all_time_used} cans`, color: 'text-gray-800' },
            { label: 'All-Time Cost', value: `$${s.all_time_cost.toFixed(2)}`, color: 'text-gray-800' },
          ].map(c => (
            <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
              <div className="text-xs text-gray-500 mt-1">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'report' && (
        <>
          {/* Period filter */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              {(['today','week','month','year','custom'] as Period[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition ${period === p ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : p === 'year' ? 'This Year' : 'Custom'}
                </button>
              ))}
              {period === 'custom' && (
                <div className="flex items-center gap-2 ml-2">
                  <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  <span className="text-gray-400 text-sm">to</span>
                  <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              )}
            </div>
          </div>

          {/* Period report */}
          {s && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Inventory flow */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
                  Inventory Flow · {s.from} – {s.to}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Beginning inventory</span>
                    <span className="font-semibold text-gray-800">{s.beginning_inventory} cans</span>
                  </div>
                  <div className="flex justify-between text-green-700">
                    <span>+ Purchased</span>
                    <span className="font-semibold">+{s.purchased} cans</span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span>− Court bookings</span>
                    <span className="font-semibold">−{s.used_bookings} cans</span>
                  </div>
                  <div className="flex justify-between text-blue-600">
                    <span>− Pro Shop sales</span>
                    <span className="font-semibold">−{s.used_pro_shop} cans</span>
                  </div>
                  {s.used_other > 0 && (
                    <div className="flex justify-between text-gray-500">
                      <span>− Other</span>
                      <span className="font-semibold">−{s.used_other} cans</span>
                    </div>
                  )}
                  <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-gray-800">
                    <span>Ending inventory</span>
                    <span className={s.ending_inventory < 0 ? 'text-red-600' : ''}>{s.ending_inventory} cans</span>
                  </div>
                </div>
              </div>

              {/* Cost stats */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
                  Cost Analysis · {s.from} – {s.to}
                </h3>
                <div className="space-y-3">
                  {[
                    { label: 'Total expense', value: `$${s.period_cost.toFixed(2)}` },
                    { label: 'Court bookings tracked', value: `${s.booking_count}` },
                    { label: 'Cost per booking', value: s.cost_per_booking > 0 ? `$${s.cost_per_booking.toFixed(2)}` : '—' },
                    { label: 'Total cans used', value: `${s.total_used}` },
                    { label: 'Pro Shop cans sold', value: `${s.used_pro_shop}` },
                  ].map(r => (
                    <div key={r.label} className="flex justify-between text-sm">
                      <span className="text-gray-500">{r.label}</span>
                      <span className="font-semibold text-gray-800">{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Usage details table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Usage Detail ({usage.length} events)</h3>
              <button onClick={() => setShowUsageForm(s => !s)}
                className="text-xs text-green-700 font-medium hover:underline">
                {showUsageForm ? 'Cancel' : '+ Record Pro Shop Sale / Manual'}
              </button>
            </div>
            {showUsageForm && (
              <form onSubmit={saveUsage} className="px-5 py-4 bg-blue-50 border-b border-blue-100 flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                  <input type="date" value={uForm.used_date} onChange={e => setUForm(f => ({ ...f, used_date: e.target.value }))} required
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cans</label>
                  <input type="number" min="1" value={uForm.quantity} onChange={e => setUForm(f => ({ ...f, quantity: e.target.value }))} required
                    className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                  <select value={uForm.source} onChange={e => setUForm(f => ({ ...f, source: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                    <option value="pro_shop">Pro Shop Sale</option>
                    <option value="manual">Manual / Other</option>
                  </select>
                </div>
                <div className="flex-1 min-w-32">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                  <input value={uForm.notes} onChange={e => setUForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Optional note"
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <button type="submit" disabled={uSaving}
                  className="px-4 py-1.5 bg-green-700 text-white text-sm font-medium rounded-lg hover:bg-green-800 transition disabled:opacity-50">
                  {uSaving ? 'Saving…' : 'Record'}
                </button>
              </form>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Member</th>
                    <th className="px-4 py-3 text-left">Court</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-center">Cans</th>
                    <th className="px-4 py-3 text-left">Notes</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {usage.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400 text-sm">No events in this period.</td></tr>
                  ) : usage.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">{e.used_date}</td>
                      <td className="px-4 py-2.5 text-gray-800 text-xs">{e.user_name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{e.court_name ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_COLOR[e.source] ?? 'bg-gray-100 text-gray-600'}`}>
                          {SOURCE_LABEL[e.source] ?? e.source}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-sm font-semibold text-gray-700">{e.quantity}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{e.notes ?? ''}</td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => deleteUsage(e.id)} className="text-xs text-red-400 hover:text-red-600">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'inventory' && (
        <>
          <div className="flex justify-end">
            <button onClick={() => { setShowPurchaseForm(s => !s); setPError('') }}
              className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition">
              {showPurchaseForm ? 'Cancel' : '+ Record Purchase'}
            </button>
          </div>

          {showPurchaseForm && (
            <form onSubmit={savePurchase} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
              <p className="text-sm font-semibold text-gray-700">New Ball Purchase</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Purchase Date *</label>
                  <input type="date" value={pForm.purchase_date} onChange={e => setPForm(f => ({ ...f, purchase_date: e.target.value }))} required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Quantity (cans) *</label>
                  <input type="number" min="1" value={pForm.quantity} onChange={e => setPForm(f => ({ ...f, quantity: e.target.value }))} required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cost per Can ($)</label>
                  <input type="number" step="0.01" min="0" value={pForm.cost_per_can} onChange={e => setPForm(f => ({ ...f, cost_per_can: e.target.value }))}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Total Cost ($)</label>
                  <input type="number" step="0.01" min="0" value={pForm.total_cost} onChange={e => setPForm(f => ({ ...f, total_cost: e.target.value }))}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div className="col-span-2 md:col-span-4">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                  <input value={pForm.notes} onChange={e => setPForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Supplier, brand, bulk purchase details…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              {pError && <p className="text-red-600 text-sm">{pError}</p>}
              <p className="text-xs text-gray-400">Enter either cost per can or total cost — the other will be calculated automatically.</p>
              <button type="submit" disabled={pSaving}
                className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-5 py-2 rounded-lg transition disabled:opacity-50">
                {pSaving ? 'Saving…' : 'Record Purchase'}
              </button>
            </form>
          )}

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Purchase History ({purchases.length} records)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Cost/Can</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-left">Notes</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {purchases.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400 text-sm">No purchases recorded yet.</td></tr>
                  ) : purchases.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">{p.purchase_date}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{p.quantity}</td>
                      <td className="px-4 py-2.5 text-right text-gray-500 text-xs">{p.cost_per_can != null ? `$${p.cost_per_can.toFixed(2)}` : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-green-700">{p.total_cost != null ? `$${p.total_cost.toFixed(2)}` : '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{p.notes ?? ''}</td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => deletePurchase(p.id)} className="text-xs text-red-400 hover:text-red-600">✕</button>
                      </td>
                    </tr>
                  ))}
                  {purchases.length > 0 && (
                    <tr className="bg-gray-50 font-semibold text-gray-800 text-sm">
                      <td className="px-4 py-2.5">Total</td>
                      <td className="px-4 py-2.5 text-right">{purchases.reduce((a, p) => a + p.quantity, 0)}</td>
                      <td className="px-4 py-2.5"></td>
                      <td className="px-4 py-2.5 text-right text-green-700">${purchases.reduce((a, p) => a + (p.total_cost ?? 0), 0).toFixed(2)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
