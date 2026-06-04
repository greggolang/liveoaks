import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { api } from '../api/client'

// Roles that count as "board" for showing the Admin menu and entering /admin.
// 'games' and 'pro' are intentionally excluded — they are "Special" roles, not
// board members, so they do not get the Admin menu.
const BOARD_ROLES = [
  'admin', 'developer', 'president', 'vice_president', 'secretary', 'treasurer',
  'billing', 'membership', 'usta', 'entertainment', 'house_grounds',
]

interface User {
  id: string
  first_name: string
  last_name: string
  email: string
  role: string
  extra_roles?: string[]
  status: string
  is_family_member?: boolean
}

function allRoles(u: User): string[] {
  return [u.role, ...(u.extra_roles ?? [])]
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  isAdmin: boolean
  isBoard: boolean
  isFamilyMember: boolean
  bookingMaxDaysAhead: number
  hasPermission: (page: string) => boolean
  canSeeAdmin: (section: string) => boolean
  // Can the user open the admin area at all? True for admins, board members, or
  // any non-board user who has been granted at least one admin section.
  canAccessAdmin: boolean
}

const AuthContext = createContext<AuthContextType>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionTimeoutDays, setSessionTimeoutDays] = useState(0)
  const [bookingMaxDaysAhead, setBookingMaxDaysAhead] = useState(5)
  const [myPages, setMyPages] = useState<Set<string>>(new Set())
  const [myAdminSections, setMyAdminSections] = useState<Set<string>>(new Set())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load current user and session config on mount
  useEffect(() => {
    Promise.all([
      api.auth.me().then((u) => setUser(u as User)).catch(() => setUser(null)),
      api.permissions.mine().then(pages => setMyPages(new Set(pages))).catch(() => {}),
      api.adminPermissions.mine().then(sections => setMyAdminSections(new Set(sections))).catch(() => {}),
      fetch('/api/session-config')
        .then(r => r.json())
        .then(d => {
          setSessionTimeoutDays(parseInt(d.session_timeout_days) || 0)
          setBookingMaxDaysAhead(parseInt(d.booking_max_days_ahead) || 5)
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  // Idle auto-logout — skipped when timeout is 0 (never) or user is admin
  useEffect(() => {
    if (!user || allRoles(user).includes('admin') || sessionTimeoutDays <= 0) return

    const ms = sessionTimeoutDays * 24 * 60 * 60 * 1000

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(async () => {
        try { await api.auth.logout() } catch {}
        setUser(null)
      }, ms)
    }

    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    resetTimer()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      events.forEach(e => window.removeEventListener(e, resetTimer))
    }
  }, [user?.id, user?.role, sessionTimeoutDays])

  const login = async (email: string, password: string) => {
    const u = await api.auth.login(email, password) as User
    setUser(u)
  }

  const logout = async () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    await api.auth.logout()
    setUser(null)
  }

  const isFamilyMember = user?.is_family_member ?? false

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      logout,
      isAdmin: !isFamilyMember && (user ? allRoles(user).some(r => r === 'admin' || r === 'developer') : false),
      isBoard: !isFamilyMember && (user ? allRoles(user).some(r => BOARD_ROLES.includes(r)) : false),
      isFamilyMember,
      bookingMaxDaysAhead,
      hasPermission: (page: string) => (!isFamilyMember && (user ? allRoles(user).some(r => r === 'admin' || r === 'developer') : false)) || myPages.has(page),
      canSeeAdmin: (section: string) => !isFamilyMember && ((user ? allRoles(user).some(r => r === 'admin' || r === 'developer') : false) || myAdminSections.has(section)),
      canAccessAdmin: !isFamilyMember && (
        (user ? allRoles(user).some(r => r === 'admin' || r === 'developer') : false) ||
        (user ? allRoles(user).some(r => BOARD_ROLES.includes(r)) : false) ||
        myAdminSections.size > 0
      ),
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
