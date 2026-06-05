export interface FinancialRule {
  id: string; name: string; enabled: boolean; condition: string
  grace_days: number; actions: string[]; created_at: string; updated_at: string
}
export interface MemberBalance {
  user_id: string; first_name: string; last_name: string; email: string
  dues_owed: number; kiosk_tab: number; charges_owed: number; total: number
  oldest_due?: string
}
export interface ApplianceItem {
  id: string; name: string; location?: string; brand?: string
  model_number?: string; serial_number?: string; installed_date?: string
  notes?: string; manual_filename?: string; manual_original_name?: string
  created_at: string; updated_at: string; updated_by_name?: string
}
export interface ApplianceServiceRecord {
  id: string; appliance_id: string; service_date: string; service_type: string
  description?: string; technician?: string; cost?: number
  created_by?: string; created_by_name: string; created_at: string
}
export interface ApplianceReminder {
  id: string; appliance_id: string; title: string; due_date: string
  recurrence_days?: number; notes?: string; last_sent_at?: string; created_at: string
}

export interface StatementEntry {
  id: string; date: string; category: string; description: string
  amount: number; status: string
}
export interface MyBalance {
  dues_owed: number; kiosk_tab: number; charges_owed: number; total: number
}
export interface PLMonth {
  month: string; label: string; dues: number; kiosk_sales: number
  charges: number; guest_fees: number; income: number; expenses: number; net: number
}
export interface PLReport {
  year: number; months: PLMonth[]; totals: PLMonth
  expense_breakdown?: Record<string, number>
}

export interface MemberRequest {
  id: string; first_name: string; last_name: string
  email?: string; phone?: string; notes?: string; admin_notes?: string
  usta_ranking?: string; status: string
  application_date?: string; created_at: string
}

export interface DocFile {
  id: string; title: string; filename: string; original_name: string; created_at: string
  uploaded_by_name?: string; ai_indexed?: boolean; indexed?: boolean
}
export interface DocFolder {
  id: string; name: string; sort_order: number; roles: string[]
  parent_id?: string | null
  doc_count?: number; docs?: DocFile[]
  children?: DocFolder[]
}
export interface PhotoFile {
  id: string; title: string; filename: string; description?: string; created_at: string
}
export interface PhotoFolder {
  id: string; name: string; sort_order: number; roles: string[]
  photo_count?: number; photos?: PhotoFile[]
}

export interface MemberMessage {
  id: string
  sender_id: string; sender_name: string
  recipient_id: string; recipient_name: string
  subject: string; body: string
  reply_to_id?: string; reply_to_subject?: string; reply_to_sender_name?: string
  read_at?: string
  created_at: string
}

export interface IMAPMessage {
  uid: number; subject: string; from: string; date: string; unread: boolean
}

export interface ConvSummary {
  id: string; title: string | null; participants: string; member_count: number
  last_body: string | null; last_sender_name: string | null; last_at: string | null; unread: number; muted: boolean
}
export interface ConvPerson { id: string; name: string }
export interface ConvMessage { id: string; sender_id: string | null; sender_name: string; body: string; created_at: string }
export interface ConvDetail { id: string; title: string | null; muted: boolean; participants: ConvPerson[]; messages: ConvMessage[] }

export interface PendingMatchPlayer { user_id: string | null; name: string; is_guest: boolean }
export interface PendingMatch {
  booking_id: string; court_name: string; start_time: string
  match_type: 'singles' | 'doubles'; players: PendingMatchPlayer[]
}
export interface MatchSet { a: number; b: number; tba?: number | null; tbb?: number | null }
export interface MatchParticipant { side: number; position: number; user_id: string | null; name: string; is_guest: boolean }
export interface MatchResult {
  id: string; booking_id: string | null; match_type: 'singles' | 'doubles'
  court_name: string | null; played_at: string; visibility: 'public' | 'private'
  winner_side: number; score_summary: string; sets: MatchSet[]
  reported_by_name: string | null; reported_by: string | null
  created_at: string; participants: MatchParticipant[]
}
export interface MatchInput {
  booking_id: string; visibility: 'public' | 'private'
  teams: { user_id: string | null; name: string; is_guest: boolean }[][]
  sets: MatchSet[]
}
export type MatchUpdateInput = Omit<MatchInput, 'booking_id'>
export interface LeaderboardRow { user_id: string; name: string; wins: number; losses: number; played: number; win_pct: number }
export interface HeadToHeadRow { user_id: string; name: string; wins: number; losses: number; played: number }
export interface PlayerStats {
  id: string; name: string; photo_url: string | null
  wins: number; losses: number; played: number; win_pct: number
  sets_won: number; sets_lost: number; games_won: number; games_lost: number
  form: string[]; head_to_head: HeadToHeadRow[]; matches: MatchResult[]
}
export interface MatchStat { user_id: string; wins: number; losses: number; played: number; last_played: string | null }
export interface ClubQuestion {
  id: string; question: string; asked_by_name: string | null
  status: 'pending' | 'answered'; answer: string | null
  answered_by_name: string | null; answered_at: string | null; created_at: string
}

export type MailFilterInput = {
  name: string
  enabled: boolean
  match_field: 'from' | 'to_cc' | 'subject' | 'body'
  pattern: string
  source_folder: string
  action: 'move' | 'delete' | 'mark_read'
  dest_folder: string
}
export interface MailFilter extends MailFilterInput {
  id: string
  account_id: string
  matched_count: number
  last_run_at: string | null
  last_error: string
  created_at: string
  updated_at: string
}

export interface TaxDocument {
  id: string; category: string; label: string; tax_year: number | null
  filename: string; original_name: string; uploaded_by_name: string | null; created_at: string
}
export interface TaxContractor {
  id: string; tax_year: number; name: string; amount_paid: number
  w9_received: boolean; form_1099_sent: boolean; notes: string; created_at: string
}

