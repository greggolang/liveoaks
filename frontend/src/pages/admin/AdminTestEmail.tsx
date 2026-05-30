import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../api/client'

export default function AdminTestEmail() {
  const { user } = useAuth()
  const [to, setTo] = useState(user?.email ?? '')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null)

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    try {
      const res = await api.admin.testEmail(to) as { success: boolean; error?: string }
      setResult(res)
    } catch (err: any) {
      setResult({ success: false, error: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-xl font-bold text-gray-800 mb-1">Test Email</h2>
      <p className="text-sm text-gray-500 mb-6">Send a test email to verify the SMTP relay is working.</p>

      <form onSubmit={send} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Send to</label>
          <input
            type="email"
            value={to}
            onChange={e => setTo(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-700 hover:bg-green-800 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Send Test Email'}
        </button>

        {result && (
          <div className={`rounded-lg p-4 text-sm font-medium ${result.success ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
            {result.success ? (
              <>✅ Email sent successfully to <strong>{to}</strong>. Check your inbox.</>
            ) : (
              <>❌ Failed to send email.<br /><span className="font-normal text-xs mt-1 block opacity-80">{result.error}</span></>
            )}
          </div>
        )}
      </form>

      <div className="mt-6 bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p className="font-medium text-gray-700">Current SMTP config:</p>
        <p>Host: <code className="bg-gray-100 px-1 rounded">smtp-relay.gmail.com:587</code></p>
        <p>From: <code className="bg-gray-100 px-1 rounded">admin@liveoakstennis.com</code></p>
        <p>Auth: <code className="bg-gray-100 px-1 rounded">IP-based (172.236.228.11)</code></p>
      </div>
    </div>
  )
}
