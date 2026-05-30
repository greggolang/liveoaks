import { useEffect, useState } from 'react'
import { api } from '../api/client'

interface Member { id: string; first_name: string; last_name: string; email: string; phone?: string }

export default function MemberDirectory() {
  const [members, setMembers] = useState<Member[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => { api.members.directory().then(d => setMembers(d as Member[])) }, [])

  const filtered = members.filter(m => {
    const q = search.toLowerCase()
    return !q || `${m.first_name} ${m.last_name} ${m.email}`.toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Member Directory</h1>
        <span className="text-sm text-gray-400">{filtered.length} members</span>
      </div>
      <input type="text" placeholder="Search name or email..." value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full mb-4 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(m => (
          <div key={m.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="font-semibold text-gray-800">{m.first_name} {m.last_name}</div>
            <a href={`mailto:${m.email}`} className="text-green-700 text-sm hover:underline">{m.email}</a>
            {m.phone && <div className="text-gray-500 text-sm mt-0.5">{m.phone}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
