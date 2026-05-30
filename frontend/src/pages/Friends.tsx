import { useEffect, useState, useCallback } from 'react'
import { api } from '../api/client'

interface Friend {
  id: string; friend_user_id?: string; friend_name: string
  friend_email?: string; is_guest: boolean
}
interface MemberResult { id: string; first_name: string; last_name: string; email: string }

export default function Friends() {
  const [friends, setFriends] = useState<Friend[]>([])
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<MemberResult[]>([])
  const [showGuestForm, setShowGuestForm] = useState(false)
  const [guestForm, setGuestForm] = useState({ friend_name: '', friend_email: '' })
  const [searching, setSearching] = useState(false)

  const load = () => api.friends.list().then(d => setFriends(d as Friend[]))
  useEffect(() => { load() }, [])

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res = await api.friends.searchMembers(q) as MemberResult[]
      setResults(res)
    } finally { setSearching(false) }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => doSearch(search), 300)
    return () => clearTimeout(t)
  }, [search, doSearch])

  const addMember = async (id: string) => {
    await api.friends.addMember(id)
    setSearch(''); setResults([])
    load()
  }

  const addGuest = async (e: React.FormEvent) => {
    e.preventDefault()
    await api.friends.addGuest(guestForm)
    setGuestForm({ friend_name: '', friend_email: '' })
    setShowGuestForm(false)
    load()
  }

  const remove = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from your friends list?`)) return
    await api.friends.remove(id)
    load()
  }

  const alreadyFriend = (userId: string) => friends.some(f => f.friend_user_id === userId)

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">My Friends List</h1>
      <p className="text-sm text-gray-500 mb-6">Add players you regularly invite to matches — members or guests.</p>

      {/* Search members */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm mb-4">
        <h2 className="font-semibold text-gray-700 mb-3">Add a Club Member</h2>
        <div className="relative">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          {searching && <span className="absolute right-3 top-2.5 text-xs text-gray-400">Searching…</span>}
        </div>
        {results.length > 0 && (
          <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100">
            {results.map(m => (
              <div key={m.id} className="flex justify-between items-center px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-gray-800">{m.first_name} {m.last_name}</div>
                  <div className="text-xs text-gray-400">{m.email}</div>
                </div>
                {alreadyFriend(m.id) ? (
                  <span className="text-xs text-green-600 font-medium">✓ Added</span>
                ) : (
                  <button onClick={() => addMember(m.id)}
                    className="text-sm bg-green-700 text-white px-3 py-1 rounded-lg hover:bg-green-800 transition">
                    Add
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add guest */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm mb-6">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold text-gray-700">Add a Guest (Non-Member)</h2>
          <button onClick={() => setShowGuestForm(s => !s)}
            className="text-sm text-green-700 font-medium hover:underline">
            {showGuestForm ? 'Cancel' : '+ Add Guest'}
          </button>
        </div>
        {showGuestForm && (
          <form onSubmit={addGuest} className="mt-3 flex gap-3">
            <input value={guestForm.friend_name} onChange={e => setGuestForm(f => ({ ...f, friend_name: e.target.value }))}
              placeholder="Name" required
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            <input type="email" value={guestForm.friend_email} onChange={e => setGuestForm(f => ({ ...f, friend_email: e.target.value }))}
              placeholder="Email" required
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            <button type="submit"
              className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition">
              Add
            </button>
          </form>
        )}
      </div>

      {/* Friends list */}
      <h2 className="font-semibold text-gray-700 mb-3">
        My Players <span className="text-gray-400 font-normal text-sm">({friends.length})</span>
      </h2>
      {friends.length === 0 ? (
        <p className="text-gray-400 text-sm">No friends added yet. Search for members above or add a guest.</p>
      ) : (
        <div className="space-y-2">
          {friends.map(f => (
            <div key={f.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex justify-between items-center shadow-sm">
              <div>
                <div className="font-medium text-gray-800 flex items-center gap-2">
                  {f.friend_name}
                  {f.is_guest && (
                    <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-normal">Guest</span>
                  )}
                </div>
                {f.friend_email && <div className="text-xs text-gray-400">{f.friend_email}</div>}
              </div>
              <button onClick={() => remove(f.id, f.friend_name)}
                className="text-red-400 hover:text-red-600 text-xs font-medium transition">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
