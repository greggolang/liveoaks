import { useEffect, useState } from 'react'
import { api } from '../../api/client'

interface Template { id: string; name: string; subject: string; body: string; updated_at: string }

const VARIABLES = [
  '{{event_title}}', '{{event_date}}', '{{event_location}}',
  '{{event_description}}', '{{signup_url}}', '{{site_url}}',
]

const emptyForm = { name: '', subject: '', body: '' }

export default function AdminEmailTemplates() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [editing, setEditing] = useState<Template | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const load = () => api.emailTemplates.list().then(d => setTemplates(d as Template[]))
  useEffect(() => { load() }, [])

  const openEdit = (t: Template) => {
    setEditing(t)
    setForm({ name: t.name, subject: t.subject, body: t.body })
    setShowNew(false)
    setMsg('')
  }

  const openNew = () => {
    setEditing(null)
    setForm(emptyForm)
    setShowNew(true)
    setMsg('')
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    try {
      if (editing) {
        await api.emailTemplates.update(editing.id, form)
        setMsg('Template saved.')
      } else {
        await api.emailTemplates.create(form)
        setShowNew(false)
      }
      load()
    } catch (err: any) {
      setMsg('Error: ' + err.message)
    } finally { setSaving(false) }
  }

  const handleDelete = async (t: Template) => {
    if (!confirm(`Delete template "${t.name}"?`)) return
    await api.emailTemplates.delete(t.id)
    if (editing?.id === t.id) setEditing(null)
    load()
  }

  const sf = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [f]: e.target.value }))

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold text-gray-800">Email Templates</h2>
        <button onClick={openNew}
          className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition">
          + New Template
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Templates are used when sending event emails. Use the variables below to insert event details.
      </p>

      {/* Variable reference */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Available variables</p>
        <div className="flex flex-wrap gap-2">
          {VARIABLES.map(v => (
            <code key={v} className="text-xs bg-white border border-gray-200 rounded px-2 py-0.5 text-green-700 font-mono">
              {v}
            </code>
          ))}
        </div>
      </div>

      <div className="flex gap-6">
        {/* Template list */}
        <div className="w-52 shrink-0 space-y-1">
          {templates.map(t => (
            <div key={t.id}
              onClick={() => openEdit(t)}
              className={`px-3 py-2 rounded-lg cursor-pointer text-sm transition ${editing?.id === t.id ? 'bg-green-100 text-green-800 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}>
              <div className="font-medium truncate">{t.name}</div>
              <div className="text-xs text-gray-400 truncate">{t.subject}</div>
            </div>
          ))}
          {templates.length === 0 && (
            <p className="text-xs text-gray-400 px-3">No templates yet.</p>
          )}
        </div>

        {/* Edit form */}
        {(editing || showNew) && (
          <form onSubmit={handleSave} className="flex-1 space-y-4 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <p className="text-sm font-semibold text-gray-700">{editing ? `Editing: ${editing.name}` : 'New Template'}</p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Template Name (slug)</label>
              <input value={form.name} onChange={sf('name')} required placeholder="e.g. event_announcement"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <p className="text-xs text-gray-400 mt-1">Used internally to select this template.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Subject Line</label>
              <input value={form.subject} onChange={sf('subject')} required
                placeholder="🎾 {{event_title}} — Liveoaks Tennis Club"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Body (HTML)</label>
              <textarea value={form.body} onChange={sf('body')} required rows={14}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500 resize-y" />
            </div>
            <div className="flex items-center gap-4 pt-1">
              <button type="submit" disabled={saving}
                className="bg-green-700 hover:bg-green-800 text-white font-semibold px-5 py-2 rounded-lg text-sm transition disabled:opacity-50">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Template'}
              </button>
              {editing && (
                <button type="button" onClick={() => handleDelete(editing)}
                  className="text-sm text-red-400 hover:text-red-600 transition">
                  Delete
                </button>
              )}
              <button type="button" onClick={() => { setEditing(null); setShowNew(false) }}
                className="text-sm text-gray-400 hover:text-gray-600 transition">
                Cancel
              </button>
              {msg && (
                <span className={`text-sm ${msg.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>{msg}</span>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
