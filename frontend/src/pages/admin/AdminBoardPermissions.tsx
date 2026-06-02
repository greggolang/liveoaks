import { Fragment, useEffect, useState } from 'react'
import { api } from '../../api/client'

type SectionDef = { key: string; label: string; group: string; desc: string }

// Board roles that can be granted admin sections. Admin is omitted — admins
// always have full access and cannot be restricted. Regular members are not
// shown because they have no admin access.
const ROLES: { key: string; label: string }[] = [
  { key: 'president', label: 'President' },
  { key: 'vice_president', label: 'Vice Pres.' },
  { key: 'secretary', label: 'Secretary' },
  { key: 'treasurer', label: 'Treasurer' },
  { key: 'entertainment', label: 'Entertain.' },
  { key: 'house_grounds', label: 'House/Grnds' },
  { key: 'billing', label: 'Billing' },
  { key: 'membership', label: 'Membership' },
  { key: 'usta', label: 'USTA' },
  { key: 'games', label: 'Games' },
  { key: 'pro', label: 'Pro' },
]

export default function AdminBoardPermissions() {
  const [catalog, setCatalog] = useState<SectionDef[]>([])
  // perms[section] = Set of roles granted that section
  const [perms, setPerms] = useState<Record<string, Set<string>>>({})
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.adminPermissions.sections(), api.adminPermissions.getAll()])
      .then(([sections, data]) => {
        setCatalog(sections)
        const map: Record<string, Set<string>> = {}
        for (const { key } of sections) map[key] = new Set()
        for (const [section, roles] of Object.entries(data)) map[section] = new Set(roles)
        setPerms(map)
      })
      .catch(() => setError('Failed to load admin permissions'))
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
    } catch {
      // no optimistic update to revert
    } finally {
      setToggling(null)
    }
  }

  if (loading) return <div className="text-sm text-gray-400">Loading…</div>
  if (error) return <div className="text-sm text-red-500">{error}</div>

  const groups = [...new Set(catalog.map(s => s.group))]

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-1">Board Access</h2>
      <p className="text-sm text-gray-500 mb-1">
        Control which board roles can open each section of the <strong>admin panel</strong>. Check a box to give that role access to that section.
      </p>
      <p className="text-sm text-gray-400 mb-6">
        Admins always have full access. Mail Accounts, Password Vault, and the Permissions pages are admin-only and cannot be delegated. Members must refresh to see updated access.
      </p>

      <div className="overflow-x-auto">
        <table className="text-sm border-collapse w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2 rounded-tl-lg w-72">
                Admin Section
              </th>
              {ROLES.map((r, i) => (
                <th key={r.key} className={`text-center text-xs font-medium text-gray-600 px-2 py-2 min-w-[72px] ${i === ROLES.length - 1 ? 'rounded-tr-lg' : ''}`}>
                  {r.label}
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
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-gray-800 block">{s.label}</span>
                      <span className="text-xs text-gray-400 font-normal">{s.desc}</span>
                    </td>
                    {ROLES.map(role => {
                      const allowed = perms[s.key]?.has(role.key) ?? false
                      const busy = toggling === `${s.key}:${role.key}`
                      return (
                        <td key={role.key} className="text-center px-2 py-2.5">
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
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Changes take effect immediately. Board members may need to refresh or sign back in to see newly granted sections.
      </p>
    </div>
  )
}
