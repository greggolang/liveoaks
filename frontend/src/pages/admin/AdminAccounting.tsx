import { useEffect, useState } from 'react'
import { api, MemberBalance, PLReport, PLMonth, StatementEntry } from '../../api/client'

const fmt = (n: number) => n === 0 ? '—' : `$${n.toFixed(2)}`

const CAT_LABELS: Record<string, string> = {
  grounds: 'Grounds & Maintenance',
  insurance: 'Insurance',
  tennis_pro: 'Tennis Pro',
  bookkeeping: 'Bookkeeping & Accounting',
  tax: 'Tax & Licenses',
  balls: 'Balls',
  utilities: 'Utilities',
  drinks: 'Drinks',
  digital: 'Digital Services',
  party: 'Party & Events',
  court_system: 'Court Reservation System',
  office: 'Office Supplies',
  repairs: 'General Repairs',
  clubhouse: 'Clubhouse Supplies',
  banking: 'Banking & Admin',
  // legacy category names
  maintenance: 'Maintenance',
  equipment: 'Equipment',
  events: 'Events',
  general: 'General',
  dues: 'Dues',
  other: 'Other',
}
const catLabel = (v: string) => CAT_LABELS[v] ?? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' ')
const fmtPos = (n: number) => n === 0 ? '—' : <span className={n < 0 ? 'text-red-600' : 'text-green-700'}>${Math.abs(n).toFixed(2)}{n < 0 ? ' loss' : ''}</span>
const badge = (status: string) => {
  if (status === 'paid') return 'bg-green-100 text-green-700'
  if (status === 'waived') return 'bg-gray-100 text-gray-500'
  if (status === 'charged') return 'bg-blue-100 text-blue-700'
  if (status === 'kiosk_payment') return 'bg-teal-100 text-teal-700'
  return 'bg-amber-100 text-amber-700'
}

