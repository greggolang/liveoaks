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

async function upload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', credentials: 'include', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || 'Upload failed')
  }
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
  courts: { list: () => request('/courts') },
  bookings: {
    list: (date?: string) => request(`/bookings${date ? `?date=${date}` : ''}`),
    create: (data: object) => request('/bookings', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/bookings/${id}`, { method: 'DELETE' }),
  },
  announcements: {
    list: () => request('/announcements'),
    create: (data: object) => request('/announcements', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/announcements/${id}`, { method: 'DELETE' }),
  },
  members: { directory: () => request('/members/directory') },
  events: {
    list: () => request('/events'),
    create: (data: object) => request('/events', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/events/${id}`, { method: 'DELETE' }),
  },
  documents: {
    list: () => request('/documents'),
    upload: (title: string, category: string, file: File) => {
      const f = new FormData(); f.append('title', title); f.append('category', category); f.append('file', file)
      return upload('/admin/documents', f)
    },
    delete: (id: string) => request(`/admin/documents/${id}`, { method: 'DELETE' }),
  },
  dues: {
    myDues: () => request('/dues/me'),
    adminList: () => request('/admin/dues'),
    updateStatus: (id: string, status: string) =>
      request(`/admin/dues/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    generate: (amount: number, due_date: string) =>
      request('/admin/dues/generate', { method: 'POST', body: JSON.stringify({ amount, due_date }) }),
  },
  waitlist: {
    join: (data: object) => request('/waitlist', { method: 'POST', body: JSON.stringify(data) }),
    list: () => request('/admin/waitlist'),
    updateStatus: (id: string, status: string) =>
      request(`/admin/waitlist/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    delete: (id: string) => request(`/admin/waitlist/${id}`, { method: 'DELETE' }),
  },
  guests: {
    log: (data: object) => request('/guests', { method: 'POST', body: JSON.stringify(data) }),
    myGuests: () => request('/guests/me'),
    adminList: () => request('/admin/guests'),
  },
  usta: {
    list: () => request('/usta-teams'),
    create: (data: object) => request('/usta-teams', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/usta-teams/${id}`, { method: 'DELETE' }),
  },
  photos: {
    list: () => request('/photos'),
    upload: (title: string, description: string, file: File) => {
      const f = new FormData(); f.append('title', title); f.append('description', description); f.append('file', file)
      return upload('/admin/photos', f)
    },
    delete: (id: string) => request(`/admin/photos/${id}`, { method: 'DELETE' }),
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
    activityLog: () => request('/admin/activity-log'),
    testEmail: (to: string) =>
      request('/admin/test-email', { method: 'POST', body: JSON.stringify({ to }) }),
  },
}
