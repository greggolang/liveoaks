import { useEffect, useState } from 'react'
import { api } from '../../api/client'

interface Recipient { id: string; name: string; email: string }
interface Court { id: number; name: string; number: number }

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function AdminMessageBookings() {
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())
  const [courtId, setCourtId] = useState('')
  const [courts, setCourts] = useState<Court[]>([])

  const [recipients, setRecipients] = useState<Recipient[] | null>(null)
  const [loadingRecipients, setLoadingRecipients] = useState(false)
  const [recipientError, setRecipientError] = useState('')

  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmCode, setConfirmCode] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number; message: string } | null>(null)

  const [improving, setImproving] = useState(false)
  const [improveError, setImproveError] = useState('')
  const [showRecipientList, setShowRecipientList] = useState(false)

  useEffect(() => {
    api.courts.list().then(d => setCourts(d as Court[]))
  }, [])

  const loadRecipients = async () => {
    if (!dateFrom || !dateTo) return
    setLoadingRecipients(true)
    setRecipientError('')
    setRecipients(null)
    try {
      const d = await api.broadcast.bookingRecipients(dateFrom, dateTo, courtId || undefined)
      setRecipients(d as Recipient[])
    } catch (e: any) {
      setRecipientError(e.message || 'Could not load recipients.')
    } finally {
      setLoadingRecipients(false)
    }
  }

  const improve = async () => {
    if (!body.trim()) return
    setImproving(true); setImproveError('')
    try {
      const r = await api.ai.improveText({ subject, body, kind: 'broadcast' }) as any
      if (r.subject) setSubject(r.subject)
      if (r.body) setBody(r.body)
    } catch (e: any) {
      setImproveError(e.message || 'Could not improve the draft.')
    } finally { setImproving(false) }
  }

  const handleSend = async () => {
    if (!recipients) return
    setConfirmError('')
    setSending(true)
    try {
      const res = await api.broadcast.sendToBookings({
        subject, body, confirm_code: confirmCode,
        date_from: dateFrom, date_to: dateTo,
        court_id: courtId || undefined,
      }) as any
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

  const canSend = subject.trim() && body.trim() && recipients && recipients.length > 0
  const previewHtml = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">${body}<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0"><p style="color:#9ca3af;font-size:12px">You're receiving this because you have a court booking during the referenced time period.</p></div>`

  const selectedCourt = courts.find(c => String(c.id) === courtId)

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold text-gray-800">Message Bookings</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Send an email to all players who have court bookings in a given date range.
          Useful for court closures, schedule changes, or any notice targeting active players.
        </p>
      </div>

      {result ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center space-y-2">
          <p className="text-2xl">✅</p>
          <p className="font-semibold text-green-800">Email queued for {result.sent} player{result.sent !== 1 ? 's' : ''}</p>
          <p className="text-sm text-green-600">{result.message}</p>
          <button onClick={() => setResult(null)}
            className="mt-2 text-sm text-green-700 hover:underline">Send another</button>
        </div>
      ) : (
        <>
          {/* Filter panel */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-gray-700 text-sm">Booking Filter</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">From date</label>
                <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setRecipients(null) }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">To date</label>
                <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setRecipients(null) }}
                  min={dateFrom}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Court <span className="font-normal text-gray-400">(optional — leave blank for all courts)</span></label>
              <select value={courtId} onChange={e => { setCourtId(e.target.value); setRecipients(null) }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white">
                <option value="">All courts</option>
                {courts.map(c => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={loadRecipients} disabled={loadingRecipients || !dateFrom || !dateTo}
                className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-40">
                {loadingRecipients ? 'Loading…' : 'Preview recipients'}
              </button>
              {recipients !== null && (
                <span className={`text-sm font-medium px-3 py-1 rounded-full ${recipients.length > 0 ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-500'}`}>
                  {recipients.length} player{recipients.length !== 1 ? 's' : ''}
                  {selectedCourt ? ` on ${selectedCourt.name}` : ''}
                  {dateFrom === dateTo ? ` on ${dateFrom}` : ` from ${dateFrom} to ${dateTo}`}
                </span>
              )}
            </div>

            {recipientError && <p className="text-red-500 text-sm">{recipientError}</p>}

            {recipients !== null && recipients.length > 0 && (
              <div>
                <button onClick={() => setShowRecipientList(s => !s)}
                  className="text-xs text-blue-600 hover:underline">
                  {showRecipientList ? 'Hide' : 'Show'} player list ({recipients.length})
                </button>
                {showRecipientList && (
                  <div className="mt-2 border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-40 overflow-y-auto text-xs">
                    {recipients.map(r => (
                      <div key={r.id} className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50">
                        <span className="text-gray-700">{r.name}</span>
                        <span className="text-gray-400">{r.email}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {recipients !== null && recipients.length === 0 && (
              <p className="text-sm text-gray-500">No active players with bookings found for this filter.</p>
            )}
          </div>

          {/* Compose */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-700 text-sm">Compose</h3>
              <button type="button" onClick={improve} disabled={improving || !body.trim()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 border border-violet-200 bg-violet-50 hover:bg-violet-100 rounded-lg px-3 py-1.5 transition disabled:opacity-50">
                {improving ? 'Improving…' : '✨ Improve with AI'}
              </button>
            </div>
            {improveError && <p className="text-red-500 text-xs">{improveError}</p>}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Subject *</label>
              <input value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="e.g. Court 2 closed this weekend — rebooking required"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Body * <span className="font-normal text-gray-400">(HTML supported)</span>
              </label>
              <textarea value={body} onChange={e => setBody(e.target.value)}
                rows={8}
                placeholder={`<p>Dear members,</p>\n<p>Your message here...</p>\n<p>Best regards,<br>Liveoaks Tennis Club</p>`}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-violet-500" />
              <p className="text-xs text-gray-400 mt-1">HTML tags like &lt;p&gt;, &lt;strong&gt;, &lt;br&gt;, &lt;a href="..."&gt; are supported.</p>
            </div>

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

            <button onClick={() => { setShowConfirm(true); setConfirmCode(''); setConfirmError('') }}
              disabled={!canSend}
              className="bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition disabled:opacity-40">
              {recipients ? `Send to ${recipients.length} player${recipients.length !== 1 ? 's' : ''} →` : 'Preview recipients first →'}
            </button>
          </div>
        </>
      )}

      {showConfirm && recipients && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="text-center">
              <div className="text-3xl mb-2">🔐</div>
              <h3 className="text-lg font-bold text-gray-800">Confirm Send</h3>
              <p className="text-sm text-gray-500 mt-1">
                You're about to send <strong>"{subject}"</strong> to{' '}
                <strong>{recipients.length} player{recipients.length !== 1 ? 's' : ''}</strong> with bookings
                {selectedCourt ? ` on ${selectedCourt.name}` : ''}{' '}
                {dateFrom === dateTo ? `on ${dateFrom}` : `from ${dateFrom} to ${dateTo}`}.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Enter confirmation code</label>
              <input type="password" value={confirmCode}
                onChange={e => { setConfirmCode(e.target.value); setConfirmError('') }}
                onKeyDown={e => e.key === 'Enter' && confirmCode && handleSend()}
                placeholder="Confirmation code"
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
              {confirmError && <p className="text-red-500 text-xs mt-1">{confirmError}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={handleSend} disabled={sending || !confirmCode}
                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm py-2.5 rounded-lg transition disabled:opacity-50">
                {sending ? 'Sending…' : 'Confirm & Send'}
              </button>
              <button onClick={() => { setShowConfirm(false); setConfirmCode(''); setConfirmError('') }}
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
