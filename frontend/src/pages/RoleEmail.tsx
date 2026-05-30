import { useEffect, useState } from 'react'
import { api } from '../api/client'

export default function RoleEmail() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.google.credentials()
      .then(d => { setEmail(d.email) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-sm text-gray-400 py-8">Loading…</div>

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Email</h1>
      <p className="text-sm text-gray-500 mb-6">
        Your role's mailbox. Click below to sign in to Gmail.
      </p>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-5">
        {/* Mailbox */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mailbox</label>
          {email ? (
            <p className="text-sm font-medium text-gray-800 mt-1">{email}</p>
          ) : (
            <p className="text-sm text-gray-400 italic mt-1">
              Not configured — ask an admin to set this up in Admin → Settings.
            </p>
          )}
        </div>

        {/* Open Gmail button */}
        {email && (
          <a
            href="https://mail.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-3 rounded-lg transition">
            Open Gmail
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Contact an admin if the mailbox is missing or needs updating.
      </p>
    </div>
  )
}
