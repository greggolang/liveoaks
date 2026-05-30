import { useEffect, useState } from 'react'
import { api } from '../../api/client'

interface FeedbackItem {
  id: string
  message: string
  status: string
  created_at: string
  first_name: string
  last_name: string
  email: string
}

const STATUSES = [
  { value: 'new',         label: 'New',         color: 'bg-blue-100 text-blue-700' },
  { value: 'reviewing',   label: 'Reviewing',   color: 'bg-yellow-100 text-yellow-700' },
  { value: 'planned',     label: 'Planned',     color: 'bg-purple-100 text-purple-700' },
  { value: 'done',        label: 'Done',        color: 'bg-green-100 text-green-700' },
  { value: 'declined',    label: 'Declined',    color: 'bg-gray-100 text-gray-500' },
]

function statusStyle(status: string) {
  return STATUSES.find(s => s.value === status)?.color ?? 'bg-gray-100 text-gray-500'
}
function statusLabel(status: string) {
  return STATUSES.find(s => s.value === status)?.label ?? status
}

export default function AdminFeedback() {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const load = () =>
    api.feedback.adminList()
      .then(d => setItems(d as FeedbackItem[]))
      .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const setStatus = async (id: string, status: string) => {
    await api.feedback.updateStatus(id, status)
    setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i))
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this idea?')) return
    await api.feedback.delete(id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const visible = filter === 'all' ? items : items.filter(i => i.status === filter)

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-1">Site Ideas & Feedback</h2>
      <p className="text-sm text-gray-500 mb-5">Ideas submitted by members from the dashboard.</p>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-5">
        {[{ value: 'all', label: `All (${items.length})` }, ...STATUSES].map(s => (
          <button key={s.value} onClick={() => setFilter(s.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition border
              ${filter === s.value
                ? 'bg-green-700 text-white border-green-700'
                : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
          No feedback yet.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(item => (
            <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{item.message}</p>
                  <p className="text-xs text-gray-400 mt-1.5">
                    {item.first_name} {item.last_name}
                    <span className="mx-1">·</span>
                    {new Date(item.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric'
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyle(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                  <select
                    value={item.status}
                    onChange={e => setStatus(item.id, e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-600">
                    {STATUSES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <button onClick={() => remove(item.id)}
                    className="text-gray-300 hover:text-red-400 transition text-sm">
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
