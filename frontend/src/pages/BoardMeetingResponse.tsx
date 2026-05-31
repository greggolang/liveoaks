import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'

export default function BoardMeetingResponse() {
  const { token, action } = useParams<{ token: string; action: string }>()
  const [status, setStatus] = useState<'loading' | 'accepted' | 'declined' | 'error'>('loading')

  useEffect(() => {
    if (!token || (action !== 'accept' && action !== 'decline')) {
      setStatus('error')
      return
    }
    api.boardMeetings.respond(token, action as 'accept' | 'decline')
      .then(() => setStatus(action === 'accept' ? 'accepted' : 'declined'))
      .catch(() => setStatus('error'))
  }, [token, action])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center space-y-4">
        {status === 'loading' && (
          <>
            <div className="text-4xl">⏳</div>
            <p className="text-gray-500 text-sm">Processing your response…</p>
          </>
        )}
        {status === 'accepted' && (
          <>
            <div className="text-5xl">✅</div>
            <h2 className="text-xl font-bold text-gray-800">You're In!</h2>
            <p className="text-gray-500 text-sm">Your attendance has been confirmed. We look forward to seeing you at the meeting.</p>
            <Link to="/dashboard"
              className="inline-block mt-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition">
              Go to Dashboard →
            </Link>
          </>
        )}
        {status === 'declined' && (
          <>
            <div className="text-5xl">👋</div>
            <h2 className="text-xl font-bold text-gray-800">Response Recorded</h2>
            <p className="text-gray-500 text-sm">You've declined this meeting. Your response has been noted.</p>
            <Link to="/dashboard"
              className="inline-block mt-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition">
              Go to Dashboard →
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-5xl">⚠️</div>
            <h2 className="text-xl font-bold text-gray-800">Link Unavailable</h2>
            <p className="text-gray-500 text-sm">This invitation link may have already been used or is no longer valid.</p>
            <Link to="/dashboard"
              className="inline-block mt-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition">
              Go to Dashboard →
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
