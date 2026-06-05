import { Fragment, useEffect, useState } from 'react'
import { api } from '../../api/client'

const PAGE_GROUPS: { group: string; items: { key: string; label: string; desc: string }[] }[] = [
  {
    group: 'Dashboard menu', items: [
      { key: 'bookings',    label: 'Book a Court',  desc: 'Court reservation calendar' },
      { key: 'events',      label: 'Events',         desc: 'Club events & signups' },
      { key: 'pro_shop',    label: 'Pro Shop',       desc: 'Pro shop purchases' },
      { key: 'directory',   label: 'Directory',      desc: 'Member directory' },
      { key: 'friends',     label: 'Friends',        desc: 'Friends list & challenges' },
      { key: 'documents',   label: 'Files',          desc: 'Document library' },
      { key: 'fantasy',     label: 'Fantasy Pool',   desc: 'Fantasy tennis pool' },
      { key: 'ladder',      label: 'Ladder',         desc: 'Tennis ladder' },
    ],
  },
  {
    group: 'Other features', items: [
      { key: 'court_grid',    label: 'Court Grid',    desc: 'View-only court availability grid' },
      { key: 'announcements', label: 'Announcements', desc: 'Club announcements' },
      { key: 'photos',        label: 'Images',        desc: 'Photo gallery' },
      { key: 'usta_teams',    label: 'USTA Teams',    desc: 'USTA team info' },
      { key: 'dues',          label: 'My Dues',       desc: 'Dues & payment history' },
      { key: 'club_info',     label: 'Club Info',     desc: 'Club details & contacts' },
    ],
  },
]

const ROLES: { key: string; label: string; short: string }[] = [
  { key: 'member',        label: 'Member',        short: 'Mbr' },
  { key: 'president',     label: 'President',     short: 'Pres' },
  { key: 'vice_president',label: 'Vice President',short: 'VP' },
  { key: 'secretary',     label: 'Secretary',     short: 'Sec' },
  { key: 'treasurer',     label: 'Treasurer',     short: 'Treas' },
  { key: 'billing',       label: 'Billing',       short: 'Bill' },
  { key: 'membership',    label: 'Membership',    short: 'Mbr' },
  { key: 'entertainment', label: 'Entertainment', short: 'Ent' },
  { key: 'house_grounds', label: 'House & Grounds',short: 'H&G' },
  { key: 'usta',          label: 'USTA',          short: 'USTA' },
  { key: 'games',         label: 'Games',         short: 'Gms' },
  { key: 'pro',           label: 'Pro',           short: 'Pro' },
]

