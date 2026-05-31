import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { api } from '../api/client'

const BOARD_ROLES = [
  'admin', 'president', 'vice_president', 'secretary', 'treasurer',
  'billing', 'membership', 'usta', 'entertainment', 'house_grounds',
  'games', 'pro',
]

interface User {
  id: string
  first_name: string
  last_name: string
  email: string
  role: string
  extra_roles?: string[]
  status: string
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
  bookingMaxDaysAhead: number
}

const AuthContext = createContext<AuthContextType>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(60)
  const [bookingMaxDaysAhead, setBookingMaxDaysAhead] = useState(5)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load current user and session config on mount
  useEffect(() => {
    Promise.all([
      api.auth.me().then((u) => setUser(u as User)).catch(() => setUser(null)),
      fetch('/api/session-config')
        .then(r => r.json())
        .then(d => {
          setSessionTimeoutMinutes(parseInt(d.session_timeout_minutes) || 60)
          setBookingMaxDaysAhead(parseInt(d.booking_max_days_ahead) || 5)
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  // Idle auto-logout — never fires for admin role (primary or extra)
  useEffect(() => {
    if (!user || allRoles(user).includes('admin') || sessionTimeoutMinutes <= 0) return

    const ms = sessionTimeoutMinutes * 60 * 1000

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
  }, [user?.id, user?.role, sessionTimeoutMinutes])

  const login = async (email: string, password: string) => {
    const u = await api.auth.login(email, password) as User
    setUser(u)
  }

  const logout = async () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    await api.auth.logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      logout,
      isAdmin: user ? allRoles(user).includes('admin') : false,
      isBoard: user ? allRoles(user).some(r => BOARD_ROLES.includes(r)) : false,
      bookingMaxDaysAhead,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
