import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

export default function Register() {
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', notes: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const set = (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.waitlist.join(form)
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-lota-50 flex items-center justify-center p-4 font-serif">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">

        {/* Crest + heading */}
        <div className="text-center mb-8">
          <img
            src="/lota-logo.png"
            alt="Live Oaks Tennis Association crest"
            className="h-20 w-20 mx-auto mb-3"
          />
          <h1 className="text-2xl font-bold text-lota-800">Live Oaks Tennis Association</h1>
          <p className="text-gray-500 text-sm mt-1">Request Membership</p>
        </div>

        {submitted ? (
          /* ── Success state ── */
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-lota-800">Request Received!</h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              Thank you, <span className="font-semibold">{form.first_name}</span>. Your membership
              request has been submitted. Our Membership Committee will review your application
              and contact you soon.
            </p>
            <p className="text-gray-400 text-xs">
              If you have any questions in the meantime, feel free to reach out to us directly.
            </p>
            <Link
              to="/login"
              className="inline-block mt-2 text-lota-700 font-medium text-sm hover:underline"
            >
              ← Back to sign in
            </Link>
          </div>
        ) : (
          /* ── Request form ── */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                <input
                  value={form.first_name}
                  onChange={set('first_name')}
                  required
                  autoComplete="given-name"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lota-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                <input
                  value={form.last_name}
                  onChange={set('last_name')}
                  required
                  autoComplete="family-name"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lota-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                required
                autoComplete="email"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lota-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <input
                type="tel"
                value={form.phone}
                onChange={set('phone')}
                autoComplete="tel"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lota-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tell us about yourself{' '}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={form.notes}
                onChange={set('notes')}
                rows={3}
                placeholder="Tennis background, how you heard about us, USTA rating, etc."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lota-500 resize-none"
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-lota-600 hover:bg-lota-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Submitting…' : 'Request Membership'}
            </button>
          </form>
        )}

      </div>
    </div>
  )
}