export default function AdminMemberPermissions() {
  const [perms, setPerms] = useState<Record<string, Set<string>>>({})
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState(ROLES[0].key)
  const [view, setView] = useState<'by-role' | 'by-section'>('by-role')

  const allPages = PAGE_GROUPS.flatMap(g => g.items)

  useEffect(() => {
    api.permissions.getAll()
      .then(data => {
        const map: Record<string, Set<string>> = {}
        for (const p of allPages) map[p.key] = new Set()
        for (const [page, roles] of Object.entries(data)) map[page] = new Set(roles as string[])
        setPerms(map)
      })
      .catch(() => setError('Failed to load permissions'))
      .finally(() => setLoading(false))
  }, [])

  const toggle = async (page: string, role: string) => {
    const key = `${page}:${role}`
    setToggling(key)
    const current = perms[page]?.has(role) ?? false
    try {
      await api.permissions.toggle(page, role, !current)
      setPerms(prev => {
        const next = { ...prev, [page]: new Set(prev[page]) }
        if (current) next[page].delete(role)
        else next[page].add(role)
        return next
      })
    } finally { setToggling(null) }
  }

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
  if (error)   return <div className="text-sm text-red-500">{error}</div>

  const grantCount = (roleKey: string) =>
    allPages.filter(p => perms[p.key]?.has(roleKey)).length

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Member Permissions</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Control which dashboard pages and features are available to each member role.
            Changes take effect immediately.
          </p>
        </div>
        <div className="flex gap-1 shrink-0 mt-1">
          <button onClick={() => setView('by-role')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${view === 'by-role' ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            By Role
          </button>
          <button onClick={() => setView('by-section')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${view === 'by-section' ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            By Section
          </button>
        </div>
      </div>

      {view === 'by-role' ? (
        <div className="mt-4">
          {/* Role selector */}
          <div className="flex flex-wrap gap-2 mb-4 md:sticky md:top-0 z-10 bg-gray-50 py-2 -mx-4 px-4 border-b border-gray-100">
            {ROLES.map(r => {
              const count = grantCount(r.key)
              const active = selectedRole === r.key
              return (
                <button key={r.key} onClick={() => setSelectedRole(r.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition ${
                    active
                      ? 'bg-green-700 text-white border-green-700 shadow-sm'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-green-400 hover:bg-green-50'
                  }`}>
                  {r.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    active ? 'bg-white/20 text-white' : count > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Pages for selected role */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {PAGE_GROUPS.map((g, gi) => (
              <Fragment key={g.group}>
                <div className={`px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 ${gi > 0 ? 'border-t border-gray-100' : ''}`}>
                  {g.group}
                </div>
                {g.items.map(p => {
                  const granted = perms[p.key]?.has(selectedRole) ?? false
                  const busy = toggling === `${p.key}:${selectedRole}`
                  const sw = busy ? (
                    <div className="w-10 h-6 rounded-full bg-gray-200 animate-pulse" />
                  ) : (
                    <button type="button" role="switch" aria-checked={granted}
                      onClick={() => toggle(p.key, selectedRole)}
                      className={`relative w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 ${granted ? 'bg-green-600' : 'bg-gray-200'}`}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${granted ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  )
                  return (
                    <label key={p.key}
                      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer border-t border-gray-50 transition">
                      <div>
                        <span className="text-sm font-medium text-gray-800">{p.label}</span>
                        <span className="text-xs text-gray-400 block">{p.desc}</span>
                      </div>
                      <div className="ml-4 shrink-0">{sw}</div>
                    </label>
                  )
                })}
              </Fragment>
            ))}
          </div>

          <p className="text-xs text-gray-400 mt-3">
            Members may need to refresh to see newly granted pages.
          </p>
        </div>
      ) : (
        /* ── Section-centric matrix ── */
        <div className="mt-4 overflow-auto max-h-[calc(100vh-180px)] border border-gray-200 rounded-lg">
          <table className="text-sm border-collapse w-full">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2 min-w-[160px] bg-gray-100 sticky left-0 z-30">
                  Page
                </th>
                {ROLES.map(r => (
                  <th key={r.key} className="text-center text-xs font-medium text-gray-600 px-2 py-2 min-w-[56px] bg-gray-100">
                    {r.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PAGE_GROUPS.map(g => (
                <Fragment key={g.group}>
                  <tr>
                    <td colSpan={ROLES.length + 1}
                      className="px-3 pt-4 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      {g.group}
                    </td>
                  </tr>
                  {g.items.map((p, pi) => (
                    <tr key={p.key} className={pi % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className={`px-3 py-2 sticky left-0 z-10 ${pi % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <span className="font-medium text-gray-800 block text-xs">{p.label}</span>
                      </td>
                      {ROLES.map(role => {
                        const allowed = perms[p.key]?.has(role.key) ?? false
                        const busy = toggling === `${p.key}:${role.key}`
                        return (
                          <td key={role.key} className="text-center px-2 py-2">
                            <input
                              type="checkbox"
                              checked={allowed}
                              disabled={busy}
                              onChange={() => toggle(p.key, role.key)}
                              className="w-4 h-4 rounded accent-green-600 cursor-pointer disabled:opacity-40"
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 p-3">
            Members may need to refresh to see newly granted pages.
          </p>
        </div>
      )}
    </div>
  )
}
