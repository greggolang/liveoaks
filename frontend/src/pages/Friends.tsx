import { useEffect, useState, useCallback } from 'react'
import { api } from '../api/client'

interface Friend {
  id: string; friend_user_id?: string; friend_name: string
  friend_email?: string; is_guest: boolean; usta_ranking?: string
}
interface GroupMember {
  friend_id: string; friend_name: string; friend_email?: string; is_guest: boolean
}
interface FriendGroup {
  id: string; name: string; members: GroupMember[]
}
interface MemberResult { id: string; first_name: string; last_name: string; email: string; usta_ranking?: string }

const USTA_RATINGS = ['2.5', '3.0', '3.5', '4.0', '4.5', '5.0']

export default function Friends() {
  const [friends, setFriends] = useState<Friend[]>([])
  const [groups, setGroups] = useState<FriendGroup[]>([])
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<MemberResult[]>([])
  const [showGuestForm, setShowGuestForm] = useState(false)
  const [guestForm, setGuestForm] = useState({ friend_name: '', friend_email: '' })
  const [searching, setSearching] = useState(false)
  const [ustaFilter, setUstaFilter] = useState('')

  // Group state
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState('')
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [groupUstaFilter, setGroupUstaFilter] = useState('')
  const [groupSearch, setGroupSearch] = useState('')
  const [groupSearchResults, setGroupSearchResults] = useState<MemberResult[]>([])
  const [groupSearching, setGroupSearching] = useState(false)

  const loadFriends = () => api.friends.list().then(d => setFriends(d as Friend[]))
  const loadGroups = () => api.groups.list().then(d => setGroups(d as FriendGroup[]))

  useEffect(() => { loadFriends(); loadGroups() }, [])

  const doSearch = useCallback(async (q: string, usta: string) => {
    if (q.length < 2 && !usta) { setResults([]); return }
    setSearching(true)
    try { setResults(await api.friends.searchMembers(q, usta || undefined) as MemberResult[]) }
    finally { setSearching(false) }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => doSearch(search, ustaFilter), 300)
    return () => clearTimeout(t)
  }, [search, ustaFilter, doSearch])

  const addMember = async (id: string) => {
    await api.friends.addMember(id)
    setSearch(''); setResults([])
    loadFriends()
  }

  const addGuest = async (e: React.FormEvent) => {
    e.preventDefault()
    await api.friends.addGuest(guestForm)
    setGuestForm({ friend_name: '', friend_email: '' })
    setShowGuestForm(false)
    loadFriends()
  }

  const removeFriend = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from your friends list?`)) return
    await api.friends.remove(id)
    loadFriends()
  }

  const alreadyFriend = (userId: string) => friends.some(f => f.friend_user_id === userId)

  // Groups
  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGroupName.trim()) return
    await api.groups.create(newGroupName.trim())
    setNewGroupName(''); setShowNewGroup(false)
    loadGroups()
  }

  const saveGroupName = async (id: string) => {
    if (!editingGroupName.trim()) return
    await api.groups.update(id, editingGroupName.trim())
    setEditingGroupId(null)
    loadGroups()
  }

  const deleteGroup = async (id: string, name: string) => {
    if (!confirm(`Delete group "${name}"?`)) return
    await api.groups.delete(id)
    loadGroups()
  }

  const toggleGroupMember = async (groupId: string, friendId: string, inGroup: boolean) => {
    if (inGroup) {
      await api.groups.removeMember(groupId, friendId)
    } else {
      await api.groups.addMember(groupId, friendId)
    }
    loadGroups()
  }

  const searchGroupMembers = async (q: string) => {
    setGroupSearch(q)
    if (q.length < 2) { setGroupSearchResults([]); return }
    setGroupSearching(true)
    try { setGroupSearchResults(await api.friends.searchMembers(q) as MemberResult[]) }
    finally { setGroupSearching(false) }
  }

  const addMemberToGroup = async (groupId: string, userId: string) => {
    // Find existing friend record, or add as friend first
    let friend = friends.find(f => f.friend_user_id === userId)
    if (!friend) {
      await api.friends.addMember(userId)
      const updated = await api.friends.list() as Friend[]
      setFriends(updated)
      friend = updated.find(f => f.friend_user_id === userId)
    }
    if (friend) await api.groups.addMember(groupId, friend.id)
    setGroupSearch(''); setGroupSearchResults([])
    loadGroups()
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-1">My Friends List</h1>
        <p className="text-sm text-gray-500">Add players you regularly invite to matches — members or guests.</p>
      </div>

      {/* Search members */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-3">Add a Club Member</h2>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            {searching && <span className="absolute right-3 top-2.5 text-xs text-gray-400">Searching…</span>}
          </div>
          <select value={ustaFilter} onChange={e => setUstaFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white text-gray-600">
            <option value="">Any USTA</option>
            {USTA_RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {results.length > 0 && (
          <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100">
            {results.map(m => (
              <div key={m.id} className="flex justify-between items-center px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-gray-800 flex items-center gap-2">
                    {m.first_name} {m.last_name}
                    {m.usta_ranking && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                        {m.usta_ranking}
                      </span>
                    )}
                  </div>
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
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
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
      <div>
        <h2 className="font-semibold text-gray-700 mb-3">
          My Players <span className="text-gray-400 font-normal text-sm">({friends.length})</span>
        </h2>
        {friends.length === 0 ? (
          <p className="text-gray-400 text-sm">No friends added yet.</p>
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
                <button onClick={() => removeFriend(f.id, f.friend_name)}
                  className="text-red-400 hover:text-red-600 text-xs font-medium transition">
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Groups */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-700">
            Groups <span className="text-gray-400 font-normal text-sm">({groups.length})</span>
          </h2>
          <button onClick={() => { setShowNewGroup(s => !s); setNewGroupName('') }}
            className="text-sm text-green-700 font-medium hover:underline">
            {showNewGroup ? 'Cancel' : '+ New Group'}
          </button>
        </div>

        {showNewGroup && (
          <form onSubmit={createGroup} className="flex gap-2 mb-4">
            <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
              placeholder="Group name (e.g. Monday Group)"
              autoFocus required
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            <button type="submit"
              className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition">
              Create
            </button>
          </form>
        )}

        {groups.length === 0 && !showNewGroup && (
          <p className="text-gray-400 text-sm">No groups yet. Create one to quickly invite your regular players.</p>
        )}

        <div className="space-y-3">
          {groups.map(g => {
            const isExpanded = expandedGroup === g.id
            const isEditingName = editingGroupId === g.id
            return (
              <div key={g.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                {/* Group header */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {isEditingName ? (
                      <form onSubmit={e => { e.preventDefault(); saveGroupName(g.id) }} className="flex gap-2 flex-1">
                        <input value={editingGroupName} onChange={e => setEditingGroupName(e.target.value)}
                          autoFocus
                          className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                        <button type="submit" className="text-xs text-green-700 font-medium">Save</button>
                        <button type="button" onClick={() => setEditingGroupId(null)} className="text-xs text-gray-400">Cancel</button>
                      </form>
                    ) : (
                      <>
                        <span className="font-medium text-gray-800">{g.name}</span>
                        <span className="text-xs text-gray-400">{g.members.length} player{g.members.length !== 1 ? 's' : ''}</span>
                      </>
                    )}
                  </div>
                  {!isEditingName && (
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={() => { setEditingGroupId(g.id); setEditingGroupName(g.name) }}
                        className="text-xs text-gray-400 hover:text-gray-600">Rename</button>
                      <button onClick={() => deleteGroup(g.id, g.name)}
                        className="text-xs text-red-400 hover:text-red-600">Delete</button>
                      <button onClick={() => { setExpandedGroup(isExpanded ? null : g.id); setGroupUstaFilter(''); setGroupSearch(''); setGroupSearchResults([]) }}
                        className="text-xs text-green-700 font-medium hover:underline">
                        {isExpanded ? 'Done' : 'Edit Players'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Member list (compact, always visible) */}
                {!isExpanded && g.members.length > 0 && (
                  <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                    {g.members.map(m => (
                      <span key={m.friend_id}
                        className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                        {m.friend_name}
                        {m.is_guest && <span className="ml-1 opacity-60">(G)</span>}
                      </span>
                    ))}
                  </div>
                )}

                {/* Expanded: toggle friends in/out + search all members */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
                    {/* Member search */}
                    <div>
                      <p className="text-xs text-gray-500 mb-1.5">Search any club member to add:</p>
                      <div className="relative">
                        <input
                          value={groupSearch}
                          onChange={e => searchGroupMembers(e.target.value)}
                          placeholder="Search by name or email…"
                          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                        />
                        {groupSearching && <span className="absolute right-3 top-2 text-xs text-gray-400">Searching…</span>}
                      </div>
                      {groupSearchResults.length > 0 && (
                        <div className="mt-1 border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white max-h-48 overflow-y-auto">
                          {groupSearchResults.map(m => {
                            const inGroup = g.members.some(gm => {
                              const f = friends.find(fr => fr.id === gm.friend_id)
                              return f?.friend_user_id === m.id
                            })
                            return (
                              <div key={m.id} className="flex items-center justify-between px-3 py-2">
                                <div>
                                  <div className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                                    {m.first_name} {m.last_name}
                                    {m.usta_ranking && (
                                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{m.usta_ranking}</span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-400">{m.email}</div>
                                </div>
                                {inGroup ? (
                                  <span className="text-xs text-green-600 font-medium">✓ In group</span>
                                ) : (
                                  <button onClick={() => addMemberToGroup(g.id, m.id)}
                                    className="text-xs bg-green-700 text-white px-3 py-1 rounded-lg hover:bg-green-800 transition">
                                    Add
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Existing friends checklist */}
                    <div>
                      <div className="flex items-center justify-between mb-2 gap-3">
                        <p className="text-xs text-gray-500">Or check from your friends list:</p>
                        <select value={groupUstaFilter} onChange={e => setGroupUstaFilter(e.target.value)}
                          className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-green-500">
                          <option value="">All ratings</option>
                          {USTA_RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      {friends.length === 0 ? (
                        <p className="text-xs text-gray-400">No friends saved yet.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {friends
                            .filter(f => !groupUstaFilter || f.usta_ranking === groupUstaFilter)
                            .map(f => {
                            const inGroup = g.members.some(m => m.friend_id === f.id)
                            return (
                              <label key={f.id} className="flex items-center gap-2.5 cursor-pointer group">
                                <input type="checkbox" checked={inGroup}
                                  onChange={() => toggleGroupMember(g.id, f.id, inGroup)}
                                  className="w-4 h-4 rounded accent-green-600" />
                                <span className="text-sm text-gray-700 group-hover:text-gray-900">
                                  {f.friend_name}
                                  {f.is_guest && <span className="ml-1.5 text-xs text-orange-500">(Guest)</span>}
                                </span>
                                {f.usta_ranking && (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{f.usta_ranking}</span>
                                )}
                                {f.friend_email && (
                                  <span className="text-xs text-gray-400">{f.friend_email}</span>
                                )}
                              </label>
                            )
                          })}
                          {friends.filter(f => !groupUstaFilter || f.usta_ranking === groupUstaFilter).length === 0 && (
                            <p className="text-xs text-gray-400 italic">No friends with that rating.</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
