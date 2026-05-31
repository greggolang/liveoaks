import { useEffect, useState } from 'react'
import { api } from '../../api/client'

const PAGES: { key: string; label: string; desc: string }[] = [
  { key: 'bookings',      label: 'Book Court',          desc: 'Reserve, view, and cancel personal court bookings (/bookings)' },
  { key: 'court_grid',    label: 'Court Availability',  desc: 'Read-only grid showing who has each court booked (/court-grid)' },
  { key: 'events',        label: 'Events',              desc: 'Browse upcoming club events and sign up (/events)' },
  { key: 'announcements', label: 'News & Announcements',desc: 'View board announcements and club news (/announcements)' },
  { key: 'documents',     label: 'Documents',           desc: 'Download club documents and forms (/documents)' },
  { key: 'photos',        label: 'Photo Gallery',       desc: 'Browse club photo albums (/photos)' },
  { key: 'usta_teams',    label: 'USTA Teams',          desc: 'View USTA league teams and rosters (/usta-teams)' },
  { key: 'directory',     label: 'Member Directory',    desc: 'Search and view member contact info (/directory)' },
  { key: 'guests',        label: 'Guest Passes',        desc: 'Log guest visits and view personal guest pass history (/guests)' },
  { key: 'dues',          label: 'My Dues',             desc: 'View personal dues balance and payment history (/dues)' },
  { key: 'club_info',       label: 'About / Club Info',    desc: 'Club hours, contact details, and general information (/club-info)' },
  { key: 'broadcast_email', label: 'Broadcast Email',      desc: 'Send mass emails to all members or filtered groups (/admin/broadcast)' },
]

const ROLES: { key: string; label: string; group: string }[] = [
  { key: 'member',         label: 'Member',        group: 'General' },
  { key: 'president',      label: 'President',     group: 'Board' },
  { key: 'vice_president', label: 'Vice Pres.',    group: 'Board' },
  { key: 'secretary',      label: 'Secretary',     group: 'Board' },
  { key: 'treasurer',      label: 'Treasurer',     group: 'Board' },
  { key: 'entertainment',  label: 'Entertain.',    group: 'Board' },
  { key: 'house_grounds',  label: 'House/Grnds',   group: 'Board' },
  { key: 'billing',        label: 'Billing',       group: 'Board' },
  { key: 'membership',     label: 'Membership',    group: 'Board' },
  { key: 'usta',           label: 'USTA',          group: 'Board' },
  { key: 'games',          label: 'Games Admin',   group: 'Special' },
  { key: 'pro',            label: 'Pro',           group: 'Special' },
]

export default function AdminPermissions() {
  // perms[page] = Set of roles that have access
  const [perms, setPerms] = useState<Record<string, Set<string>>>({})
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.permissions.getAll()
      .then(data => {
        const map: Record<string, Set<string>> = {}
        for (const [page, roles] of Object.entries(data)) {
          map[page] = new Set(roles)
        }
        // ensure every known page has an entry
        for (const { key } of PAGES) {
          if (!map[key]) map[key] = new Set()
        }
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
    } catch {
      // revert on failure — no change needed since we didn't optimistically update
    } finally {
      setToggling(null)
    }
  }

  if (loading) return <div className="text-sm text-gray-400">Loading…</div>
  if (error) return <div className="text-sm text-red-500">{error}</div>

  const groups = [...new Set(ROLES.map(r => r.group))]

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-1">Page Permissions</h2>
      <p className="text-sm text-gray-500 mb-1">
        Control which roles can access each <strong>member-facing</strong> page. These permissions do not affect admin-only areas (Users, Settings, Dues management, etc.) — those are always restricted to admins.
      </p>
      <p className="text-sm text-gray-400 mb-6">Admin always has full access to everything.</p>

      <div className="overflow-x-auto">
        <table className="text-sm border-collapse w-full">
          <thead>
            <tr>
              <th className="text-left text-gray-500 font-medium text-xs px-3 py-2 w-72">
                {/* group header row */}
              </th>
              {groups.map(group => {
                const cols = ROLES.filter(r => r.group === group)
                return (
                  <th key={group} colSpan={cols.length}
                    className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 pb-1 border-b border-gray-100">
                    {group}
                  </th>
                )
              })}
              <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 pb-1 border-b border-gray-100">
                Admin
              </th>
            </tr>
            <tr className="bg-gray-50">
              <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2 rounded-tl-lg w-72">
                Page / Description
              </th>
              {ROLES.map(r => (
                <th key={r.key} className="text-center text-xs font-medium text-gray-600 px-2 py-2 min-w-[72px]">
                  {r.label}
                </th>
              ))}
              <th className="text-center text-xs font-medium text-gray-400 px-2 py-2 min-w-[60px] rounded-tr-lg">
                Admin
              </th>
            </tr>
          </thead>
          <tbody>
            {PAGES.map((page, pi) => (
              <tr key={page.key}
                className={pi % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2.5">
                  <span className="font-medium text-gray-800 block">{page.label}</span>
                  <span className="text-xs text-gray-400 font-normal">{page.desc}</span>
                </td>
                {ROLES.map(role => {
                  const allowed = perms[page.key]?.has(role.key) ?? false
                  const busy = toggling === `${page.key}:${role.key}`
                  return (
                    <td key={role.key} className="text-center px-2 py-2.5">
                      <input
                        type="checkbox"
                        checked={allowed}
                        disabled={busy}
                        onChange={() => toggle(page.key, role.key)}
                        className="w-4 h-4 rounded accent-green-600 cursor-pointer disabled:opacity-40"
                      />
                    </td>
                  )
                })}
                {/* Admin — always on, locked */}
                <td className="text-center px-2 py-2.5">
                  <input
                    type="checkbox"
                    checked
                    disabled
                    className="w-4 h-4 rounded accent-green-600 opacity-40 cursor-not-allowed"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Changes take effect immediately. Members must refresh to see updated access.
      </p>
    </div>
  )
}
