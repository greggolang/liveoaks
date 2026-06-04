import { Fragment, useEffect, useState } from 'react'
import { api, DocFolder } from '../../api/client'

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

  // Files drill-down: which document folders the selected role can see.
  const [foldersOpen, setFoldersOpen] = useState(false)
  const [folders, setFolders] = useState<DocFolder[]>([])
  const [foldersLoading, setFoldersLoading] = useState(false)
  const [foldersLoaded, setFoldersLoaded] = useState(false)
  const [folderBusy, setFolderBusy] = useState<string | null>(null)

  const loadFolders = async () => {
    setFoldersLoading(true)
    try { setFolders(await api.documents.folders.adminList()); setFoldersLoaded(true) }
    catch { setFolders([]) }
    finally { setFoldersLoading(false) }
  }
  const flattenFolders = (list: DocFolder[], depth = 0): { f: DocFolder; depth: number }[] =>
    list.flatMap(f => [{ f, depth }, ...flattenFolders(f.children ?? [], depth + 1)])
  const applyFolderRoles = (list: DocFolder[], id: string, roles: string[]): DocFolder[] =>
    list.map(f => f.id === id ? { ...f, roles } : { ...f, children: f.children ? applyFolderRoles(f.children, id, roles) : f.children })
  const toggleFolderRole = async (f: DocFolder, role: string) => {
    const has = f.roles.includes(role)
    const roles = has ? f.roles.filter(r => r !== role) : [...f.roles, role]
    setFolderBusy(`${f.id}:${role}`)
    try {
      await api.documents.folders.update(f.id, { name: f.name, sort_order: f.sort_order, roles, parent_id: f.parent_id ?? null })
      setFolders(prev => applyFolderRoles(prev, f.id, roles))
    } finally { setFolderBusy(null) }
  }

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
          <h2 className="text-xl font-bold text-gray-800">Admin Permissions</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Control which roles — including regular members — can open each admin page.
            Granting a page lets that role into the admin area for that page only. Admins always have full access.
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
          {/* Role selector — pinned so you always see which role you're editing */}
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
                    const sw = busy ? (
                      <div className="w-10 h-6 rounded-full bg-gray-200 animate-pulse" />
                    ) : (
                      <button type="button" role="switch" aria-checked={granted}
                        onClick={() => toggle(s.key, selectedRole)}
                        className={`relative w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 ${granted ? 'bg-green-600' : 'bg-gray-200'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${granted ? 'translate-x-4' : 'translate-x-0'}`} />
                      </button>
                    )

                    if (s.key === 'files') {
                      return (
                        <div key={s.key} className="border-t border-gray-50">
                          <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <button type="button" title="Folder access"
                                onClick={() => { setFoldersOpen(o => !o); if (!foldersLoaded) loadFolders() }}
                                className="p-0.5 text-gray-400 hover:text-gray-700 shrink-0">
                                <svg className={`w-4 h-4 transition-transform ${foldersOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                              <div className="min-w-0">
                                <span className="text-sm font-medium text-gray-800">{s.label}</span>
                                <span className="text-xs text-gray-400 block">{s.desc} · expand to set per-folder access</span>
                              </div>
                            </div>
                            <div className="ml-4 shrink-0">{sw}</div>
                          </div>
                          {foldersOpen && (
                            <div className="bg-gray-50/70 border-t border-gray-100 px-4 py-3">
                              <p className="text-xs text-gray-500 mb-2">
                                Folders <strong className="text-gray-700">{ROLES.find(r => r.key === selectedRole)?.label}</strong> can see on the Files page:
                              </p>
                              {foldersLoading ? (
                                <p className="text-xs text-gray-400">Loading…</p>
                              ) : folders.length === 0 ? (
                                <p className="text-xs text-gray-400">No document folders yet.</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {flattenFolders(folders).map(({ f, depth }) => {
                                    const on = f.roles.includes(selectedRole)
                                    const fb = folderBusy === `${f.id}:${selectedRole}`
                                    return (
                                      <div key={f.id} className="flex items-center justify-between gap-3" style={{ paddingLeft: `${depth * 1.25}rem` }}>
                                        <span className="flex items-center gap-1.5 text-sm text-gray-700 min-w-0">
                                          <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                          </svg>
                                          <span className="truncate">{f.name}</span>
                                        </span>
                                        <button type="button" disabled={fb} onClick={() => toggleFolderRole(f, selectedRole)}
                                          className={`relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50 ${on ? 'bg-green-600' : 'bg-gray-300'}`}>
                                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`} />
                                        </button>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    }

                    return (
                      <label key={s.key}
                        className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer border-t border-gray-50 transition">
                        <div>
                          <span className="text-sm font-medium text-gray-800">{s.label}</span>
                          <span className="text-xs text-gray-400 block">{s.desc}</span>
                        </div>
                        <div className="ml-4 shrink-0">{sw}</div>
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
        <div className="mt-4 overflow-auto max-h-[calc(100vh-180px)] border border-gray-200 rounded-lg">
          <table className="text-sm border-collapse w-full">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2 min-w-[160px] bg-gray-100 sticky left-0 z-30">
                  Section
                </th>
                {ROLES.map((r) => (
                  <th key={r.key} className="text-center text-xs font-medium text-gray-600 px-2 py-2 min-w-[56px] bg-gray-100">
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
                      <td className={`px-3 py-2 sticky left-0 z-10 ${si % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
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
