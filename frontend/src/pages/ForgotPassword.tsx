import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
    <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">🎾</div>
          <h1 className="text-2xl font-bold text-green-800">Reset Password</h1>
          <p className="text-gray-500 text-sm mt-1">Enter your email to request a reset link</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-800 text-sm">
              If that email is registered, a reset link has been sent. Check your inbox (and spam/junk folder).
            </div>
            <Link to="/login" className="block text-green-700 font-medium hover:underline text-sm">
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-green-700 hover:bg-green-800 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50">
              {loading ? 'Submitting...' : 'Request Reset Link'}
            </button>
            <p className="text-center text-sm text-gray-500">
              <Link to="/login" className="text-green-700 font-medium hover:underline">Back to sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
