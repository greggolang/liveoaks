import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'

interface ReminderInfo {
  status: string
  player_name: string
  is_host: boolean
  court_name: string
  start_time: string
  end_time: string
  players: string[]
}

export default function BookingReminderResponse() {
  const { token, action } = useParams<{ token: string; action: string }>()
  const [info, setInfo] = useState<ReminderInfo | null>(null)
  const [result, setResult] = useState<{ status?: string; error?: string } | null>(null)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) { setLoading(false); return }

    api.bookingReminder.getInfo(token)
      .then(d => {
        const ri = d as ReminderInfo
        setInfo(ri)

        // Already responded — just show the status
        if (ri.status !== 'pending') {
          setResult({ status: ri.status })
          setLoading(false)
          return
        }

        // "ok" action — auto-confirm immediately
        if (action === 'ok') {
          api.bookingReminder.confirm(token)
            .then(() => setResult({ status: 'confirmed' }))
            .catch(err => setResult({ error: err.message }))
            .finally(() => setLoading(false))
        } else {
          // "issue" action — show the form
          setLoading(false)
        }
      })
      .catch(err => { setResult({ error: err.message }); setLoading(false) })
  }, [token, action])

  const submitIssue = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setSubmitting(true)
    try {
      await api.bookingReminder.reportIssue(token, note)
      setResult({ status: 'issue' })
    } catch (err: any) {
      setResult({ error: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🎾</div>
          <h1 className="text-xl font-bold text-green-800">Live Oaks Tennis Club</h1>
        </div>

        {loading ? (
          <p className="text-center text-gray-500">Loading…</p>

        ) : result?.error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm text-center">
            {result.error}
          </div>

        ) : result?.status === 'confirmed' ? (
          <div className="text-center space-y-3">
            <div className="text-5xl">✅</div>
            <p className="font-semibold text-green-800 text-lg">You're all set!</p>
            <p className="text-gray-500 text-sm">See you on the court today.</p>
            {info && (
              <div className="mt-2 bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800 text-left">
                <div className="font-semibold">{info.court_name}</div>
                <div>{info.start_time} – {info.end_time}</div>
              </div>
            )}
          </div>

        ) : result?.status === 'issue' ? (
          <div className="text-center space-y-3">
            <div className="text-4xl">📬</div>
            <p className="font-semibold text-gray-800">Issue reported.</p>
            <p className="text-gray-500 text-sm">
              {info?.is_host
                ? 'All other players on your booking have been notified.'
                : 'The booking host has been notified and will find a replacement.'}
            </p>
          </div>

        ) : action === 'issue' && info ? (
          <>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5 text-sm">
              <div className="font-semibold text-green-800">{info.court_name}</div>
              <div className="text-green-700">{info.start_time} – {info.end_time}</div>
              {info.players.length > 0 && (
                <div className="mt-2 text-gray-600">
                  <span className="font-medium">Players:</span> {info.players.join(', ')}
                </div>
              )}
            </div>

            <form onSubmit={submitIssue} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  What's the issue?{' '}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="e.g. Can't make it — injured my shoulder"
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50">
                {submitting ? 'Submitting…' : 'Submit Issue'}
              </button>
              <p className="text-xs text-gray-400 text-center">
                {info.is_host
                  ? 'All other players will be notified.'
                  : "You'll be removed from the roster and the host will be notified."}
              </p>
            </form>
          </>

        ) : null}

        <div className="mt-8 text-center">
          <Link to="/login" className="text-green-700 text-sm hover:underline">
            Sign in to your member account →
          </Link>
        </div>
      </div>
    </div>
  )
}
