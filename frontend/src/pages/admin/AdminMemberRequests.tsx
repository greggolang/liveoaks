import { useEffect, useState } from 'react'
import { parseDate } from '../../utils/dates'
import { api, MemberRequest } from '../../api/client'
import { formatPhone } from '../../utils/phone'

// ── Email modal ───────────────────────────────────────────────────────────────
function EmailModal({
  request,
  onClose,
  onSent,
}: {
  request: MemberRequest
  onClose: () => void
  onSent: () => void
}) {
  const [subject, setSubject] = useState(`Regarding Your Live Oaks Membership Request`)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const send = async () => {
    if (!subject.trim() || !message.trim()) { setError('Subject and message are required'); return }
    setSending(true); setError('')
    try {
      await api.memberRequests.sendEmail(request.id, subject, message)
      onSent()
    } catch (e: any) { setError(e.message || 'Failed to send') }
    finally { setSending(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800">Email {request.first_name} {request.last_name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          To: <span className="font-medium text-gray-700">{request.email}</span>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={6}
            placeholder="Type your message here…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
          />
        </div>

        {error && <p className="text-red-600 text-xs">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 px-4 py-2 transition">
            Cancel
          </button>
          <button
            onClick={send}
            disabled={sending}
            className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-5 py-2 rounded-lg transition disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send Email'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Request row ───────────────────────────────────────────────────────────────
function RequestRow({
  request,
  onApprove,
  onDecline,
  onDelete,
  onEmail,
  onNotesChange,
}: {
  request: MemberRequest
  onApprove: (id: string) => void
  onDecline: (id: string) => void
  onDelete: (id: string, name: string) => void
  onEmail: (r: MemberRequest) => void
  onNotesChange: (id: string, notes: string) => void
}) {
  const [notes, setNotes] = useState(request.admin_notes ?? '')
  const [noteDirty, setNoteDirty] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const saveNotes = async () => {
    setSavingNotes(true)
    try {
      await api.memberRequests.updateAdminNotes(request.id, notes)
      onNotesChange(request.id, notes)
      setNoteDirty(false)
    } finally { setSavingNotes(false) }
  }

  const appliedDate = request.application_date
    ? parseDate(request.application_date + 'T12:00:00').toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    : parseDate(request.created_at).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      })

  return (
    <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
      {/* Main row */}
      <div className="flex items-start gap-4 p-4">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-lota-100 flex items-center justify-center shrink-0 text-lota-700 font-bold text-sm">
          {request.first_name[0]}{request.last_name[0]}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="font-semibold text-gray-800">
                {request.first_name} {request.last_name}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
                {request.email && (
                  <a href={`mailto:${request.email}`}
                    className="text-xs text-blue-600 hover:underline">{request.email}</a>
                )}
                {request.phone && (
                  <span className="text-xs text-gray-500">{formatPhone(request.phone)}</span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">Submitted {appliedDate}</p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                onClick={() => onEmail(request)}
                disabled={!request.email}
                title={request.email ? 'Send email' : 'No email on file'}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Email
              </button>
              <button
                onClick={() => onDecline(request.id)}
                className="text-xs font-medium text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition"
              >
                Decline
              </button>
              <button
                onClick={() => onApprove(request.id)}
                className="text-xs font-medium text-white bg-green-700 hover:bg-green-800 px-3 py-1.5 rounded-lg transition"
              >
                ✓ Approve → Waitlist
              </button>
            </div>
          </div>

          {/* Applicant notes (collapsible) */}
          {request.notes && (
            <button
              onClick={() => setExpanded(x => !x)}
              className="mt-2 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 transition"
            >
              <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18l6-6-6-6" />
              </svg>
              {expanded ? 'Hide' : 'Show'} applicant note
            </button>
          )}
          {request.notes && expanded && (
            <div className="mt-2 bg-gray-50 rounded-lg p-3 text-xs text-gray-600 italic leading-relaxed">
              "{request.notes}"
            </div>
          )}
        </div>
      </div>

      {/* Admin notes section */}
      <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          Board Notes
        </label>
        <div className="flex gap-2">
          <textarea
            value={notes}
            onChange={e => { setNotes(e.target.value); setNoteDirty(true) }}
            rows={2}
            placeholder="Add internal notes visible only to board members…"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 resize-none bg-white"
          />
          {noteDirty && (
            <button
              onClick={saveNotes}
              disabled={savingNotes}
              className="self-end text-xs bg-green-700 hover:bg-green-800 text-white px-3 py-2 rounded-lg transition disabled:opacity-50 shrink-0"
            >
              {savingNotes ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* Remove (hidden action — only for truly invalid requests) */}
      <div className="border-t border-gray-100 px-4 py-2 flex justify-end">
        <button
          onClick={() => onDelete(request.id, `${request.first_name} ${request.last_name}`)}
          className="text-xs text-gray-300 hover:text-red-400 transition"
        >
          Remove request
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminMemberRequests() {
  const [requests, setRequests] = useState<MemberRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [emailTarget, setEmailTarget] = useState<MemberRequest | null>(null)
  const [toast, setToast] = useState('')

  const load = async () => {
    try {
      const data = await api.memberRequests.list()
      setRequests(data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const handleApprove = async (id: string) => {
    const r = requests.find(x => x.id === id)
    if (!confirm(`Approve ${r?.first_name} ${r?.last_name} and add them to the official waitlist?`)) return
    try {
      await api.memberRequests.approve(id)
      setRequests(prev => prev.filter(x => x.id !== id))
      showToast(`${r?.first_name} ${r?.last_name} has been added to the waitlist.`)
    } catch (e: any) { alert(e.message || 'Approval failed') }
  }

  const handleDecline = async (id: string) => {
    const r = requests.find(x => x.id === id)
    if (!confirm(`Decline ${r?.first_name} ${r?.last_name}'s membership request?`)) return
    try {
      await api.memberRequests.updateStatus(id, 'declined')
      setRequests(prev => prev.filter(x => x.id !== id))
      showToast(`Request declined.`)
    } catch (e: any) { alert(e.message || 'Failed') }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Permanently remove ${name}'s request? This cannot be undone.`)) return
    await api.memberRequests.delete(id)
    setRequests(prev => prev.filter(x => x.id !== id))
  }

  const handleNotesChange = (id: string, notes: string) => {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, admin_notes: notes } : r))
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-700 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Email modal */}
      {emailTarget && (
        <EmailModal
          request={emailTarget}
          onClose={() => setEmailTarget(null)}
          onSent={() => { setEmailTarget(null); showToast('Email sent.') }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold text-gray-800">New Member Requests</h2>
        {!loading && (
          <span className="text-sm text-gray-400">
            {requests.length} pending
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-6">
        Review each request, add notes, follow up by email, then approve to move them onto the official waitlist.
      </p>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-20">
          <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-gray-400 text-sm">No pending requests — you're all caught up!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map(r => (
            <RequestRow
              key={r.id}
              request={r}
              onApprove={handleApprove}
              onDecline={handleDecline}
              onDelete={handleDelete}
              onEmail={setEmailTarget}
              onNotesChange={handleNotesChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}
