import { useEffect, useState } from 'react'
import { api, MatchStat } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { Link } from 'react-router-dom'
import { formatPhone } from '../utils/phone'

interface Member { id: string; first_name: string; last_name: string; email: string; phone?: string; address?: string; family?: string; usta_ranking?: string; created_at?: string; photo_url?: string; household?: string[]; is_family_member?: boolean; type: 'member' }
interface Contact { id: string; first_name: string; last_name: string; email?: string; phone?: string; address?: string; family?: string; category: string; notes?: string; type: 'contact' }
interface FamilyEntry { id: string; first_name: string; last_name: string; email?: string; phone?: string; usta_ranking?: string; relationship: string; primary_member_name: string; primary_member_id: string; type: 'family' }
type Entry = Member | Contact | FamilyEntry

const CATEGORIES = ['spouse', 'coach', 'staff', 'associate', 'other']

const CATEGORY_LABEL: Record<string, string> = {
  spouse: 'Spouse/Partner', coach: 'Coach', staff: 'Staff', associate: 'Associate', other: 'Other',
}

const emptyForm = { first_name: '', last_name: '', email: '', phone: '', address: '', family: '', category: 'other', notes: '' }

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700', 'bg-sky-100 text-sky-700', 'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700', 'bg-orange-100 text-orange-700',
]
function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function initials(first: string, last: string) {
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase()
}

