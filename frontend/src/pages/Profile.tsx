import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

const USTA_RATINGS = ['NR', '2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0', '5.5+']

interface UserProfile {
  first_name: string; last_name: string; email: string
  phone?: string; address?: string; role: string; status: string
  usta_ranking?: string
}

interface FamilyMember {
  id: string
  first_name: string; last_name: string
  relationship: string
  phone?: string; email?: string; notes?: string
}

const RELATIONSHIPS = [
  { value: 'spouse',   label: 'Spouse / Partner' },
  { value: 'child',    label: 'Child' },
  { value: 'parent',   label: 'Parent' },
  { value: 'sibling',  label: 'Sibling' },
  { value: 'other',    label: 'Other' },
]

const emptyMember = { first_name: '', last_name: '', relationship: 'spouse', phone: '', email: '', notes: '' }

export default function Profile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', address: '', usta_ranking: '' })
  const [pwForm, setPwForm] = useState({ current: '', new: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [savingPw, setSavingPw] = useState(false)
  const [msg, setMsg] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [pwError, setPwError] = useState('')

  // Family members
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [showFamilyForm, setShowFamilyForm] = useState(false)
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null)
  const [memberForm, setMemberForm] = useState(emptyMember)
  const [savingMember, setSavingMember] = useState(false)

  useEffect(() => {
    api.auth.me().then(d => {
      const p = d as UserProfile
      setProfile(p)
      setForm({ first_name: p.first_name, last_name: p.last_name, phone: p.phone ?? '', address: p.address ?? '', usta_ranking: p.usta_ranking ?? '' })
    })
    api.family.list().then(d => setFamilyMembers(d as FamilyMember[]))
  }, [])

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [f]: e.target.value }))

  const setMf = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setMemberForm(prev => ({ ...prev, [f]: e.target.value }))

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    try {
      await api.auth.updateProfile(form)
      setMsg('Profile updated successfully.')
    } catch (err: any) {
      setMsg('Error: ' + err.message)
    } finally { setSaving(false) }
  }

  const handleChangePw = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError('')
    setPwMsg('')
    if (pwForm.new !== pwForm.confirm) { setPwError('New passwords do not match.'); return }
    if (pwForm.new.length < 8) { setPwError('Password must be at least 8 characters.'); return }
    setSavingPw(true)
    try {
      await api.auth.changePassword(pwForm.current, pwForm.new)
      setPwMsg('Password changed successfully.')
      setPwForm({ current: '', new: '', confirm: '' })
    } catch (err: any) {
      setPwError(err.message)
    } finally { setSavingPw(false) }
  }

  const openAddMember = () => {
    setEditingMember(null)
    setMemberForm(emptyMember)
    setShowFamilyForm(true)
  }

  const openEditMember = (m: FamilyMember) => {
    setEditingMember(m)
    setMemberForm({
      first_name: m.first_name, last_name: m.last_name,
      relationship: m.relationship,
      phone: m.phone ?? '', email: m.email ?? '', notes: m.notes ?? '',
    })
    setShowFamilyForm(true)
  }

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingMember(true)
    try {
      if (editingMember) {
        await api.family.update(editingMember.id, memberForm)
        setFamilyMembers(prev => prev.map(m => m.id === editingMember.id ? { ...m, ...memberForm } : m))
      } else {
        const created = await api.family.create(memberForm) as FamilyMember
        setFamilyMembers(prev => [...prev, created])
      }
      setShowFamilyForm(false)
      setEditingMember(null)
    } finally { setSavingMember(false) }
  }

  const handleDeleteMember = async (id: string, name: string) => {
    if (!confirm(`Remove ${name}?`)) return
    await api.family.delete(id)
    setFamilyMembers(prev => prev.filter(m => m.id !== id))
  }

  const relationshipLabel = (val: string) =>
    RELATIONSHIPS.find(r => r.value === val)?.label ?? val

  if (!profile) return null

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">My Profile</h1>

      {/* Personal info */}
      <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
        <h2 className="font-semibold text-gray-800">Personal Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">First Name</label>
            <input value={form.first_name} onChange={set('first_name')} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Last Name</label>
            <input value={form.last_name} onChange={set('last_name')} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
          <input value={profile.email} disabled
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-not-allowed" />
          <p className="text-xs text-gray-400 mt-1">Email cannot be changed. Contact an admin if needed.</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
          <input type="tel" value={form.phone} onChange={set('phone')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Billing Address</label>
          <input value={form.address} onChange={set('address')}
            placeholder="123 Main St, South Pasadena CA 91030"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">USTA Rating (NTRP)</label>
          <select value={form.usta_ranking} onChange={e => setForm(f => ({ ...f, usta_ranking: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
            <option value="">Not set</option>
            {USTA_RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1">Your NTRP self-rating, used when searching for match partners.</p>
        </div>
        <div className="flex items-center gap-4">
          <button type="submit" disabled={saving}
            className="bg-green-700 hover:bg-green-800 text-white font-semibold px-6 py-2 rounded-lg text-sm transition disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          {msg && <p className={`text-sm ${msg.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>{msg}</p>}
        </div>
      </form>

      {/* Family members */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">Family Members</h2>
            <p className="text-xs text-gray-400 mt-0.5">Shown in the member directory.</p>
          </div>
          {!showFamilyForm && (
            <button onClick={openAddMember}
              className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition">
              + Add Member
            </button>
          )}
        </div>

        {/* Existing members list */}
        {familyMembers.length > 0 && !showFamilyForm && (
          <div className="space-y-2">
            {familyMembers.map(m => (
              <div key={m.id}
                className="flex items-start justify-between gap-4 border border-gray-100 rounded-lg px-4 py-3 hover:border-gray-200 transition">
                <div className="min-w-0">
                  <div className="font-medium text-gray-800 text-sm">
                    {m.first_name} {m.last_name}
                    <span className="ml-2 text-xs font-normal text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                      {relationshipLabel(m.relationship)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                    {m.phone && <span className="text-xs text-gray-500">📞 {m.phone}</span>}
                    {m.email && <span className="text-xs text-gray-500">✉️ {m.email}</span>}
                    {m.notes && <span className="text-xs text-gray-400 italic">{m.notes}</span>}
                  </div>
                </div>
                <div className="flex gap-3 shrink-0">
                  <button onClick={() => openEditMember(m)}
                    className="text-xs text-gray-400 hover:text-gray-600 transition">Edit</button>
                  <button onClick={() => handleDeleteMember(m.id, `${m.first_name} ${m.last_name}`)}
                    className="text-xs text-red-400 hover:text-red-600 transition">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {familyMembers.length === 0 && !showFamilyForm && (
          <p className="text-sm text-gray-400">No family members added yet.</p>
        )}

        {/* Add / Edit form */}
        {showFamilyForm && (
          <form onSubmit={handleSaveMember} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
            <p className="text-sm font-semibold text-gray-700">
              {editingMember ? 'Edit Family Member' : 'Add Family Member'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label>
                <input value={memberForm.first_name} onChange={setMf('first_name')} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
                <input value={memberForm.last_name} onChange={setMf('last_name')} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Relationship</label>
                <select value={memberForm.relationship} onChange={setMf('relationship')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                  {RELATIONSHIPS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input type="tel" value={memberForm.phone} onChange={setMf('phone')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input type="email" value={memberForm.email} onChange={setMf('email')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea value={memberForm.notes} onChange={setMf('notes')} rows={2}
                  placeholder="e.g. junior player, allergic to bees…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white resize-none" />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={savingMember}
                className="bg-green-700 hover:bg-green-800 text-white font-semibold px-5 py-2 rounded-lg text-sm transition disabled:opacity-50">
                {savingMember ? 'Saving…' : editingMember ? 'Save Changes' : 'Add Member'}
              </button>
              <button type="button" onClick={() => { setShowFamilyForm(false); setEditingMember(null) }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Change password */}
      <form onSubmit={handleChangePw} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
        <h2 className="font-semibold text-gray-800">Change Password</h2>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Current Password</label>
          <input type="password" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">New Password</label>
            <input type="password" value={pwForm.new} onChange={e => setPwForm(f => ({ ...f, new: e.target.value }))} required minLength={8}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Confirm New Password</label>
            <input type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} required minLength={8}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button type="submit" disabled={savingPw}
            className="bg-gray-700 hover:bg-gray-800 text-white font-semibold px-6 py-2 rounded-lg text-sm transition disabled:opacity-50">
            {savingPw ? 'Changing…' : 'Change Password'}
          </button>
          {pwError && <p className="text-red-600 text-sm">{pwError}</p>}
          {pwMsg && <p className="text-green-700 text-sm">{pwMsg}</p>}
        </div>
      </form>

      {/* Membership info */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex gap-6 text-sm">
        <div><span className="text-gray-400">Role</span><br /><span className="font-medium text-gray-700 capitalize">{profile.role.replace('_', ' ')}</span></div>
        <div><span className="text-gray-400">Status</span><br /><span className="font-medium text-gray-700 capitalize">{profile.status}</span></div>
      </div>
    </div>
  )
}
