import { useEffect, useState } from 'react'
import { api } from '../../api/client'

const USTA_RATINGS = ['2.5', '3.0', '3.5', '4.0', '4.5', '5.0']

interface User {
  id: string; first_name: string; last_name: string; email: string
  role: string; extra_roles?: string[]; status: string; phone?: string; address?: string; family?: string
  usta_ranking?: string; created_at: string
}

// All assignable roles (used for extra_roles checkboxes)
const ALL_ASSIGNABLE_ROLES = [
  { value: 'president',      label: 'President',      group: 'Board' },
  { value: 'vice_president', label: 'Vice President', group: 'Board' },
  { value: 'secretary',      label: 'Secretary',      group: 'Board' },
  { value: 'treasurer',      label: 'Treasurer',      group: 'Board' },
  { value: 'entertainment',  label: 'Entertainment',  group: 'Board' },
  { value: 'house_grounds',  label: 'House & Grounds',group: 'Board' },
  { value: 'billing',        label: 'Billing',        group: 'Board' },
  { value: 'membership',     label: 'Membership',     group: 'Board' },
  { value: 'usta',           label: 'USTA',           group: 'Board' },
  { value: 'games',          label: 'Games Admin',    group: 'Special' },
  { value: 'pro',            label: 'Pro',            group: 'Special' },
  { value: 'admin',          label: 'Admin',          group: 'System' },
  { value: 'member',         label: 'Member',         group: 'General' },
]

const emptyEdit = { first_name: '', last_name: '', email: '', phone: '', address: '', family: '', usta_ranking: '' }
const emptyNew = { first_name: '', last_name: '', email: '', phone: '', password: '', role: 'member', status: 'active' }
const RELATIONSHIPS = ['spouse', 'child', 'parent', 'sibling', 'other']

