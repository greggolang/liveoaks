import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface UserProfile {
  first_name: string; last_name: string; email: string
  phone?: string; address?: string; family?: string; role: string; status: string
}

export default function Profile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', address: '', family: '' })
  const [pwForm, setPwForm] = useState({ current: '', new: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [savingPw, setSavingPw] = useState(false)
  const [msg, setMsg] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [pwError, setPwError] = useState('')

  useEffect(() => {
    api.auth.me().then(d => {
      const p = d as UserProfile
      setProfile(p)
      setForm({
        first_name: p.first_name,
        last_name: p.last_name,
        phone: p.phone ?? '',
        address: p.address ?? '',
        family: p.family ?? '',
      })
    })
  }, [])

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
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
    if (pwForm.new !== pwForm.confirm) {
      setPwError('New passwords do not match.')
      return
    }
    if (pwForm.new.length < 8) {
      setPwError('Password must be at least 8 characters.')
      return
    }
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
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">My Profile</h1>

      {/* Profile form */}
      <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6 space-y-4">
        <h2 className="font-semibold text-gray-800">Personal Information</h2>

        <div className="grid grid-cols-2 gap-4">
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
          <label className="block text-xs font-medium text-gray-600 mb-1">Family Members</label>
          <textarea value={form.family} onChange={set('family')} rows={2}
            placeholder="e.g. Jennifer (spouse), Tim (son), Sarah (daughter)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
          <p className="text-xs text-gray-400 mt-1">Family members shown in the member directory.</p>
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
        <div className="grid grid-cols-2 gap-4">
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

      {/* Read-only membership info */}
      <div className="mt-6 bg-gray-50 border border-gray-200 rounded-xl p-4 flex gap-6 text-sm">
        <div><span className="text-gray-400">Role</span><br /><span className="font-medium text-gray-700 capitalize">{profile.role.replace('_', ' ')}</span></div>
        <div><span className="text-gray-400">Status</span><br /><span className="font-medium text-gray-700 capitalize">{profile.status}</span></div>
      </div>
    </div>
  )
}
