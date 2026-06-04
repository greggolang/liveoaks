import { useEffect, useState } from 'react'
import { api } from '../../api/client'

interface Recipient { id: string; name: string; email: string; role: string }

const ALL_ROLES = [
  { value: 'member',         label: 'Member' },
  { value: 'games',          label: 'Games Admin' },
  { value: 'billing',        label: 'Billing' },
  { value: 'membership',     label: 'Membership' },
  { value: 'usta',           label: 'USTA' },
  { value: 'entertainment',  label: 'Entertainment' },
  { value: 'house_grounds',  label: 'House & Grounds' },
  { value: 'secretary',      label: 'Secretary' },
  { value: 'treasurer',      label: 'Treasurer' },
  { value: 'vice_president', label: 'Vice President' },
  { value: 'president',      label: 'President' },
  { value: 'admin',          label: 'Admin' },
]

export default function AdminBroadcast() {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]) // empty = all
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [loadingRecipients, setLoadingRecipients] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmCode, setConfirmCode] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number; message: string } | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [improving, setImproving] = useState(false)
  const [improveError, setImproveError] = useState('')

  const improve = async () => {
    if (!body.trim()) return
    setImproving(true); setImproveError('')
    try {
      const r = await api.ai.improveText({ subject, body, kind: 'broadcast' })
      if (r.subject) setSubject(r.subject)
      if (r.body) setBody(r.body)
    } catch (e: any) {
      setImproveError(e.message || 'Could not improve the draft.')
    } finally { setImproving(false) }
  }

  // Load recipients whenever role filter changes
  useEffect(() => {
    setLoadingRecipients(true)
    api.broadcast.recipients(selectedRoles.length ? selectedRoles : undefined)
      .then(d => setRecipients(d as Recipient[]))
      .finally(() => setLoadingRecipients(false))
  }, [selectedRoles])

  const toggleRole = (role: string) =>
    setSelectedRoles(rs => rs.includes(role) ? rs.filter(r => r !== role) : [...rs, role])

  const handleSend = async () => {
    setConfirmError('')
    setSending(true)
    try {
      const res = await api.broadcast.send(subject, body, confirmCode, selectedRoles.length ? selectedRoles : undefined) as any
      setResult(res)
      setShowConfirm(false)
      setConfirmCode('')
      setSubject('')
      setBody('')
    } catch (e: any) {
      setConfirmError(e.message ?? 'Incorrect code or send failed.')
    } finally {
      setSending(false)
    }
  }

  const canSend = subject.trim() && body.trim() && recipients.length > 0

  const previewHtml = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">${body}<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0"><p style="color:#9ca3af;font-size:12px">You're receiving this as an active member of Liveoaks Tennis Club.</p></div>`

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold text-gray-800">Broadcast Email</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Send an email to all active members or a filtered group. A confirmation code is required before sending.
        </p>
      </div>

      {result ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center space-y-2">
          <p className="text-2xl">✅</p>
          <p className="font-semibold text-green-800">Email queued for {result.sent} recipients</p>
          <p className="text-sm text-green-600">{result.message}</p>
          <button onClick={() => setResult(null)}
            className="mt-2 text-sm text-green-700 hover:underline">Send another</button>
        </div>
      ) : (
        <>
          {/* Recipient filter */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-700 text-sm">Recipients</h3>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${loadingRecipients ? 'bg-gray-100 text-gray-400' : 'bg-green-100 text-green-700'}`}>
                {loadingRecipients ? '…' : `${recipients.length} member${recipients.length !== 1 ? 's' : ''}`}
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Select specific roles to narrow the audience, or leave all unselected to email every active member.
            </p>
            <div className="flex gap-2 flex-wrap">
              {ALL_ROLES.map(r => (
                <button key={r.value} onClick={() => toggleRole(r.value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                    selectedRoles.includes(r.value)
                      ? 'bg-green-700 text-white border-green-700'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'
                  }`}>
                  {r.label}
                </button>
              ))}
              {selectedRoles.length > 0 && (
                <button onClick={() => setSelectedRoles([])}
                  className="px-2.5 py-1 rounded-full text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-300">
                  Clear filter
                </button>
              )}
            </div>

            {/* Recipient list toggle */}
            {recipients.length > 0 && (
              <button onClick={() => setShowPreview(s => !s)}
                className="text-xs text-blue-600 hover:underline">
                {showPreview ? 'Hide' : 'Show'} recipient list ({recipients.length})
              </button>
            )}
            {showPreview && (
              <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-40 overflow-y-auto text-xs">
                {recipients.map(r => (
                  <div key={r.id} className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50">
                    <span className="text-gray-700">{r.name}</span>
                    <span className="text-gray-400">{r.email}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Compose */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-700 text-sm">Compose</h3>
              <button type="button" onClick={improve} disabled={improving || !body.trim()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 border border-green-200 bg-green-50 hover:bg-green-100 rounded-lg px-3 py-1.5 transition disabled:opacity-50">
                {improving ? 'Improving…' : '✨ Improve with AI'}
              </button>
            </div>
            {improveError && <p className="text-red-500 text-xs">{improveError}</p>}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Subject *</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Email subject line"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Body * <span className="font-normal text-gray-400">(HTML supported)</span>
              </label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={10}
                placeholder={`<p>Dear members,</p>\n<p>Your message here...</p>\n<p>Best regards,<br>Liveoaks Tennis Club</p>`}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                You can use HTML tags like &lt;p&gt;, &lt;strong&gt;, &lt;br&gt;, &lt;a href="..."&gt;, &lt;ul&gt;/&lt;li&gt;.
              </p>
            </div>

            {/* Email preview */}
            {body.trim() && (
              <details className="border border-gray-100 rounded-lg">
                <summary className="px-3 py-2 text-xs font-medium text-gray-500 cursor-pointer hover:bg-gray-50 rounded-lg">
                  Preview email
                </summary>
                <div className="border-t border-gray-100 p-4">
                  <div className="text-xs text-gray-400 mb-2">Subject: <strong className="text-gray-600">{subject || '(no subject)'}</strong></div>
                  <div className="border border-gray-100 rounded-lg p-4 bg-white text-sm"
                    dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              </details>
            )}

            <button
              onClick={() => { setShowConfirm(true); setConfirmCode(''); setConfirmError('') }}
              disabled={!canSend}
              className="bg-green-700 hover:bg-green-800 text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition disabled:opacity-40">
              Send to {recipients.length} member{recipients.length !== 1 ? 's' : ''} →
            </button>
          </div>
        </>
      )}

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="text-center">
              <div className="text-3xl mb-2">🔐</div>
              <h3 className="text-lg font-bold text-gray-800">Confirm Broadcast</h3>
              <p className="text-sm text-gray-500 mt-1">
                You're about to send <strong>"{subject}"</strong> to{' '}
                <strong>{recipients.length} member{recipients.length !== 1 ? 's' : ''}</strong>.
                This cannot be undone.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Enter confirmation code</label>
              <input
                type="password"
                value={confirmCode}
                onChange={e => { setConfirmCode(e.target.value); setConfirmError('') }}
                onKeyDown={e => e.key === 'Enter' && confirmCode && handleSend()}
                placeholder="Confirmation code"
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              {confirmError && (
                <p className="text-red-500 text-xs mt-1">{confirmError}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSend}
                disabled={sending || !confirmCode}
                className="flex-1 bg-green-700 hover:bg-green-800 text-white font-semibold text-sm py-2.5 rounded-lg transition disabled:opacity-50">
                {sending ? 'Sending…' : 'Confirm & Send'}
              </button>
              <button
                onClick={() => { setShowConfirm(false); setConfirmCode(''); setConfirmError('') }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm py-2.5 rounded-lg transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