function StatementModal({ balance, onClose }: { balance: MemberBalance; onClose: () => void }) {
  const [entries, setEntries] = useState<StatementEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [addingCharge, setAddingCharge] = useState(false)
  const [chargeForm, setChargeForm] = useState({ description: '', amount: '', charge_date: new Date().toISOString().slice(0, 10) })
  const [chargeError, setChargeError] = useState('')
  const [addingPayment, setAddingPayment] = useState(false)
  const [paymentForm, setPaymentForm] = useState({ amount: '', notes: '' })
  const [paymentError, setPaymentError] = useState('')

  const load = () => {
    setLoading(true)
    api.finance.statement(balance.user_id).then(d => { setEntries(d); setLoading(false) }).catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [balance.user_id])

  const submitCharge = async (e: React.FormEvent) => {
    e.preventDefault()
    setChargeError('')
    const amt = parseFloat(chargeForm.amount)
    if (!chargeForm.description || isNaN(amt) || amt <= 0) { setChargeError('Description and amount > 0 required.'); return }
    try {
      await api.finance.createCharge({ user_id: balance.user_id, description: chargeForm.description, amount: amt, charge_date: chargeForm.charge_date })
      setChargeForm({ description: '', amount: '', charge_date: new Date().toISOString().slice(0, 10) })
      setAddingCharge(false)
      load()
    } catch (err: any) { setChargeError(err.message) }
  }

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    setPaymentError('')
    const amt = parseFloat(paymentForm.amount)
    if (isNaN(amt) || amt <= 0) { setPaymentError('Amount > 0 required.'); return }
    try {
      await api.finance.recordKioskPayment({ user_id: balance.user_id, amount: amt, notes: paymentForm.notes })
      setPaymentForm({ amount: '', notes: '' })
      setAddingPayment(false)
      load()
    } catch (err: any) { setPaymentError(err.message) }
  }

  const markCharge = async (id: string, status: string) => {
    await api.finance.updateChargeStatus(id, status)
    load()
  }

  const deleteCharge = async (id: string) => {
    if (!confirm('Delete this charge?')) return
    await api.finance.deleteCharge(id)
    load()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start p-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{balance.first_name} {balance.last_name}</h2>
            <p className="text-sm text-gray-500">{balance.email}</p>
            <div className="flex gap-4 mt-2 text-sm">
              {balance.dues_owed > 0 && <span className="text-amber-700">Dues: ${balance.dues_owed.toFixed(2)}</span>}
              {balance.kiosk_tab > 0 && <span className="text-blue-700">Kiosk tab: ${balance.kiosk_tab.toFixed(2)}</span>}
              {balance.charges_owed > 0 && <span className="text-purple-700">Charges: ${balance.charges_owed.toFixed(2)}</span>}
              <span className="font-semibold text-red-700">Total: ${balance.total.toFixed(2)}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="flex gap-2 px-6 py-3 border-b border-gray-100">
          <button onClick={() => { setAddingCharge(a => !a); setAddingPayment(false) }}
            className="text-xs bg-amber-100 text-amber-800 hover:bg-amber-200 px-3 py-1.5 rounded-lg font-medium transition">
            + Add Charge
          </button>
          <button onClick={() => { setAddingPayment(p => !p); setAddingCharge(false) }}
            className="text-xs bg-green-100 text-green-800 hover:bg-green-200 px-3 py-1.5 rounded-lg font-medium transition">
            + Record Kiosk Payment
          </button>
        </div>

        {addingCharge && (
          <form onSubmit={submitCharge} className="px-6 py-3 bg-amber-50 border-b border-amber-100 flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-40">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description *</label>
              <input value={chargeForm.description} onChange={e => setChargeForm(f => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Pro lesson fee"
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
            </div>
            <div className="w-28">
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount *</label>
              <input type="number" step="0.01" min="0.01" value={chargeForm.amount} onChange={e => setChargeForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
            </div>
            <div className="w-36">
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input type="date" value={chargeForm.charge_date} onChange={e => setChargeForm(f => ({ ...f, charge_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
            </div>
            <button type="submit" className="px-3 py-1.5 bg-amber-700 text-white text-xs rounded-lg hover:bg-amber-800 transition font-medium">Add</button>
            {chargeError && <p className="text-xs text-red-600 w-full">{chargeError}</p>}
          </form>
        )}

        {addingPayment && (
          <form onSubmit={submitPayment} className="px-6 py-3 bg-green-50 border-b border-green-100 flex flex-wrap gap-2 items-end">
            <div className="w-32">
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount Paid *</label>
              <input type="number" step="0.01" min="0.01" value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" />
            </div>
            <div className="flex-1 min-w-40">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <input value={paymentForm.notes} onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. Paid via Zelle"
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" />
            </div>
            <button type="submit" className="px-3 py-1.5 bg-green-700 text-white text-xs rounded-lg hover:bg-green-800 transition font-medium">Record</button>
            {paymentError && <p className="text-xs text-red-600 w-full">{paymentError}</p>}
          </form>
        )}

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <p className="text-center text-gray-400 py-8 text-sm">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">No transactions on file.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Description</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map(e => (
                  <tr key={`${e.category}-${e.id}`} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500 text-xs tabular-nums">{e.date}</td>
                    <td className="px-4 py-2 text-gray-800">{e.description}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                      {e.category === 'kiosk_payment' ? (
                        <span className="text-green-700">-${e.amount.toFixed(2)}</span>
                      ) : (
                        `$${e.amount.toFixed(2)}`
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge(e.category === 'kiosk_payment' ? 'kiosk_payment' : e.status)}`}>
                        {e.category === 'kiosk_payment' ? 'payment' : e.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {e.category === 'charge' && e.status === 'unpaid' && (
                        <div className="flex gap-2">
                          <button onClick={() => markCharge(e.id, 'paid')} className="text-xs text-green-600 hover:text-green-800">Paid</button>
                          <button onClick={() => markCharge(e.id, 'waived')} className="text-xs text-gray-400 hover:text-gray-600">Waive</button>
                          <button onClick={() => deleteCharge(e.id)} className="text-xs text-red-400 hover:text-red-600">Del</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AdminAccounting() {
  const [tab, setTab] = useState<'pl' | 'balances'>('pl')
  const [year, setYear] = useState(new Date().getFullYear())
  const [pl, setPL] = useState<PLReport | null>(null)
  const [plLoading, setPLLoading] = useState(false)
  const [balances, setBalances] = useState<MemberBalance[]>([])
  const [balancesLoading, setBalancesLoading] = useState(false)
  const [selectedMember, setSelectedMember] = useState<MemberBalance | null>(null)
  const [reminderSending, setReminderSending] = useState(false)
  const [reminderResult, setReminderResult] = useState<{ sent: number; failed: number; total: number } | null>(null)

  const loadPL = (y: number) => {
    setPLLoading(true)
    api.finance.pl(y).then(d => { setPL(d); setPLLoading(false) }).catch(() => setPLLoading(false))
  }

  const loadBalances = () => {
    setBalancesLoading(true)
    api.finance.balances().then(d => { setBalances(d); setBalancesLoading(false) }).catch(() => setBalancesLoading(false))
  }

  useEffect(() => { loadPL(year) }, [year])
  useEffect(() => { if (tab === 'balances') loadBalances() }, [tab])

  const sendReminders = async () => {
    if (!confirm('Send dues reminder emails to all members with overdue balances?')) return
    setReminderSending(true)
    try {
      const res = await api.finance.sendReminders() as { sent: number; failed: number; total: number }
      setReminderResult(res)
    } finally { setReminderSending(false) }
  }

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  const totalOutstanding = balances.reduce((s, b) => s + b.total, 0)

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-xl font-bold text-gray-800">Accounting</h2>
        <div className="flex gap-2">
          {['pl', 'balances'].map(t => (
            <button key={t} onClick={() => setTab(t as 'pl' | 'balances')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab === t ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {t === 'pl' ? 'P&L Report' : 'Member Balances'}
            </button>
          ))}
        </div>
      </div>

      {/* P&L Tab */}
      {tab === 'pl' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm font-medium text-gray-600">Year:</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {plLoading && <span className="text-xs text-gray-400">Loading…</span>}
          </div>

          {pl && (
            <>
              {/* YTD summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                {[
                  { label: 'Total Income', value: pl.totals.income, color: 'bg-green-50 border-green-200 text-green-700' },
                  { label: 'Dues Collected', value: pl.totals.dues, color: 'bg-blue-50 border-blue-200 text-blue-700' },
                  { label: 'Total Expenses', value: pl.totals.expenses, color: 'bg-red-50 border-red-200 text-red-700' },
                  { label: 'Net P&L', value: pl.totals.net, color: pl.totals.net >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700' },
                ].map(c => (
                  <div key={c.label} className={`${c.color} border rounded-xl p-4`}>
                    <div className="text-2xl font-bold">${Math.abs(c.value).toFixed(2)}{c.value < 0 ? ' loss' : ''}</div>
                    <div className="text-xs font-medium mt-0.5 opacity-75">{c.label}</div>
                  </div>
                ))}
              </div>

              {/* Expense breakdown by category */}
              {pl.expense_breakdown && Object.keys(pl.expense_breakdown).length > 0 && (
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Expense Breakdown by Category</h3>
                  <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                          <tr>
                            <th className="px-4 py-3 text-left">Category</th>
                            <th className="px-4 py-3 text-right">YTD Amount</th>
                            <th className="px-4 py-3 text-right">% of Expenses</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {Object.entries(pl.expense_breakdown)
                            .sort((a, b) => b[1] - a[1])
                            .map(([cat, amt]) => (
                              <tr key={cat} className="hover:bg-gray-50">
                                <td className="px-4 py-2.5 text-gray-700">{catLabel(cat)}</td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-red-600">${amt.toFixed(2)}</td>
                                <td className="px-4 py-2.5 text-right text-gray-400 tabular-nums">
                                  {pl.totals.expenses > 0 ? ((amt / pl.totals.expenses) * 100).toFixed(1) + '%' : '—'}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                          <tr>
                            <td className="px-4 py-3 text-gray-700">Total Expenses</td>
                            <td className="px-4 py-3 text-right text-red-600 tabular-nums">${pl.totals.expenses.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right text-gray-400">100%</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Monthly table */}
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Month</th>
                        <th className="px-4 py-3 text-right">Dues</th>
                        <th className="px-4 py-3 text-right">Kiosk</th>
                        <th className="px-4 py-3 text-right">Charges</th>
                        <th className="px-4 py-3 text-right">Guest Fees</th>
                        <th className="px-4 py-3 text-right font-semibold">Total Income</th>
                        <th className="px-4 py-3 text-right">Expenses</th>
                        <th className="px-4 py-3 text-right font-semibold">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pl.months.map((m: PLMonth) => {
                        const hasActivity = m.income > 0 || m.expenses > 0
                        return (
                          <tr key={m.month} className={hasActivity ? 'hover:bg-gray-50' : 'opacity-40'}>
                            <td className="px-4 py-2.5 font-medium text-gray-700">{m.label}</td>
                            <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{fmt(m.dues)}</td>
                            <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{fmt(m.kiosk_sales)}</td>
                            <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{fmt(m.charges)}</td>
                            <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{fmt(m.guest_fees)}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-green-700 tabular-nums">{fmt(m.income)}</td>
                            <td className="px-4 py-2.5 text-right text-red-600 tabular-nums">{fmt(m.expenses)}</td>
                            <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtPos(m.net)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                      <tr>
                        <td className="px-4 py-3 text-gray-700">Year Total</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(pl.totals.dues)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(pl.totals.kiosk_sales)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(pl.totals.charges)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(pl.totals.guest_fees)}</td>
                        <td className="px-4 py-3 text-right text-green-700 tabular-nums">{fmt(pl.totals.income)}</td>
                        <td className="px-4 py-3 text-right text-red-600 tabular-nums">{fmt(pl.totals.expenses)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtPos(pl.totals.net)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Member Balances Tab */}
      {tab === 'balances' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              {balances.length > 0 && (
                <p className="text-sm text-gray-500">
                  <span className="font-semibold text-red-700">{balances.length} member{balances.length !== 1 ? 's' : ''}</span> with outstanding balances
                  {' · '}total owed: <span className="font-semibold">${totalOutstanding.toFixed(2)}</span>
                </p>
              )}
            </div>
            <div className="flex gap-2 items-center">
              {reminderResult && (
                <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                  Sent {reminderResult.sent} reminder{reminderResult.sent !== 1 ? 's' : ''}{reminderResult.failed > 0 ? ` (${reminderResult.failed} failed)` : ''}
                </span>
              )}
              <button onClick={sendReminders} disabled={reminderSending}
                className="text-sm bg-amber-100 text-amber-800 hover:bg-amber-200 px-4 py-1.5 rounded-lg font-medium transition disabled:opacity-50">
                {reminderSending ? 'Sending…' : 'Send Reminders'}
              </button>
              <button onClick={loadBalances}
                className="text-sm bg-gray-100 text-gray-600 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition">
                Refresh
              </button>
            </div>
          </div>

          {balancesLoading ? (
            <p className="text-center text-gray-400 py-12 text-sm">Loading…</p>
          ) : balances.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
              <div className="text-3xl mb-2">✓</div>
              <p className="font-medium text-green-800">All accounts are clear</p>
              <p className="text-sm text-green-600 mt-1">No members have outstanding balances.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Member</th>
                      <th className="px-4 py-3 text-right">Dues</th>
                      <th className="px-4 py-3 text-right">Kiosk Tab</th>
                      <th className="px-4 py-3 text-right">Other Charges</th>
                      <th className="px-4 py-3 text-right font-semibold">Total Owed</th>
                      <th className="px-4 py-3 text-left">Oldest Item</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {balances.map(b => (
                      <tr key={b.user_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-800">{b.first_name} {b.last_name}</div>
                          <div className="text-xs text-gray-400">{b.email}</div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {b.dues_owed > 0 ? <span className="text-amber-700">${b.dues_owed.toFixed(2)}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {b.kiosk_tab > 0 ? <span className="text-blue-700">${b.kiosk_tab.toFixed(2)}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {b.charges_owed > 0 ? <span className="text-purple-700">${b.charges_owed.toFixed(2)}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-red-700 tabular-nums">${b.total.toFixed(2)}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{b.oldest_due ?? '—'}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => setSelectedMember(b)}
                            className="text-xs text-blue-500 hover:text-blue-700 font-medium">View / Edit</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedMember && (
        <StatementModal balance={selectedMember} onClose={() => { setSelectedMember(null); loadBalances() }} />
      )}
    </div>
  )
}
