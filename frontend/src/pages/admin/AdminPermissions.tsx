import { Fragment, useEffect, useState } from 'react'
import { api } from '../../api/client'

// ── Member page permissions ──────────────────────────────────────────────────

type PageDef = { key: string; label: string; desc: string; group: string }

const MEMBER_PAGES: PageDef[] = [
  // Content pages — each has a corresponding admin management area
  { key: 'events',        label: 'Events',             group: 'Content', desc: 'Members see upcoming events on the dashboard and can sign up' },
  { key: 'announcements', label: 'Announcements',      group: 'Content', desc: 'Members see board announcements on the dashboard' },
  { key: 'pro_shop',      label: 'Pro Shop',           group: 'Content', desc: 'Members can browse pro shop items and prices' },
  { key: 'documents',     label: 'Files & Documents',  group: 'Content', desc: 'Members can download club documents and files' },
  { key: 'photos',        label: 'Photos',             group: 'Content', desc: 'Members can browse club photo albums' },
  { key: 'usta_teams',    label: 'USTA Teams',         group: 'Content', desc: 'Members can view USTA league teams and rosters' },
  // Member features
  { key: 'bookings',      label: 'Book Court',         group: 'Features', desc: 'Reserve, view, and cancel personal court bookings' },
  { key: 'court_grid',    label: 'Court Availability', group: 'Features', desc: 'Read-only grid showing who has each court booked' },
  { key: 'directory',     label: 'Member Directory',   group: 'Features', desc: 'Search and view member contact info' },
  { key: 'dues',          label: 'My Dues',            group: 'Features', desc: 'View personal dues balance and payment history' },
  { key: 'club_info',     label: 'About / Club Info',  group: 'Features', desc: 'Club hours, contact details, and general information' },
  { key: 'bylaws',        label: 'Bylaws',             group: 'Features', desc: 'View the club bylaws document' },
  { key: 'friends',       label: 'Friends',            group: 'Features', desc: 'Manage friends and frequent playing partners' },
  { key: 'messages',      label: 'Messages',           group: 'Features', desc: 'Send and receive member-to-member messages' },
  { key: 'fantasy',       label: 'Fantasy Pool',       group: 'Features', desc: 'Join the fantasy tennis pool and make picks' },
  { key: 'ladder',        label: 'Tennis Ladder',      group: 'Features', desc: 'Join ladders, issue challenges, view leaderboards' },
  // Special grants
  { key: 'broadcast_email',      label: 'Broadcast Email',      group: 'Special', desc: 'Send mass emails to all members or filtered groups' },
  { key: 'teaching_pro_booking', label: 'Teaching Pro Booking', group: 'Special', desc: 'Allow this role to book Teaching Pro court sessions' },
]

const MEMBER_GROUP_LABELS: Record<string, string> = {
  Content:  'Content — each page has a corresponding admin management area',
  Features: 'Member Features',
  Special:  'Special Permissions',
}

const MEMBER_ROLES: { key: string; label: string; group: string }[] = [
  { key: 'member',         label: 'Member',      group: 'General' },
  { key: 'president',      label: 'President',   group: 'Board' },
  { key: 'vice_president', label: 'Vice Pres.',  group: 'Board' },
  { key: 'secretary',      label: 'Secretary',   group: 'Board' },
  { key: 'treasurer',      label: 'Treasurer',   group: 'Board' },
  { key: 'entertainment',  label: 'Entertain.',  group: 'Board' },
  { key: 'house_grounds',  label: 'House/Grnds', group: 'Board' },
  { key: 'billing',        label: 'Billing',     group: 'Board' },
  { key: 'membership',     label: 'Membership',  group: 'Board' },
  { key: 'usta',           label: 'USTA',        group: 'Board' },
  { key: 'games',          label: 'Games',       group: 'Special' },
  { key: 'pro',            label: 'Pro',         group: 'Special' },
]

// ── Admin section permissions ────────────────────────────────────────────────

type SectionDef = { key: string; label: string; group: string; desc: string }

const ADMIN_ROLES: { key: string; label: string; short: string }[] = [
  { key: 'president',      label: 'President',       short: 'Pres'  },
  { key: 'vice_president', label: 'Vice President',  short: 'VP'    },
  { key: 'secretary',      label: 'Secretary',       short: 'Sec'   },
  { key: 'treasurer',      label: 'Treasurer',       short: 'Treas' },
  { key: 'billing',        label: 'Billing',         short: 'Bill'  },
  { key: 'membership',     label: 'Membership',      short: 'Mbr'   },
  { key: 'entertainment',  label: 'Entertainment',   short: 'Ent'   },
  { key: 'house_grounds',  label: 'House & Grounds', short: 'H&G'   },
  { key: 'usta',           label: 'USTA',            short: 'USTA'  },
  { key: 'games',          label: 'Games',           short: 'Games' },
  { key: 'pro',            label: 'Pro',             short: 'Pro'   },
]