const IC = {
  mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  phone: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  pin: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
  people: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
}
const Icon = ({ d, className = 'text-gray-400' }: { d: string; className?: string }) => (
  <svg className={`w-3.5 h-3.5 shrink-0 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
  </svg>
)

export default function MemberDirectory() {
  const { isBoard } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [familyEntries, setFamilyEntries] = useState<FamilyEntry[]>([])
  const [records, setRecords] = useState<Record<string, MatchStat>>({})
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'member' | 'family' | 'contact'>('all')
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
    api.members.familyDirectory().then(d =>
      setFamilyEntries((d as any[]).map(f => ({ ...f, type: 'family' as const })))
    ).catch(() => {})
    api.matches.stats().then(s => {
      const map: Record<string, MatchStat> = {}
      s.forEach(r => { map[r.user_id] = r })
      setRecords(map)
    }).catch(() => {})
  }

  const daysAgo = (iso?: string | null) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null

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
    ...familyEntries,
  ].sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name))

  const filtered = all.filter(e => {
    if (filterType === 'family' && e.type !== 'family') return false
    if (filterType === 'member' && e.type !== 'member') return false
    if (filterType === 'contact' && e.type !== 'contact') return false
    if (!search) return true
    const q = search.toLowerCase()
    const base = `${e.first_name} ${e.last_name} ${e.email ?? ''}`.toLowerCase()
    const extra = e.type === 'family' ? (e as FamilyEntry).primary_member_name.toLowerCase() : ''
    return base.includes(q) || extra.includes(q)
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
          <p className="text-sm text-gray-400 mt-0.5">
            {members.length} members · {familyEntries.length} family · {contacts.length} contacts
            {members.filter(m => m.usta_ranking).length > 0 && ` · ${members.filter(m => m.usta_ranking).length} rated`}
          </p>
          {!isBoard && (
            <p className="text-xs text-gray-400 mt-1">
              📞 Phone and address details are visible to board members only.{' '}
              <Link to="/profile" className="text-green-700 hover:underline">Update your own info →</Link>
            </p>
          )}
        </div>
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
        <div className="relative flex-1 sm:flex-none sm:w-72">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon d={IC.search} />
          </span>
          <input type="text" placeholder="Search name or email…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {(['all', 'member', 'family', 'contact'] as const).map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition ${filterType === t ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {t === 'all' ? `All (${all.length})` : t === 'member' ? `Members (${members.length})` : t === 'family' ? `Family (${familyEntries.length})` : `Contacts (${contacts.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Directory grouped by letter */}
      {Object.keys(grouped).sort().map(letter => (
        <div key={letter} className="mb-6">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 pl-1">{letter}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {grouped[letter].map(e => {
              const isMember = e.type === 'member'
              const isFamily = e.type === 'family'
              const isContact = e.type === 'contact'
              const fullName = `${e.first_name} ${e.last_name}`
              const rating = isMember ? (e as Member).usta_ranking : isFamily ? (e as FamilyEntry).usta_ranking : undefined
              const since = isMember ? (e as Member).created_at : undefined
              const photo = isMember ? (e as Member).photo_url : undefined
              const household = isMember ? (e as Member).household : undefined
              const rec = isMember ? records[e.id] : undefined
              const recentDays = daysAgo(rec?.last_played)
              return (
                <div key={`${e.type}-${e.id}`}
                  className={`group bg-white border rounded-xl p-3.5 shadow-sm hover:shadow-md transition flex items-start gap-3
                    ${isMember ? 'border-gray-200 hover:border-green-200' : isFamily ? 'border-gray-200 border-l-4 border-l-purple-300' : 'border-gray-200 border-l-4 border-l-blue-300'}`}>
                  {/* Avatar */}
                  {isMember ? (
                    <Link to={`/players/${e.id}`} title="View profile" className="shrink-0">
                      {photo
                        ? <img src={photo} alt={fullName} className="w-10 h-10 rounded-full object-cover" />
                        : <span className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${avatarColor(fullName)}`}>{initials(e.first_name, e.last_name)}</span>}
                    </Link>
                  ) : isFamily ? (
                    <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-bold bg-purple-50 text-purple-500">
                      {initials(e.first_name, e.last_name)}
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-bold bg-blue-50 text-blue-500">
                      {initials(e.first_name, e.last_name)}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isMember
                        ? <Link to={`/players/${e.id}`} className="font-semibold text-gray-800 hover:text-green-700 transition truncate">{fullName}</Link>
                        : <span className="font-semibold text-gray-800 truncate">{fullName}</span>}
                      {rating && <span className="text-[11px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded">USTA {rating}</span>}
                      {rec && rec.played > 0 && (
                        <span className="text-[11px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded" title="Wins–losses (public matches)">{rec.wins}–{rec.losses}</span>
                      )}
                      {recentDays !== null && recentDays <= 21 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600" title={`Played ${recentDays === 0 ? 'today' : `${recentDays}d ago`}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Active
                        </span>
                      )}
                      {isFamily && (
                        <span className="text-[11px] font-medium text-purple-500 bg-purple-50 px-1.5 py-0.5 rounded capitalize">
                          {(e as FamilyEntry).relationship}
                        </span>
                      )}
                      {isContact && (
                        <span className="text-[11px] font-medium text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                          {CATEGORY_LABEL[(e as Contact).category] ?? (e as Contact).category}
                        </span>
                      )}
                    </div>

                    <div className="mt-1 space-y-0.5">
                      {e.email && (
                        <a href={`mailto:${e.email}`} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-green-700 transition">
                          <Icon d={IC.mail} /><span className="truncate">{e.email}</span>
                        </a>
                      )}
                      {e.phone && (
                        <a href={`tel:${e.phone}`} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-green-700 transition">
                          <Icon d={IC.phone} />{formatPhone(e.phone)}
                        </a>
                      )}
                      {(e as Member).address && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <Icon d={IC.pin} /><span className="truncate">{(e as Member).address}</span>
                        </div>
                      )}
                      {household && household.length > 0 && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <Icon d={IC.people} /><span className="truncate">Household: {household.join(', ')}</span>
                        </div>
                      )}
                      {(e as Member).family && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <Icon d={IC.people} /><span className="truncate">{(e as Member).family}</span>
                        </div>
                      )}
                      {isFamily && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <Icon d={IC.people} /><span className="truncate">{(e as FamilyEntry).primary_member_name}</span>
                        </div>
                      )}
                      {isContact && (e as Contact).notes && (
                        <div className="text-xs text-gray-400 italic">{(e as Contact).notes}</div>
                      )}
                    </div>

                    {since && <div className="text-[11px] text-gray-300 mt-1.5">Member since {new Date(since).getFullYear()}</div>}
                  </div>

                  {isBoard && isContact && (
                    <div className="flex flex-col gap-1 shrink-0 sm:opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => openEdit(e as Contact)}
                        className="text-gray-400 hover:text-gray-600 text-xs">Edit</button>
                      <button onClick={() => handleDelete(e.id, `${e.first_name} ${e.last_name}`)}
                        className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-8">No entries match your search.</p>
      )}
    </div>
  )
}
