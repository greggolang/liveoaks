import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { api } from '../api/client'

interface User {
  id: string
  first_name: string
  last_name: string
  email: string
  role: 'admin' | 'board' | 'member'
  status: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  isAdmin: boolean
  isBoard: boolean
}

const AuthContext = createContext<AuthContextType>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.auth.me()
      .then((u) => setUser(u as User))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const u = await api.auth.login(email, password) as User
    setUser(u)
  }

  const logout = async () => {
    await api.auth.logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      logout,
      isAdmin: user?.role === 'admin',
      isBoard: user?.role === 'board' || user?.role === 'admin',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