export interface YoLinkRule {
  id: string
  name: string
  enabled: boolean
  priority: number                  // lower = evaluated first; default 100
  device_id: string | null
  device_type: string | null
  event_contains: string | null
  state_equals: string | null
  active_start_time: string | null  // "HH:MM" 24h, null = no restriction
  active_end_time: string | null    // "HH:MM" 24h, null = no restriction
  active_days: number | null        // bitmask: bit0=Sun..bit6=Sat, null = any
  cooldown_minutes: number | null   // suppress re-firing within N min, null = none
  last_fired_at: string | null      // read-only, set by the service
  stop_processing: boolean          // halt lower-priority rules after this one fires
  notes: string | null
  recipient_scope: 'all_members' | 'board' | 'role' | 'user'
  recipient_role: string | null
  recipient_user_id: string | null
  notify_dashboard: boolean
  notify_email: boolean
  notify_sms: boolean
  alert_type: 'info' | 'warning' | 'danger'
  message_template: string | null
  created_at: string
}
export interface IMAPMessageDetail extends IMAPMessage {
  to: string; cc?: string; body: string
}
export interface MailContact {
  id: string; user_id: string; name: string; email: string
  phone?: string; notes?: string; created_at: string; updated_at: string
}

export interface BoardMinutes {
  id: string; event_id: string
  called_to_order?: string; adjourned_at?: string
  attendees_present?: string; attendees_absent?: string
  prev_minutes_approved: boolean
  treasurer_report?: string; old_business?: string; new_business?: string
  action_items?: string; additional_notes?: string; submitted_by?: string
  published_at?: string; created_at: string; updated_at: string
}

export interface Poll {
  id: string; title: string; question: string; options: string[]
  created_by: string; creator_name: string; created_at: string
  deadline_at?: string | null; status: 'active' | 'closed'
  total_votes: number; results: Record<string, number>
  has_voted: boolean; my_vote?: string
}

export interface CollabDocSummary {
  id: string; title: string; version: number
  updated_at: string; updated_by_name: string; created_by_name: string
  active_editors: number
}
export interface CollabDoc {
  id: string; title: string; body: string; version: number
  created_by: string | null
  updated_at: string; updated_by_name: string; created_by_name: string
}
export interface CollabEditor { user_id: string; name: string; editing: boolean }
export type CollabSaveResult =
  | { status: 'ok'; version: number; updated_at: string }
  | { status: 'conflict'; document: CollabDoc }
export interface CollabPresence { editors: CollabEditor[]; version: number; updated_by_name: string }

// --- AI assistant shapes ---
export interface DraftedMinutes {
  attendees_present: string; attendees_absent: string; treasurer_report: string
  old_business: string; new_business: string; action_items: string; additional_notes: string
}
export interface FeedbackDigestTheme {
  title: string; type: 'bug' | 'idea' | 'mixed'; count: number
  item_numbers: number[]; summary: string; suggestion: string; priority: 'high' | 'medium' | 'low'
}
export interface FeedbackDigest { summary: string; themes: FeedbackDigestTheme[] }
export interface ParsedScore {
  match_type: 'singles' | 'doubles'
  teams: { name: string; user_id: string | null; is_guest: boolean }[][]
  sets: { a: number; b: number; tba: number | null; tbb: number | null }[]
  winner_side: number; confidence: 'high' | 'medium' | 'low'; notes: string
}
export interface ReceiptAnalysis {
  title: string; amount: string; receipt_date: string; category: string; notes: string
  confidence: 'high' | 'medium' | 'low'
}

const BASE = '/api'
export const IMPERSONATION_KEY = 'impersonation_jwt'

function impersonationHeaders(): Record<string, string> {
  try {
    const jwt = sessionStorage.getItem(IMPERSONATION_KEY)
    if (jwt) return { Authorization: `Bearer ${jwt}` }
  } catch {}
  return {}
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...impersonationHeaders(), ...options?.headers },
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
  const res = await fetch(`${BASE}${path}`, { method: 'POST', credentials: 'include', headers: impersonationHeaders(), body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || 'Upload failed')
  }
  return res.json()
}

