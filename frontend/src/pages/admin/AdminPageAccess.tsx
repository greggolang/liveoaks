import { useEffect, useState, useRef } from 'react'
import { api, DocFolder } from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'

// Pages that can be toggled. Keys must match the page_permissions keys the app
// checks via hasPermission() (which drives the dashboard menu).
const PAGE_GROUPS: { group: string; items: { key: string; label: string }[] }[] = [
  {
    group: 'Dashboard menu', items: [
      { key: 'bookings', label: 'Book a Court' },
      { key: 'events', label: 'Events' },
      { key: 'pro_shop', label: 'Pro Shop' },
      { key: 'directory', label: 'Directory' },
      { key: 'friends', label: 'Friends' },
      { key: 'documents', label: 'Files' },
      { key: 'fantasy', label: 'Fantasy Pool' },
      { key: 'ladder', label: 'Ladder' },
    ],
  },
  {
    group: 'Other features', items: [
      { key: 'court_grid', label: 'Court Grid' },
      { key: 'announcements', label: 'Announcements' },
      { key: 'photos', label: 'Photos' },
      { key: 'usta_teams', label: 'USTA Teams' },
      { key: 'guests', label: 'Guest Passes' },
      { key: 'dues', label: 'My Dues' },
      { key: 'club_info', label: 'Club Info' },
    ],
  },
]

const ROLES = [
  { key: 'member', label: 'Member' },
  { key: 'president', label: 'President' },
  { key: 'vice_president', label: 'Vice President' },
  { key: 'secretary', label: 'Secretary' },
  { key: 'treasurer', label: 'Treasurer' },
  { key: 'billing', label: 'Billing' },
  { key: 'membership', label: 'Membership' },
  { key: 'entertainment', label: 'Entertainment' },
  { key: 'house_grounds', label: 'House & Grounds' },
  { key: 'usta', label: 'USTA' },
  { key: 'games', label: 'Games' },
  { key: 'pro', label: 'Pro' },
]

