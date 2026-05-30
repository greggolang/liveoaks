import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../api/client'

const SMTP_FIELDS = [
  { key: 'smtp_host', label: 'SMTP Host', placeholder: 'smtp-relay.gmail.com', type: 'text' },
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
  const [sending, setSending] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)

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
    setSending(true)
    setTestResult(null)
    try {
      const res = await api.admin.testEmail(to) as { success: boolean; error?: string }
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

        {/* Settings table */}
        <div className="bg-white rounded-lg border border-blue-100 p-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono text-gray-700">
          <span className="text-gray-500 font-sans font-medium col-span-2 mb-1 text-xs">Use these settings:</span>
          <span className="text-gray-500 font-sans">Host</span><span>smtp-relay.gmail.com</span>
          <span className="text-gray-500 font-sans">Port</span><span>587</span>
          <span className="text-gray-500 font-sans">Encryption</span><span>TLS (STARTTLS)</span>
          <span className="text-gray-500 font-sans">Username</span><span>your Workspace account email</span>
          <span className="text-gray-500 font-sans">Password</span><span>App Password (see below)</span>
          <span className="text-gray-500 font-sans">From</span><span>your Workspace account email</span>
        </div>

        {/* Option A — SMTP Auth with App Password */}
        <div>
          <p className="font-semibold text-blue-700 mb-1">Option A — Authenticate with an App Password</p>
          <ol className="list-decimal list-inside space-y-1.5 text-blue-700">
            <li>Sign in to your Google Workspace account at <strong>myaccount.google.com</strong></li>
            <li>Go to <strong>Security → 2-Step Verification</strong> and confirm it is enabled</li>
            <li>Scroll to the bottom of 2-Step Verification and click <strong>App passwords</strong></li>
            <li>App: <strong>Mail</strong> · Device: <strong>Other</strong> → type "Liveoaks Server" → click Generate</li>
            <li>Copy the 16-character password and paste it in the Password field below (no spaces)</li>
            <li>Enter your Workspace email as the Username and From address</li>
          </ol>
        </div>

        {/* Option B — IP Allowlist */}
        <div>
          <p className="font-semibold text-blue-700 mb-1">Option B — IP Allowlist (no password needed)</p>
          <ol className="list-decimal list-inside space-y-1.5 text-blue-700">
            <li>Sign in to the <strong>Google Workspace Admin Console</strong> at <strong>admin.google.com</strong></li>
            <li>Go to <strong>Apps → Google Workspace → Gmail → Routing</strong></li>
            <li>Under <strong>SMTP relay service</strong>, click <strong>Configure</strong></li>
            <li>Add the server's IP address (<strong>172.236.228.11</strong>) as an allowed sender</li>
            <li>Leave Username and Password blank below — just set Host, Port, and From</li>
          </ol>
        </div>

        <p className="text-xs text-blue-600">
          <strong>Tip:</strong> Option A is simpler — just needs an App Password. Option B requires Google Workspace admin access but doesn't need credentials stored on the server.
        </p>
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

      {/* Test email */}
      <form onSubmit={sendTest} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
        <p className="text-sm font-semibold text-gray-700">Send Test Email</p>
        <p className="text-xs text-gray-500">Sends a test using the settings currently saved in the database.</p>
        <div className="flex items-center gap-4">
          <label className="w-44 shrink-0 text-sm font-medium text-gray-600">Send to</label>
          <input
            type="email"
            value={to}
            onChange={e => setTo(e.target.value)}
            required
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="w-44 shrink-0" />
          <button
            type="submit"
            disabled={sending}
            className="bg-green-700 hover:bg-green-800 text-white font-semibold px-5 py-2 rounded-lg text-sm transition disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send Test Email'}
          </button>
        </div>
        {testResult && (
          <div className={`rounded-lg p-4 text-sm font-medium ${testResult.success ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
            {testResult.success ? (
              <>✅ Email sent successfully to <strong>{to}</strong>. Check your inbox.</>
            ) : (
              <>
                ❌ Failed to send email.
                <span className="font-normal text-xs mt-1 block opacity-80">{testResult.error}</span>
              </>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
