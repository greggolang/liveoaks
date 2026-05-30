import { useEffect, useState } from 'react'
import { api } from '../api/client'

export default function RoleDrive() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.google.credentials()
      .then(d => { setEmail(d.email); setPassword(d.password) })
      .finally(() => setLoading(false))
  }, [])

  const copy = async () => {
    await navigator.clipboard.writeText(password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div className="text-sm text-gray-400 py-8">Loading…</div>

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Drive</h1>
      <p className="text-sm text-gray-500 mb-6">
        Your role's Google account credentials. Use these to sign in to Google Drive in a new tab.
      </p>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-5">
        {/* Mailbox */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Account</label>
          {email ? (
            <p className="text-sm font-medium text-gray-800 mt-1">{email}</p>
          ) : (
            <p className="text-sm text-gray-400 italic mt-1">
              Not configured — ask an admin to set this up in Admin → Settings.
            </p>
          )}
        </div>

        {/* Password */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Password</label>
          <div className="flex items-center gap-2 mt-1">
            <span className="flex-1 text-sm font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 min-h-[38px] flex items-center">
              {password
                ? (showPass ? password : '••••••••••••')
                : <span className="text-gray-400 italic text-xs font-sans">Not set</span>
              }
            </span>
            {password && (
              <>
                <button
                  onClick={() => setShowPass(s => !s)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition shrink-0">
                  {showPass ? 'Hide' : 'Show'}
                </button>
                <button
                  onClick={copy}
                  className={`px-3 py-2 border rounded-lg text-xs font-medium transition shrink-0 ${
                    copied ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Open Drive button */}
        {email && (
          <a
            href="https://drive.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-3 rounded-lg transition">
            Open Google Drive
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Sign in to Google Drive with the account and password shown above.
        Contact an admin if credentials are missing or need updating.
      </p>
    </div>
  )
}