// ── Component ────────────────────────────────────────────────────────────────

export default function AdminPermissions() {
  const [tab, setTab] = useState<'admin' | 'member'>('admin')

  // Member page state
  const [pagePerms, setPagePerms] = useState<Record<string, Set<string>>>({})
  const [pageLoading, setPageLoading] = useState(true)
  const [pageToggling, setPageToggling] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  // Admin section state
  const [catalog, setCatalog] = useState<SectionDef[]>([])
  const [sectionPerms, setSectionPerms] = useState<Record<string, Set<string>>>({})
  const [sectionLoading, setSectionLoading] = useState(true)
  const [sectionToggling, setSectionToggling] = useState<string | null>(null)
  const [sectionError, setSectionError] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState(ADMIN_ROLES[0].key)
  const [adminView, setAdminView] = useState<'by-role' | 'matrix'>('by-role')

  useEffect(() => {
    api.permissions.getAll()
      .then(data => {
        const map: Record<string, Set<string>> = {}
        for (const [page, roles] of Object.entries(data)) map[page] = new Set(roles)
        for (const { key } of MEMBER_PAGES) if (!map[key]) map[key] = new Set()
        setPagePerms(map)
      })
      .catch(() => setPageError('Failed to load member page permissions'))
      .finally(() => setPageLoading(false))

    Promise.all([api.adminPermissions.sections(), api.adminPermissions.getAll()])
      .then(([sections, data]) => {
        setCatalog(sections)
        const map: Record<string, Set<string>> = {}
        for (const { key } of sections) map[key] = new Set()
        for (const [section, roles] of Object.entries(data)) map[section] = new Set(roles as string[])
        setSectionPerms(map)
      })
      .catch(() => setSectionError('Failed to load admin section permissions'))
      .finally(() => setSectionLoading(false))
  }, [])

  const togglePage = async (page: string, role: string) => {
    const k = `${page}:${role}`
    setPageToggling(k)
    const current = pagePerms[page]?.has(role) ?? false
    try {
      await api.permissions.toggle(page, role, !current)
      setPagePerms(prev => {
        const next = { ...prev, [page]: new Set(prev[page]) }
        if (current) next[page].delete(role); else next[page].add(role)
        return next
      })
    } finally { setPageToggling(null) }
  }

  const toggleSection = async (section: string, role: string) => {
    const k = `${section}:${role}`
    setSectionToggling(k)
    const current = sectionPerms[section]?.has(role) ?? false
    try {
      await api.adminPermissions.toggle(section, role, !current)
      setSectionPerms(prev => {
        const next = { ...prev, [section]: new Set(prev[section]) }
        if (current) next[section].delete(role); else next[section].add(role)
        return next
      })
    } finally { setSectionToggling(null) }
  }

  const grantCount = (roleKey: string) =>
    catalog.filter(s => sectionPerms[s.key]?.has(roleKey)).length

  const adminGroups  = [...new Set(catalog.map(s => s.group))]
  const memberGroups = [...new Set(MEMBER_PAGES.map(p => p.group))]
  const roleGroups   = [...new Set(MEMBER_ROLES.map(r => r.group))]

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Permissions</h2>
          <p className="text-sm text-gray-500 mt-0.5">Admins always have full access to everything.</p>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          <button onClick={() => setTab('admin')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${tab === 'admin' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            Admin Pages
          </button>
          <button onClick={() => setTab('member')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${tab === 'member' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            Member Pages
          </button>
        </div>
      </div>

      {/* ── Admin Pages tab ── */}
      {tab === 'admin' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">
            Control which board roles can open each admin section.
            Sections not listed (Mail, Passwords, Permissions) are admin-only and never grantable.
          </p>

          {sectionLoading ? <div className="text-sm text-gray-400">Loading…</div>
           : sectionError ? <div className="text-sm text-red-500">{sectionError}</div>
           : (
            <>
              <div className="flex gap-1 mb-5">
                <button onClick={() => setAdminView('by-role')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${adminView === 'by-role' ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  By Role
                </button>
                <button onClick={() => setAdminView('matrix')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${adminView === 'matrix' ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  Matrix
                </button>
              </div>

              {adminView === 'by-role' ? (
                <>
                  <div className="flex flex-wrap gap-2 mb-5">
                    {ADMIN_ROLES.map(r => {
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
                          }`}>{count}</span>
                        </button>
                      )
                    })}
                  </div>

                  <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    {adminGroups.map((group, gi) => (
                      <Fragment key={group}>
                        <div className={`px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 ${gi > 0 ? 'border-t border-gray-100' : ''}`}>
                          {group}
                        </div>
                        {catalog.filter(s => s.group === group).map(s => {
                          const granted = sectionPerms[s.key]?.has(selectedRole) ?? false
                          const busy = sectionToggling === `${s.key}:${selectedRole}`
                          return (
                            <label key={s.key} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer border-t border-gray-50 transition">
                              <div>
                                <span className="text-sm font-medium text-gray-800">{s.label}</span>
                                <span className="text-xs text-gray-400 block">{s.desc}</span>
                              </div>
                              <div className="ml-4 shrink-0">
                                {busy ? (
                                  <div className="w-10 h-6 rounded-full bg-gray-200 animate-pulse" />
                                ) : (
                                  <button type="button" role="switch" aria-checked={granted}
                                    onClick={() => toggleSection(s.key, selectedRole)}
                                    className={`relative w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 ${granted ? 'bg-green-600' : 'bg-gray-200'}`}>
                                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${granted ? 'translate-x-4' : 'translate-x-0'}`} />
                                  </button>
                                )}
                              </div>
                            </label>
                          )
                        })}
                      </Fragment>
                    ))}
                  </div>
                </>
              ) : (
                <div className="overflow-x-auto">
                  <table className="text-sm border-collapse w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2 rounded-tl-lg min-w-[200px]">Section</th>
                        {ADMIN_ROLES.map((r, i) => (
                          <th key={r.key} className={`text-center text-xs font-medium text-gray-600 px-2 py-2 min-w-[56px] ${i === ADMIN_ROLES.length - 1 ? 'rounded-tr-lg' : ''}`}>
                            {r.short}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {adminGroups.map(group => (
                        <Fragment key={group}>
                          <tr>
                            <td colSpan={ADMIN_ROLES.length + 1} className="px-3 pt-4 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                              {group}
                            </td>
                          </tr>
                          {catalog.filter(s => s.group === group).map((s, si) => (
                            <tr key={s.key} className={si % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-3 py-2">
                                <span className="font-medium text-gray-800 block text-xs">{s.label}</span>
                              </td>
                              {ADMIN_ROLES.map(role => {
                                const allowed = sectionPerms[s.key]?.has(role.key) ?? false
                                const busy = sectionToggling === `${s.key}:${role.key}`
                                return (
                                  <td key={role.key} className="text-center px-2 py-2">
                                    <input type="checkbox" checked={allowed} disabled={busy}
                                      onChange={() => toggleSection(s.key, role.key)}
                                      className="w-4 h-4 rounded accent-green-600 cursor-pointer disabled:opacity-40" />
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
              )}
            </>
          )}
          <p className="text-xs text-gray-400 mt-3">Changes take effect immediately.</p>
        </div>
      )}

      {/* ── Member Pages tab ── */}
      {tab === 'member' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">
            Control which roles can see each member-facing page.
            Content pages have a matching admin management area — granting member access controls the member-facing view only.
          </p>

          {pageLoading ? <div className="text-sm text-gray-400">Loading…</div>
           : pageError ? <div className="text-sm text-red-500">{pageError}</div>
           : (
            <div className="overflow-x-auto">
              <table className="text-sm border-collapse w-full">
                <thead>
                  <tr>
                    <th className="text-left text-gray-500 font-medium text-xs px-3 py-2 w-80" />
                    {roleGroups.map(group => {
                      const cols = MEMBER_ROLES.filter(r => r.group === group)
                      return (
                        <th key={group} colSpan={cols.length}
                          className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 pb-1 border-b border-gray-100">
                          {group}
                        </th>
                      )
                    })}
                  </tr>
                  <tr className="bg-gray-50">
                    <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2 rounded-tl-lg w-80">Page / Description</th>
                    {MEMBER_ROLES.map((r, i) => (
                      <th key={r.key} className={`text-center text-xs font-medium text-gray-600 px-2 py-2 min-w-[72px] ${i === MEMBER_ROLES.length - 1 ? 'rounded-tr-lg' : ''}`}>
                        {r.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {memberGroups.map(group => (
                    <Fragment key={group}>
                      <tr>
                        <td colSpan={MEMBER_ROLES.length + 1}
                          className="px-3 pt-5 pb-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 border-t border-gray-100">
                          {MEMBER_GROUP_LABELS[group] ?? group}
                        </td>
                      </tr>
                      {MEMBER_PAGES.filter(p => p.group === group).map((page, pi) => (
                        <tr key={page.key} className={pi % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-3 py-2.5">
                            <span className="font-medium text-gray-800 block">{page.label}</span>
                            <span className="text-xs text-gray-400">{page.desc}</span>
                          </td>
                          {MEMBER_ROLES.map(role => {
                            const allowed = pagePerms[page.key]?.has(role.key) ?? false
                            const busy = pageToggling === `${page.key}:${role.key}`
                            return (
                              <td key={role.key} className="text-center px-2 py-2.5">
                                <input type="checkbox" checked={allowed} disabled={busy}
                                  onChange={() => togglePage(page.key, role.key)}
                                  className="w-4 h-4 rounded accent-green-600 cursor-pointer disabled:opacity-40" />
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
          )}
          <p className="text-xs text-gray-400 mt-4">
            Changes take effect immediately. Members must refresh to see updated access.
          </p>
        </div>
      )}
    </div>
  )
}
