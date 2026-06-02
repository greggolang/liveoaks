import { useEffect, useState, useCallback } from 'react'
import { api } from '../../api/client'

interface BoardComm {
  id: string
  type: 'message' | 'alert' | 'meeting'
  subject: string
  preview: string
  from_name: string
  from_email: string
  from_user_id?: string
  to_name: string
  to_email: string
  to_user_id?: string
  created_at: string
}

interface BoardMember {
  id: string
  first_name: string
  last_name: string
  role: string
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  message: { label: 'Internal Message', color: 'bg-blue-100 text-blue-700' },
  alert:   { label: 'Member Alert',     color: 'bg-yellow-100 text-yellow-700' },
  meeting: { label: 'Board Meeting',    color: 'bg-green-100 text-green-700' },
}

const ROLE_LABELS: Record<string, string> = {
  admin:          'Admin',
  president:      'President',
  vice_president: 'Vice President',
  secretary:      'Secretary',
  treasurer:      'Treasurer',
  billing:        'Billing',
  entertainment:  'Entertainment',
  house_grounds:  'House & Grounds',
}

export default function AdminBoardCommunications() {
  const [comms, setComms]           = useState<BoardComm[]>([])
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([])
  const [loading, setLoading]       = useState(false)
  const [expanded, setExpanded]     = useState<string | null>(null)

  const [search, setSearch]       = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [fromDate, setFromDate]   = useState('')
  const [toDate, setToDate]       = useState('')

  const [appliedSearch, setAppliedSearch] = useState('')
  const [appliedType, setAppliedType]     = useState('')
  const [appliedUser, setAppliedUser]     = useState('')
  const [appliedFrom, setAppliedFrom]     = useState('')
  const [appliedTo, setAppliedTo]         = useState('')

  useEffect(() => {
    api.boardCommunications.boardMembers().then(d => setBoardMembers(d as BoardMember[]))
  }, [])

  const load = useCallback((q: string, type: string, userId: string, from: string, to: string) => {
    setLoading(true)
    api.boardCommunications.list({
      q: q || undefined,
      type: type || undefined,
      user_id: userId || undefined,
      from: from || undefined,
      to: to || undefined,
    }).then(d => {
      setComms(d as BoardComm[])
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load('', '', '', '', '')
  }, [load])

  const handleSearch = () => {
    setAppliedSearch(search)
    setAppliedType(typeFilter)
    setAppliedUser(userFilter)
    setAppliedFrom(fromDate)
    setAppliedTo(toDate)
    load(search, typeFilter, userFilter, fromDate, toDate)
  }

  const handleClear = () => {
    setSearch('')
    setTypeFilter('')
    setUserFilter('')
    setFromDate('')
    setToDate('')
    setAppliedSearch('')
    setAppliedType('')
    setAppliedUser('')
    setAppliedFrom('')
    setAppliedTo('')
    load('', '', '', '', '')
  }

  const hasFilters = appliedSearch || appliedType || appliedUser || appliedFrom || appliedTo

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Board Communications</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Internal messages, alerts, and board meeting invitations involving board members
          </p>
        </div>
        <span className="text-xs text-gray-400">{comms.length} result{comms.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search subject, body, names..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 flex-1 min-w-48"
          />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All types</option>
            <option value="message">Internal Messages</option>
            <option value="alert">Member Alerts</option>
            <option value="meeting">Board Meetings</option>
          </select>
          <select
            value={userFilter}
            onChange={e => setUserFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All board members</option>
            {boardMembers.map(m => (
              <option key={m.id} value={m.id}>
                {m.first_name} {m.last_name} ({ROLE_LABELS[m.role] ?? m.role})
              </option>
            ))}
          </select>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            title="From date"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            title="To date"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={handleSearch}
            className="bg-green-700 hover:bg-green-800 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition"
          >
            Search
          </button>
          {hasFilters && (
            <button onClick={handleClear} className="text-sm text-red-500 hover:text-red-700 font-medium px-2">
              Clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : comms.length === 0 ? (
        <p className="text-gray-400 text-sm">No communications found.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-100">
            {comms.map(c => {
              const meta = TYPE_LABELS[c.type] ?? { label: c.type, color: 'bg-gray-100 text-gray-700' }
              const isExpanded = expanded === c.id
              return (
                <div key={c.id} className="px-4 py-3 hover:bg-gray-50 transition">
                  <div
                    className="flex items-start gap-3 cursor-pointer"
                    onClick={() => setExpanded(isExpanded ? null : c.id)}
                  >
                    <div className="mt-0.5 shrink-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.color}`}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800 truncate">{c.subject || '(no subject)'}</p>
                        <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                          {new Date(c.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                        <span>
                          <span className="text-gray-400">From:</span>{' '}
                          <span className="font-medium text-gray-700">{c.from_name}</span>
                          {c.from_email && <span className="text-gray-400"> &lt;{c.from_email}&gt;</span>}
                        </span>
                        <span className="text-gray-300">·</span>
                        <span>
                          <span className="text-gray-400">To:</span>{' '}
                          <span className="font-medium text-gray-700">{c.to_name}</span>
                          {c.to_email && <span className="text-gray-400"> &lt;{c.to_email}&gt;</span>}
                        </span>
                      </div>
                      {!isExpanded && c.preview && (
                        <p className="mt-1 text-xs text-gray-400 truncate">{c.preview}</p>
                      )}
                    </div>
                    <div className="text-gray-400 text-xs mt-1 shrink-0">
                      {isExpanded ? '▲' : '▼'}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 ml-0 pl-0 border-t border-gray-100 pt-3">
                      <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
                        {c.preview}
                      </pre>
                      {c.preview.length >= 400 && (
                        <p className="text-xs text-gray-400 mt-2 italic">Preview truncated at 400 characters.</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
