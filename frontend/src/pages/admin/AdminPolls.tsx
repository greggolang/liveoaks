import { useEffect, useState } from 'react'
import { parseDate } from '../../utils/dates'
import { api, Poll } from '../../api/client'

const EMPTY_FORM = { title: '', question: '', options: ['', ''], deadline_at: '' }

export default function AdminPolls() {
  const [polls, setPolls] = useState<Poll[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => api.polls.adminList().then(setPolls).catch(() => {})
  useEffect(() => { load() }, [])

  const addOption = () => setForm(f => ({ ...f, options: [...f.options, ''] }))
  const removeOption = (i: number) =>
    setForm(f => ({ ...f, options: f.options.filter((_, idx) => idx !== i) }))
  const setOption = (i: number, val: string) =>
    setForm(f => ({ ...f, options: f.options.map((o, idx) => idx === i ? val : o) }))

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const opts = form.options.map(o => o.trim()).filter(Boolean)
    if (opts.length < 2) { setError('At least 2 non-empty options required'); return }
    setSaving(true)
    try {
      await api.polls.adminCreate({
        title: form.title,
        question: form.question,
        options: opts,
        deadline_at: form.deadline_at || null,
      })
      setForm(EMPTY_FORM)
      setShowForm(false)
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleClose = async (id: string) => {
    await api.polls.adminClose(id).catch(() => {})
    load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this poll and all responses?')) return
    await api.polls.adminDelete(id).catch(() => {})
    load()
  }

  const pct = (poll: Poll, option: string) => {
    if (poll.total_votes === 0) return 0
    return Math.round(((poll.results[option] ?? 0) / poll.total_votes) * 100)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Membership Polls</h2>
          <p className="text-sm text-gray-500">Create anonymous polls that appear on the member dashboard.</p>
        </div>
        <button
          onClick={() => setShowForm(s => !s)}
          className="bg-lota-600 hover:bg-lota-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          {showForm ? 'Cancel' : '+ New Poll'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Poll title</label>
            <input
              value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lota-500"
              placeholder="e.g. Summer Social Preference"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
            <textarea
              value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
              required rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lota-500"
              placeholder="What would you like to ask members?"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Options</label>
            <div className="space-y-2">
              {form.options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={opt} onChange={e => setOption(i, e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lota-500"
                    placeholder={`Option ${i + 1}`}
                  />
                  {form.options.length > 2 && (
                    <button type="button" onClick={() => removeOption(i)}
                      className="text-red-400 hover:text-red-600 px-2 text-lg leading-none">×</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addOption}
                className="text-lota-600 hover:text-lota-700 text-sm font-medium">
                + Add option
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deadline (optional)</label>
            <input
              type="datetime-local" value={form.deadline_at}
              onChange={e => setForm(f => ({ ...f, deadline_at: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lota-500"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={saving}
            className="bg-lota-600 hover:bg-lota-700 text-white font-semibold px-5 py-2 rounded-lg transition disabled:opacity-50 text-sm">
            {saving ? 'Creating…' : 'Create Poll'}
          </button>
        </form>
      )}

      {polls.length === 0 ? (
        <p className="text-gray-400 text-sm mt-6">No polls yet. Create one to get started.</p>
      ) : (
        <div className="space-y-4 mt-4">
          {polls.map(poll => (
            <div key={poll.id} className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-gray-800">{poll.title}</span>
                    {poll.status === 'active' ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Active</span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">Closed</span>
                    )}
                    {poll.deadline_at && poll.status === 'active' && (
                      <span className="text-xs text-gray-400">
                        Closes {parseDate(poll.deadline_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{poll.question}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {poll.total_votes} vote{poll.total_votes !== 1 ? 's' : ''} · by {poll.creator_name}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {poll.status === 'active' && (
                    <button onClick={() => handleClose(poll.id)}
                      className="text-xs text-amber-600 hover:text-amber-700 border border-amber-200 hover:border-amber-400 px-3 py-1 rounded-lg transition">
                      Close
                    </button>
                  )}
                  <button onClick={() => handleDelete(poll.id)}
                    className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1 rounded-lg transition">
                    Delete
                  </button>
                </div>
              </div>

              <div className="space-y-2 mt-3">
                {poll.options.map(opt => (
                  <div key={opt}>
                    <div className="flex justify-between text-sm mb-0.5">
                      <span className="text-gray-700">{opt}</span>
                      <span className="text-gray-500 font-medium">
                        {poll.results[opt] ?? 0} ({pct(poll, opt)}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-lota-600 h-2 rounded-full transition-all"
                        style={{ width: `${pct(poll, opt)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
