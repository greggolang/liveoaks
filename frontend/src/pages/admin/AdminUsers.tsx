import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { formatPhone } from '../../utils/phone'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button onClick={copy} title={`Copy "${text}"`}
      className="opacity-0 group-hover:opacity-100 ml-1 shrink-0 text-gray-350 hover:text-gray-600 transition-opacity align-middle">
      {copied
        ? <span className="text-green-600 text-xs font-medium">✓</span>
        : <svg className="inline w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
      }
    </button>
  )
}

const USTA_RATINGS = ['2.5', '3.0', '3.5', '4.0', '4.5', '5.0']

interface User {
  id: string; member_number: number; first_name: string; last_name: string; email: string
  role: string; extra_roles?: string[]; status: string; phone?: string; address?: string; family?: string
  usta_ranking?: string; birthday?: string; has_family?: boolean; created_at: string; last_login_at?: string; login_count: number
}

function fmtLastLogin(ts?: string): string {
  if (!ts) return 'Never'
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
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

const emptyEdit = { first_name: '', last_name: '', email: '', phone: '', address: '', family: '', usta_ranking: '', birthday: '' }
const emptyNew = { first_name: '', last_name: '', email: '', phone: '', password: '', role: 'member', status: 'active' }
const RELATIONSHIPS = ['spouse', 'child']

interface FamilyMember { id: string; first_name: string; last_name: string; relationship: string; phone?: string; email?: string; birthday?: string; usta_ranking?: string }
interface WaitlistEntry { id: string; first_name: string; last_name: string; email?: string; phone?: string; usta_ranking?: string; status: string; created_at: string }

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
  const [waitlistFilter, setWaitlistFilter] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [familyFilter, setFamilyFilter] = useState(false)
  const [familyView, setFamilyView] = useState(false)
  const [allFamilyMembers, setAllFamilyMembers] = useState<{
    id: string; user_id: string; primary_member_name: string; primary_member_email: string
    first_name: string; last_name: string; relationship: string
    email?: string; phone?: string; birthday?: string; usta_ranking?: string; has_login: boolean
  }[]>([])
  const [familySearch, setFamilySearch] = useState('')
  const [editing, setEditing] = useState<User | null>(null)
  const [editForm, setEditForm] = useState(emptyEdit)
  const [saving, setSaving] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState(emptyNew)
  const [addError, setAddError] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [showFamilyForm, setShowFamilyForm] = useState(false)
  const [familyForm, setFamilyForm] = useState({ first_name: '', last_name: '', relationship: 'spouse', birthday: '', email: '', phone: '', usta_ranking: '' })
  const [savingFamily, setSavingFamily] = useState(false)
  const [familyError, setFamilyError] = useState('')
  const [editingFamilyId, setEditingFamilyId] = useState<string | null>(null)
  const [editFamilyForm, setEditFamilyForm] = useState({ first_name: '', last_name: '', relationship: 'spouse', birthday: '', email: '', phone: '', usta_ranking: '' })
  const [savingEditFamily, setSavingEditFamily] = useState(false)
  const [editFamilyError, setEditFamilyError] = useState('')
  const [editExtraRoles, setEditExtraRoles] = useState<string[]>([])
  const [savingExtraRoles, setSavingExtraRoles] = useState(false)
  const [memberAlerts, setMemberAlerts] = useState<{ id: string; message: string; type: string; created_at: string; dismissed_at?: string }[]>([])
  const [alertMsg, setAlertMsg] = useState('')
  const [alertType, setAlertType] = useState('info')
  const [sendingAlert, setSendingAlert] = useState(false)
  const [forceResetNotice, setForceResetNotice] = useState<{ name: string; emailSent: boolean; url: string; error?: string } | null>(null)

  const load = () => api.admin.users().then(d => setUsers(d as User[]))
  const loadWaitlist = () => api.waitlist.list().then(d => setWaitlist(d as WaitlistEntry[]))
  const loadFamily = (userId: string) => api.family.adminList(userId).then(d => setFamilyMembers(d as FamilyMember[]))
  const loadAllFamily = () => api.family.adminListAll().then(d => setAllFamilyMembers(d as typeof allFamilyMembers)).catch(() => {})
  const deleteWaitlistEntry = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from the waitlist?`)) return
    await api.waitlist.delete(id)
    loadWaitlist()
  }

  const loadAlerts = (userId: string) =>
    api.memberAlerts.adminList(userId).then(d => setMemberAlerts(d as typeof memberAlerts)).catch(() => {})

  const openEdit = (u: User) => {
    setEditing(u)
    setEditExtraRoles(u.extra_roles ?? [])
    setEditForm({ first_name: u.first_name, last_name: u.last_name, email: u.email,
      phone: formatPhone(u.phone) ?? '', address: u.address ?? '', family: u.family ?? '', usta_ranking: u.usta_ranking ?? '',
      birthday: u.birthday ?? '' })
    setFamilyMembers([])
    setShowFamilyForm(false)
    setFamilyForm({ first_name: '', last_name: '', relationship: 'spouse', birthday: '', email: '', phone: '', usta_ranking: '' })
    setEditingFamilyId(null)
    setMemberAlerts([])
    setAlertMsg('')
    loadFamily(u.id)
    loadAlerts(u.id)
  }

  const addFamilyMember = async () => {
    if (!editing || !familyForm.first_name || !familyForm.last_name) {
      setFamilyError('First and last name are required.')
      return
    }
    if (familyForm.relationship === 'child' && !familyForm.birthday) {
      setFamilyError('Birthday is required for children.')
      return
    }
    setSavingFamily(true)
    setFamilyError('')
    try {
      await api.family.adminCreate(editing.id, familyForm)
      setFamilyForm({ first_name: '', last_name: '', relationship: 'spouse', birthday: '', email: '', phone: '', usta_ranking: '' })
      setShowFamilyForm(false)
      loadFamily(editing.id)
    } catch (err: any) {
      setFamilyError(err.message || 'Could not save family member.')
    } finally { setSavingFamily(false) }
  }

  const removeFamilyMember = async (memberId: string) => {
    if (!editing) return
    await api.family.adminDelete(editing.id, memberId)
    loadFamily(editing.id)
  }

  const openEditFamily = (m: FamilyMember) => {
    setEditingFamilyId(m.id)
    setEditFamilyForm({
      first_name: m.first_name, last_name: m.last_name,
      relationship: m.relationship, birthday: m.birthday ?? '',
      email: m.email ?? '', phone: formatPhone(m.phone) ?? '',
      usta_ranking: m.usta_ranking ?? '',
    })
    setShowFamilyForm(false)
  }

  const saveEditFamily = async () => {
    if (!editing || !editingFamilyId) return
    if (!editFamilyForm.first_name || !editFamilyForm.last_name) {
      setEditFamilyError('First and last name are required.')
      return
    }
    if (editFamilyForm.relationship === 'child' && !editFamilyForm.birthday) {
      setEditFamilyError('Birthday is required for children.')
      return
    }
    setSavingEditFamily(true)
    setEditFamilyError('')
    try {
      await api.family.adminUpdate(editing.id, editingFamilyId, editFamilyForm)
      setEditingFamilyId(null)
      loadFamily(editing.id)
    } catch (err: any) {
      setEditFamilyError(err.message || 'Could not save family member.')
    } finally { setSavingEditFamily(false) }
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
  useEffect(() => { load(); loadWaitlist(); loadAllFamily() }, [])

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

  const forcePasswordReset = async (u: User) => {
    if (!confirm(`Send a password reset email to ${u.first_name} ${u.last_name} (${u.email})?`)) return
    try {
      const res = await api.admin.forceReset(u.id)
      setForceResetNotice({ name: `${u.first_name} ${u.last_name}`, emailSent: res.email_sent, url: res.reset_url, error: res.email_error || undefined })
    } catch (err: any) {
      setForceResetNotice({ name: `${u.first_name} ${u.last_name}`, emailSent: false, url: '', error: err.message })
    }
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

  const BOARD_ROLES = ['president', 'vice_president', 'secretary', 'treasurer', 'entertainment', 'house_grounds', 'billing', 'membership', 'usta']

  const filtered = users.filter(u => {
    if (roleFilter === 'board') { if (!BOARD_ROLES.includes(u.role)) return false }
    else if (roleFilter && u.role !== roleFilter) return false
    if (statusFilter && u.status !== statusFilter) return false
    if (familyFilter && !u.has_family) return false
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

  const waitlistFiltered = waitlist.filter(w => {
    if (!search) return true
    const q = search.toLowerCase()
    return w.first_name.toLowerCase().includes(q) || w.last_name.toLowerCase().includes(q) ||
      (w.email ?? '').toLowerCase().includes(q) || (w.phone ?? '').includes(q)
  })

  const hasFilters = search || roleFilter || statusFilter || familyFilter || waitlistFilter

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
    members: users.filter(u => u.role === 'member').length,
    waitlist: waitlist.length,
    inactive: users.filter(u => u.status === 'inactive').length,
    board: users.filter(u => BOARD_ROLES.includes(u.role)).length,
    admin: users.filter(u => u.role === 'admin').length,
    withFamily: users.filter(u => u.has_family).length,
    familyMembers: allFamilyMembers.length,
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">Members</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {familyView
              ? `${allFamilyMembers.length} family member${allFamilyMembers.length !== 1 ? 's' : ''}`
              : `${waitlistFilter ? waitlistFiltered.length : filtered.length} of ${waitlistFilter ? waitlist.length : users.length} shown`}
          </span>
          <button onClick={() => { setShowAddModal(true); setAddForm(emptyNew); setAddError('') }}
            className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition">
            + Add Member
          </button>
        </div>
      </div>

      {/* Force reset notification */}
      {forceResetNotice && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm flex items-start gap-3 ${forceResetNotice.emailSent ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          <div className="flex-1">
            {forceResetNotice.emailSent
              ? <><span className="font-medium">Reset email sent</span> to {forceResetNotice.name}. The link expires in 24 hours.</>
              : <><span className="font-medium">Email failed</span> for {forceResetNotice.name}{forceResetNotice.error ? ` — ${forceResetNotice.error}` : ''}. Copy the link below to share manually:</>
            }
            {!forceResetNotice.emailSent && forceResetNotice.url && (
              <div className="mt-1.5 flex items-center gap-2">
                <code className="text-xs bg-white border border-amber-200 rounded px-2 py-1 break-all">{forceResetNotice.url}</code>
                <button onClick={() => navigator.clipboard.writeText(forceResetNotice.url)}
                  className="shrink-0 text-xs bg-amber-700 text-white px-2 py-1 rounded hover:bg-amber-800 transition">Copy</button>
              </div>
            )}
          </div>
          <button onClick={() => setForceResetNotice(null)} className="opacity-50 hover:opacity-80 transition text-lg leading-none">✕</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mb-5">
        {[
          { label: 'Total Users',     value: counts.total,         color: 'bg-gray-50 border-gray-200 text-gray-700',    active: !statusFilter && !roleFilter && !familyFilter && !waitlistFilter && !familyView, click: () => { setStatusFilter(''); setRoleFilter(''); setFamilyFilter(false); setWaitlistFilter(false); setFamilyView(false) } },
          { label: 'Members',         value: counts.members,       color: 'bg-green-50 border-green-200 text-green-700',  active: roleFilter === 'member' && !familyView,       click: () => { setRoleFilter('member'); setStatusFilter(''); setFamilyFilter(false); setWaitlistFilter(false); setFamilyView(false) } },
          { label: 'Wait List',       value: counts.waitlist,      color: 'bg-amber-50 border-amber-200 text-amber-700',  active: waitlistFilter && !familyView,                click: () => { setWaitlistFilter(w => !w); setRoleFilter(''); setStatusFilter(''); setFamilyFilter(false); setFamilyView(false) } },
          { label: 'Inactive',        value: counts.inactive,      color: 'bg-red-50 border-red-200 text-red-700',        active: statusFilter === 'inactive' && !familyView,   click: () => { setStatusFilter('inactive'); setFamilyFilter(false); setWaitlistFilter(false); setFamilyView(false) } },
          { label: 'Board',           value: counts.board,         color: 'bg-blue-50 border-blue-200 text-blue-700',     active: roleFilter === 'board' && !familyView,        click: () => { setRoleFilter('board');  setFamilyFilter(false); setWaitlistFilter(false); setFamilyView(false) } },
          { label: 'Admin',           value: counts.admin,         color: 'bg-purple-50 border-purple-200 text-purple-700', active: roleFilter === 'admin' && !familyView,      click: () => { setRoleFilter('admin');  setFamilyFilter(false); setWaitlistFilter(false); setFamilyView(false) } },
          { label: 'Has Family',      value: counts.withFamily,    color: 'bg-orange-50 border-orange-200 text-orange-700', active: familyFilter && !familyView,               click: () => { setFamilyFilter(f => !f); setRoleFilter(''); setStatusFilter(''); setWaitlistFilter(false); setFamilyView(false) } },
          { label: 'Family Members',  value: counts.familyMembers, color: 'bg-pink-50 border-pink-200 text-pink-700',     active: familyView,                                   click: () => { setFamilyView(v => !v); setRoleFilter(''); setStatusFilter(''); setFamilyFilter(false); setWaitlistFilter(false) } },
        ].map(s => (
          <button key={s.label} onClick={s.click}
            className={`${s.color} border rounded-xl p-3 text-center hover:opacity-80 transition cursor-pointer ${s.active ? 'ring-2 ring-offset-1 ring-current' : ''}`}>
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
          <option value="board">All Board</option>
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
          <button onClick={() => { setSearch(''); setRoleFilter(''); setStatusFilter(''); setFamilyFilter(false); setWaitlistFilter(false) }}
            className="text-sm text-red-500 hover:text-red-700 font-medium px-2">
            Clear
          </button>
        )}
      </div>

      {familyView ? (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {/* Search bar for family members view */}
          <div className="px-4 py-3 border-b border-gray-100">
            <input
              type="text"
              placeholder="Search by name, primary member, or email…"
              value={familySearch}
              onChange={e => setFamilySearch(e.target.value)}
              className="w-full sm:w-80 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Family Member</th>
                  <th className="px-4 py-3 text-left">Relationship</th>
                  <th className="px-4 py-3 text-left">USTA</th>
                  <th className="px-4 py-3 text-left">Primary Member</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Birthday</th>
                  <th className="px-4 py-3 text-left">Login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(() => {
                  const q = familySearch.toLowerCase()
                  const visible = familySearch
                    ? allFamilyMembers.filter(fm =>
                        `${fm.first_name} ${fm.last_name}`.toLowerCase().includes(q) ||
                        fm.primary_member_name.toLowerCase().includes(q) ||
                        fm.primary_member_email.toLowerCase().includes(q) ||
                        (fm.email ?? '').toLowerCase().includes(q))
                    : allFamilyMembers
                  if (visible.length === 0) return (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400 text-sm">
                      {familySearch ? 'No family members match your search.' : 'No family members on file.'}
                    </td></tr>
                  )
                  return visible.map(fm => (
                  <tr key={fm.id} className="hover:bg-pink-50 group">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {fm.first_name} {fm.last_name}
                      <CopyButton text={`${fm.first_name} ${fm.last_name}`} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 capitalize">
                        {fm.relationship}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {fm.usta_ranking
                        ? <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{fm.usta_ranking}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-800">{fm.primary_member_name}</div>
                      <div className="text-xs text-gray-400">
                        {fm.primary_member_email}
                        <CopyButton text={fm.primary_member_email} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {fm.email
                        ? <>{fm.email}<CopyButton text={fm.email} /></>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{fm.birthday ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3">
                      {fm.has_login
                        ? <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">✓ Has login</span>
                        : <span className="text-xs text-gray-400">—</span>}
                    </td>
                  </tr>
                ))
                })()}
              </tbody>
            </table>
          </div>
        </div>
      ) : (

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">#</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Last Login</th>
              <th className="px-4 py-3 text-left">Logins</th>
              <th className="px-4 py-3 text-left">Joined</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {waitlistFilter ? (
              waitlistFiltered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400 text-sm">No waitlist entries match your search.</td></tr>
              ) : waitlistFiltered.map(w => (
                <tr key={`wl-${w.id}`} className="hover:bg-amber-50 group">
                  <td className="px-4 py-3 text-gray-300 text-xs">—</td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {w.first_name} {w.last_name}
                    <CopyButton text={`${w.first_name} ${w.last_name}`} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {w.email
                      ? <>{w.email}<CopyButton text={w.email} /></>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-700">Wait List</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${
                      w.status === 'contacted' ? 'bg-blue-100 text-blue-700' :
                      w.status === 'accepted'  ? 'bg-green-100 text-green-700' :
                      w.status === 'declined'  ? 'bg-gray-100 text-gray-500' :
                                                 'bg-yellow-100 text-yellow-700'
                    }`}>{w.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-xs">—</td>
                  <td className="px-4 py-3 text-gray-300 text-xs">—</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(w.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 flex gap-3">
                    <a href="/admin/waitlist" className="text-blue-500 hover:text-blue-700 text-xs font-medium">Manage</a>
                    <button onClick={() => deleteWaitlistEntry(w.id, `${w.first_name} ${w.last_name}`)}
                      className="text-red-400 hover:text-red-600 text-xs">Delete</button>
                  </td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400 text-sm">No members match your search.</td></tr>
            ) : filtered.map(u => (
              <tr key={u.id} className="hover:bg-gray-50 group">
                <td className="px-4 py-3 text-xs text-gray-400 font-mono tabular-nums">
                  {u.member_number}
                  <CopyButton text={String(u.member_number)} />
                </td>
                <td className="px-4 py-3 font-medium text-gray-800">
                  {u.first_name} {u.last_name}
                  <CopyButton text={`${u.first_name} ${u.last_name}`} />
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {u.email}<CopyButton text={u.email} />
                </td>
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
                <td className="px-4 py-3 text-xs">
                  <span className={u.last_login_at ? 'text-gray-600' : 'text-gray-300'} title={u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never logged in'}>
                    {fmtLastLogin(u.last_login_at)}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{u.login_count > 0 ? u.login_count : <span className="text-gray-300">0</span>}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 flex gap-3">
                  <button onClick={() => openEdit(u)}
                    className="text-blue-500 hover:text-blue-700 text-xs font-medium">Edit</button>
                  <button onClick={() => forcePasswordReset(u)}
                    className="text-orange-500 hover:text-orange-700 text-xs font-medium">Reset PW</button>
                  <button onClick={() => deleteUser(u.id, `${u.first_name} ${u.last_name}`)}
                    className="text-red-400 hover:text-red-600 text-xs">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      )}

      {/* Edit member modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
          <form onSubmit={handleSaveEdit} onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Edit Member</h2>
                <p className="text-xs text-gray-400 font-mono mt-0.5">Member #{editing.member_number}</p>
              </div>
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

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">USTA Rating (NTRP)</label>
                <select value={editForm.usta_ranking} onChange={e => setEditForm(f => ({ ...f, usta_ranking: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                  <option value="">Not set</option>
                  {USTA_RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Birthday</label>
                <input type="date" value={editForm.birthday} onChange={e => setEditForm(f => ({ ...f, birthday: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
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
              </div>
              {familyMembers.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {familyMembers.map(m => (
                    <div key={m.id}>
                      {editingFamilyId === m.id ? (
                        <div className="flex flex-wrap gap-2 items-end bg-blue-50 border border-blue-200 rounded-lg p-2">
                          <input value={editFamilyForm.first_name} onChange={e => setEditFamilyForm(f => ({ ...f, first_name: e.target.value }))}
                            placeholder="First name *"
                            className="border border-gray-300 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          <input value={editFamilyForm.last_name} onChange={e => setEditFamilyForm(f => ({ ...f, last_name: e.target.value }))}
                            placeholder="Last name *"
                            className="border border-gray-300 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          <select value={editFamilyForm.relationship} onChange={e => setEditFamilyForm(f => ({ ...f, relationship: e.target.value }))}
                            className="border border-gray-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                            {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <input type="date" value={editFamilyForm.birthday} onChange={e => setEditFamilyForm(f => ({ ...f, birthday: e.target.value }))}
                            title="Birthday *"
                            className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          <input type="email" value={editFamilyForm.email} onChange={e => setEditFamilyForm(f => ({ ...f, email: e.target.value }))}
                            placeholder="Email"
                            className="border border-gray-300 rounded px-2 py-1 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          <input type="tel" value={editFamilyForm.phone} onChange={e => setEditFamilyForm(f => ({ ...f, phone: e.target.value }))}
                            placeholder="Phone"
                            className="border border-gray-300 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          <select value={editFamilyForm.usta_ranking} onChange={e => setEditFamilyForm(f => ({ ...f, usta_ranking: e.target.value }))}
                            className="border border-gray-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                            <option value="">USTA</option>
                            {USTA_RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <button type="button" onClick={saveEditFamily} disabled={savingEditFamily}
                            className="text-xs bg-blue-700 text-white px-2 py-1 rounded hover:bg-blue-800 transition disabled:opacity-50">
                            {savingEditFamily ? 'Saving…' : 'Save'}
                          </button>
                          <button type="button" onClick={() => { setEditingFamilyId(null); setEditFamilyError('') }}
                            className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                          {editFamilyError && <span className="text-xs text-red-600 w-full">{editFamilyError}</span>}
                        </div>
                      ) : (
                        <div className="flex items-start justify-between bg-gray-50 rounded-lg px-3 py-1.5 text-sm">
                          <div>
                            <span className="text-gray-800 font-medium">{m.first_name} {m.last_name}</span>
                            <span className="ml-2 text-xs font-normal text-gray-400 capitalize">{m.relationship}</span>
                            {m.usta_ranking && <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{m.usta_ranking}</span>}
                            {m.birthday && <span className="ml-2 text-xs font-normal text-gray-400">b. {m.birthday}</span>}
                            {(m.email || m.phone) && (
                              <div className="text-xs text-gray-400 mt-0.5 space-x-2">
                                {m.email && <span>{m.email}</span>}
                                {m.phone && <span>{formatPhone(m.phone)}</span>}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-3 shrink-0 ml-2">
                            <button type="button" onClick={() => openEditFamily(m)}
                              className="text-xs text-blue-500 hover:text-blue-700 transition">Edit</button>
                            <button type="button" onClick={() => removeFamilyMember(m.id)}
                              className="text-xs text-red-400 hover:text-red-600 transition">Remove</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {familyMembers.length === 0 && (
                <p className="text-xs text-gray-400">No family members added.</p>
              )}
            </div>

            {/* Dashboard Alerts */}
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-medium text-gray-600 mb-2">Dashboard Alerts</p>
              <p className="text-xs text-gray-400 mb-2">Alerts appear on this member's dashboard until they dismiss them.</p>
              {memberAlerts.filter(a => !a.dismissed_at).length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {memberAlerts.filter(a => !a.dismissed_at).map(a => {
                    const color: Record<string, string> = { info: 'bg-blue-50 border-blue-200 text-blue-700', warning: 'bg-amber-50 border-amber-200 text-amber-700', danger: 'bg-red-50 border-red-200 text-red-700' }
                    return (
                      <div key={a.id} className={`flex items-center gap-2 border rounded-lg px-3 py-1.5 text-xs ${color[a.type] ?? color.info}`}>
                        <span className="flex-1">{a.message}</span>
                        <span className="opacity-50 capitalize">{a.type}</span>
                        <button type="button" onClick={async () => {
                          await api.memberAlerts.adminDelete(a.id)
                          loadAlerts(editing!.id)
                        }} className="opacity-40 hover:opacity-70 transition">✕</button>
                      </div>
                    )
                  })}
                </div>
              )}
              {memberAlerts.filter(a => !a.dismissed_at).length === 0 && (
                <p className="text-xs text-gray-300 mb-2">No active alerts.</p>
              )}
              <div className="flex gap-2 items-start">
                <select value={alertType} onChange={e => setAlertType(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-green-500 shrink-0">
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="danger">Urgent</option>
                </select>
                <input value={alertMsg} onChange={e => setAlertMsg(e.target.value)}
                  placeholder="Alert message…"
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500" />
                <button type="button" disabled={!alertMsg.trim() || sendingAlert}
                  onClick={async () => {
                    if (!editing || !alertMsg.trim()) return
                    setSendingAlert(true)
                    try {
                      await api.memberAlerts.adminCreate(editing.id, alertMsg.trim(), alertType)
                      setAlertMsg('')
                      loadAlerts(editing.id)
                    } finally { setSendingAlert(false) }
                  }}
                  className="px-3 py-1.5 bg-green-700 text-white text-xs rounded-lg hover:bg-green-800 transition disabled:opacity-50 shrink-0">
                  {sendingAlert ? 'Sending…' : 'Send'}
                </button>
              </div>
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
