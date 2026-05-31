import { useEffect, useState } from 'react'
import { api } from '../../api/client'

interface Item {
  id: string; name: string; description: string; price: number
  category: string; emoji: string; in_stock: boolean; sort_order: number
}

const emptyForm = { name: '', description: '', price: '', category: 'drinks', emoji: '', sort_order: '0' }

export default function AdminProShop() {
  const [items, setItems] = useState<Item[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Item | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  const load = () => api.proShop.adminList().then(d => setItems(d as Item[]))
  useEffect(() => { load() }, [])

  const categories = [...new Set(items.map(i => i.category)), 'drinks', 'balls', 'equipment', 'apparel', 'other']
    .filter((v, i, a) => a.indexOf(v) === i)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.proShop.create({
        name: form.name, description: form.description,
        price: parseFloat(form.price) || 0,
        category: form.category, emoji: form.emoji,
        sort_order: parseInt(form.sort_order) || 0,
      })
      setForm(emptyForm)
      setShowForm(false)
      load()
    } catch (err: any) { setError(err.message) }
    finally { setSaving(false) }
  }

  const openEdit = (item: Item) => {
    setEditingId(item.id)
    setEditForm({ ...item })
    setEditError('')
  }

  const saveEdit = async () => {
    if (!editForm) return
    setSavingEdit(true)
    setEditError('')
    try {
      await api.proShop.update(editForm.id, {
        name: editForm.name, description: editForm.description,
        price: editForm.price, category: editForm.category,
        emoji: editForm.emoji, in_stock: editForm.in_stock,
        sort_order: editForm.sort_order,
      })
      setEditingId(null)
      load()
    } catch (err: any) { setEditError(err.message) }
    finally { setSavingEdit(false) }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return
    await api.proShop.delete(id)
    load()
  }

  const toggleStock = async (item: Item) => {
    await api.proShop.update(item.id, { ...item, in_stock: !item.in_stock })
    load()
  }

  const grouped = categories.reduce<Record<string, Item[]>>((acc, cat) => {
    const catItems = items.filter(i => i.category === cat)
    if (catItems.length > 0) acc[cat] = catItems
    return acc
  }, {})

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">Pro Shop Items</h2>
        <button onClick={() => { setShowForm(s => !s); setError('') }}
          className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition">
          {showForm ? 'Cancel' : '+ Add Item'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm mb-6 space-y-3">
          <p className="text-sm font-semibold text-gray-700">New Item</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Emoji</label>
              <input value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))}
                placeholder="🛍️"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Price ($)</label>
              <input type="number" step="0.01" min="0" value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                list="category-list"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <datalist id="category-list">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sort Order</label>
              <input type="number" value={form.sort_order}
                onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={saving}
            className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-5 py-2 rounded-lg transition disabled:opacity-50">
            {saving ? 'Adding…' : 'Add Item'}
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <p className="text-gray-400 text-sm">No items yet.</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, catItems]) => (
            <div key={cat}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </p>
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden divide-y divide-gray-100">
                {catItems.map(item => (
                  <div key={item.id}>
                    {editingId === item.id && editForm ? (
                      <div className="p-4 bg-blue-50 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                            <input value={editForm.name} onChange={e => setEditForm(f => f && ({ ...f, name: e.target.value }))}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Emoji</label>
                            <input value={editForm.emoji} onChange={e => setEditForm(f => f && ({ ...f, emoji: e.target.value }))}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                            <input value={editForm.description} onChange={e => setEditForm(f => f && ({ ...f, description: e.target.value }))}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Price ($)</label>
                            <input type="number" step="0.01" min="0" value={editForm.price}
                              onChange={e => setEditForm(f => f && ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                            <input value={editForm.category} onChange={e => setEditForm(f => f && ({ ...f, category: e.target.value }))}
                              list="category-list"
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Sort Order</label>
                            <input type="number" value={editForm.sort_order}
                              onChange={e => setEditForm(f => f && ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-gray-600">In Stock</label>
                            <input type="checkbox" checked={editForm.in_stock}
                              onChange={e => setEditForm(f => f && ({ ...f, in_stock: e.target.checked }))}
                              className="w-4 h-4 accent-green-600" />
                          </div>
                        </div>
                        {editError && <p className="text-red-600 text-xs">{editError}</p>}
                        <div className="flex gap-2">
                          <button onClick={saveEdit} disabled={savingEdit}
                            className="px-4 py-1.5 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 transition disabled:opacity-50">
                            {savingEdit ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50">
                        <span className="text-2xl w-8 text-center shrink-0">{item.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800 flex items-center gap-2">
                            {item.name}
                            {!item.in_stock && (
                              <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">Out of stock</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400">{item.description}</div>
                        </div>
                        <span className="text-sm font-semibold text-green-700 shrink-0">${item.price.toFixed(2)}</span>
                        <button onClick={() => toggleStock(item)}
                          className={`text-xs font-medium px-2 py-1 rounded-lg transition shrink-0 ${item.in_stock ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          {item.in_stock ? 'In Stock' : 'Out of Stock'}
                        </button>
                        <button onClick={() => openEdit(item)} className="text-xs text-blue-500 hover:text-blue-700 font-medium shrink-0">Edit</button>
                        <button onClick={() => handleDelete(item.id, item.name)} className="text-xs text-red-400 hover:text-red-600 shrink-0">Delete</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
