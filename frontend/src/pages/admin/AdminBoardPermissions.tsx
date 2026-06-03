import { Fragment, useEffect, useState } from 'react'
import { api } from '../../api/client'

type SectionDef = { key: string; label: string; group: string; desc: string }

const ROLES: { key: string; label: string; short: string }[] = [
  { key: 'president',      label: 'President',       short: 'Pres' },
  { key: 'vice_president', label: 'Vice President',  short: 'VP' },
  { key: 'secretary',      label: 'Secretary',       short: 'Sec' },
  { key: 'treasurer',      label: 'Treasurer',       short: 'Treas' },
  { key: 'billing',        label: 'Billing',         short: 'Bill' },
  { key: 'membership',     label: 'Membership',      short: 'Mbr' },
  { key: 'entertainment',  label: 'Entertainment',   short: 'Ent' },
  { key: 'house_grounds',  label: 'House & Grounds', short: 'H&G' },
  { key: 'usta',           label: 'USTA',            short: 'USTA' },
  { key: 'games',          label: 'Games',           short: 'Games' },
  { key: 'pro',            label: 'Pro',             short: 'Pro' },
]

export default function AdminBoardPermissions() {
  const [catalog, setCatalog] = useState<SectionDef[]>([])
  const [perms, setPerms] = useState<Record<string, Set<string>>>({})
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState(ROLES[0].key)
  const [view, setView] = useState<'by-role' | 'by-section'>('by-role')

  useEffect(() => {
    Promise.all([api.adminPermissions.sections(), api.adminPermissions.getAll()])
      .then(([sections, data]) => {
        setCatalog(sections)
        const map: Record<string, Set<string>> = {}
        for (const { key } of sections) map[key] = new Set()
        for (const [section, roles] of Object.entries(data)) map[section] = new Set(roles as string[])
        setPerms(map)
      })
      .catch(() => setError('Failed to load permissions'))
      .finally(() => setLoading(false))
  }, [])

  const toggle = async (section: string, role: string) => {
    const key = `${section}:${role}`
    setToggling(key)
    const current = perms[section]?.has(role) ?? false
    try {
      await api.adminPermissions.toggle(section, role, !current)
      setPerms(prev => {
        const next = { ...prev, [section]: new Set(prev[section]) }
        if (current) next[section].delete(role)
        else next[section].add(role)
        return next
      })
    } finally {
      setToggling(null)
    }
  }

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
  if (error)   return <div className="text-sm text-red-500">{error}</div>

  const groups = [...new Set(catalog.map(s => s.group))]

  // Count granted sections per role for the role selector badges
  const grantCount = (roleKey: string) =>
    catalog.filter(s => perms[s.key]?.has(roleKey)).length

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Board Access</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Control which board roles can open each admin section.
            Admins always have full access.
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
        /* ── Role-centric view ── */
        <div className="mt-4">
          {/* Role selector */}
          <div className="flex flex-wrap gap-2 mb-5">
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

          {/* Sections for selected role */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {groups.map((group, gi) => {
              const sections = catalog.filter(s => s.group === group)
              return (
                <Fragment key={group}>
                  <div className={`px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 ${gi > 0 ? 'border-t border-gray-100' : ''}`}>
                    {group}
                  </div>
                  {sections.map(s => {
                    const granted = perms[s.key]?.has(selectedRole) ?? false
                    const busy = toggling === `${s.key}:${selectedRole}`
                    return (
                      <label key={s.key}
                        className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer border-t border-gray-50 transition">
                        <div>
                          <span className="text-sm font-medium text-gray-800">{s.label}</span>
                          <span className="text-xs text-gray-400 block">{s.desc}</span>
                        </div>
                        <div className="ml-4 shrink-0">
                          {busy ? (
                            <div className="w-10 h-6 rounded-full bg-gray-200 animate-pulse" />
                          ) : (
                            <button
                              type="button"
                              role="switch"
                              aria-checked={granted}
                              onClick={() => toggle(s.key, selectedRole)}
                              className={`relative w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 ${
                                granted ? 'bg-green-600' : 'bg-gray-200'
                              }`}
                            >
                              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                                granted ? 'translate-x-4' : 'translate-x-0'
                              }`} />
                            </button>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </Fragment>
              )
            })}
          </div>

          <p className="text-xs text-gray-400 mt-3">
            Changes take effect immediately. Members may need to refresh to see newly granted sections.
          </p>
        </div>
      ) : (
        /* ── Section-centric view (compact matrix) ── */
        <div className="mt-4 overflow-x-auto">
          <table className="text-sm border-collapse w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2 rounded-tl-lg min-w-[200px]">
                  Section
                </th>
                {ROLES.map((r, i) => (
                  <th key={r.key} className={`text-center text-xs font-medium text-gray-600 px-2 py-2 min-w-[56px] ${i === ROLES.length - 1 ? 'rounded-tr-lg' : ''}`}>
                    {r.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(group => (
                <Fragment key={group}>
                  <tr>
                    <td colSpan={ROLES.length + 1}
                      className="px-3 pt-4 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      {group}
                    </td>
                  </tr>
                  {catalog.filter(s => s.group === group).map((s, si) => (
                    <tr key={s.key} className={si % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2">
                        <span className="font-medium text-gray-800 block text-xs">{s.label}</span>
                      </td>
                      {ROLES.map(role => {
                        const allowed = perms[s.key]?.has(role.key) ?? false
                        const busy = toggling === `${s.key}:${role.key}`
                        return (
                          <td key={role.key} className="text-center px-2 py-2">
                            <input
                              type="checkbox"
                              checked={allowed}
                              disabled={busy}
                              onChange={() => toggle(s.key, role.key)}
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
          <p className="text-xs text-gray-400 mt-3">
            Changes take effect immediately. Members may need to refresh to see newly granted sections.
          </p>
        </div>
      )}
    </div>
  )
}
