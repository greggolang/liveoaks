import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { Link } from 'react-router-dom'
import { formatPhone } from '../utils/phone'

interface Member { id: string; first_name: string; last_name: string; email: string; phone?: string; address?: string; family?: string; type: 'member' }
interface Contact { id: string; first_name: string; last_name: string; email?: string; phone?: string; address?: string; family?: string; category: string; notes?: string; type: 'contact' }
type Entry = Member | Contact

const CATEGORIES = ['spouse', 'coach', 'staff', 'associate', 'other']

const CATEGORY_LABEL: Record<string, string> = {
  spouse: 'Spouse/Partner', coach: 'Coach', staff: 'Staff', associate: 'Associate', other: 'Other',
}

const emptyForm = { first_name: '', last_name: '', email: '', phone: '', address: '', family: '', category: 'other', notes: '' }

export default function MemberDirectory() {
  const { isBoard } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'member' | 'contact'>('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = () => {
    api.members.directory().then(d =>
      setMembers((d as any[]).map(m => ({ ...m, type: 'member' as const })))
    )
    api.contacts.list().then(d =>
      setContacts((d as any[]).map(c => ({ ...c, type: 'contact' as const })))
    )
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEdit = (c: Contact) => {
    setEditing(c)
    setForm({
      first_name: c.first_name, last_name: c.last_name,
      email: c.email ?? '', phone: formatPhone(c.phone),
      address: c.address ?? '', family: c.family ?? '',
      category: c.category, notes: c.notes ?? '',
    })
    setShowForm(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editing) {
        await api.contacts.update(editing.id, form)
      } else {
        await api.contacts.create(form)
      }
      setShowForm(false)
      setEditing(null)
      load()
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from the directory?`)) return
    await api.contacts.delete(id)
    load()
  }

  const all: Entry[] = [
    ...members,
    ...contacts,
  ].sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name))

  const filtered = all.filter(e => {
    if (filterType !== 'all' && e.type !== filterType) return false
    if (!search) return true
    const q = search.toLowerCase()
    return `${e.first_name} ${e.last_name} ${e.email ?? ''}`.toLowerCase().includes(q)
  })

  // Group by first letter of last name
  const grouped = filtered.reduce((acc, e) => {
    const letter = e.last_name[0]?.toUpperCase() ?? '#'
    if (!acc[letter]) acc[letter] = []
    acc[letter].push(e)
    return acc
  }, {} as Record<string, Entry[]>)

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Member Directory</h1>
          <p className="text-sm text-gray-400 mt-0.5">{members.length} members · {contacts.length} contacts</p>
          {!isBoard && (
            <p className="text-xs text-gray-400 mt-1">
              📞 Phone and address details are visible to board members only.{' '}
              <Link to="/profile" className="text-green-700 hover:underline">Update your own info →</Link>
            </p>
          )}
        </div>
        {isBoard && (
          <button onClick={openAdd}
            className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition">
            + Add Contact
          </button>
        )}
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-800">{editing ? 'Edit Contact' : 'Add Non-Member Contact'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">First Name</label>
              <input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Last Name</label>
              <input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
              <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="123 Main St, South Pasadena CA 91030"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition disabled:opacity-50">
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add to Directory'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null) }}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Search + filter */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input type="text" placeholder="Search name or email…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 flex-1 sm:flex-none sm:w-64" />
        <div className="flex gap-1">
          {(['all', 'member', 'contact'] as const).map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition ${filterType === t ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {t === 'all' ? `All (${all.length})` : t === 'member' ? `Members (${members.length})` : `Contacts (${contacts.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Directory grouped by letter */}
      {Object.keys(grouped).sort().map(letter => (
        <div key={letter} className="mb-6">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 pl-1">{letter}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {grouped[letter].map(e => (
              <div key={e.id}
                className={`bg-white border rounded-xl p-4 shadow-sm flex justify-between items-start
                  ${e.type === 'contact' ? 'border-gray-200 border-l-4 border-l-blue-300' : 'border-gray-200'}`}>
                <div className="min-w-0">
                  <div className="font-semibold text-gray-800 truncate">
                    {e.type === 'member'
                      ? <Link to={`/players/${e.id}`} className="hover:underline">{e.first_name} {e.last_name}</Link>
                      : <>{e.first_name} {e.last_name}</>}
                    {e.type === 'contact' && (
                      <span className="ml-2 text-xs font-normal text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                        {CATEGORY_LABEL[(e as Contact).category] ?? (e as Contact).category}
                      </span>
                    )}
                  </div>
                  {e.email && (
                    <a href={`mailto:${e.email}`} className="text-green-700 text-xs hover:underline truncate block">{e.email}</a>
                  )}
                  {e.phone && (
                    <a href={`tel:${e.phone}`} className="text-gray-600 text-xs mt-0.5 hover:text-green-700 block">📞 {formatPhone(e.phone)}</a>
                  )}
                  {e.address && <div className="text-gray-500 text-xs mt-0.5">📍 {e.address}</div>}
                  {e.family && <div className="text-gray-400 text-xs mt-0.5">👨‍👩‍👧 {e.family}</div>}
                  {e.type === 'contact' && (e as Contact).notes && (
                    <div className="text-gray-400 text-xs mt-0.5 italic">{(e as Contact).notes}</div>
                  )}
                </div>
                {isBoard && e.type === 'contact' && (
                  <div className="flex gap-2 ml-2 shrink-0">
                    <button onClick={() => openEdit(e as Contact)}
                      className="text-gray-400 hover:text-gray-600 text-xs">Edit</button>
                    <button onClick={() => handleDelete(e.id, `${e.first_name} ${e.last_name}`)}
                      className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-8">No entries match your search.</p>
      )}
    </div>
  )
}