function uploadWithProgress<T>(path: string, form: FormData, onProgress?: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.withCredentials = true
    xhr.open('POST', `${BASE}${path}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)) } catch { reject(new Error('Upload failed')) }
      } else {
        try { const err = JSON.parse(xhr.responseText); reject(new Error(err.message || 'Upload failed')) }
        catch { reject(new Error(xhr.statusText || 'Upload failed')) }
      }
    }
    xhr.onerror = () => reject(new Error('Upload failed'))
    xhr.send(form)
  })
}

export const api = {
  version: {
    get: () => request<{ version: string }>('/version'),
  },
  auth: {
    login: (email: string, password: string) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (data: object) =>
      request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    me: () => request('/auth/me'),
    updateProfile: (data: object) => request('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
    uploadPhoto: (file: File) => { const f = new FormData(); f.append('file', file); return upload<{ photo_url: string }>('/profile/photo', f) },
    deletePhoto: () => request('/profile/photo', { method: 'DELETE' }),
    changePassword: (current: string, newPw: string) =>
      request('/auth/password', { method: 'PUT', body: JSON.stringify({ current, new: newPw }) }),
    forgotPassword: (email: string) =>
      request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
    resetPassword: (token: string, password: string) =>
      request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
    redeemImpersonation: (token: string) =>
      request<{ jwt: string; name: string }>('/auth/redeem-impersonation', { method: 'POST', body: JSON.stringify({ token }) }),
  },
  courts: { list: () => request('/courts') },
  courtWaitlist: {
    listForDate: (date: string) =>
      request<{ court_id: number; start_time: string; end_time: string; count: number; is_mine: boolean; my_entry_id?: string }[]>(
        `/court-waitlist?date=${date}`
      ),
    mine: () =>
      request<{ id: string; court_id: number; court_name: string; start_time: string; end_time: string; position: number; notified_at?: string; created_at: string }[]>(
        '/court-waitlist/mine'
      ),
    join: (data: { court_id: number; start_time: string; end_time: string }) =>
      request<{ id: string; position: number }>('/court-waitlist', { method: 'POST', body: JSON.stringify(data) }),
    leave: (id: string) => request(`/court-waitlist/${id}`, { method: 'DELETE' }),
  },
  courtBlocks: {
    listForDate: (date: string) => request(`/court-blocks?date=${date}`),
    listAdmin: () => request('/admin/court-blocks'),
    create: (data: object) => request('/admin/court-blocks', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/admin/court-blocks/${id}`, { method: 'DELETE' }),
  },
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
  members: {
    directory: () => request('/members/directory'),
    familyDirectory: () => request('/members/family-directory'),
  },
  siteContent: {
    get: () => request<any>('/site-content'),
    save: (content: unknown) => request('/admin/site-content', { method: 'PUT', body: JSON.stringify(content) }),
  },
  tax: {
    documents: {
      list: () => request<TaxDocument[]>('/admin/taxes/documents'),
      upload: (form: FormData) => upload<TaxDocument>('/admin/taxes/documents', form),
      delete: (id: string) => request(`/admin/taxes/documents/${id}`, { method: 'DELETE' }),
    },
    contractors: {
      list: () => request<TaxContractor[]>('/admin/taxes/contractors'),
      create: (data: Partial<TaxContractor>) => request<TaxContractor>('/admin/taxes/contractors', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: Partial<TaxContractor>) => request(`/admin/taxes/contractors/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) => request(`/admin/taxes/contractors/${id}`, { method: 'DELETE' }),
    },
    settings: {
      get: () => request<{ ein: string; sales_tax_rate: string }>('/admin/taxes/settings'),
      save: (data: { ein: string; sales_tax_rate: string }) => request('/admin/taxes/settings', { method: 'PUT', body: JSON.stringify(data) }),
    },
    salesSummary: (start: string, end: string) =>
      request<{ start: string; end: string; taxable_sales: number; rate: number; tax_collected: number }>(`/admin/taxes/sales-summary?start=${start}&end=${end}`),
  },
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
    withdraw: (bookingId: string, reason: string, transferToPlayerId?: string) =>
      request(`/bookings/${bookingId}/withdraw`, { method: 'POST', body: JSON.stringify({ reason, transfer_to_player_id: transferToPlayerId ?? null }) }),
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
    list: () => request<{ id: string; name: string; subject: string; body: string }[]>('/email-templates'),
    adminList: () => request('/admin/email-templates'),
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
  bylaws: {
    meta: () => request<{ uploaded_at: string | null }>('/admin/bylaws/meta'),
    upload: (file: File) => {
      const f = new FormData(); f.append('file', file)
      return upload<{ uploaded_at: string }>('/admin/bylaws', f)
    },
  },
  documents: {
    list: () => request<DocFolder[]>('/documents'),
    upload: (title: string, folderId: string, file: File, onProgress?: (pct: number) => void) => {
      const f = new FormData(); f.append('title', title); f.append('folder_id', folderId); f.append('file', file)
      return uploadWithProgress('/admin/documents', f, onProgress)
    },
    delete: (id: string) => request(`/admin/documents/${id}`, { method: 'DELETE' }),
    setAIIndexed: (id: string, indexed: boolean) =>
      request(`/admin/documents/${id}/ai-indexed`, { method: 'PUT', body: JSON.stringify({ indexed }) }),
    folders: {
      adminList: () => request<DocFolder[]>('/admin/document-folders'),
      create: (data: { name: string; sort_order: number; roles: string[]; parent_id?: string | null }) =>
        request('/admin/document-folders', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: { name: string; sort_order: number; roles: string[]; parent_id?: string | null }) =>
        request(`/admin/document-folders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) => request(`/admin/document-folders/${id}`, { method: 'DELETE' }),
    },
  },
  dues: {
    myDues: () => request('/dues/me'),
    adminList: () => request('/admin/dues'),
    updateStatus: (id: string, status: string) =>
      request(`/admin/dues/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    generate: (amount: number, due_date: string) =>
      request('/admin/dues/generate', { method: 'POST', body: JSON.stringify({ amount, due_date }) }),
    generateForUser: (user_id: string, amount: number, due_date: string) =>
      request('/admin/dues/generate-for-user', { method: 'POST', body: JSON.stringify({ user_id, amount, due_date }) }),
  },
  stripe: {
    getConfig: () => request<{ publishable_key: string }>('/stripe/config'),
    createPaymentIntent: (dueId: string) =>
      request<{ client_secret: string }>(`/dues/${dueId}/stripe-intent`, { method: 'POST' }),
  },
  waitlist: {
    join: (data: object) => request('/waitlist', { method: 'POST', body: JSON.stringify(data) }),
    list: () => request('/admin/waitlist'),
    updateStatus: (id: string, status: string) =>
      request(`/admin/waitlist/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    updateContact: (id: string, email: string, phone: string, usta_ranking: string) =>
      request(`/admin/waitlist/${id}/contact`, { method: 'PUT', body: JSON.stringify({ email, phone, usta_ranking }) }),
    updateAdminNotes: (id: string, admin_notes: string) =>
      request(`/admin/waitlist/${id}/admin-notes`, { method: 'PUT', body: JSON.stringify({ admin_notes }) }),
    delete: (id: string) => request(`/admin/waitlist/${id}`, { method: 'DELETE' }),
  },
  memberRequests: {
    list: () => request<MemberRequest[]>('/admin/member-requests'),
    approve: (id: string) =>
      request(`/admin/member-requests/${id}/approve`, { method: 'PUT' }),
    updateAdminNotes: (id: string, admin_notes: string) =>
      request(`/admin/member-requests/${id}/admin-notes`, { method: 'PUT', body: JSON.stringify({ admin_notes }) }),
    sendEmail: (id: string, subject: string, message: string) =>
      request(`/admin/member-requests/${id}/email`, { method: 'POST', body: JSON.stringify({ subject, message }) }),
    updateStatus: (id: string, status: string) =>
      request(`/admin/member-requests/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    delete: (id: string) => request(`/admin/member-requests/${id}`, { method: 'DELETE' }),
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
    list: () => request<PhotoFolder[]>('/photos'),
    upload: (title: string, description: string, folderId: string, file: File) => {
      const f = new FormData()
      f.append('title', title); f.append('description', description)
      f.append('folder_id', folderId); f.append('file', file)
      return upload('/admin/photos', f)
    },
    delete: (id: string) => request(`/admin/photos/${id}`, { method: 'DELETE' }),
    folders: {
      adminList: () => request<PhotoFolder[]>('/admin/photo-folders'),
      create: (data: { name: string; sort_order: number; roles: string[] }) =>
        request('/admin/photo-folders', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: { name: string; sort_order: number; roles: string[] }) =>
        request(`/admin/photo-folders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) => request(`/admin/photo-folders/${id}`, { method: 'DELETE' }),
    },
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
    updateAssigned: (id: string, assigned_to: string) =>
      request(`/admin/feedback/${id}/assigned`, { method: 'PUT', body: JSON.stringify({ assigned_to }) }),
    updateNote: (id: string, note: string) =>
      request(`/admin/feedback/${id}/note`, { method: 'PUT', body: JSON.stringify({ note }) }),
    delete: (id: string) => request(`/admin/feedback/${id}`, { method: 'DELETE' }),
  },
  permissions: {
    getAll: () => request<Record<string, string[]>>('/admin/permissions'),
    mine: () => request<string[]>('/my-permissions'),
    toggle: (page: string, role: string, allowed: boolean) =>
      request(`/admin/permissions/${encodeURIComponent(page)}/${encodeURIComponent(role)}`,
        { method: 'PUT', body: JSON.stringify({ allowed }) }),
    userPerms: (userId: string) =>
      request<{ role: string; roles: string[]; role_pages: string[]; overrides: Record<string, boolean> }>(
        `/admin/user-permissions/${userId}`),
    setUserPerm: (userId: string, page: string, state: 'on' | 'off' | 'inherit') =>
      request(`/admin/user-permissions/${userId}/${encodeURIComponent(page)}`,
        { method: 'PUT', body: JSON.stringify({ state }) }),
  },
  adminPermissions: {
    sections: () => request<{ key: string; label: string; group: string; desc: string }[]>('/admin/admin-permissions/sections'),
    getAll: () => request<Record<string, string[]>>('/admin/admin-permissions'),
    mine: () => request<string[]>('/my-admin-sections'),
    toggle: (section: string, role: string, allowed: boolean) =>
      request(`/admin/admin-permissions/${encodeURIComponent(section)}/${encodeURIComponent(role)}`,
        { method: 'PUT', body: JSON.stringify({ allowed }) }),
  },
  admin: {
    users: () => request('/admin/users'),
    createUser: (data: object) => request('/admin/users', { method: 'POST', body: JSON.stringify(data) }),
    updateProfile: (id: string, data: object) =>
      request(`/admin/users/${id}/profile`, { method: 'PUT', body: JSON.stringify(data) }),
    updateRole: (id: string, role: string) =>
      request(`/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
    updateStatus: (id: string, status: string) =>
      request(`/admin/users/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    deleteUser: (id: string) => request(`/admin/users/${id}`, { method: 'DELETE' }),
    forceReset: (id: string) => request<{ reset_url: string; email_sent: boolean; email_error: string }>(`/admin/users/${id}/force-reset`, { method: 'POST' }),
    impersonate: (id: string) => request<{ token: string }>(`/admin/users/${id}/impersonate`, { method: 'POST' }),
    settings: () => request('/admin/settings'),
    updateSetting: (key: string, value: string) =>
      request(`/admin/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }),
    aiConfig: () => request<{ configured: boolean; key_preview: string; model: string; enabled: boolean }>('/admin/ai-config'),
    updateAIConfig: (data: { api_key?: string | null; model: string; enabled: boolean }) =>
      request('/admin/ai-config', { method: 'PUT', body: JSON.stringify(data) }),
    testAIConfig: (api_key?: string) =>
      request<{ success: boolean; error?: string }>('/admin/ai-config/test', { method: 'POST', body: JSON.stringify({ api_key: api_key ?? '' }) }),
    aiUsage: () => request<{
      month_to_date: number; last_30_days: number; all_time: number; calls_30_days: number
      by_feature: { feature: string; cost: number; calls: number }[]
    }>('/admin/ai-usage'),
    aiIndexStatus: () => request<{ total: number; indexed: number; pending: number }>('/admin/ai/index-status'),
    reindexAI: (force = false) =>
      request<{ indexed: number; pending: number }>(`/admin/ai/reindex${force ? '?force=1' : ''}`, { method: 'POST' }),
    passwordResets: () => request('/admin/password-resets'),
    activityLog: () => request('/admin/activity-log'),
    testEmail: (to: string) =>
      request('/admin/test-email', { method: 'POST', body: JSON.stringify({ to }) }),
    testSms: (to: string) =>
      request('/admin/test-sms', { method: 'POST', body: JSON.stringify({ to }) }),
    smtpPing: () => request('/admin/smtp-ping'),
    clubQuestions: () => request<ClubQuestion[]>('/admin/club-questions'),
    answerClubQuestion: (id: string, answer: string) =>
      request(`/admin/club-questions/${id}/answer`, { method: 'POST', body: JSON.stringify({ answer }) }),
    deleteClubQuestion: (id: string) => request(`/admin/club-questions/${id}`, { method: 'DELETE' }),
  },
  finance: {
    // Rules
    rules: () => request<FinancialRule[]>('/admin/finance/rules'),
    createRule: (data: object) => request('/admin/finance/rules', { method: 'POST', body: JSON.stringify(data) }),
    updateRule: (id: string, data: object) => request(`/admin/finance/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteRule: (id: string) => request(`/admin/finance/rules/${id}`, { method: 'DELETE' }),
    // Balances & statements
    balances: () => request<MemberBalance[]>('/admin/finance/balances'),
    statement: (userId: string) => request<StatementEntry[]>(`/admin/finance/statement/${userId}`),
    myBalance: () => request<MyBalance>('/finance/my-balance'),
    myStatement: () => request<StatementEntry[]>('/finance/my-statement'),
    // Charges
    createCharge: (data: object) => request('/admin/finance/charges', { method: 'POST', body: JSON.stringify(data) }),
    updateChargeStatus: (id: string, status: string) => request(`/admin/finance/charges/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    deleteCharge: (id: string) => request(`/admin/finance/charges/${id}`, { method: 'DELETE' }),
    // Kiosk payments
    recordKioskPayment: (data: object) => request('/admin/finance/kiosk-payments', { method: 'POST', body: JSON.stringify(data) }),
    deleteKioskPayment: (id: string) => request(`/admin/finance/kiosk-payments/${id}`, { method: 'DELETE' }),
    // P&L
    pl: (year?: number) => request<PLReport>(`/admin/finance/pl${year ? `?year=${year}` : ''}`),
    // Reminders
    sendReminders: () => request('/admin/finance/send-reminders', { method: 'POST' }),
  },
  appliances: {
    list: () => request<ApplianceItem[]>('/admin/appliances'),
    create: (data: object) => request<ApplianceItem>('/admin/appliances', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: object) => request<ApplianceItem>(`/admin/appliances/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/admin/appliances/${id}`, { method: 'DELETE' }),
    uploadManual: (id: string, form: FormData) => upload<ApplianceItem>(`/admin/appliances/${id}/manual`, form),
    deleteManual: (id: string) => request(`/admin/appliances/${id}/manual`, { method: 'DELETE' }),
    serviceRecords: {
      list: (id: string) => request<ApplianceServiceRecord[]>(`/admin/appliances/${id}/service-records`),
      create: (id: string, data: object) => request<ApplianceServiceRecord>(`/admin/appliances/${id}/service-records`, { method: 'POST', body: JSON.stringify(data) }),
      delete: (applianceId: string, recordId: string) => request(`/admin/appliances/${applianceId}/service-records/${recordId}`, { method: 'DELETE' }),
    },
    reminders: {
      list: (id: string) => request<ApplianceReminder[]>(`/admin/appliances/${id}/reminders`),
      create: (id: string, data: object) => request<ApplianceReminder>(`/admin/appliances/${id}/reminders`, { method: 'POST', body: JSON.stringify(data) }),
      update: (applianceId: string, reminderId: string, data: object) => request<ApplianceReminder>(`/admin/appliances/${applianceId}/reminders/${reminderId}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (applianceId: string, reminderId: string) => request(`/admin/appliances/${applianceId}/reminders/${reminderId}`, { method: 'DELETE' }),
      send: (applianceId: string, reminderId: string) => request<{ sent: number }>(`/admin/appliances/${applianceId}/reminders/${reminderId}/send`, { method: 'POST' }),
    },
  },
  teachingPro: {
    list: (from?: string, to?: string) => {
      const p = new URLSearchParams()
      if (from) p.set('from', from)
      if (to) p.set('to', to)
      return request(`/admin/teaching-pro${p.toString() ? '?' + p : ''}`)
    },
  },
  cancellations: {
    list: (from?: string, to?: string) => {
      const p = new URLSearchParams()
      if (from) p.set('from', from)
      if (to) p.set('to', to)
      return request(`/admin/booking-cancellations${p.toString() ? '?' + p : ''}`)
    },
  },
  balls: {
    summary: (from?: string, to?: string) => {
      const p = new URLSearchParams()
      if (from) p.set('from', from)
      if (to) p.set('to', to)
      return request<{
        from: string; to: string
        beginning_inventory: number; purchased: number
        used_bookings: number; used_pro_shop: number; used_other: number
        total_used: number; ending_inventory: number
        period_cost: number; booking_count: number; cost_per_booking: number
        all_time_purchased: number; all_time_used: number; on_hand: number; all_time_cost: number
      }>(`/admin/balls/summary${p.toString() ? '?' + p : ''}`)
    },
    usageList: (from?: string, to?: string) => {
      const p = new URLSearchParams()
      if (from) p.set('from', from)
      if (to) p.set('to', to)
      return request<{ id: string; used_date: string; quantity: number; source: string; user_name?: string; court_name?: string; notes?: string }[]>(
        `/admin/balls/usage${p.toString() ? '?' + p : ''}`)
    },
    deleteUsage: (id: string) => request(`/admin/balls/usage/${id}`, { method: 'DELETE' }),
    purchaseList: () => request<{ id: string; purchase_date: string; quantity: number; cost_per_can?: number; total_cost?: number; notes?: string; created_at: string }[]>('/admin/balls/purchases'),
    recordPurchase: (data: object) => request('/admin/balls/purchases', { method: 'POST', body: JSON.stringify(data) }),
    deletePurchase: (id: string) => request(`/admin/balls/purchases/${id}`, { method: 'DELETE' }),
    recordUsage: (data: object) => request('/admin/balls/usage', { method: 'POST', body: JSON.stringify(data) }),
  },
  proShop: {
    list: () => request<{ id: string; name: string; description: string; price: number; category: string; emoji: string; in_stock: boolean; sort_order: number }[]>('/pro-shop'),
    adminList: () => request<{ id: string; name: string; description: string; price: number; category: string; emoji: string; in_stock: boolean; sort_order: number }[]>('/admin/pro-shop'),
    create: (data: object) => request('/admin/pro-shop', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: object) => request(`/admin/pro-shop/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/admin/pro-shop/${id}`, { method: 'DELETE' }),
  },
  memberAlerts: {
    getMyAlerts: () => request<{ id: string; message: string; type: string; created_at: string; created_by_name?: string; ref_id?: string }[]>('/member-alerts'),
    dismiss: (id: string) => request(`/member-alerts/${id}/dismiss`, { method: 'POST' }),
    adminListAll: () => request<{ id: string; user_id: string; message: string; type: string; created_at: string; target_name: string }[]>('/admin/member-alerts'),
    adminList: (userId: string) => request<{ id: string; message: string; type: string; created_at: string; dismissed_at?: string }[]>(`/admin/member-alerts/${userId}`),
    adminCreate: (userId: string, message: string, type: string) =>
      request('/admin/member-alerts', { method: 'POST', body: JSON.stringify({ user_id: userId, message, type }) }),
    adminDelete: (id: string) => request(`/admin/member-alerts/${id}`, { method: 'DELETE' }),
  },
  yolink: {
    getConfig: () => request<{ client_id: string }>('/admin/yolink/config'),
    updateConfig: (clientId: string, secretKey: string) =>
      request('/admin/yolink/config', { method: 'PUT', body: JSON.stringify({ client_id: clientId, secret_key: secretKey }) }),
    syncDevices: () => request('/admin/yolink/sync', { method: 'POST' }),
    listDevices: () => request('/admin/yolink/devices'),
    updateDevice: (id: string, data: { name: string; alerts_enabled: boolean }) =>
      request(`/admin/yolink/devices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    listAlerts: () => request('/admin/yolink/alerts'),
    listRules: () => request<YoLinkRule[]>('/admin/yolink/rules'),
    createRule: (data: Partial<YoLinkRule>) =>
      request<YoLinkRule>('/admin/yolink/rules', { method: 'POST', body: JSON.stringify(data) }),
    updateRule: (id: string, data: Partial<YoLinkRule>) =>
      request(`/admin/yolink/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteRule: (id: string) =>
      request(`/admin/yolink/rules/${id}`, { method: 'DELETE' }),
    testRule: (id: string) =>
      request<{ recipients: number }>(`/admin/yolink/rules/${id}/test`, { method: 'POST' }),
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
    getMinutes: (id: string) => request<BoardMinutes | null>(`/board-meetings/${id}/minutes`),
    admin: {
      list: () => request('/admin/board-meetings'),
      create: (data: object) => request('/admin/board-meetings', { method: 'POST', body: JSON.stringify(data) }),
      roster: (id: string) => request(`/admin/board-meetings/${id}/roster`),
      delete: (id: string) => request(`/admin/board-meetings/${id}`, { method: 'DELETE' }),
      getMinutes: (id: string) => request<BoardMinutes | null>(`/admin/board-meetings/${id}/minutes`),
      saveMinutes: (id: string, data: object) => request<BoardMinutes>(`/admin/board-meetings/${id}/minutes`, { method: 'PUT', body: JSON.stringify(data) }),
      publishMinutes: (id: string) => request<{ notified: number }>(`/admin/board-meetings/${id}/minutes/publish`, { method: 'POST' }),
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
    stats: (id: string) => request(`/ladder/${id}/stats`),
    register: (id: string, data: object) => request(`/ladder/${id}/register`, { method: 'POST', body: JSON.stringify(data) }),
    myStatus: (id: string) => request(`/ladder/${id}/me`),
    setMyStatus: (ladderId: string, status: string) =>
      request(`/ladder/${ladderId}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    createChallenge: (id: string, data: object) => request(`/ladder/${id}/challenge`, { method: 'POST', body: JSON.stringify(data) }),
    respondChallenge: (challengeId: string, action: 'accept' | 'decline', data?: object) =>
      request(`/challenges/${challengeId}/respond`, { method: 'PUT', body: JSON.stringify({ action, ...data }) }),
    scheduleMatch: (challengeId: string, matchDate: string, matchTime: string) =>
      request(`/challenges/${challengeId}/schedule`, { method: 'PUT', body: JSON.stringify({ match_date: matchDate, match_time: matchTime }) }),
    submitScore: (challengeId: string, score: string) =>
      request(`/challenges/${challengeId}/score`, { method: 'PUT', body: JSON.stringify({ score }) }),
    approveScore: (challengeId: string, action: 'approve' | 'dispute') =>
      request(`/challenges/${challengeId}/approve-score`, { method: 'PUT', body: JSON.stringify({ action }) }),
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
      setPlayerStatus: (ladderId: string, userId: string, status: string, note?: string) =>
        request(`/admin/ladder/${ladderId}/player-status`, { method: 'PUT', body: JSON.stringify({ user_id: userId, status, note: note ?? '' }) }),
      challenges: (id: string, status?: string) => request(`/admin/ladder/${id}/challenges${status ? `?status=${status}` : ''}`),
      enterResult: (challengeId: string, winnerId: string, score: string) =>
        request(`/admin/challenges/${challengeId}/result`, { method: 'PUT', body: JSON.stringify({ winner_id: winnerId, score }) }),
      forfeit: (challengeId: string) =>
        request(`/admin/challenges/${challengeId}/forfeit`, { method: 'PUT' }),
      reverseResult: (challengeId: string, note?: string) =>
        request(`/admin/challenges/${challengeId}/reverse`, { method: 'PUT', body: JSON.stringify({ note: note ?? '' }) }),
      awardPoints: (ladderId: string, data: object) =>
        request(`/admin/ladder/${ladderId}/points`, { method: 'POST', body: JSON.stringify(data) }),
      auditLog: (ladderId: string) => request(`/admin/ladder/${ladderId}/audit`),
      conduct: (ladderId: string) => request(`/admin/ladder/${ladderId}/conduct`),
      issueConductAction: (ladderId: string, data: object) =>
        request(`/admin/ladder/${ladderId}/conduct`, { method: 'POST', body: JSON.stringify(data) }),
      notifyPreview: (ladderId: string, levels: string[]) =>
        request(`/admin/ladder/${ladderId}/notify/preview?${levels.map(l => `level=${encodeURIComponent(l)}`).join('&')}`),
      notify: (ladderId: string, data: object) =>
        request(`/admin/ladder/${ladderId}/notify`, { method: 'POST', body: JSON.stringify(data) }),
    },
    respondToInvite: (token: string, action: 'accept' | 'decline') =>
      request(`/ladder-invite/${token}/${action}`),
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
  passwords: {
    list: () => request('/admin/passwords'),
    create: (data: { label: string; username: string; password: string; url: string; category: string; notes: string }) =>
      request('/admin/passwords', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { label: string; username: string; password: string; url: string; category: string; notes: string }) =>
      request(`/admin/passwords/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/admin/passwords/${id}`, { method: 'DELETE' }),
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
  messages: {
    inbox: () => request<MemberMessage[]>('/messages/inbox'),
    sent: () => request<MemberMessage[]>('/messages/sent'),
    unreadCount: () => request<{ count: number }>('/messages/unread-count'),
    get: (id: string) => request<MemberMessage>(`/messages/${id}`),
    send: (data: { recipient_id: string; subject: string; body: string; reply_to?: string }) =>
      request<MemberMessage>('/messages', { method: 'POST', body: JSON.stringify(data) }),
    markAllRead: () => request('/messages/read-all', { method: 'PUT' }),
    delete: (id: string) => request(`/messages/${id}`, { method: 'DELETE' }),
  },
  conversations: {
    list: () => request<ConvSummary[]>('/conversations'),
    get: (id: string) => request<ConvDetail>(`/conversations/${id}`),
    create: (data: { title?: string; participant_ids: string[]; body: string }) =>
      request<{ id: string }>('/conversations', { method: 'POST', body: JSON.stringify(data) }),
    send: (id: string, body: string) =>
      request(`/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
    addParticipants: (id: string, participantIds: string[]) =>
      request<{ added: number }>(`/conversations/${id}/participants`, { method: 'POST', body: JSON.stringify({ participant_ids: participantIds }) }),
    markRead: (id: string) => request(`/conversations/${id}/read`, { method: 'POST' }),
    mute: (id: string, muted: boolean) =>
      request(`/conversations/${id}/mute`, { method: 'POST', body: JSON.stringify({ muted }) }),
    leave: (id: string) => request(`/conversations/${id}`, { method: 'DELETE' }),
  },
  collabDocs: {
    list: () => request<CollabDocSummary[]>('/collab-docs'),
    get: (id: string) => request<CollabDoc>(`/collab-docs/${id}`),
    create: (title?: string, body?: string) =>
      request<CollabDoc>('/collab-docs', { method: 'POST', body: JSON.stringify({ title: title ?? '', body: body ?? '' }) }),
    // Save with optimistic concurrency. A 409 means someone else saved first —
    // we return the conflict payload (with the latest copy) instead of throwing.
    update: async (id: string, data: { title: string; body: string; version: number }): Promise<CollabSaveResult> => {
      const res = await fetch(`${BASE}/collab-docs/${id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...impersonationHeaders() },
        body: JSON.stringify(data),
      })
      if (res.status === 409) return res.json()
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }))
        throw new Error(err.message || 'Save failed')
      }
      return res.json()
    },
    delete: (id: string) => request(`/collab-docs/${id}`, { method: 'DELETE' }),
    presence: (id: string, editing: boolean) =>
      request<CollabPresence>(`/collab-docs/${id}/presence`, { method: 'POST', body: JSON.stringify({ editing }) }),
    leave: (id: string) => request(`/collab-docs/${id}/presence`, { method: 'DELETE' }),
  },
  matches: {
    pending: () => request<PendingMatch[]>('/matches/pending'),
    recent: (limit = 30) => request<MatchResult[]>(`/matches/recent?limit=${limit}`),
    mine: () => request<MatchResult[]>('/matches/mine'),
    get: (id: string) => request<MatchResult>(`/matches/${id}`),
    create: (data: MatchInput) =>
      request<{ id: string }>('/matches', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: MatchUpdateInput) =>
      request<{ id: string }>(`/matches/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/matches/${id}`, { method: 'DELETE' }),
    leaderboard: () => request<LeaderboardRow[]>('/matches/leaderboard'),
    player: (id: string) => request<PlayerStats>(`/matches/player/${id}`),
    stats: () => request<MatchStat[]>('/matches/stats'),
  },
  ai: {
    askClub: (question: string, history: { role: 'user' | 'assistant'; content: string }[] = []) =>
      request<{
        answer: string; answered: boolean
        booking_proposal?: { court_id: number; court_name: string; start_time: string; end_time: string; match_type: string; label: string }
      }>('/ask-club', { method: 'POST', body: JSON.stringify({ question, history }) }),
    escalate: (question: string) =>
      request<{ id: string }>('/ask-club/escalate', { method: 'POST', body: JSON.stringify({ question }) }),
    analyzeReceipt: (file: File) => {
      const f = new FormData(); f.append('file', file)
      return upload<ReceiptAnalysis>('/admin/receipts/analyze', f)
    },
    draftMinutes: (notes: string) =>
      request<DraftedMinutes>('/admin/ai/draft-minutes', { method: 'POST', body: JSON.stringify({ notes }) }),
    improveText: (data: { subject?: string; body: string; kind: 'announcement' | 'broadcast' | 'email' }) =>
      request<{ subject: string; body: string }>('/admin/ai/improve-text', { method: 'POST', body: JSON.stringify(data) }),
    feedbackDigest: () => request<FeedbackDigest>('/admin/feedback/digest'),
    parseScore: (data: { text: string; roster?: { id: string; name: string }[]; reporter_name?: string }) =>
      request<ParsedScore>('/matches/parse-score', { method: 'POST', body: JSON.stringify(data) }),
  },
  kiosk: {
    members: () => request<{ id: string; name: string; member_number: number }[]>('/kiosk/members'),
    items: () => request<{ id: string; name: string; description: string; price: number; category: string; emoji: string; in_stock: boolean; sort_order: number }[]>('/kiosk/items'),
    purchase: (data: { user_id: string; items: { item_id: string; item_name: string; price: number; quantity: number }[]; notes?: string }) =>
      request<{ member_name: string; purchases: { id: string; item_name: string; price: number; quantity: number; total: number }[]; grand_total: number }>('/kiosk/purchase', { method: 'POST', body: JSON.stringify(data) }),
    adminPurchases: (userId?: string) =>
      request<{ id: string; user_id: string; member_name: string; item_name: string; item_price: number; quantity: number; total: number; notes?: string; created_at: string }[]>(
        `/admin/kiosk/purchases${userId ? `?user_id=${userId}` : ''}`),
    updatePurchase: (id: string, data: { item_name: string; item_price: number; quantity: number; notes: string }) =>
      request(`/admin/kiosk/purchases/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deletePurchase: (id: string) =>
      request(`/admin/kiosk/purchases/${id}`, { method: 'DELETE' }),
  },
  mail: {
    myAccount: () => request<{ address: string; role_label: string; display_name: string; webmail_url: string } | null>('/my-mail-account'),
    list: () => request<{
      id: string; address: string; role_label: string; display_name: string
      assigned_user_id: string | null; assigned_name: string | null
      has_password: boolean; quota_mb: number; active: boolean
      created_at: string; updated_at: string
    }[]>('/admin/mail/accounts'),
    create: (data: { address: string; role_label: string; display_name: string; quota_mb: number }) =>
      request<{ id: string }>('/admin/mail/accounts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { role_label: string; display_name: string; quota_mb: number }) =>
      request(`/admin/mail/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    resetPassword: (id: string) =>
      request<{ password: string }>(`/admin/mail/accounts/${id}/reset-password`, { method: 'POST' }),
    assign: (id: string, userId: string | null) =>
      request(`/admin/mail/accounts/${id}/assign`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
    importMbox: (id: string, file: File, folder: string, onProgress?: (pct: number) => void) => {
      const form = new FormData()
      form.append('file', file)
      if (folder) form.append('folder', folder)
      return uploadWithProgress<{ imported: number; failed: number; mailbox: string; by_folder: Record<string, number> }>(
        `/admin/mail/accounts/${id}/import`, form, onProgress)
    },
    stats: (id: string) =>
      request<{ messages: number; unseen: number; by_folder: Record<string, number> }>(`/admin/mail/accounts/${id}/stats`),
    emptyMailbox: (id: string) =>
      request<{ deleted: number; mailbox: string }>(`/admin/mail/accounts/${id}/empty`, { method: 'POST' }),
    delete: (id: string) => request(`/admin/mail/accounts/${id}`, { method: 'DELETE' }),
    filters: (id: string) => request<MailFilter[]>(`/admin/mail/accounts/${id}/filters`),
    createFilter: (id: string, data: MailFilterInput) =>
      request<{ id: string }>(`/admin/mail/accounts/${id}/filters`, { method: 'POST', body: JSON.stringify(data) }),
    updateFilter: (fid: string, data: MailFilterInput) =>
      request(`/admin/mail/filters/${fid}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteFilter: (fid: string) =>
      request(`/admin/mail/filters/${fid}`, { method: 'DELETE' }),
    runFilters: (id: string) =>
      request<{ matched: number; errors: string[] }>(`/admin/mail/accounts/${id}/run-filters`, { method: 'POST' }),
    testFilter: (id: string, data: { match_field: string; pattern: string; source_folder: string }) =>
      request<{ matched: number; by_field: Record<string, number> }>(
        `/admin/mail/accounts/${id}/filters/test`, { method: 'POST', body: JSON.stringify(data) }),
  },
  imap: {
    listMessages: (folder = 'INBOX') =>
      request<{ messages: IMAPMessage[]; mailbox: string; total: number }>(
        `/imap/messages?folder=${encodeURIComponent(folder)}`
      ),
    getMessage: (uid: number, folder = 'INBOX') =>
      request<IMAPMessageDetail>(
        `/imap/messages/${uid}?folder=${encodeURIComponent(folder)}`
      ),
    send: (data: { to: string; cc?: string; subject: string; body: string; attachments?: File[]; docIds?: string[] }) => {
      const f = new FormData()
      f.append('to', data.to)
      f.append('subject', data.subject)
      f.append('body', data.body || '')
      if (data.cc) f.append('cc', data.cc)
      data.attachments?.forEach(file => f.append('attachments', file))
      data.docIds?.forEach(id => f.append('doc_ids[]', id))
      return upload<{ status: string }>('/imap/send', f)
    },
    markRead: (uid: number, folder = 'INBOX') =>
      request(`/imap/messages/${uid}/read?folder=${encodeURIComponent(folder)}`, { method: 'PUT' }),
    markUnread: (uid: number, folder = 'INBOX') =>
      request(`/imap/messages/${uid}/unread?folder=${encodeURIComponent(folder)}`, { method: 'PUT' }),
    delete: (uid: number, folder = 'INBOX') =>
      request(`/imap/messages/${uid}?folder=${encodeURIComponent(folder)}`, { method: 'DELETE' }),
    action: (folder: string, uids: number[], action: 'delete' | 'read' | 'unread' | 'move' | 'spam' | 'archive', to?: string) =>
      request<{ affected: number }>('/imap/messages/action', {
        method: 'POST', body: JSON.stringify({ folder, uids, action, to }),
      }),
    emptyFolder: (folder: string) =>
      request<{ deleted: number }>(`/imap/folders/${encodeURIComponent(folder)}/empty`, { method: 'POST' }),
    folders: () => request<{ folders: string[] }>('/imap/folders'),
    createFolder: (name: string) =>
      request<{ name: string }>('/imap/folders', { method: 'POST', body: JSON.stringify({ name }) }),
    deleteFolder: (name: string) =>
      request(`/imap/folders/${encodeURIComponent(name)}`, { method: 'DELETE' }),
    contacts: {
      list: () => request<MailContact[]>('/imap/contacts'),
      create: (data: { name: string; email: string; phone?: string; notes?: string }) =>
        request<MailContact>('/imap/contacts', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: { name: string; email: string; phone?: string; notes?: string }) =>
        request(`/imap/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) => request(`/imap/contacts/${id}`, { method: 'DELETE' }),
    },
    filters: {
      list: () => request<MailFilter[]>('/imap/filters'),
      create: (data: MailFilterInput) =>
        request<{ id: string }>('/imap/filters', { method: 'POST', body: JSON.stringify(data) }),
      update: (fid: string, data: MailFilterInput) =>
        request(`/imap/filters/${fid}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (fid: string) => request(`/imap/filters/${fid}`, { method: 'DELETE' }),
      run: () => request<{ matched: number; errors: string[] }>('/imap/filters/run', { method: 'POST' }),
      test: (data: { match_field: string; pattern: string; source_folder: string }) =>
        request<{ matched: number; by_field: Record<string, number> }>('/imap/filters/test', { method: 'POST', body: JSON.stringify(data) }),
    },
  },
  notificationPrefs: {
    get: () => request<{
      booking_confirmation: boolean; match_invitation: boolean; booking_reminder: boolean
      announcement: boolean; broadcast: boolean; event_notification: boolean
      board_meeting: boolean; ladder_challenge: boolean; liveball_invitation: boolean
      member_message: boolean
    }>('/notification-prefs'),
    update: (prefs: {
      booking_confirmation: boolean; match_invitation: boolean; booking_reminder: boolean
      announcement: boolean; broadcast: boolean; event_notification: boolean
      board_meeting: boolean; ladder_challenge: boolean; liveball_invitation: boolean
      member_message: boolean
    }) => request('/notification-prefs', { method: 'PUT', body: JSON.stringify(prefs) }),
  },
  bookingReminder: {
    getInfo: (token: string) => request(`/booking-reminder/${token}`),
    confirm: (token: string) => request(`/booking-reminder/${token}/ok`, { method: 'POST' }),
    reportIssue: (token: string, note: string) =>
      request(`/booking-reminder/${token}/issue`, { method: 'POST', body: JSON.stringify({ note }) }),
  },
  boardCommunications: {
    list: (params?: { q?: string; type?: string; user_id?: string; from?: string; to?: string }) => {
      const qs = new URLSearchParams()
      if (params?.q) qs.set('q', params.q)
      if (params?.type) qs.set('type', params.type)
      if (params?.user_id) qs.set('user_id', params.user_id)
      if (params?.from) qs.set('from', params.from)
      if (params?.to) qs.set('to', params.to)
      const q = qs.toString()
      return request(`/admin/board-communications${q ? '?' + q : ''}`)
    },
    boardMembers: () => request('/admin/board-members'),
  },
  polls: {
    list: () => request<Poll[]>('/polls'),
    vote: (id: string, option: string) =>
      request(`/polls/${id}/vote`, { method: 'POST', body: JSON.stringify({ option }) }),
    adminList: () => request<Poll[]>('/admin/polls'),
    adminCreate: (data: { title: string; question: string; options: string[]; deadline_at?: string | null }) =>
      request<Poll>('/admin/polls', { method: 'POST', body: JSON.stringify(data) }),
    adminClose: (id: string) => request(`/admin/polls/${id}/close`, { method: 'PUT' }),
    adminDelete: (id: string) => request(`/admin/polls/${id}`, { method: 'DELETE' }),
  },
}
