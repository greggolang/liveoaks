import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'

export default function InviteResponse() {
  const { token, action } = useParams<{ token: string; action: string }>()
  const [result, setResult] = useState<{ status?: string; message?: string; error?: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token || !action) { setLoading(false); return }
    api.invitations.respond(token, action as 'accept' | 'decline')
      .then(d => setResult(d as any))
      .catch(err => setResult({ error: err.message }))
      .finally(() => setLoading(false))
  }, [token, action])

  const accepted = result?.status === 'accepted'
  const declined = result?.status === 'declined'

  return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8 text-center">
        <div className="text-5xl mb-4">🎾</div>
        <h1 className="text-xl font-bold text-green-800 mb-2">Liveoaks Tennis Club</h1>

        {loading ? (
          <p className="text-gray-500">Processing your response…</p>
        ) : result?.error ? (
          <>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-4 text-red-700 text-sm">{result.error}</div>
            <Link to="/" className="block mt-4 text-green-700 text-sm hover:underline">Go to homepage</Link>
          </>
        ) : (
          <>
            <div className={`text-4xl mb-3 ${accepted ? 'text-green-600' : declined ? 'text-gray-400' : ''}`}>
              {accepted ? '✓' : declined ? '✗' : 'ℹ️'}
            </div>
            <p className="text-gray-700 font-medium">
              {result?.message || (accepted ? 'You\'ve accepted the invitation! See you on the court.' : 'You\'ve declined the invitation.')}
            </p>
            {accepted && (
              <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-3 text-green-800 text-sm">
                The booking member will receive a confirmation. Check your email for details.
              </div>
            )}
            <Link to="/login" className="block mt-6 text-green-700 text-sm hover:underline">
              Sign in to your member account →
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
