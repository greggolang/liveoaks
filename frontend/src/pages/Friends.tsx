import { useEffect, useState, useCallback } from 'react'
import { parseDate } from '../utils/dates'
import { api } from '../api/client'
import HelpPanel from '../components/HelpPanel'

const HELP = [
  { heading: 'What is the Friends List?', body: 'Your friends list is a quick-select roster for inviting people to court bookings. Add fellow members or regular guests here so you can invite them in one tap instead of searching each time.' },
  { heading: 'Adding a Member', body: 'Search by name or email to find a club member and add them to your list. They appear as a blue entry. Their email is linked to their account, so booking invites go to them automatically.' },
  { heading: 'Adding a Guest', body: 'Guests are non-members you play with regularly. Enter their name (and optionally email) and they\'ll be saved as a green guest entry. A guest fee may apply when they play.' },
  { heading: 'Friend Groups', body: 'Create a named group (e.g. "Tuesday Doubles") to invite multiple people at once. Groups appear in the booking invite flow so you can invite the whole group in one click.' },
  { heading: 'Inviting to a Booking', body: 'Check the boxes next to the friends you want and click "Invite to Booking" — you\'ll be taken to your upcoming bookings so you can select which one to attach the invitation to.' },
]

interface Friend {
  id: string; friend_user_id?: string; friend_name: string
  friend_email?: string; is_guest: boolean; usta_ranking?: string
}
interface GroupMember { friend_id: string; friend_name: string; friend_email?: string; is_guest: boolean }
interface FriendGroup { id: string; name: string; members: GroupMember[] }
interface MemberResult { id: string; first_name: string; last_name: string; email: string; usta_ranking?: string }
interface FamilyMember { id: string; first_name: string; last_name: string; relationship: string; email?: string; linked_user_id?: string }
interface Booking { id: string; court: { name: string; number: number }; start_time: string; end_time: string; match_type?: string }

const USTA_RATINGS = ['2.5', '3.0', '3.5', '4.0', '4.5', '5.0']

function initials(name: string) {
  return name.split(' ').map(n => n[0] ?? '').join('').slice(0, 2).toUpperCase()
}
function avatarBg(name: string) {
  const palette = ['bg-blue-500','bg-emerald-500','bg-violet-500','bg-rose-500','bg-amber-500','bg-indigo-500','bg-cyan-500','bg-pink-500']
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % palette.length
  return palette[h]
}