interface FamilyMember { id: string; first_name: string; last_name: string; relationship: string; phone?: string; email?: string; birthday?: string }

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [editing, setEditing] = useState<User | null>(null)
  const [editForm, setEditForm] = useState(emptyEdit)
  const [saving, setSaving] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState(emptyNew)
  const [addError, setAddError] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [showFamilyForm, setShowFamilyForm] = useState(false)
  const [familyForm, setFamilyForm] = useState({ first_name: '', last_name: '', relationship: 'spouse', birthday: '' })
  const [savingFamily, setSavingFamily] = useState(false)
  const [editExtraRoles, setEditExtraRoles] = useState<string[]>([])
  const [savingExtraRoles, setSavingExtraRoles] = useState(false)

  const load = () => api.admin.users().then(d => setUsers(d as User[]))
  const loadFamily = (userId: string) => api.family.adminList(userId).then(d => setFamilyMembers(d as FamilyMember[]))

  const openEdit = (u: User) => {
    setEditing(u)
    setEditExtraRoles(u.extra_roles ?? [])
    setEditForm({ first_name: u.first_name, last_name: u.last_name, email: u.email,
      phone: u.phone ?? '', address: u.address ?? '', family: u.family ?? '', usta_ranking: u.usta_ranking ?? '' })
    setFamilyMembers([])
    setShowFamilyForm(false)
    setFamilyForm({ first_name: '', last_name: '', relationship: 'spouse', birthday: '' })
    loadFamily(u.id)
  }

  const addFamilyMember = async () => {
    if (!editing || !familyForm.first_name || !familyForm.last_name || !familyForm.birthday) return
    setSavingFamily(true)
    try {
      await api.family.adminCreate(editing.id, familyForm)
      setFamilyForm({ first_name: '', last_name: '', relationship: 'spouse', birthday: '' })
      setShowFamilyForm(false)
      loadFamily(editing.id)
    } finally { setSavingFamily(false) }
  }

  const removeFamilyMember = async (memberId: string) => {
    if (!editing) return
    await api.family.adminDelete(editing.id, memberId)
    loadFamily(editing.id)
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    try {
      await api.admin.updateProfile(editing.id, editForm)
      setEditing(null)
      load()
    } finally { setSaving(false) }
  }
  useEffect(() => { load() }, [])

  const setRole = async (id: string, role: string) => {
    await api.admin.updateRole(id, role)
    load()
  }
  const setStatus = async (id: string, status: string) => {
    await api.admin.updateStatus(id, status)
    load()
  }
  const deleteUser = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return
    await api.admin.deleteUser(id)
    load()
  }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError('')
    setAddSaving(true)
    try {
      await api.admin.createUser(addForm)
      setShowAddModal(false)
      setAddForm(emptyNew)
      load()
    } catch (err: any) {
      setAddError(err.message)
    } finally { setAddSaving(false) }
  }

  const filtered = users.filter(u => {
    if (roleFilter && u.role !== roleFilter) return false
    if (statusFilter && u.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        u.first_name.toLowerCase().includes(q) ||
        u.last_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone ?? '').includes(q)
      )
    }
    return true
  })

  const hasFilters = search || roleFilter || statusFilter

  const BOARD_ROLES = ['president', 'vice_president', 'secretary', 'treasurer', 'entertainment', 'house_grounds']

  const roleColor = (role: string): string => {
    if (role === 'admin') return 'bg-purple-100 text-purple-700'
    if (BOARD_ROLES.includes(role)) return 'bg-blue-100 text-blue-700'
    if (role === 'games') return 'bg-orange-100 text-orange-700'
    if (role === 'pro') return 'bg-indigo-100 text-indigo-700'
    return 'bg-gray-100 text-gray-700'
  }

  const roleLabel: Record<string, string> = {
    admin: 'Admin', president: 'President', vice_president: 'Vice President',
    secretary: 'Secretary', treasurer: 'Treasurer', entertainment: 'Entertainment',
    house_grounds: 'House & Grounds', billing: 'Billing', membership: 'Membership',
    usta: 'USTA', games: 'Games Admin', pro: 'Pro', member: 'Member',
  }
  const statusColor: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    inactive: 'bg-red-100 text-red-700',
  }

  const counts = {
    total: users.length,
    active: users.filter(u => u.status === 'active').length,
    pending: users.filter(u => u.status === 'pending').length,
    inactive: users.filter(u => u.status === 'inactive').length,
    board: users.filter(u => ['president','vice_president','secretary','treasurer','entertainment','house_grounds'].includes(u.role)).length,
    admin: users.filter(u => u.role === 'admin').length,
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">Members</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{filtered.length} of {users.length} shown</span>
          <button onClick={() => { setShowAddModal(true); setAddForm(emptyNew); setAddError('') }}
            className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition">
            + Add Member
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-5">
        {[
          { label: 'Total', value: counts.total, color: 'bg-gray-50 border-gray-200 text-gray-700', click: () => { setStatusFilter(''); setRoleFilter('') } },
          { label: 'Active', value: counts.active, color: 'bg-green-50 border-green-200 text-green-700', click: () => setStatusFilter('active') },
          { label: 'Pending', value: counts.pending, color: 'bg-yellow-50 border-yellow-200 text-yellow-700', click: () => setStatusFilter('pending') },
          { label: 'Inactive', value: counts.inactive, color: 'bg-red-50 border-red-200 text-red-700', click: () => setStatusFilter('inactive') },
          { label: 'Board', value: counts.board, color: 'bg-blue-50 border-blue-200 text-blue-700', click: () => setRoleFilter('president') },
          { label: 'Admin', value: counts.admin, color: 'bg-purple-50 border-purple-200 text-purple-700', click: () => setRoleFilter('admin') },
        ].map(s => (
          <button key={s.label} onClick={s.click}
            className={`${s.color} border rounded-xl p-3 text-center hover:opacity-80 transition cursor-pointer`}>
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-xs font-medium mt-0.5 opacity-75">{s.label}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search name, email, phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 flex-1 sm:flex-none sm:w-60"
        />
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
          <option value="">All roles</option>
          <option value="member">Member</option>
          <option value="pro">Pro</option>
          <option value="games">Games Admin</option>
          <option value="membership">Membership</option>
          <option value="usta">USTA</option>
          <option value="entertainment">Entertainment</option>
          <option value="house_grounds">House &amp; Grounds</option>
          <option value="secretary">Secretary</option>
          <option value="treasurer">Treasurer</option>
          <option value="vice_president">Vice President</option>
          <option value="president">President</option>
          <option value="admin">Admin</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="inactive">Inactive</option>
        </select>
        {hasFilters && (
          <button onClick={() => { setSearch(''); setRoleFilter(''); setStatusFilter('') }}
            className="text-sm text-red-500 hover:text-red-700 font-medium px-2">
            Clear
          </button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Joined</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400 text-sm">No members match your search.</td></tr>
            ) : filtered.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{u.first_name} {u.last_name}</td>
                <td className="px-4 py-3 text-gray-500">{u.email}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 flex-wrap">
                    <select value={u.role} onChange={e => setRole(u.id, e.target.value)}
                      className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${roleColor(u.role)}`}>
                      <option value="member">Member</option>
                      <optgroup label="Board">
                        <option value="billing">Billing</option>
                        <option value="membership">Membership</option>
                        <option value="usta">USTA</option>
                        <option value="entertainment">Entertainment</option>
                        <option value="house_grounds">House &amp; Grounds</option>
                        <option value="secretary">Secretary</option>
                        <option value="treasurer">Treasurer</option>
                        <option value="vice_president">Vice President</option>
                        <option value="president">President</option>
                      </optgroup>
                      <optgroup label="Special">
                        <option value="games">Games Admin</option>
                        <option value="pro">Pro</option>
                      </optgroup>
                      <optgroup label="System">
                        <option value="admin">Admin</option>
                      </optgroup>
                    </select>
                    {(u.extra_roles ?? []).map(r => (
                      <span key={r} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${roleColor(r)}`}>
                        +{roleLabel[r] ?? r}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <select value={u.status} onChange={e => setStatus(u.id, e.target.value)}
                    className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${statusColor[u.status]}`}>
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 flex gap-3">
                  <button onClick={() => openEdit(u)}
                    className="text-blue-500 hover:text-blue-700 text-xs font-medium">Edit</button>
                  <button onClick={() => deleteUser(u.id, `${u.first_name} ${u.last_name}`)}
                    className="text-red-400 hover:text-red-600 text-xs">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Edit member modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
          <form onSubmit={handleSaveEdit} onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-800">Edit Member</h2>
              <button type="button" onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">First Name</label>
                <input value={editForm.first_name} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Last Name</label>
                <input value={editForm.last_name} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input type="tel" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Billing Address</label>
                <input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="123 Main St, City CA 91030"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Family Members</label>
                <textarea value={editForm.family} onChange={e => setEditForm(f => ({ ...f, family: e.target.value }))} rows={2}
                  placeholder="e.g. Jennifer (spouse), Tim (son)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">USTA Rating (NTRP)</label>
                <select value={editForm.usta_ranking} onChange={e => setEditForm(f => ({ ...f, usta_ranking: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                  <option value="">Not set</option>
                  {USTA_RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            {/* Additional roles */}
            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-600">Additional Role Assignments</p>
                {savingExtraRoles && <span className="text-xs text-gray-400">Saving…</span>}
              </div>
              <p className="text-xs text-gray-400 mb-2">Check any extra roles this member should hold alongside their primary role.</p>
              <div className="grid grid-cols-2 gap-1.5">
                {ALL_ASSIGNABLE_ROLES.filter(r => r.value !== (editing?.role ?? 'member')).map(r => (
                  <label key={r.value} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox"
                      checked={editExtraRoles.includes(r.value)}
                      onChange={async e => {
                        const next = e.target.checked
                          ? [...editExtraRoles, r.value]
                          : editExtraRoles.filter(x => x !== r.value)
                        setEditExtraRoles(next)
                        setSavingExtraRoles(true)
                        try {
                          await api.admin.updateExtraRoles(editing!.id, next)
                          setUsers(us => us.map(u => u.id === editing!.id ? { ...u, extra_roles: next } : u))
                        } finally { setSavingExtraRoles(false) }
                      }}
                      className="w-3.5 h-3.5 rounded accent-green-600 cursor-pointer"
                    />
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${roleColor(r.value)}`}>
                      {r.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Family members */}
            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-600">Family Members</p>
                {!showFamilyForm && (
                  <button type="button" onClick={() => setShowFamilyForm(true)}
                    className="text-xs text-green-700 hover:underline font-medium">+ Add</button>
                )}
              </div>
              {familyMembers.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {familyMembers.map(m => (
                    <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5 text-sm">
                      <span className="text-gray-800 font-medium">{m.first_name} {m.last_name}
                        <span className="ml-2 text-xs font-normal text-gray-400 capitalize">{m.relationship}</span>
                        {m.birthday && <span className="ml-2 text-xs font-normal text-gray-400">b. {m.birthday}</span>}
                      </span>
                      <button type="button" onClick={() => removeFamilyMember(m.id)}
                        className="text-xs text-red-400 hover:text-red-600 transition">Remove</button>
                    </div>
                  ))}
                </div>
              )}
              {familyMembers.length === 0 && !showFamilyForm && (
                <p className="text-xs text-gray-400">No family members added.</p>
              )}
              {showFamilyForm && (
                <div className="flex flex-wrap gap-2 items-end bg-gray-50 rounded-lg p-2">
                  <input value={familyForm.first_name} onChange={e => setFamilyForm(f => ({ ...f, first_name: e.target.value }))}
                    placeholder="First name"
                    className="border border-gray-300 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-green-500" />
                  <input value={familyForm.last_name} onChange={e => setFamilyForm(f => ({ ...f, last_name: e.target.value }))}
                    placeholder="Last name"
                    className="border border-gray-300 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-green-500" />
                  <select value={familyForm.relationship} onChange={e => setFamilyForm(f => ({ ...f, relationship: e.target.value }))}
                    className="border border-gray-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-green-500">
                    {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <input type="date" value={familyForm.birthday} onChange={e => setFamilyForm(f => ({ ...f, birthday: e.target.value }))}
                    title="Birthday"
                    className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500" />
                  <button type="button" onClick={addFamilyMember} disabled={savingFamily}
                    className="text-xs bg-green-700 text-white px-2 py-1 rounded hover:bg-green-800 transition disabled:opacity-50">
                    {savingFamily ? 'Adding…' : 'Add'}
                  </button>
                  <button type="button" onClick={() => setShowFamilyForm(false)}
                    className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="bg-green-700 hover:bg-green-800 text-white font-semibold px-6 py-2 rounded-lg text-sm transition disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              <button type="button" onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Member modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <form onSubmit={handleAddMember} onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-800">Add Member</h2>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label>
                <input value={addForm.first_name} onChange={e => setAddForm(f => ({ ...f, first_name: e.target.value }))} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
                <input value={addForm.last_name} onChange={e => setAddForm(f => ({ ...f, last_name: e.target.value }))} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                <input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input type="tel" value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Temporary Password *</label>
                <input type="text" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} required minLength={8}
                  placeholder="Min 8 characters"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select value={addForm.role} onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                  <option value="member">Member</option>
                  <optgroup label="Committee">
                    <option value="billing">Billing</option>
                    <option value="membership">Membership</option>
                    <option value="usta">USTA</option>
                  </optgroup>
                  <optgroup label="Board">
                    <option value="entertainment">Entertainment</option>
                    <option value="house_grounds">House &amp; Grounds</option>
                    <option value="secretary">Secretary</option>
                    <option value="treasurer">Treasurer</option>
                    <option value="vice_president">Vice President</option>
                    <option value="president">President</option>
                  </optgroup>
                  <optgroup label="System">
                    <option value="admin">Admin</option>
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select value={addForm.status} onChange={e => setAddForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            {addError && <p className="text-red-600 text-sm">{addError}</p>}
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={addSaving}
                className="bg-green-700 hover:bg-green-800 text-white font-semibold px-6 py-2 rounded-lg text-sm transition disabled:opacity-50">
                {addSaving ? 'Adding…' : 'Add Member'}
              </button>
              <button type="button" onClick={() => setShowAddModal(false)}
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
