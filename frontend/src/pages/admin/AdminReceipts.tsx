import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'

interface Receipt {
  id: string; title: string; filename: string; original_name: string
  amount?: string; receipt_date?: string; category: string
  notes?: string; created_at: string
}

const CATEGORIES = ['general', 'dues', 'maintenance', 'equipment', 'utilities', 'insurance', 'events', 'other']

const emptyForm = { title: '', amount: '', receipt_date: '', category: 'general', notes: '' }

export default function AdminReceipts() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () => api.receipts.list().then(d => setReceipts(d as Receipt[]))
  useEffect(() => { load() }, [])

  const sf = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [f]: e.target.value }))

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) { setError('Please select a file'); return }
    if (!form.title.trim()) { setError('Title is required'); return }
    setUploading(true); setError('')
    try {
      await api.receipts.upload({ ...form, file })
      setForm(emptyForm); setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      setShowForm(false)
      load()
    } catch (err: any) {
      setError(err.message)
    } finally { setUploading(false) }
  }

  const handleDelete = async (r: Receipt) => {
    if (!confirm(`Delete receipt "${r.title}"?`)) return
    await api.receipts.delete(r.id)
    load()
  }

  const totalByCategory = receipts.reduce((acc, r) => {
    if (r.amount) acc[r.category] = (acc[r.category] || 0) + parseFloat(r.amount)
    return acc
  }, {} as Record<string, number>)

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold text-gray-800">Receipts</h2>
        <button onClick={() => { setShowForm(s => !s); setError('') }}
          className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition">
          {showForm ? 'Cancel' : '+ Upload Receipt'}
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-5">Upload and track billing receipts and invoices.</p>

      {/* Upload form */}
      {showForm && (
        <form onSubmit={handleUpload}
          className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm mb-6 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Upload Receipt</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
              <input value={form.title} onChange={sf('title')} required placeholder="e.g. Court resurfacing invoice"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount ($)</label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={sf('amount')}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Receipt Date</label>
              <input type="date" value={form.receipt_date} onChange={sf('receipt_date')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select value={form.category} onChange={sf('category')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">File *</label>
              <input ref={fileRef} type="file"
                accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.heic"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea value={form.notes} onChange={sf('notes')} rows={2}
                placeholder="Any additional details…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
            </div>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={uploading}
            className="bg-green-700 hover:bg-green-800 text-white font-semibold px-5 py-2 rounded-lg text-sm transition disabled:opacity-50">
            {uploading ? 'Uploading…' : 'Upload Receipt'}
          </button>
        </form>
      )}

      {/* Summary bar */}
      {Object.keys(totalByCategory).length > 0 && (
        <div className="flex flex-wrap gap-3 mb-5">
          {Object.entries(totalByCategory).map(([cat, total]) => (
            <div key={cat} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs shadow-sm">
              <span className="text-gray-400 capitalize">{cat}</span>
              <span className="ml-2 font-semibold text-gray-800">${total.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Receipt list */}
      {receipts.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm shadow-sm">
          No receipts uploaded yet.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Title</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">File</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {receipts.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{r.title}</div>
                    {r.notes && <div className="text-xs text-gray-400 mt-0.5">{r.notes}</div>}
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-600 text-xs">{r.category}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {r.receipt_date
                      ? new Date(r.receipt_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-800">
                    {r.amount ? `$${parseFloat(r.amount).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <a href={`/uploads/receipts/${r.filename}`} target="_blank" rel="noreferrer"
                      className="text-xs text-green-700 hover:underline font-medium truncate max-w-[140px] block">
                      {r.original_name}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(r)}
                      className="text-red-400 hover:text-red-600 text-xs transition">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
