import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../api/client'

const SMTP_FIELDS = [
  { key: 'smtp_host', label: 'SMTP Host', placeholder: 'smtp.gmail.com', type: 'text' },
  { key: 'smtp_port', label: 'SMTP Port', placeholder: '587', type: 'text' },
  { key: 'smtp_user', label: 'Username', placeholder: 'admin@liveoakstennis.com (or leave blank)', type: 'text' },
  { key: 'smtp_pass', label: 'Password / App Password', placeholder: '••••••••••••••••', type: 'password' },
  { key: 'smtp_from', label: 'From Address', placeholder: 'admin@liveoakstennis.com', type: 'text' },
]

export default function AdminTestEmail() {
  const { user } = useAuth()

  const [settings, setSettings] = useState<Record<string, string>>({
    smtp_host: '', smtp_port: '587', smtp_user: '', smtp_pass: '', smtp_from: '',
  })
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<'saved' | 'error' | null>(null)

  const [to, setTo] = useState(user?.email ?? '')
  const [toError, setToError] = useState('')
  const [sending, setSending] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)

  const [pinging, setPinging] = useState(false)
  const [pingResult, setPingResult] = useState<{ ok: boolean; message: string } | null>(null)

  const runPing = async () => {
    setPinging(true)
    setPingResult(null)
    try {
      const res = await api.admin.smtpPing() as { ok: boolean; message: string }
      setPingResult(res)
    } catch (err: any) {
      setPingResult({ ok: false, message: err.message })
    } finally {
      setPinging(false) }
  }

  // Sync to email field once user is available (useState only captures initial value)
  useEffect(() => {
    if (user?.email && !to) setTo(user.email)
  }, [user?.email])

  useEffect(() => {
    api.admin.settings().then(d => {
      const s = d as Record<string, string>
      setSettings(prev => ({
        ...prev,
        smtp_host: s.smtp_host ?? '',
        smtp_port: s.smtp_port ?? '587',
        smtp_user: s.smtp_user ?? '',
        smtp_from: s.smtp_from ?? '',
        // never pre-fill the password field
        smtp_pass: '',
      }))
    })
  }, [])

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaveResult(null)
    try {
      for (const { key } of SMTP_FIELDS) {
        if (key === 'smtp_pass' && settings[key] === '') continue
        await api.admin.updateSetting(key, settings[key])
      }
      setSaveResult('saved')
      setTimeout(() => setSaveResult(null), 3000)
    } catch {
      setSaveResult('error')
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!to.trim()) { setToError('Enter an email address to send the test to.'); return }
    setToError('')
    setSending(true)
    setTestResult(null)
    try {
      const res = await api.admin.testEmail(to.trim()) as { success: boolean; error?: string }
      setTestResult(res)
    } catch (err: any) {
      setTestResult({ success: false, error: err.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Email Settings</h2>
        <p className="text-sm text-gray-500">Configure SMTP credentials for outgoing email.</p>
      </div>

      {/* Google Workspace SMTP Relay setup guide */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-sm space-y-4">
        <p className="font-semibold text-blue-800">Google Workspace — SMTP Relay Setup</p>

        {/* Option A — App Password */}
        <div className="bg-white rounded-lg border border-blue-100 p-4 space-y-3">
          <p className="font-semibold text-blue-800">Option A — App Password (recommended)</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono text-gray-700">
            <span className="text-gray-500 font-sans">Host</span><span className="font-bold text-green-700">smtp.gmail.com</span>
            <span className="text-gray-500 font-sans">Port</span><span>587</span>
            <span className="text-gray-500 font-sans">Username</span><span>your Google account email</span>
            <span className="text-gray-500 font-sans">Password</span><span>16-char App Password</span>
            <span className="text-gray-500 font-sans">From</span><span>your Google account email</span>
          </div>
          <ol className="list-decimal list-inside space-y-1.5 text-blue-700 text-sm">
            <li>Sign in at <strong>myaccount.google.com</strong></li>
            <li>Go to <strong>Security → 2-Step Verification</strong> and confirm it is on</li>
            <li>Scroll to the bottom and click <strong>App passwords</strong></li>
            <li>App: <strong>Mail</strong> · Device: <strong>Other</strong> → type "Liveoaks Server" → Generate</li>
            <li>Copy the 16-character password (no spaces) into the Password field below</li>
          </ol>
          <p className="text-xs text-orange-600 font-medium">⚠️ Use <code className="bg-orange-50 px-1 rounded">smtp.gmail.com</code> — App Passwords do NOT work with <code className="bg-orange-50 px-1 rounded">smtp-relay.gmail.com</code>.</p>
        </div>

        {/* Option B — IP Allowlist */}
        <div className="bg-white rounded-lg border border-blue-100 p-4 space-y-3">
          <p className="font-semibold text-blue-800">Option B — SMTP Relay via IP Allowlist (no password)</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono text-gray-700">
            <span className="text-gray-500 font-sans">Host</span><span>smtp-relay.gmail.com</span>
            <span className="text-gray-500 font-sans">Port</span><span>587</span>
            <span className="text-gray-500 font-sans">Username</span><span className="italic text-gray-400">leave blank</span>
            <span className="text-gray-500 font-sans">Password</span><span className="italic text-gray-400">leave blank</span>
            <span className="text-gray-500 font-sans">From</span><span>your Google Workspace email</span>
          </div>
          <ol className="list-decimal list-inside space-y-1.5 text-blue-700 text-sm">
            <li>Sign in to <strong>admin.google.com</strong> (Google Workspace Admin Console)</li>
            <li>Go to <strong>Apps → Google Workspace → Gmail → Routing</strong></li>
            <li>Under <strong>SMTP relay service</strong>, click Configure</li>
            <li>Add <strong>172.236.228.11</strong> as an allowed sender IP and save</li>
          </ol>
        </div>
      </div>

      {/* SMTP settings form */}
      <form onSubmit={saveSettings} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
        <p className="text-sm font-semibold text-gray-700">SMTP Configuration</p>
        {SMTP_FIELDS.map(({ key, label, placeholder, type }) => (
          <div key={key} className="flex items-center gap-4">
            <label className="w-44 shrink-0 text-sm font-medium text-gray-600">{label}</label>
            <input
              type={type}
              value={settings[key] ?? ''}
              onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
              placeholder={placeholder}
              autoComplete={key === 'smtp_pass' ? 'new-password' : 'off'}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        ))}
        <div className="flex items-center gap-4 pt-1">
          <div className="w-44 shrink-0" />
          <button
            type="submit"
            disabled={saving}
            className="bg-green-700 hover:bg-green-800 text-white font-semibold px-5 py-2 rounded-lg text-sm transition disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
          {saveResult === 'saved' && (
            <span className="text-sm font-medium text-green-700">✓ Settings saved</span>
          )}
          {saveResult === 'error' && (
            <span className="text-sm font-medium text-red-600">Failed to save</span>
          )}
        </div>
        <p className="text-xs text-gray-400 pt-1">
          Password is write-only — leave blank to keep the existing saved password.
        </p>
      </form>

      {/* Connection diagnostic */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-3">
        <p className="text-sm font-semibold text-gray-700">Step 1 — Test Network Connection</p>
        <p className="text-xs text-gray-500">
          Checks whether this server can reach the SMTP host on the configured port.
          Run this first — if it fails, the firewall is blocking outbound email and no password will work.
        </p>
        {pingResult && (
          <div className={`rounded-lg px-4 py-3 text-sm font-medium ${pingResult.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
            {pingResult.ok ? '✅' : '❌'} {pingResult.message}
            {!pingResult.ok && (
              <p className="text-xs font-normal mt-1 opacity-80">
                Port is blocked. On Linode: open a support ticket and ask them to enable outbound SMTP (port 587) for your Linode ID.
              </p>
            )}
          </div>
        )}
        <button onClick={runPing} disabled={pinging}
          className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2 rounded-lg text-sm transition disabled:opacity-50">
          {pinging ? 'Testing…' : 'Test Connection'}
        </button>
      </div>

      {/* Test email */}
      <form onSubmit={sendTest} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
        <p className="text-sm font-semibold text-gray-700">Step 2 — Send Test Email</p>
        <p className="text-xs text-gray-500">
          Only run this after Step 1 passes. Uses the settings currently saved in the database.
        </p>

        {/* Result shown first so it's always visible without scrolling */}
        {testResult && (
          <div className={`rounded-lg p-4 text-sm font-medium ${testResult.success ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
            {testResult.success ? (
              <>✅ Email sent successfully to <strong>{to}</strong>. Check your inbox.</>
            ) : (
              <>
                ❌ Failed to send.
                <span className="font-normal text-xs mt-1 block opacity-80">{testResult.error}</span>
              </>
            )}
          </div>
        )}

        <div className="space-y-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="sm:w-44 sm:shrink-0 text-sm font-medium text-gray-600">Send to</label>
            <input
              type="email"
              value={to}
              onChange={e => { setTo(e.target.value); setToError('') }}
              placeholder="you@example.com"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          {toError && <p className="text-red-500 text-xs sm:ml-[calc(176px+0.5rem)]">{toError}</p>}
        </div>

        <button
          type="submit"
          disabled={sending}
          className="w-full sm:w-auto bg-green-700 hover:bg-green-800 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send Test Email'}
        </button>
      </form>
    </div>
  )
}
