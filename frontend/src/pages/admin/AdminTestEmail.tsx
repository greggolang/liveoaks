import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../api/client'

const SMTP_FIELDS = [
  { key: 'smtp_host', label: 'SMTP Host', placeholder: 'mail.dropshot.company', type: 'text' },
  { key: 'smtp_port', label: 'SMTP Port', placeholder: '587', type: 'text' },
  { key: 'smtp_user', label: 'Username', placeholder: 'admin@dropshot.company', type: 'text' },
  { key: 'smtp_pass', label: 'Password / App Password', placeholder: '••••••••••••••••', type: 'password' },
  { key: 'smtp_from', label: 'From Address', placeholder: 'admin@dropshot.company', type: 'text' },
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

  // Test SMS
  const [smsTo, setSmsTo] = useState('')
  const [smsToError, setSmsToError] = useState('')
  const [smsSending, setSmsSending] = useState(false)
  const [smsResult, setSmsResult] = useState<{ success: boolean; error?: string } | null>(null)

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

  const sendTestSms = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!smsTo.trim()) { setSmsToError('Enter a phone number to send the test to.'); return }
    setSmsToError('')
    setSmsSending(true)
    setSmsResult(null)
    try {
      const res = await api.admin.testSms(smsTo.trim()) as { success: boolean; error?: string }
      setSmsResult(res)
    } catch (err: any) {
      setSmsResult({ success: false, error: err.message })
    } finally {
      setSmsSending(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Test Communications</h2>
        <p className="text-sm text-gray-500">Configure and test outgoing email (SMTP) and text messages (SMS).</p>
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

      {/* ---- Text Messaging (SMS) ---- */}
      <div className="pt-4">
        <h2 className="text-xl font-bold text-gray-800 mb-1">Text Messaging (SMS)</h2>
        <p className="text-sm text-gray-500">
          Outgoing texts are sent through Twilio. Credentials (Account SID, Auth Token, and From number)
          are configured on the server via environment variables.
        </p>
      </div>

      <form onSubmit={sendTestSms} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
        <p className="text-sm font-semibold text-gray-700">Send Test SMS</p>
        <p className="text-xs text-gray-500">
          Sends a short test text using the Twilio settings currently configured on the server.
          On a Twilio trial account you can only text numbers you have verified.
        </p>

        {/* Result shown first so it's always visible without scrolling */}
        {smsResult && (
          <div className={`rounded-lg p-4 text-sm font-medium ${smsResult.success ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
            {smsResult.success ? (
              <>✅ Test text sent successfully to <strong>{smsTo}</strong>. Check the phone.</>
            ) : (
              <>
                ❌ Failed to send.
                <span className="font-normal text-xs mt-1 block opacity-80">{smsResult.error}</span>
              </>
            )}
          </div>
        )}

        <div className="space-y-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="sm:w-44 sm:shrink-0 text-sm font-medium text-gray-600">Send to</label>
            <input
              type="tel"
              value={smsTo}
              onChange={e => { setSmsTo(e.target.value); setSmsToError('') }}
              placeholder="+15125551234"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          {smsToError && <p className="text-red-500 text-xs sm:ml-[calc(176px+0.5rem)]">{smsToError}</p>}
          <p className="text-xs text-gray-400 sm:ml-[calc(176px+0.5rem)]">
            US numbers can be entered with or without the country code; international numbers need a leading <code className="bg-gray-100 px-1 rounded">+</code>.
          </p>
        </div>

        <button
          type="submit"
          disabled={smsSending}
          className="w-full sm:w-auto bg-green-700 hover:bg-green-800 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition disabled:opacity-50"
        >
          {smsSending ? 'Sending…' : 'Send Test SMS'}
        </button>
      </form>
    </div>
  )
}
