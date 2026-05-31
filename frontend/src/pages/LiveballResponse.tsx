import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/client'

type State = 'loading' | 'ready' | 'confirming' | 'confirmed' | 'waitlisted' | 'declined' | 'already' | 'error'

export default function LiveballResponse() {
  const { token, action } = useParams<{ token: string; action?: string }>()
  const [state, setState] = useState<State>('loading')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!token || !action) { setState('ready'); return }
    // Auto-submit if action is in the URL
    setState('confirming')
    api.liveball.respond(token, action as 'accept' | 'decline')
      .then((d: any) => {
        if (d.status === 'confirmed')   setState('confirmed')
        else if (d.status === 'waitlisted') setState('waitlisted')
        else if (d.status === 'declined')   setState('declined')
        else { setState('already'); setStatus(d.status); setMessage(d.message ?? '') }
      })
      .catch(() => setState('error'))
  }, [token, action])

  const respond = (act: 'accept' | 'decline') => {
    if (!token) return
    setState('confirming')
    api.liveball.respond(token, act)
      .then((d: any) => {
        if (d.status === 'confirmed')      setState('confirmed')
        else if (d.status === 'waitlisted') setState('waitlisted')
        else if (d.status === 'declined')   setState('declined')
        else { setState('already'); setStatus(d.status); setMessage(d.message ?? '') }
      })
      .catch(() => setState('error'))
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center space-y-5">
        <div className="text-4xl">🎾</div>
        <h1 className="text-xl font-bold text-gray-800">LiveBall – Liveoaks Tennis Club</h1>

        {state === 'loading' || state === 'confirming' ? (
          <p className="text-gray-400">Processing your response…</p>
        ) : state === 'ready' ? (
          <>
            <p className="text-gray-600">Would you like to join this LiveBall session?</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => respond('accept')}
                className="bg-green-700 hover:bg-green-800 text-white font-semibold px-8 py-3 rounded-xl transition">
                ✓ I'm In!
              </button>
              <button onClick={() => respond('decline')}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold px-8 py-3 rounded-xl transition">
                ✗ Can't Make It
              </button>
            </div>
          </>
        ) : state === 'confirmed' ? (
          <>
            <div className="bg-green-50 border border-green-200 rounded-xl p-5">
              <p className="text-2xl font-bold text-green-700 mb-1">✅ You're confirmed!</p>
              <p className="text-green-600">Your spot is secured. See you on the court!</p>
            </div>
            <p className="text-xs text-gray-400">You'll receive a confirmation email shortly.</p>
          </>
        ) : state === 'waitlisted' ? (
          <>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
              <p className="text-2xl font-bold text-yellow-700 mb-1">⏳ You're on the waitlist</p>
              <p className="text-yellow-600">All spots filled just before your response. We'll email you immediately if a spot opens up!</p>
            </div>
          </>
        ) : state === 'declined' ? (
          <>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
              <p className="text-lg font-semibold text-gray-600 mb-1">No problem!</p>
              <p className="text-gray-500">You've declined this invitation. We hope to see you at the next one.</p>
            </div>
          </>
        ) : state === 'already' ? (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
              <p className="text-gray-700">{message || `You already responded to this invitation (${status}).`}</p>
            </div>
          </>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5">
            <p className="text-red-600">Something went wrong. This invitation may have expired or already been used.</p>
          </div>
        )}
      </div>
    </div>
  )
}
