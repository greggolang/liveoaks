import { useEffect, useState } from 'react'
import { api } from '../../api/client'

type Purchase = {
  id: string; user_id: string; member_name: string
  item_name: string; item_price: number; quantity: number; total: number
  notes?: string; created_at: string
}

type EditForm = { item_name: string; item_price: string; quantity: string; notes: string }

function fmtDate(ts: string) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function AdminKioskPurchases() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ item_name: '', item_price: '', quantity: '', notes: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const load = () =>
    api.kiosk.adminPurchases()
      .then(d => setPurchases(d))
      .catch(() => {})
      .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const filtered = purchases.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return p.member_name.toLowerCase().includes(q) || p.item_name.toLowerCase().includes(q)
  })

  const grandTotal = filtered.reduce((s, p) => s + p.total, 0)

  const byMember: Record<string, { name: string; total: number; count: number }> = {}
  filtered.forEach(p => {
    if (!byMember[p.user_id]) byMember[p.user_id] = { name: p.member_name, total: 0, count: 0 }
    byMember[p.user_id].total += p.total
    byMember[p.user_id].count += p.quantity
  })
  const memberTotals = Object.values(byMember).sort((a, b) => b.total - a.total)

  const openEdit = (p: Purchase) => {
    setEditingId(p.id)
    setEditForm({
      item_name: p.item_name,
      item_price: p.item_price.toFixed(2),
      quantity: String(p.quantity),
      notes: p.notes ?? '',
    })
    setEditError('')
  }

  const saveEdit = async () => {
    if (!editingId) return
    const qty = parseInt(editForm.quantity)
    const price = parseFloat(editForm.item_price)
    if (!editForm.item_name.trim() || isNaN(qty) || qty < 1 || isNaN(price)) {
      setEditError('Item name, valid price, and quantity ≥ 1 are required')
      return
    }
    setEditSaving(true); setEditError('')
    try {
      await api.kiosk.updatePurchase(editingId, {
        item_name: editForm.item_name.trim(),
        item_price: price,
        quantity: qty,
        notes: editForm.notes,
      })
      setEditingId(null)
      await load()
    } catch (e: any) { setEditError(e.message || 'Save failed') }
    finally { setEditSaving(false) }
  }

  const handleDelete = async (id: string, name: string, member: string) => {
    if (!confirm(`Delete "${name}" for ${member}?`)) return
    await api.kiosk.deletePurchase(id)
    setPurchases(p => p.filter(x => x.id !== id))
  }

  const editTotal = (() => {
    const qty = parseInt(editForm.quantity)
    const price = parseFloat(editForm.item_price)
    return !isNaN(qty) && !isNaN(price) ? (qty * price).toFixed(2) : '—'
  })()

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Kiosk Purchases</h2>
          <p className="text-sm text-gray-500 mt-0.5">Pro shop charges recorded on the club iPad</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Total outstanding</p>
          <p className="text-2xl font-bold text-green-700">${grandTotal.toFixed(2)}</p>
        </div>
      </div>

      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Filter by member or item…"
        className="mb-5 w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      />

      {/* Per-member summary */}
      {memberTotals.length > 0 && (
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {memberTotals.map(m => (
            <button key={m.name} onClick={() => setSearch(m.name)}
              className="bg-white border border-gray-200 rounded-xl p-3 text-left hover:border-green-400 transition">
              <p className="font-semibold text-gray-800 text-sm truncate">{m.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{m.count} item{m.count !== 1 ? 's' : ''}</p>
              <p className="text-green-700 font-bold mt-1">${m.total.toFixed(2)}</p>
            </button>
          ))}
        </div>
      )}

      {/* Transaction log */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Member</th>
                <th className="px-4 py-3 text-left">Item</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No purchases found.</td></tr>
              ) : filtered.map(p => (
                editingId === p.id ? (
                  /* ── Inline edit row ── */
                  <tr key={p.id} className="bg-blue-50">
                    <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">{fmtDate(p.created_at)}</td>
                    <td className="px-3 py-2 font-medium text-gray-800">{p.member_name}</td>
                    <td className="px-2 py-2">
                      <input value={editForm.item_name}
                        onChange={e => setEditForm(f => ({ ...f, item_name: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min="1" value={editForm.quantity}
                        onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))}
                        className="w-16 border border-gray-300 rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" step="0.01" min="0" value={editForm.item_price}
                        onChange={e => setEditForm(f => ({ ...f, item_price: e.target.value }))}
                        className="w-20 border border-gray-300 rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800 text-xs">${editTotal}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-col gap-1 items-end">
                        {editError && <p className="text-red-500 text-xs text-right max-w-32">{editError}</p>}
                        <div className="flex gap-1">
                          <button onClick={saveEdit} disabled={editSaving}
                            className="text-xs bg-blue-700 hover:bg-blue-800 text-white px-2 py-1 rounded transition disabled:opacity-50">
                            {editSaving ? '…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingId(null)}
                            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 transition">
                            Cancel
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  /* ── Normal row ── */
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(p.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      <button onClick={() => setSearch(p.member_name)}
                        className="hover:text-green-700 transition text-left">
                        {p.member_name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {p.item_name}
                      {p.notes && <span className="ml-2 text-xs text-gray-400 italic">{p.notes}</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{p.quantity}</td>
                    <td className="px-4 py-3 text-right text-gray-600">${p.item_price.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">${p.total.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openEdit(p)}
                          className="text-xs text-blue-500 hover:text-blue-700 font-medium transition">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(p.id, p.item_name, p.member_name)}
                          className="text-xs text-red-400 hover:text-red-600 transition">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
              {filtered.length > 0 && (
                <tr className="bg-gray-50 font-bold">
                  <td colSpan={5} className="px-4 py-3 text-right text-gray-700 text-sm">Grand Total</td>
                  <td className="px-4 py-3 text-right text-green-700">${grandTotal.toFixed(2)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
