const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || 'Request failed')
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (data: object) =>
      request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    me: () => request('/auth/me'),
    forgotPassword: (email: string) =>
      request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
    resetPassword: (token: string, password: string) =>
      request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
  },
  courts: {
    list: () => request('/courts'),
  },
  bookings: {
    list: (date?: string) => request(`/bookings${date ? `?date=${date}` : ''}`),
    create: (data: object) =>
      request('/bookings', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/bookings/${id}`, { method: 'DELETE' }),
  },
  announcements: {
    list: () => request('/announcements'),
    create: (data: object) =>
      request('/announcements', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/announcements/${id}`, { method: 'DELETE' }),
  },
  admin: {
    users: () => request('/admin/users'),
    updateRole: (id: string, role: string) =>
      request(`/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
    updateStatus: (id: string, status: string) =>
      request(`/admin/users/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    deleteUser: (id: string) => request(`/admin/users/${id}`, { method: 'DELETE' }),
    settings: () => request('/admin/settings'),
    updateSetting: (key: string, value: string) =>
      request(`/admin/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }),
    passwordResets: () => request('/admin/password-resets'),
  },
}
