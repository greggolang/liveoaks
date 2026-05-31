export interface EmailThread {
  id: string; subject: string; from: string; snippet: string
  date: string; unread: boolean; message_count: number
}
export interface EmailMessage {
  id: string; from: string; to: string; cc?: string
  subject: string; date: string; body: string; unread: boolean
}
export interface EmailThreadDetail { id: string; subject: string; messages: EmailMessage[] }

export interface DriveFile {
  id: string; name: string; mime_type: string; modified_time: string
  size?: number; web_view_link?: string; icon_link?: string; is_folder: boolean
}

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
    updateProfile: (data: object) => request('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
    changePassword: (current: string, newPw: string) =>
      request('/auth/password', { method: 'PUT', body: JSON.stringify({ current, new: newPw }) }),
    forgotPassword: (email: string) =>
      request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
    resetPassword: (token: string, password: string) =>
      request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
  },
  courts: { list: () => request('/courts') },
  bookings: {
    list: (date?: string) => request(`/bookings${date ? `?date=${date}` : ''}`),
    mine: () => request('/bookings/mine'),
    history: () => request('/bookings/history'),
    adminCreate: (data: object) => request('/admin/bookings', { method: 'POST', body: JSON.stringify(data) }),
    create: (data: object) => request('/bookings', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: object) => request(`/bookings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string, reason?: string) => request(`/bookings/${id}`, {
      method: 'DELETE',
      body: reason ? JSON.stringify({ reason }) : undefined,
    }),
    cancelReasons: {
      list: () => request('/booking-cancel-reasons'),
      create: (reason: string) => request('/admin/booking-cancel-reasons', { method: 'POST', body: JSON.stringify({ reason }) }),
      delete: (id: string) => request(`/admin/booking-cancel-reasons/${id}`, { method: 'DELETE' }),
    },
  },
  announcements: {
    list: () => request('/announcements'),
    create: (data: object) => request('/announcements', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: object) => request(`/announcements/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/announcements/${id}`, { method: 'DELETE' }),
    confirmRead: (id: string) => request(`/announcements/${id}/read`, { method: 'POST' }),
    getReadStats: (id: string) => request(`/announcements/${id}/reads`),
  },
  members: { directory: () => request('/members/directory') },
  friends: {
    list: () => request('/friends'),
    searchMembers: (q: string, ustaRanking?: string) =>
      request(`/friends/search?q=${encodeURIComponent(q)}${ustaRanking ? `&usta_ranking=${encodeURIComponent(ustaRanking)}` : ''}`),
    addMember: (friendUserId: string) => request('/friends/member', { method: 'POST', body: JSON.stringify({ friend_user_id: friendUserId }) }),
    addGuest: (data: object) => request('/friends/guest', { method: 'POST', body: JSON.stringify(data) }),
    addFromFamily: (familyMemberId: string) => request(`/friends/from-family/${familyMemberId}`, { method: 'POST' }),
    remove: (id: string) => request(`/friends/${id}`, { method: 'DELETE' }),
  },
  invitations: {
    getRoster: (bookingId: string) => request(`/bookings/${bookingId}/roster`),
    send: (bookingId: string, data: object) => request(`/bookings/${bookingId}/invite`, { method: 'POST', body: JSON.stringify(data) }),
    addPlayer: (bookingId: string, data: object) => request(`/bookings/${bookingId}/players`, { method: 'POST', body: JSON.stringify(data) }),
    removePlayer: (bookingId: string, playerId: string) => request(`/bookings/${bookingId}/players/${playerId}`, { method: 'DELETE' }),
    withdraw: (bookingId: string, reason?: string) =>
      request(`/bookings/${bookingId}/withdraw`, { method: 'POST', body: JSON.stringify({ reason: reason ?? '' }) }),
    respond: (token: string, action: 'accept' | 'decline') => request(`/invite/${token}/${action}`, { method: 'POST' }),
    cancel: (id: string) => request(`/invitations/${id}/cancel`, { method: 'PUT' }),
    responses: () => request('/invitations/responses'),
    pending: () => request('/invitations/pending'),
    sentPending: () => request('/invitations/sent/pending'),
  },
  contacts: {
    list: () => request('/contacts'),
    create: (data: object) => request('/contacts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: object) => request(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/contacts/${id}`, { method: 'DELETE' }),
  },
  weather: {
    get: () => request('/weather'),
    airQuality: () => request('/air-quality'),
  },
  events: {
    list: () => request('/events'),
    get: (id: string) => request(`/events/${id}`),
    create: (data: object) => request('/events', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/events/${id}`, { method: 'DELETE' }),
    sendEmail: (id: string, templateName: string, userIds?: string[]) =>
      request(`/events/${id}/send-email`, { method: 'POST', body: JSON.stringify({ template_name: templateName, user_ids: userIds ?? [] }) }),
  },
  receipts: {
    list: () => request('/admin/receipts'),
    upload: (data: { title: string; amount: string; receipt_date: string; category: string; notes: string; file: File }) => {
      const f = new FormData()
      f.append('title', data.title)
      f.append('amount', data.amount)
      f.append('receipt_date', data.receipt_date)
      f.append('category', data.category)
      f.append('notes', data.notes)
      f.append('file', data.file)
      return upload('/admin/receipts', f)
    },
    delete: (id: string) => request(`/admin/receipts/${id}`, { method: 'DELETE' }),
  },
  emailTemplates: {
    list: () => request('/admin/email-templates'),
    create: (data: object) => request('/admin/email-templates', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: object) => request(`/admin/email-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/admin/email-templates/${id}`, { method: 'DELETE' }),
  },
  signups: {
    submit: (eventId: string, data: object) => request(`/events/${eventId}/signup`, { method: 'POST', body: JSON.stringify(data) }),
    list: (eventId: string) => request(`/admin/events/${eventId}/signups`),
    summary: (eventId: string) => request(`/admin/events/${eventId}/signups/summary`),
    delete: (eventId: string, signupId: string) => request(`/admin/events/${eventId}/signups/${signupId}`, { method: 'DELETE' }),
    toggleSignup: (eventId: string, data: object) => request(`/events/${eventId}/signup-toggle`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  google: {
    credentials: () => request<{ email: string; password: string }>('/google/credentials'),
    email: {
      listThreads: (params?: { label?: string; q?: string; pageToken?: string }) => {
        const p = new URLSearchParams()
        if (params?.label) p.set('label', params.label)
        if (params?.q) p.set('q', params.q)
        if (params?.pageToken) p.set('pageToken', params.pageToken)
        return request<{ threads: EmailThread[]; next_page_token: string; mailbox: string }>(
          `/google/email/threads${p.toString() ? '?' + p : ''}`
        )
      },
      getThread: (threadId: string) =>
        request<EmailThreadDetail>(`/google/email/threads/${threadId}`),
      send: (data: { to: string; subject: string; body: string; thread_id?: string; reply_to_message_id?: string }) =>
        request<{ id: string; thread_id: string }>('/google/email/send', { method: 'POST', body: JSON.stringify(data) }),
      markRead: (threadId: string) =>
        request(`/google/email/threads/${threadId}/read`, { method: 'PUT' }),
      trash: (threadId: string) =>
        request(`/google/email/threads/${threadId}`, { method: 'DELETE' }),
    },
    drive: {
      listFiles: (folderId?: string, pageToken?: string) => {
        const p = new URLSearchParams()
        if (folderId) p.set('folderId', folderId)
        if (pageToken) p.set('pageToken', pageToken)
        return request<{ files: DriveFile[]; next_page_token: string; mailbox: string }>(
          `/google/drive/files${p.toString() ? '?' + p : ''}`
        )
      },
    },
  },
  bylaws: {
    meta: () => request<{ uploaded_at: string | null }>('/admin/bylaws/meta'),
    upload: (file: File) => {
      const f = new FormData(); f.append('file', file)
      return upload<{ uploaded_at: string }>('/admin/bylaws', f)
    },
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
    updateContact: (id: string, email: string, phone: string, usta_ranking: string) =>
      request(`/admin/waitlist/${id}/contact`, { method: 'PUT', body: JSON.stringify({ email, phone, usta_ranking }) }),
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
  groups: {
    list: () => request('/friend-groups'),
    create: (name: string) => request('/friend-groups', { method: 'POST', body: JSON.stringify({ name }) }),
    update: (id: string, name: string) => request(`/friend-groups/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
    delete: (id: string) => request(`/friend-groups/${id}`, { method: 'DELETE' }),
    addMember: (groupId: string, friendId: string) =>
      request(`/friend-groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ friend_id: friendId }) }),
    removeMember: (groupId: string, friendId: string) =>
      request(`/friend-groups/${groupId}/members/${friendId}`, { method: 'DELETE' }),
  },
  family: {
    list: () => request('/family-members'),
    listAll: () => request('/family-members/all'),
    create: (data: object) => request('/family-members', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: object) => request(`/family-members/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/family-members/${id}`, { method: 'DELETE' }),
    adminList: (userId: string) => request(`/admin/users/${userId}/family`),
    adminListAll: () => request('/admin/family-members'),
    adminCreate: (userId: string, data: object) => request(`/admin/users/${userId}/family`, { method: 'POST', body: JSON.stringify(data) }),
    adminUpdate: (userId: string, id: string, data: object) => request(`/admin/users/${userId}/family/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    adminDelete: (userId: string, id: string) => request(`/admin/users/${userId}/family/${id}`, { method: 'DELETE' }),
    setPassword: (id: string, password: string) =>
      request(`/family-members/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
  },
  feedback: {
    submit: (message: string, type: 'idea' | 'bug', page?: string) =>
      request('/feedback', { method: 'POST', body: JSON.stringify({ message, type, page }) }),
    newItems: () => request('/feedback/new'),
    adminList: () => request('/admin/feedback'),
    updateStatus: (id: string, status: string) =>
      request(`/admin/feedback/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    delete: (id: string) => request(`/admin/feedback/${id}`, { method: 'DELETE' }),
  },
  permissions: {
    getAll: () => request<Record<string, string[]>>('/admin/permissions'),
    toggle: (page: string, role: string, allowed: boolean) =>
      request(`/admin/permissions/${encodeURIComponent(page)}/${encodeURIComponent(role)}`,
        { method: 'PUT', body: JSON.stringify({ allowed }) }),
  },
  admin: {
    users: () => request('/admin/users'),
    createUser: (data: object) => request('/admin/users', { method: 'POST', body: JSON.stringify(data) }),
    updateProfile: (id: string, data: object) =>
      request(`/admin/users/${id}/profile`, { method: 'PUT', body: JSON.stringify(data) }),
    updateRole: (id: string, role: string) =>
      request(`/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
    updateExtraRoles: (id: string, roles: string[]) =>
      request(`/admin/users/${id}/extra-roles`, { method: 'PUT', body: JSON.stringify({ roles }) }),
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
    smtpPing: () => request('/admin/smtp-ping'),
  },
  memberAlerts: {
    getMyAlerts: () => request<{ id: string; message: string; type: string; created_at: string; created_by_name?: string }[]>('/member-alerts'),
    dismiss: (id: string) => request(`/member-alerts/${id}/dismiss`, { method: 'POST' }),
    adminList: (userId: string) => request<{ id: string; message: string; type: string; created_at: string; dismissed_at?: string }[]>(`/admin/member-alerts/${userId}`),
    adminCreate: (userId: string, message: string, type: string) =>
      request('/admin/member-alerts', { method: 'POST', body: JSON.stringify({ user_id: userId, message, type }) }),
    adminDelete: (id: string) => request(`/admin/member-alerts/${id}`, { method: 'DELETE' }),
  },
  camera: {
    embedURL: () => request<{ url: string }>('/camera/embed'),
    updateURL: (url: string) =>
      request<{ url: string }>('/admin/camera/url', { method: 'PUT', body: JSON.stringify({ url }) }),
    adminStatus: () => request<{ online: boolean; url: string; last_restart: string }>('/admin/camera/status'),
  },
  boardMeetings: {
    myInvitations: () => request('/board-meetings/invitations/mine'),
    respond: (token: string, action: 'accept' | 'decline') =>
      request(`/board-meetings/invite/${token}/${action}`, { method: 'POST' }),
    admin: {
      list: () => request('/admin/board-meetings'),
      create: (data: object) => request('/admin/board-meetings', { method: 'POST', body: JSON.stringify(data) }),
      roster: (id: string) => request(`/admin/board-meetings/${id}/roster`),
      delete: (id: string) => request(`/admin/board-meetings/${id}`, { method: 'DELETE' }),
    },
  },
  liveball: {
    myInvitations: () => request('/liveball/my-invitations'),
    respond: (token: string, action: 'accept' | 'decline') =>
      request(`/liveball/${token}/${action}`, { method: 'POST' }),
    admin: {
      list: () => request('/admin/liveball'),
      create: (data: object) => request('/admin/liveball', { method: 'POST', body: JSON.stringify(data) }),
      roster: (id: string) => request(`/admin/liveball/${id}/roster`),
      preview: (id: string, levels: string[]) =>
        request(`/admin/liveball/${id}/preview?${levels.map(l => `level=${encodeURIComponent(l)}`).join('&')}`),
      sendInvites: (id: string, data: object) =>
        request(`/admin/liveball/${id}/invite`, { method: 'POST', body: JSON.stringify(data) }),
      removePlayer: (id: string, userId: string) =>
        request(`/admin/liveball/${id}/players/${userId}`, { method: 'DELETE' }),
      cancelEvent: (id: string) => request(`/admin/liveball/${id}`, { method: 'DELETE' }),
    },
  },
  ladder: {
    list: () => request('/ladder'),
    get: (id: string) => request(`/ladder/${id}`),
    register: (id: string, data: object) => request(`/ladder/${id}/register`, { method: 'POST', body: JSON.stringify(data) }),
    myStatus: (id: string) => request(`/ladder/${id}/me`),
    createChallenge: (id: string, data: object) => request(`/ladder/${id}/challenge`, { method: 'POST', body: JSON.stringify(data) }),
    respondChallenge: (challengeId: string, action: 'accept' | 'decline') =>
      request(`/challenges/${challengeId}/respond`, { method: 'PUT', body: JSON.stringify({ action }) }),
    leaderboard: (id: string) => request(`/ladder/${id}/leaderboard`),
    admin: {
      list: () => request('/admin/ladder'),
      create: (data: object) => request('/admin/ladder', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: object) => request(`/admin/ladder/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) => request(`/admin/ladder/${id}?confirm=true`, { method: 'DELETE' }),
      registrations: (id: string) => request(`/admin/ladder/${id}/registrations`),
      approveReg: (ladderId: string, userId: string, status: string) =>
        request(`/admin/ladder/${ladderId}/registrations/${userId}`, { method: 'PUT', body: JSON.stringify({ status }) }),
      setRank: (ladderId: string, userId: string, rank: number) =>
        request(`/admin/ladder/${ladderId}/rank`, { method: 'PUT', body: JSON.stringify({ user_id: userId, rank }) }),
      challenges: (id: string, status?: string) => request(`/admin/ladder/${id}/challenges${status ? `?status=${status}` : ''}`),
      enterResult: (challengeId: string, winnerId: string, score: string) =>
        request(`/admin/challenges/${challengeId}/result`, { method: 'PUT', body: JSON.stringify({ winner_id: winnerId, score }) }),
      forfeit: (challengeId: string) =>
        request(`/admin/challenges/${challengeId}/forfeit`, { method: 'PUT' }),
      awardPoints: (ladderId: string, data: object) =>
        request(`/admin/ladder/${ladderId}/points`, { method: 'POST', body: JSON.stringify(data) }),
    },
  },
  broadcast: {
    recipients: (roles?: string[]) =>
      request(`/admin/broadcast/recipients${roles && roles.length ? '?' + roles.map(r => `role=${r}`).join('&') : ''}`),
    send: (subject: string, body: string, confirmCode: string, roles?: string[]) =>
      request('/admin/broadcast/send', { method: 'POST', body: JSON.stringify({ subject, body, confirm_code: confirmCode, roles: roles ?? [] }) }),
  },
  notes: {
    list: () => request('/admin/notes'),
    create: (title: string, body: string) => request('/admin/notes', { method: 'POST', body: JSON.stringify({ title, body }) }),
    update: (id: string, title: string, body: string) => request(`/admin/notes/${id}`, { method: 'PUT', body: JSON.stringify({ title, body }) }),
    delete: (id: string) => request(`/admin/notes/${id}`, { method: 'DELETE' }),
  },
  fantasy: {
    // Member
    tournaments: () => request('/fantasy/tournaments'),
    players: (gender?: 'M' | 'W') => request(`/fantasy/players${gender ? `?gender=${gender}` : ''}`),
    leaderboard: () => request('/fantasy/leaderboard'),
    myStatus: () => request('/fantasy/me'),
    myPicks: () => request('/fantasy/picks'),
    myScores: () => request('/fantasy/scores'),
    results: (tid: string) => request(`/fantasy/results/${tid}`),
    join: () => request('/fantasy/join', { method: 'POST' }),
    savePicks: (tid: string, picks: { slot: string; player_id: string }[]) =>
      request(`/fantasy/picks/${tid}`, { method: 'PUT', body: JSON.stringify({ picks }) }),
    // Admin
    admin: {
      tournaments: () => request('/admin/fantasy/tournaments'),
      createTournament: (data: object) => request('/admin/fantasy/tournaments', { method: 'POST', body: JSON.stringify(data) }),
      updateTournament: (id: string, data: object) => request(`/admin/fantasy/tournaments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      deleteTournament: (id: string) => request(`/admin/fantasy/tournaments/${id}`, { method: 'DELETE' }),
      players: () => request('/admin/fantasy/players'),
      createPlayer: (data: object) => request('/admin/fantasy/players', { method: 'POST', body: JSON.stringify(data) }),
      updatePlayer: (id: string, data: object) => request(`/admin/fantasy/players/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      deletePlayer: (id: string) => request(`/admin/fantasy/players/${id}`, { method: 'DELETE' }),
      saveResult: (data: object) => request('/admin/fantasy/results', { method: 'PUT', body: JSON.stringify(data) }),
      deleteResult: (tid: string, pid: string) => request(`/admin/fantasy/results/${tid}/${pid}`, { method: 'DELETE' }),
      participants: () => request('/admin/fantasy/participants'),
      updatePaid: (userId: string, paid: boolean) =>
        request(`/admin/fantasy/participants/${userId}/paid`, { method: 'PUT', body: JSON.stringify({ paid }) }),
      pickPopularity: (tid: string) => request(`/admin/fantasy/picks/popularity/${tid}`),
    },
  },
  bookingReminder: {
    getInfo: (token: string) => request(`/booking-reminder/${token}`),
    confirm: (token: string) => request(`/booking-reminder/${token}/ok`, { method: 'POST' }),
    reportIssue: (token: string, note: string) =>
      request(`/booking-reminder/${token}/issue`, { method: 'POST', body: JSON.stringify({ note }) }),
  },
}