export default function Friends() {
  const [friends, setFriends] = useState<Friend[]>([])
  const [groups, setGroups] = useState<FriendGroup[]>([])
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])

  // Search
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<MemberResult[]>([])
  const [searching, setSearching] = useState(false)
  const [ustaFilter, setUstaFilter] = useState('')
  const [searchChecked, setSearchChecked] = useState<Set<string>>(new Set())
  const [addingBulk, setAddingBulk] = useState(false)

  // Friends filter
  const [friendFilter, setFriendFilter] = useState('')
  const [ustaListFilter, setUstaListFilter] = useState('')

  // Guest form
  const [showGuestForm, setShowGuestForm] = useState(false)
  const [guestForm, setGuestForm] = useState({ friend_name: '', friend_email: '' })

  // Groups
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState('')
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [groupSearch, setGroupSearch] = useState('')
  const [groupSearchResults, setGroupSearchResults] = useState<MemberResult[]>([])
  const [groupSearching, setGroupSearching] = useState(false)

  // Multi-select & invite
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [inviteModal, setInviteModal] = useState(false)
  const [myBookings, setMyBookings] = useState<Booking[]>([])
  const [sendingInvite, setSendingInvite] = useState<string | null>(null)
  const [inviteResult, setInviteResult] = useState<{ sent: number; skipped: number } | null>(null)

  const loadFriends = () => api.friends.list().then(d => setFriends(d as Friend[]))
  const loadGroups = () => api.groups.list().then(d => setGroups(d as FriendGroup[]))
  const loadFamily = () => api.family.list().then(d => setFamilyMembers(d as FamilyMember[])).catch(() => {})
  useEffect(() => { loadFriends(); loadGroups(); loadFamily() }, [])

  // Member search with debounce
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

  const alreadyFriend = (userId: string) => friends.some(f => f.friend_user_id === userId)

  const addSingle = async (id: string) => {
    await api.friends.addMember(id)
    setSearch(''); setResults([]); setSearchChecked(new Set())
    loadFriends()
  }

  const addBulk = async () => {
    if (searchChecked.size === 0) return
    setAddingBulk(true)
    for (const id of searchChecked) {
      if (!alreadyFriend(id)) await api.friends.addMember(id).catch(() => {})
    }
    setSearch(''); setResults([]); setSearchChecked(new Set())
    setAddingBulk(false)
    loadFriends()
  }

  const toggleSearchCheck = (id: string) =>
    setSearchChecked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const addGuest = async (e: React.FormEvent) => {
    e.preventDefault()
    await api.friends.addGuest(guestForm)
    setGuestForm({ friend_name: '', friend_email: '' }); setShowGuestForm(false)
    loadFriends()
  }

  const removeFriend = async (id: string, name: string) => {
    if (!confirm(`Remove ${name}?`)) return
    await api.friends.remove(id)
    setSelected(s => { const n = new Set(s); n.delete(id); return n })
    loadFriends()
  }

  // Selection
  const toggleSelect = (id: string) =>
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selectNone = () => setSelected(new Set())
  const selectAll = () => setSelected(new Set(friends.map(f => f.id)))

  const groupFullySelected = (g: FriendGroup) =>
    g.members.length > 0 && g.members.every(m => selected.has(m.friend_id))

  const toggleGroup = (g: FriendGroup) => {
    if (groupFullySelected(g)) {
      setSelected(s => { const n = new Set(s); g.members.forEach(m => n.delete(m.friend_id)); return n })
    } else {
      setSelected(s => { const n = new Set(s); g.members.forEach(m => n.add(m.friend_id)); return n })
    }
  }

  // Invite
  const openInviteModal = async () => {
    setInviteResult(null); setSendingInvite(null)
    const bookings = await api.bookings.mine() as Booking[]
    setMyBookings(bookings); setInviteModal(true)
  }

  const sendInvites = async (bookingId: string) => {
    setSendingInvite(bookingId); setInviteResult(null)
    const toInvite = friends.filter(f => selected.has(f.id) && f.friend_email)
    let sent = 0, skipped = 0
    for (const f of toInvite) {
      try {
        await api.invitations.send(bookingId, { invitee_name: f.friend_name, invitee_email: f.friend_email, invitee_user_id: f.friend_user_id ?? null, is_guest: f.is_guest })
        sent++
      } catch { skipped++ }
    }
    skipped += friends.filter(f => selected.has(f.id) && !f.friend_email).length
    setSendingInvite(null); setInviteResult({ sent, skipped })
  }

  // Groups management
  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGroupName.trim()) return
    await api.groups.create(newGroupName.trim())
    setNewGroupName(''); setShowNewGroup(false); loadGroups()
  }
  const saveGroupName = async (id: string) => {
    if (!editingGroupName.trim()) return
    await api.groups.update(id, editingGroupName.trim())
    setEditingGroupId(null); loadGroups()
  }
  const deleteGroup = async (id: string, name: string) => {
    if (!confirm(`Delete group "${name}"?`)) return
    await api.groups.delete(id); loadGroups()
  }
  const toggleGroupMember = async (groupId: string, friendId: string, inGroup: boolean) => {
    if (inGroup) await api.groups.removeMember(groupId, friendId)
    else await api.groups.addMember(groupId, friendId)
    loadGroups()
  }
  const addMemberToGroup = async (groupId: string, userId: string) => {
    let friend = friends.find(f => f.friend_user_id === userId)
    if (!friend) {
      await api.friends.addMember(userId)
      const updated = await api.friends.list() as Friend[]
      setFriends(updated)
      friend = updated.find(f => f.friend_user_id === userId)
    }
    if (friend) await api.groups.addMember(groupId, friend.id)
    setGroupSearch(''); setGroupSearchResults([]); loadGroups()
  }
  const searchGroupMembers = async (q: string) => {
    setGroupSearch(q)
    if (q.length < 2) { setGroupSearchResults([]); return }
    setGroupSearching(true)
    try { setGroupSearchResults(await api.friends.searchMembers(q) as MemberResult[]) }
    finally { setGroupSearching(false) }
  }

  // Filtered friends
  const filteredFriends = friends.filter(f => {
    if (ustaListFilter && f.usta_ranking !== ustaListFilter) return false
    if (friendFilter) {
      const q = friendFilter.toLowerCase()
      return f.friend_name.toLowerCase().includes(q) || (f.friend_email ?? '').toLowerCase().includes(q)
    }
    return true
  })

  const selectedFriends = friends.filter(f => selected.has(f.id))
  const withEmail = selectedFriends.filter(f => f.friend_email)

  const matchLabel = (t?: string) => t === 'singles' ? 'Singles' : t === 'doubles' ? 'Doubles' : t === 'teaching_pro' ? 'Teaching Pro' : t === 'casual' ? 'Hit Session' : ''

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">My Friends List</h1>
        <p className="text-sm text-gray-500 mt-0.5">Select players to invite them to a court booking.</p>
        <div className="mt-3"><HelpPanel items={HELP} /></div>
      </div>

      {/* Sticky selection bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-30 mb-5 bg-green-700 text-white rounded-2xl px-5 py-3 shadow-xl">
          <div className="flex items-center gap-4">
            <div>
              <span className="font-semibold text-sm">
                {selected.size} player{selected.size !== 1 ? 's' : ''} selected
              </span>
              {selected.size !== withEmail.length && (
                <span className="text-green-300 text-xs ml-2">({withEmail.length} can be invited)</span>
              )}
            </div>
            <div className="h-4 w-px bg-green-500" />
            <button onClick={openInviteModal}
              className="bg-white text-green-800 text-sm font-bold px-4 py-1.5 rounded-xl hover:bg-green-50 transition">
              Invite to Booking →
            </button>
            <button onClick={selectNone} className="text-green-300 hover:text-white text-xs ml-auto transition">
              ✕ Clear
            </button>
          </div>
          {selectedFriends.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-green-600">
              {selectedFriends.map(f => (
                <button key={f.id} onClick={() => toggleSelect(f.id)}
                  className="text-xs bg-green-600 hover:bg-green-500 text-white px-2 py-0.5 rounded-full transition flex items-center gap-1">
                  {f.friend_name.split(' ')[0]}
                  <span className="opacity-60">×</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search + Add */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 mb-6">
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-56">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
            <input value={search} onChange={e => { setSearch(e.target.value); setSearchChecked(new Set()) }}
              placeholder="Search members by name or email…"
              className="w-full border border-gray-300 rounded-xl pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <select value={ustaFilter} onChange={e => setUstaFilter(e.target.value)}
            className="border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500">
            <option value="">Any USTA</option>
            {USTA_RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={() => { setShowGuestForm(s => !s) }}
            className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition font-medium">
            + Add Guest
          </button>
        </div>

        {/* Search results with multi-select */}
        {(results.length > 0 || searching) && (
          <div className="mt-3 border border-gray-200 rounded-xl overflow-hidden">
            {searching ? (
              <p className="px-4 py-3 text-sm text-gray-400">Searching…</p>
            ) : (
              <>
                {searchChecked.size > 0 && (
                  <div className="flex items-center justify-between px-4 py-2 bg-green-50 border-b border-green-100">
                    <span className="text-sm text-green-700 font-medium">{searchChecked.size} selected</span>
                    <button onClick={addBulk} disabled={addingBulk}
                      className="bg-green-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green-800 transition disabled:opacity-50">
                      {addingBulk ? 'Adding…' : `Add ${searchChecked.size} to My List`}
                    </button>
                  </div>
                )}
                <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {results.map(m => {
                    const already = alreadyFriend(m.id)
                    const checked = searchChecked.has(m.id)
                    return (
                      <div key={m.id} onClick={() => !already && toggleSearchCheck(m.id)}
                        className={`flex items-center gap-3 px-4 py-3 transition ${already ? 'opacity-60' : 'cursor-pointer hover:bg-gray-50'} ${checked ? 'bg-green-50' : ''}`}>
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition ${checked ? 'bg-green-600 border-green-600' : already ? 'bg-gray-200 border-gray-200' : 'border-gray-300'}`}>
                          {(checked || already) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                        </div>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${avatarBg(m.first_name + ' ' + m.last_name)}`}>
                          {initials(m.first_name + ' ' + m.last_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800 flex items-center gap-2">
                            {m.first_name} {m.last_name}
                            {m.usta_ranking && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{m.usta_ranking}</span>}
                          </div>
                          <div className="text-xs text-gray-400 truncate">{m.email}</div>
                        </div>
                        {already ? (
                          <span className="text-xs text-green-600 font-medium shrink-0">✓ Added</span>
                        ) : (
                          <button onClick={e => { e.stopPropagation(); addSingle(m.id) }}
                            className="text-xs bg-green-700 text-white px-3 py-1.5 rounded-lg hover:bg-green-800 transition shrink-0">
                            Add
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Guest form */}
        {showGuestForm && (
          <form onSubmit={addGuest} className="mt-3 flex gap-2 flex-wrap">
            <input value={guestForm.friend_name} onChange={e => setGuestForm(f => ({ ...f, friend_name: e.target.value }))}
              placeholder="Guest name *" required
              className="flex-1 min-w-40 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            <input type="email" value={guestForm.friend_email} onChange={e => setGuestForm(f => ({ ...f, friend_email: e.target.value }))}
              placeholder="Email *" required
              className="flex-1 min-w-40 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            <button type="submit" className="bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-800 transition">Add Guest</button>
            <button type="button" onClick={() => setShowGuestForm(false)} className="px-3 py-2 text-sm text-gray-400 hover:text-gray-600">Cancel</button>
          </form>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── My Players (left, wider) ── */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-semibold text-gray-800">
              My Players <span className="text-gray-400 font-normal text-sm ml-1">({friends.length})</span>
            </h2>
            <div className="flex items-center gap-3 text-xs">
              {selected.size > 0
                ? <button onClick={selectNone} className="text-gray-400 hover:text-gray-600">Clear selection</button>
                : <button onClick={selectAll} className="text-green-700 hover:underline font-medium">Select all</button>}
            </div>
          </div>

          {/* Filter bar */}
          {friends.length > 4 && (
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <input value={friendFilter} onChange={e => setFriendFilter(e.target.value)}
                  placeholder="Filter by name…"
                  className="w-full border border-gray-200 rounded-lg pl-3 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-400" />
              </div>
              <select value={ustaListFilter} onChange={e => setUstaListFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-400">
                <option value="">All ratings</option>
                {USTA_RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}

          {friends.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-8 text-center text-gray-400 text-sm">
              Search for members above to start building your list.
            </div>
          ) : filteredFriends.length === 0 ? (
            <p className="text-sm text-gray-400">No players match your filter.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredFriends.map(f => {
                const isSelected = selected.has(f.id)
                return (
                  <div key={f.id} onClick={() => toggleSelect(f.id)}
                    className={`relative bg-white border rounded-xl p-3.5 flex items-center gap-3 cursor-pointer transition group
                      ${isSelected ? 'border-green-400 ring-1 ring-green-400 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    {/* Checkbox */}
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition ${isSelected ? 'bg-green-600 border-green-600' : 'border-gray-300 group-hover:border-green-400'}`}>
                      {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                    </div>
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${avatarBg(f.friend_name)}`}>
                      {initials(f.friend_name)}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate flex items-center gap-1.5">
                        {f.friend_name}
                        {f.is_guest && <span className="text-xs bg-orange-100 text-orange-600 px-1 py-0.5 rounded font-normal shrink-0">G</span>}
                        {!f.friend_email && <span className="text-xs text-gray-300 shrink-0">·</span>}
                      </div>
                      {f.friend_email && <div className="text-xs text-gray-400 truncate">{f.friend_email}</div>}
                      {f.usta_ranking && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{f.usta_ranking}</span>
                      )}
                    </div>
                    {/* Remove */}
                    <button onClick={e => { e.stopPropagation(); removeFriend(f.id, f.friend_name) }}
                      className="shrink-0 text-gray-200 hover:text-red-500 transition opacity-0 group-hover:opacity-100 text-sm leading-none">
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Groups (right, narrower) ── */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-gray-800">
                Groups <span className="text-gray-400 font-normal text-sm ml-1">({groups.length})</span>
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Click member names to select individually</p>
            </div>
            <button onClick={() => { setShowNewGroup(s => !s); setNewGroupName('') }}
              className="text-sm text-green-700 font-medium hover:underline">
              {showNewGroup ? 'Cancel' : '+ New Group'}
            </button>
          </div>

          {showNewGroup && (
            <form onSubmit={createGroup} className="flex gap-2 mb-3">
              <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                placeholder="Group name…" autoFocus required
                className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <button type="submit" className="bg-green-700 text-white px-3 py-2 rounded-xl text-sm font-medium hover:bg-green-800 transition">Create</button>
            </form>
          )}

          {groups.length === 0 && !showNewGroup && (
            <p className="text-sm text-gray-400">No groups yet. Create one to select a whole group at once.</p>
          )}

          <div className="space-y-2">
            {groups.map(g => {
              const isExpanded = expandedGroup === g.id
              const isEditingName = editingGroupId === g.id
              const fullySelected = groupFullySelected(g)
              const partiallySelected = !fullySelected && g.members.some(m => selected.has(m.friend_id))
              const selectedInGroup = g.members.filter(m => selected.has(m.friend_id)).length

              return (
                <div key={g.id} className={`bg-white border rounded-2xl overflow-hidden transition
                  ${fullySelected ? 'border-green-400 ring-1 ring-green-300' : partiallySelected ? 'border-green-200' : 'border-gray-200'}`}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Group select checkbox */}
                    {!isEditingName && (
                      <button onClick={() => toggleGroup(g)}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition
                          ${fullySelected ? 'bg-green-600 border-green-600' : partiallySelected ? 'border-green-400' : 'border-gray-300 hover:border-green-400'}`}>
                        {fullySelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                        {partiallySelected && !fullySelected && <div className="w-2 h-0.5 bg-green-500 rounded" />}
                      </button>
                    )}

                    <div className="flex-1 min-w-0">
                      {isEditingName ? (
                        <form onSubmit={e => { e.preventDefault(); saveGroupName(g.id) }} className="flex gap-2">
                          <input value={editingGroupName} onChange={e => setEditingGroupName(e.target.value)} autoFocus
                            className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                          <button type="submit" className="text-xs text-green-700 font-medium">Save</button>
                          <button type="button" onClick={() => setEditingGroupId(null)} className="text-xs text-gray-400">Cancel</button>
                        </form>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-800 text-sm">{g.name}</span>
                          <span className="text-xs text-gray-400">{g.members.length} player{g.members.length !== 1 ? 's' : ''}</span>
                          {selectedInGroup > 0 && (
                            <span className="text-xs bg-green-100 text-green-700 font-semibold px-1.5 py-0.5 rounded-full">
                              {selectedInGroup}/{g.members.length} selected
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {!isEditingName && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => { setEditingGroupId(g.id); setEditingGroupName(g.name) }}
                          className="text-xs text-gray-400 hover:text-gray-600">Rename</button>
                        <button onClick={() => deleteGroup(g.id, g.name)}
                          className="text-xs text-red-400 hover:text-red-600">Delete</button>
                        <button onClick={() => { setExpandedGroup(isExpanded ? null : g.id); setGroupSearch(''); setGroupSearchResults([]) }}
                          className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded-lg font-medium transition">
                          {isExpanded ? 'Done' : 'Edit'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Member chips (collapsed view) — click to select individually */}
                  {!isExpanded && g.members.length > 0 && (
                    <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                      {g.members.map(m => {
                        const chipSelected = selected.has(m.friend_id)
                        return (
                          <button key={m.friend_id}
                            onClick={() => toggleSelect(m.friend_id)}
                            title={m.friend_name}
                            className={`text-xs px-2.5 py-1 rounded-full border font-medium transition cursor-pointer
                              ${chipSelected
                                ? 'bg-green-600 text-white border-green-600 shadow-sm'
                                : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-green-400 hover:bg-green-50 hover:text-green-700'}`}>
                            {chipSelected && <span className="mr-1">✓</span>}
                            {m.friend_name.split(' ')[0]}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Expanded edit panel */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-3">
                      {/* Search to add */}
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1.5">Add a club member:</p>
                        <div className="relative">
                          <input value={groupSearch} onChange={e => searchGroupMembers(e.target.value)}
                            placeholder="Search name or email…"
                            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                          {groupSearching && <span className="absolute right-3 top-2 text-xs text-gray-400">…</span>}
                        </div>
                        {groupSearchResults.length > 0 && (
                          <div className="mt-1 border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white max-h-36 overflow-y-auto">
                            {groupSearchResults.map(m => {
                              const inGroup = g.members.some(gm => friends.find(fr => fr.id === gm.friend_id)?.friend_user_id === m.id)
                              return (
                                <div key={m.id} className="flex items-center justify-between px-3 py-2">
                                  <div className="min-w-0">
                                    <div className="text-xs font-medium text-gray-800 truncate">{m.first_name} {m.last_name}</div>
                                    <div className="text-xs text-gray-400 truncate">{m.email}</div>
                                  </div>
                                  {inGroup
                                    ? <span className="text-xs text-green-600 shrink-0">✓ In group</span>
                                    : <button onClick={() => addMemberToGroup(g.id, m.id)} className="text-xs bg-green-700 text-white px-2 py-1 rounded-lg hover:bg-green-800 transition shrink-0">Add</button>}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* Existing friends checklist */}
                      {friends.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1.5">From your friends list:</p>
                          <div className="space-y-1 max-h-48 overflow-y-auto pr-0.5">
                            {friends.map(f => {
                              const inGroup = g.members.some(m => m.friend_id === f.id)
                              return (
                                <label key={f.id} className="flex items-center gap-2.5 cursor-pointer group py-0.5">
                                  <input type="checkbox" checked={inGroup}
                                    onChange={() => toggleGroupMember(g.id, f.id, inGroup)}
                                    className="w-3.5 h-3.5 rounded accent-green-600" />
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${avatarBg(f.friend_name)}`}>
                                    {initials(f.friend_name)}
                                  </div>
                                  <span className="text-xs text-gray-700 truncate group-hover:text-gray-900">
                                    {f.friend_name}
                                    {f.is_guest && <span className="ml-1 text-orange-400">(G)</span>}
                                  </span>
                                  {f.usta_ranking && <span className="text-xs bg-blue-100 text-blue-700 px-1 py-0.5 rounded shrink-0">{f.usta_ranking}</span>}
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Family members */}
                      {familyMembers.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1.5">Family members:</p>
                          <div className="space-y-1">
                            {familyMembers.map(fm => {
                              const name = `${fm.first_name} ${fm.last_name}`
                              const friendEntry = friends.find(f => (fm.linked_user_id && f.friend_user_id === fm.linked_user_id) || f.friend_name === name)
                              const inGroup = friendEntry ? g.members.some(m => m.friend_id === friendEntry.id) : false
                              return (
                                <label key={fm.id} className="flex items-center gap-2.5 cursor-pointer group py-0.5">
                                  <input type="checkbox" checked={inGroup}
                                    onChange={async () => {
                                      if (inGroup && friendEntry) {
                                        await api.groups.removeMember(g.id, friendEntry.id); loadGroups()
                                      } else {
                                        const result = await api.friends.addFromFamily(fm.id) as { id: string }
                                        await api.groups.addMember(g.id, result.id)
                                        await loadFriends(); loadGroups()
                                      }
                                    }}
                                    className="w-3.5 h-3.5 rounded accent-green-600" />
                                  <span className="text-xs text-gray-700 group-hover:text-gray-900">
                                    {name} <span className="text-purple-400 capitalize">({fm.relationship})</span>
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Invite modal */}
      {inviteModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Invite to a Booking</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {withEmail.length} player{withEmail.length !== 1 ? 's' : ''} will receive an invitation.
                </p>
              </div>
              <button onClick={() => { setInviteModal(false); setInviteResult(null) }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {selectedFriends.map(f => (
                <span key={f.id} className={`text-xs px-2 py-0.5 rounded-full ${f.friend_email ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400 line-through'}`}>
                  {f.friend_name}
                </span>
              ))}
            </div>

            {inviteResult ? (
              <div className="space-y-3">
                <div className={`rounded-xl p-4 text-sm ${inviteResult.sent > 0 ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-600'}`}>
                  {inviteResult.sent > 0 && <p className="font-medium">✓ {inviteResult.sent} invitation{inviteResult.sent !== 1 ? 's' : ''} sent!</p>}
                  {inviteResult.skipped > 0 && <p className="text-amber-600 mt-1 text-xs">⚠ {inviteResult.skipped} skipped (already invited, no email, or not eligible)</p>}
                </div>
                <button onClick={() => { setInviteModal(false); setInviteResult(null); setSelected(new Set()) }}
                  className="w-full bg-green-700 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-green-800 transition">
                  Done
                </button>
              </div>
            ) : myBookings.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No upcoming bookings. Book a court first.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {myBookings.map(b => {
                  const start = parseDate(b.start_time)
                  const end = parseDate(b.end_time)
                  const isSending = sendingInvite === b.id
                  return (
                    <div key={b.id} className={`border rounded-xl p-3 transition ${isSending ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                            Court {b.court.number} — {b.court.name}
                            {matchLabel(b.match_type) && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-normal">{matchLabel(b.match_type)}</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            {' · '}
                            {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            {' – '}
                            {end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </div>
                        </div>
                        <button disabled={!!sendingInvite}
                          onClick={() => sendInvites(b.id)}
                          className="bg-green-700 hover:bg-green-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50 shrink-0">
                          {isSending ? 'Sending…' : 'Invite'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
