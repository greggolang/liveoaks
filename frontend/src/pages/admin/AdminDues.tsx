import { useEffect, useState } from 'react'
import { parseDate } from '../../utils/dates'
import { api } from '../../api/client'

interface Due { id: string; user_id: string; first_name: string; last_name: string; email: string; amount: number; due_date: string; paid_at?: string; status: string }
interface Member { id: string; first_name: string; last_name: string; email: string }

export default function AdminDues() {
  const [dues, setDues] = useState<Due[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [filter, setFilter] = useState('all')
  const [genAmount, setGenAmount] = useState('100')
  const [genDate, setGenDate] = useState('')
  const [generating, setGenerating] = useState(false)
  const [singleUser, setSingleUser] = useState('')
  const [singleAmount, setSingleAmount] = useState('100')
  const [singleDate, setSingleDate] = useState('')
  const [generatingSingle, setGeneratingSingle] = useState(false)

  const load = () => api.dues.adminList().then(d => setDues(d as Due[]))
  useEffect(() => {
    load()
    api.members.directory().then((m: any) => setMembers(m as Member[])).catch(() => {})
  }, [])

  const filtered = filter === 'all' ? dues : dues.filter(d => d.status === filter)

  const statusColor: Record<string, string> = {
    paid: 'bg-green-100 text-green-700',
    unpaid: 'bg-yellow-100 text-yellow-700',
    waived: 'bg-gray-100 text-gray-500',
  }

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    setGenerating(true)
    try {
      const res = await api.dues.generate(parseFloat(genAmount), genDate) as any
      alert(`Generated dues for ${res.created} members`)
      load()
    } finally { setGenerating(false) }
  }

  const handleGenerateSingle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!singleUser) return
    setGeneratingSingle(true)
    try {
      const res = await api.dues.generateForUser(singleUser, parseFloat(singleAmount), singleDate) as any
      const m = members.find(x => x.id === singleUser)
      const name = m ? `${m.first_name} ${m.last_name}` : 'member'
      alert(res.created ? `Due generated for ${name}` : `${name} already has a due for that date`)
      load()
    } finally { setGeneratingSingle(false) }
  }

  const summary = { total: dues.length, paid: dues.filter(d => d.status === 'paid').length, unpaid: dues.filter(d => d.status === 'unpaid').length }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-4">Dues Management</h2>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[['Total', summary.total, 'bg-gray-50'], ['Paid', summary.paid, 'bg-green-50'], ['Unpaid', summary.unpaid, 'bg-yellow-50']].map(([label, count, bg]) => (
          <div key={label as string} className={`${bg} border border-gray-200 rounded-xl p-4 text-center`}>
            <div className="text-2xl font-bold text-gray-800">{count}</div>
            <div className="text-sm text-gray-500">{label}</div>
          </div>
        ))}
      </div>

      <form onSubmit={handleGenerate} className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex flex-col sm:flex-row gap-3 sm:items-end shadow-sm">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Amount ($)</label>
          <input type="number" value={genAmount} onChange={e => setGenAmount(e.target.value)} required
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
          <input type="date" value={genDate} onChange={e => setGenDate(e.target.value)} required
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <button type="submit" disabled={generating}
          className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition disabled:opacity-50">
          {generating ? 'Generating...' : 'Generate for All Active Members'}
        </button>
      </form>

      <form onSubmit={handleGenerateSingle} className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex flex-col sm:flex-row gap-3 sm:items-end shadow-sm">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">Single Member</label>
          <select value={singleUser} onChange={e => setSingleUser(e.target.value)} required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
            <option value="">Choose a member…</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>{m.first_name} {m.last_name} ({m.email})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Amount ($)</label>
          <input type="number" value={singleAmount} onChange={e => setSingleAmount(e.target.value)} required
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
          <input type="date" value={singleDate} onChange={e => setSingleDate(e.target.value)} required
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <button type="submit" disabled={generatingSingle || !singleUser}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50 whitespace-nowrap">
          {generatingSingle ? 'Generating...' : 'Generate for One Member'}
        </button>
      </form>

      <div className="flex gap-2 mb-4">
        {['all', 'unpaid', 'paid', 'waived'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filter === f ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Member</th>
              <th className="px-4 py-3 text-left">Amount</th>
              <th className="px-4 py-3 text-left">Due Date</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(d => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800">{d.first_name} {d.last_name}</div>
                  <div className="text-xs text-gray-400">{d.email}</div>
                </td>
                <td className="px-4 py-3">${d.amount.toFixed(2)}</td>
                <td className="px-4 py-3 text-gray-500">{parseDate(d.due_date).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[d.status]}`}>{d.status}</span>
                </td>
                <td className="px-4 py-3">
                  <select value={d.status} onChange={async e => { await api.dues.updateStatus(d.id, e.target.value); load() }}
                    className="text-xs border border-gray-200 rounded px-2 py-1">
                    <option value="unpaid">Unpaid</option>
                    <option value="paid">Mark Paid</option>
                    <option value="waived">Waived</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
