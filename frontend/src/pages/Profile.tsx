import { useEffect, useState } from 'react'
import { api } from '../api/client'

const USTA_RATINGS = ['2.5', '3.0', '3.5', '4.0', '4.5', '5.0']
const RELATIONSHIPS = ['spouse', 'child', 'parent', 'sibling', 'other']
const emptyFamilyForm = { first_name: '', last_name: '', relationship: 'spouse', birthday: '', email: '', phone: '' }

interface UserProfile {
  first_name: string; last_name: string; email: string
  phone?: string; address?: string; role: string; status: string
  usta_ranking?: string
}

interface FamilyMember {
  id: string; first_name: string; last_name: string
  relationship: string; birthday?: string; email?: string; phone?: string
}

export default function Profile() {
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
  const [familyForm, setFamilyForm] = useState(emptyFamilyForm)
  const [savingFamily, setSavingFamily] = useState(false)
  const [editingFamilyId, setEditingFamilyId] = useState<string | null>(null)
  const [editFamilyForm, setEditFamilyForm] = useState(emptyFamilyForm)
  const [savingEditFamily, setSavingEditFamily] = useState(false)

  const loadFamily = () => api.family.list().then(d => setFamilyMembers(d as FamilyMember[]))

  useEffect(() => {
    api.auth.me().then(d => {
      const p = d as UserProfile
      setProfile(p)
      setForm({ first_name: p.first_name, last_name: p.last_name, phone: p.phone ?? '', address: p.address ?? '', usta_ranking: p.usta_ranking ?? '' })
    })
    loadFamily()
  }, [])

  const addFamilyMember = async () => {
    if (!familyForm.first_name || !familyForm.last_name || !familyForm.birthday) return
    setSavingFamily(true)
    try {
      await api.family.create(familyForm)
      setFamilyForm(emptyFamilyForm)
      setShowFamilyForm(false)
      loadFamily()
    } finally { setSavingFamily(false) }
  }

  const openEditFamily = (m: FamilyMember) => {
    setEditingFamilyId(m.id)
    setEditFamilyForm({
      first_name: m.first_name, last_name: m.last_name,
      relationship: m.relationship, birthday: m.birthday ?? '',
      email: m.email ?? '', phone: m.phone ?? '',
    })
    setShowFamilyForm(false)
  }

  const saveEditFamily = async () => {
    if (!editingFamilyId || !editFamilyForm.first_name || !editFamilyForm.last_name || !editFamilyForm.birthday) return
    setSavingEditFamily(true)
    try {
      await api.family.update(editingFamilyId, editFamilyForm)
      setEditingFamilyId(null)
      loadFamily()
    } finally { setSavingEditFamily(false) }
  }

  const removeFamily = async (id: string) => {
    if (!confirm('Remove this family member?')) return
    await api.family.delete(id)
    loadFamily()
  }

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [f]: e.target.value }))

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

      {/* Family members */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">Family Members</h2>
            <p className="text-xs text-gray-400 mt-0.5">Spouses and children under 26 can be added to your court bookings as members.</p>
          </div>
          {!showFamilyForm && !editingFamilyId && (
            <button onClick={() => setShowFamilyForm(true)}
              className="text-sm text-green-700 hover:text-green-900 font-medium transition">
              + Add
            </button>
          )}
        </div>

        {/* Existing members */}
        {familyMembers.length > 0 && (
          <div className="space-y-2">
            {familyMembers.map(m => (
              <div key={m.id}>
                {editingFamilyId === m.id ? (
                  <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-medium text-blue-800">Edit family member</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label>
                        <input value={editFamilyForm.first_name} onChange={e => setEditFamilyForm(f => ({ ...f, first_name: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
                        <input value={editFamilyForm.last_name} onChange={e => setEditFamilyForm(f => ({ ...f, last_name: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Relationship</label>
                        <select value={editFamilyForm.relationship} onChange={e => setEditFamilyForm(f => ({ ...f, relationship: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                          {RELATIONSHIPS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Birthday *</label>
                        <input type="date" value={editFamilyForm.birthday} onChange={e => setEditFamilyForm(f => ({ ...f, birthday: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                        <input type="email" value={editFamilyForm.email} onChange={e => setEditFamilyForm(f => ({ ...f, email: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                        <input type="tel" value={editFamilyForm.phone} onChange={e => setEditFamilyForm(f => ({ ...f, phone: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={saveEditFamily} disabled={savingEditFamily}
                        className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2 rounded-lg text-sm transition disabled:opacity-50">
                        {savingEditFamily ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => setEditingFamilyId(null)}
                        className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between bg-gray-50 rounded-xl px-4 py-3">
                    <div>
                      <span className="font-medium text-gray-800 text-sm">{m.first_name} {m.last_name}</span>
                      <span className="ml-2 text-xs text-gray-400 capitalize">{m.relationship}</span>
                      {m.birthday && <span className="ml-2 text-xs text-gray-400">b. {m.birthday}</span>}
                      {(m.email || m.phone) && (
                        <div className="text-xs text-gray-400 mt-0.5 space-x-2">
                          {m.email && <span>{m.email}</span>}
                          {m.phone && <span>{m.phone}</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-3 shrink-0 ml-3">
                      <button onClick={() => openEditFamily(m)}
                        className="text-xs text-blue-500 hover:text-blue-700 font-medium transition">Edit</button>
                      <button onClick={() => removeFamily(m.id)}
                        className="text-xs text-red-400 hover:text-red-600 transition">Remove</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {familyMembers.length === 0 && !showFamilyForm && (
          <p className="text-sm text-gray-400">No family members added yet.</p>
        )}

        {/* Add form */}
        {showFamilyForm && (
          <div className="border border-green-200 bg-green-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-medium text-green-800">Add family member</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label>
                <input value={familyForm.first_name} onChange={e => setFamilyForm(f => ({ ...f, first_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
                <input value={familyForm.last_name} onChange={e => setFamilyForm(f => ({ ...f, last_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Relationship</label>
                <select value={familyForm.relationship} onChange={e => setFamilyForm(f => ({ ...f, relationship: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                  {RELATIONSHIPS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Birthday *</label>
                <input type="date" value={familyForm.birthday} onChange={e => setFamilyForm(f => ({ ...f, birthday: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input type="email" value={familyForm.email} onChange={e => setFamilyForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input type="tel" value={familyForm.phone} onChange={e => setFamilyForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={addFamilyMember} disabled={savingFamily}
                className="bg-green-700 hover:bg-green-800 text-white font-semibold px-5 py-2 rounded-lg text-sm transition disabled:opacity-50">
                {savingFamily ? 'Adding…' : 'Add Family Member'}
              </button>
              <button onClick={() => { setShowFamilyForm(false); setFamilyForm(emptyFamilyForm) }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Membership info */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex gap-6 text-sm">
        <div><span className="text-gray-400">Role</span><br /><span className="font-medium text-gray-700 capitalize">{profile.role.replace('_', ' ')}</span></div>
        <div><span className="text-gray-400">Status</span><br /><span className="font-medium text-gray-700 capitalize">{profile.status}</span></div>
      </div>
    </div>
  )
}
