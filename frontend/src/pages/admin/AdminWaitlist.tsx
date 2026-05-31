import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { formatPhone } from '../../utils/phone'

const USTA_RATINGS = ['2.5', '3.0', '3.5', '4.0', '4.5', '5.0']

interface Entry {
  id: string; first_name: string; last_name: string
  email?: string; phone?: string; notes?: string; usta_ranking?: string
  status: string; position?: number; created_at: string
}

const STATUS_COLOR: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-700',
  contacted: 'bg-blue-100 text-blue-700',
  accepted:  'bg-green-100 text-green-700',
  declined:  'bg-red-100 text-red-700',
}

export default function AdminWaitlist() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [editContact, setEditContact] = useState<string | null>(null)
  const [contactForm, setContactForm] = useState({ email: '', phone: '', usta_ranking: '' })
  const [savingContact, setSavingContact] = useState(false)

  const load = () => api.waitlist.list().then(d => setEntries(d as Entry[]))
  useEffect(() => { load() }, [])

  const openContact = (w: Entry) => {
    setEditContact(w.id)
    setContactForm({ email: w.email ?? '', phone: formatPhone(w.phone), usta_ranking: w.usta_ranking ?? '' })
  }

  const saveContact = async (id: string) => {
    setSavingContact(true)
    try {
      await api.waitlist.updateContact(id, contactForm.email, contactForm.phone, contactForm.usta_ranking)
      setEditContact(null)
      load()
    } finally { setSavingContact(false) }
  }

  const missing = entries.filter(e => !e.email && !e.phone).length

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-xl font-bold text-gray-800">Waitlist</h2>
        <span className="text-sm text-gray-400">{entries.length} entries</span>
      </div>
      {missing > 0 && (
        <p className="text-xs text-amber-600 mb-4">
          {missing} entr{missing === 1 ? 'y has' : 'ies have'} no contact info — click the contact cell to add email / phone.
        </p>
      )}

      {entries.length === 0 ? (
        <p className="text-gray-400 text-sm">No one on the waitlist.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-3 py-3 text-left w-10">#</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Contact</th>
                <th className="px-4 py-3 text-left">Notes</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((w, idx) => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 text-gray-400 text-xs font-mono">
                    {w.position ?? idx + 1}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {w.first_name} {w.last_name}
                  </td>
                  <td className="px-4 py-3">
                    {editContact === w.id ? (
                      <div className="flex flex-col gap-1.5">
                        <input
                          type="email"
                          value={contactForm.email}
                          onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))}
                          placeholder="Email"
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-full focus:outline-none focus:ring-1 focus:ring-green-500"
                        />
                        <input
                          type="tel"
                          value={contactForm.phone}
                          onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))}
                          placeholder="Phone"
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-full focus:outline-none focus:ring-1 focus:ring-green-500"
                        />
                        <select
                          value={contactForm.usta_ranking}
                          onChange={e => setContactForm(f => ({ ...f, usta_ranking: e.target.value }))}
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-full focus:outline-none focus:ring-1 focus:ring-green-500 bg-white">
                          <option value="">USTA Rating</option>
                          {USTA_RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <div className="flex gap-2">
                          <button onClick={() => saveContact(w.id)} disabled={savingContact}
                            className="text-xs bg-green-700 text-white px-2 py-1 rounded hover:bg-green-800 transition disabled:opacity-50">
                            {savingContact ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => setEditContact(null)}
                            className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => openContact(w)}
                        className="text-left hover:opacity-70 transition group">
                        {w.email || w.phone ? (
                          <>
                            {w.email && <div className="text-gray-600 text-xs">{w.email}</div>}
                            {w.phone && <div className="text-gray-400 text-xs">{formatPhone(w.phone)}</div>}
                            {w.usta_ranking && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium mt-0.5 inline-block">
                                USTA {w.usta_ranking}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-amber-500 group-hover:text-amber-600">
                            + Add contact info
                          </span>
                        )}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{w.notes ?? '—'}</td>
                  <td className="px-4 py-3">
                    <select value={w.status}
                      onChange={async e => { await api.waitlist.updateStatus(w.id, e.target.value); load() }}
                      className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLOR[w.status]}`}>
                      <option value="pending">Pending</option>
                      <option value="contacted">Contacted</option>
                      <option value="accepted">Accepted</option>
                      <option value="declined">Declined</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={async () => {
                      if (confirm(`Remove ${w.first_name} ${w.last_name} from waitlist?`)) {
                        await api.waitlist.delete(w.id); load()
                      }
                    }} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}
