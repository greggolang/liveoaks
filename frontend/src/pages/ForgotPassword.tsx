import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [human, setHuman] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.auth.forgotPassword(email)
      setSent(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-lota-50 flex items-center justify-center p-4 font-serif">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
        <div className="text-center mb-8">
          <Link to="/login">
            <img src="/lota-logo.png" alt="Live Oaks Tennis Association crest"
                 className="h-20 w-20 mx-auto mb-3 hover:opacity-80 transition" />
          </Link>
          <h1 className="text-2xl font-bold text-lota-800">Live Oaks Tennis Association</h1>
          <p className="text-gray-500 text-sm mt-1">Enter your email to request a reset link</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="bg-lota-50 border border-lota-200 rounded-xl p-4 text-lota-800 text-sm">
              If that email is registered, a reset link has been sent. Check your inbox (and spam/junk folder).
            </div>
            <Link to="/login" className="block text-lota-700 font-medium hover:underline text-sm">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lota-500"
              />
            </div>
            <label className="flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-3 cursor-pointer select-none hover:bg-gray-50 transition">
              <input
                type="checkbox"
                checked={human}
                onChange={e => setHuman(e.target.checked)}
                className="w-5 h-5 accent-lota-600 cursor-pointer"
              />
              <span className="text-sm text-gray-700">I am not a robot</span>
              <span className="ml-auto text-2xl">🤖</span>
            </label>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button type="submit" disabled={loading || !human}
              className="w-full bg-lota-600 hover:bg-lota-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50">
              {loading ? 'Submitting...' : 'Request Reset Link'}
            </button>
            <p className="text-center text-sm text-gray-500">
              <Link to="/login" className="text-lota-700 font-medium hover:underline">Back to sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