interface Member { id: string; first_name: string; last_name: string; email: string }

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition disabled:opacity-50 ${on ? 'bg-green-600' : 'bg-gray-300'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

export default function AdminPageAccess() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState<'role' | 'member' | 'files'>('role')

  // ── By role ──
  const [perms, setPerms] = useState<Record<string, Set<string>>>({})
  const [permsLoading, setPermsLoading] = useState(true)
  const [selectedRole, setSelectedRole] = useState('member')
  const [busy, setBusy] = useState<string | null>(null)

  async function loadPerms() {
    setPermsLoading(true)
    try {
      const data = await api.permissions.getAll()
      const map: Record<string, Set<string>> = {}
      for (const [page, roles] of Object.entries(data)) map[page] = new Set(roles)
      setPerms(map)
    } finally { setPermsLoading(false) }
  }
  useEffect(() => { loadPerms() }, [])

  async function toggleRole(page: string, role: string) {
    const has = perms[page]?.has(role) ?? false
    setBusy(`${page}:${role}`)
    try {
      await api.permissions.toggle(page, role, !has)
      setPerms(prev => {
        const next = { ...prev, [page]: new Set(prev[page] ?? []) }
        if (has) next[page].delete(role); else next[page].add(role)
        return next
      })
    } finally { setBusy(null) }
  }

  // ── By member ──
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Member[]>([])
  const [searching, setSearching] = useState(false)
  const [member, setMember] = useState<Member | null>(null)
  const [up, setUp] = useState<{ role: string; role_pages: string[]; overrides: Record<string, boolean> } | null>(null)
  const [upLoading, setUpLoading] = useState(false)
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current)
    if (search.length < 2) { setResults([]); return }
    searchRef.current = setTimeout(async () => {
      setSearching(true)
      try { setResults(await api.friends.searchMembers(search) as Member[]) }
      finally { setSearching(false) }
    }, 300)
    return () => { if (searchRef.current) clearTimeout(searchRef.current) }
  }, [search])

  async function pickMember(m: Member) {
    setMember(m); setResults([]); setSearch(`${m.first_name} ${m.last_name}`); setUpLoading(true)
    try { setUp(await api.permissions.userPerms(m.id)) }
    finally { setUpLoading(false) }
  }

  async function setMemberState(page: string, state: 'on' | 'off' | 'inherit') {
    if (!member) return
    setBusy(`m:${page}`)
    try {
      await api.permissions.setUserPerm(member.id, page, state)
      setUp(prev => {
        if (!prev) return prev
        const overrides = { ...prev.overrides }
        if (state === 'inherit') delete overrides[page]
        else overrides[page] = state === 'on'
        return { ...prev, overrides }
      })
    } finally { setBusy(null) }
  }

  // ── Files ──
  const [folders, setFolders] = useState<DocFolder[]>([])
  const [foldersLoading, setFoldersLoading] = useState(false)

  async function loadFolders() {
    setFoldersLoading(true)
    try { setFolders(await api.documents.folders.adminList()) }
    catch { setFolders([]) }
    finally { setFoldersLoading(false) }
  }
  useEffect(() => { if (tab === 'files' && folders.length === 0) loadFolders() }, [tab])

  function flatten(list: DocFolder[], depth = 0): { f: DocFolder; depth: number }[] {
    return list.flatMap(f => [{ f, depth }, ...flatten(f.children ?? [], depth + 1)])
  }
  function applyRoles(list: DocFolder[], id: string, roles: string[]): DocFolder[] {
    return list.map(f => f.id === id ? { ...f, roles } : { ...f, children: f.children ? applyRoles(f.children, id, roles) : f.children })
  }
  async function toggleFolderRole(f: DocFolder, role: string) {
    const has = f.roles.includes(role)
    const roles = has ? f.roles.filter(r => r !== role) : [...f.roles, role]
    setBusy(`f:${f.id}:${role}`)
    try {
      await api.documents.folders.update(f.id, { name: f.name, sort_order: f.sort_order, roles, parent_id: f.parent_id ?? null })
      setFolders(prev => applyRoles(prev, f.id, roles))
    } finally { setBusy(null) }
  }

  if (!isAdmin) return <div className="text-gray-500 text-sm p-4">Only admins can manage page access.</div>

  const TABS = [
    { key: 'role' as const, label: 'By Role' },
    { key: 'member' as const, label: 'By Member' },
    { key: 'files' as const, label: 'Files & Folders' },
  ]

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Page Access</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Control which pages appear in each member's dashboard menu — by role, or for one person.
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t.key ? 'border-green-700 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── By Role ── */}
      {tab === 'role' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">Role:</label>
            <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
              {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            <span className="text-xs text-gray-400">
              {selectedRole === 'member' ? 'Applies to every regular member.' : 'Applies to everyone with this role.'}
            </span>
          </div>

          {permsLoading ? (
            <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
          ) : (
            <div className="space-y-5">
              {PAGE_GROUPS.map(g => (
                <div key={g.group}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{g.group}</p>
                  <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
                    {g.items.map(p => {
                      const on = perms[p.key]?.has(selectedRole) ?? false
                      return (
                        <div key={p.key} className="flex items-center justify-between px-4 py-2.5">
                          <span className="text-sm text-gray-700">{p.label}</span>
                          <Toggle on={on} disabled={busy === `${p.key}:${selectedRole}`} onClick={() => toggleRole(p.key, selectedRole)} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── By Member ── */}
      {tab === 'member' && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <input value={search} onChange={e => { setSearch(e.target.value); setMember(null); setUp(null) }}
              placeholder="Search member by name or email…"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            {(results.length > 0 || searching) && !member && (
              <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                {searching ? <p className="px-4 py-3 text-sm text-gray-400">Searching…</p>
                  : results.map(m => (
                    <button key={m.id} onClick={() => pickMember(m)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0">
                      <div className="text-sm font-medium text-gray-800">{m.first_name} {m.last_name}</div>
                      <div className="text-xs text-gray-400">{m.email}</div>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {member && upLoading && <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>}

          {member && up && !upLoading && (
            <div className="space-y-5">
              <p className="text-sm text-gray-500">
                Overrides for <strong className="text-gray-800">{member.first_name} {member.last_name}</strong>.
                “Inherit” uses their role (<span className="font-medium">{up.role}</span>); On/Off forces it for this person.
              </p>
              {PAGE_GROUPS.map(g => (
                <div key={g.group}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{g.group}</p>
                  <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
                    {g.items.map(p => {
                      const ov = up.overrides[p.key]
                      const state: 'on' | 'off' | 'inherit' = ov === true ? 'on' : ov === false ? 'off' : 'inherit'
                      const inheritedOn = up.role_pages.includes(p.key)
                      return (
                        <div key={p.key} className="flex items-center justify-between px-4 py-2.5 gap-3">
                          <span className="text-sm text-gray-700">{p.label}</span>
                          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs shrink-0">
                            {(['inherit', 'on', 'off'] as const).map(s => (
                              <button key={s} disabled={busy === `m:${p.key}`}
                                onClick={() => setMemberState(p.key, s)}
                                className={`px-2.5 py-1 font-medium transition disabled:opacity-50 ${
                                  state === s
                                    ? (s === 'on' ? 'bg-green-600 text-white' : s === 'off' ? 'bg-red-500 text-white' : 'bg-gray-600 text-white')
                                    : 'bg-white text-gray-500 hover:bg-gray-50'
                                }`}>
                                {s === 'inherit' ? `Inherit (${inheritedOn ? 'on' : 'off'})` : s === 'on' ? 'On' : 'Off'}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Files & Folders ── */}
      {tab === 'files' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Choose which roles can see each document folder. The Files page shows a member only the folders their role can access.</p>
          {foldersLoading ? (
            <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
          ) : folders.length === 0 ? (
            <div className="text-sm text-gray-400 py-8 text-center border-2 border-dashed border-gray-200 rounded-2xl">No document folders yet.</div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
              {flatten(folders).map(({ f, depth }) => (
                <div key={f.id} className="px-4 py-3" style={{ paddingLeft: `${1 + depth * 1.25}rem` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="text-sm font-medium text-gray-800">{f.name}</span>
                    {f.roles.length === 0 && <span className="text-[11px] text-amber-600">(no roles — hidden from members)</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ROLES.map(r => {
                      const has = f.roles.includes(r.key)
                      return (
                        <button key={r.key} disabled={busy === `f:${f.id}:${r.key}`}
                          onClick={() => toggleFolderRole(f, r.key)}
                          className={`text-[11px] px-2 py-0.5 rounded-full border transition disabled:opacity-50 ${
                            has ? 'bg-green-100 border-green-300 text-green-800' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                          }`}>
                          {r.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
