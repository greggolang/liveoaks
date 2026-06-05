import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/client'

type State = 'loading' | 'ready' | 'submitting' | 'accepted' | 'declined' | 'already' | 'not_found' | 'error'

export default function LadderInviteResponse() {
  const { token, action } = useParams<{ token: string; action?: string }>()
  const [state, setState] = useState<State>('loading')

  useEffect(() => {
    if (!token || !action) { setState('ready'); return }
    setState('submitting')
    api.ladder.respondToInvite(token, action as 'accept' | 'decline')
      .then((d: any) => {
        if (d.status === 'accepted')          setState('accepted')
        else if (d.status === 'declined')     setState('declined')
        else if (d.status === 'not_found')    setState('not_found')
        else if (d.status === 'already_responded') setState('already')
        else setState('error')
      })
      .catch(() => setState('error'))
  }, [token, action])

  const respond = (act: 'accept' | 'decline') => {
    if (!token) return
    setState('submitting')
    api.ladder.respondToInvite(token, act)
      .then((d: any) => {
        if (d.status === 'accepted')          setState('accepted')
        else if (d.status === 'declined')     setState('declined')
        else if (d.status === 'not_found')    setState('not_found')
        else if (d.status === 'already_responded') setState('already')
        else setState('error')
      })
      .catch(() => setState('error'))
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center space-y-5">
        <div className="text-4xl">🎾</div>
        <h1 className="text-xl font-bold text-gray-800">Tennis Ladder — Live Oaks Tennis Club</h1>

        {state === 'loading' || state === 'submitting' ? (
          <p className="text-gray-400">Processing your response…</p>

        ) : state === 'ready' ? (
          <>
            <p className="text-gray-600">Would you like to join the Tennis Ladder?</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => respond('accept')}
                className="bg-green-700 hover:bg-green-800 text-white font-semibold px-8 py-3 rounded-xl transition">
                ✓ Sign Me Up
              </button>
              <button onClick={() => respond('decline')}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold px-8 py-3 rounded-xl transition">
                ✗ Decline
              </button>
            </div>
          </>

        ) : state === 'accepted' ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-2">
            <p className="text-2xl font-bold text-green-700">✅ You're registered!</p>
            <p className="text-green-600">
              Your sign-up has been submitted. An admin will review and approve your registration shortly.
              You'll receive an email once you're placed on the ladder.
            </p>
          </div>

        ) : state === 'declined' ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-2">
            <p className="text-lg font-semibold text-gray-600">No problem!</p>
            <p className="text-gray-500">You've declined this invitation. We hope to see you on the ladder in the future.</p>
          </div>

        ) : state === 'already' ? (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <p className="text-gray-700 font-semibold mb-1">Already Responded</p>
            <p className="text-gray-500 text-sm">You've already responded to this invitation. Contact the club if you'd like to change your response.</p>
          </div>

        ) : state === 'not_found' ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <p className="text-amber-700 font-semibold mb-1">Invitation Not Found</p>
            <p className="text-amber-600 text-sm">This link could not be found. It may be incorrect or have expired. Please contact the club if you think this is a mistake.</p>
          </div>

        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5">
            <p className="text-red-600 font-semibold mb-1">Something went wrong</p>
            <p className="text-red-500 text-sm">Please try the link in your email again, or contact the club if the problem persists.</p>
          </div>
        )}
      </div>
    </div>
  )
}
