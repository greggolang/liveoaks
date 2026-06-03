import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../../api/client'
import { formatPhone } from '../../utils/phone'
import { parseDate } from '../../utils/dates'

interface Signup {
  id: string; full_name: string; email: string; phone?: string; member_status: string
  playing_tennis: boolean; skill_level?: string; formats?: string[]; preferred_partner?: string; willing_substitute?: boolean
  attending_lunch: boolean; lunch_count?: number; lunch_guest_names?: string
  food_contributions?: string[]; food_item?: string; food_servings?: string; food_allergies?: string
  volunteer_roles?: string[]; volunteer_time?: string
  emergency_name?: string; emergency_phone?: string; comments?: string
  submitted_at: string
}

interface Summary {
  total_signups: number; total_players: number; total_lunch: number; substitute_pool: number
  skill_levels: Record<string, number>; food_items: Record<string, number>
  volunteers: Record<string, number>; food_allergies: Array<{ name: string; allergies: string }>
}

const STATUS_COLORS: Record<string, string> = {
  member: 'bg-green-100 text-green-700',
  guest: 'bg-orange-100 text-orange-700',
  non_member: 'bg-gray-100 text-gray-600',
}

export default function AdminEventSignups() {
  const { id } = useParams<{ id: string }>()
  const [signups, setSignups] = useState<Signup[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [view, setView] = useState<'summary' | 'list'>('summary')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    api.signups.list(id!).then(d => setSignups(d as Signup[]))
    api.signups.summary(id!).then(d => setSummary(d as Summary))
  }, [id])

  const remove = async (signupId: string) => {
    if (!confirm('Remove this signup?')) return
    await api.signups.delete(id!, signupId)
    setSignups(s => s.filter(x => x.id !== signupId))
    api.signups.summary(id!).then(d => setSummary(d as Summary))
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin/events" className="text-gray-400 hover:text-gray-600 text-sm">← Events</Link>
        <h2 className="text-xl font-bold text-gray-800">Event Sign-Ups</h2>
        <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">{signups.length} registered</span>
      </div>

      <div className="flex gap-2 mb-6">
        {(['summary', 'list'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${view === v ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {v === 'summary' ? '📊 Planning Summary' : '📋 All Signups'}
          </button>
        ))}
      </div>

      {view === 'summary' && summary && (
        <div className="space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Sign-Ups', value: summary.total_signups, color: 'bg-blue-50 text-blue-700' },
              { label: 'Tennis Players', value: summary.total_players, color: 'bg-green-50 text-green-700' },
              { label: 'Lunch Attending', value: summary.total_lunch, color: 'bg-yellow-50 text-yellow-700' },
              { label: 'Substitute Pool', value: summary.substitute_pool, color: 'bg-purple-50 text-purple-700' },
            ].map(s => (
              <div key={s.label} className={`${s.color} rounded-xl p-4 text-center border border-white shadow-sm`}>
                <div className="text-3xl font-bold">{s.value}</div>
                <div className="text-xs font-medium mt-1 opacity-80">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Skill levels */}
            {Object.keys(summary.skill_levels).length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold text-gray-700 mb-3">🎾 Skill Level Distribution</h3>
                <div className="space-y-2">
                  {Object.entries(summary.skill_levels).sort().map(([level, count]) => (
                    <div key={level} className="flex items-center gap-3">
                      <span className="w-10 text-sm font-medium text-gray-600">{level}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-3">
                        <div className="bg-green-500 h-3 rounded-full"
                          style={{ width: `${(count / summary.total_players) * 100}%` }} />
                      </div>
                      <span className="text-sm text-gray-500 w-6 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Food contributions */}
            {Object.keys(summary.food_items).length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold text-gray-700 mb-3">🍽 Potluck Items</h3>
                <div className="space-y-1.5">
                  {Object.entries(summary.food_items).filter(([k]) => k !== 'Not This Time').map(([item, count]) => (
                    <div key={item} className="flex justify-between items-center text-sm">
                      <span className="text-gray-700">{item}</span>
                      <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-xs font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Volunteers */}
            {Object.keys(summary.volunteers).length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold text-gray-700 mb-3">🙋 Volunteers</h3>
                <div className="space-y-1.5">
                  {Object.entries(summary.volunteers).filter(([k]) => k !== 'Not This Time').map(([role, count]) => (
                    <div key={role} className="flex justify-between items-center text-sm">
                      <span className="text-gray-700">{role}</span>
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Food allergies */}
            {summary.food_allergies.length > 0 && (
              <div className="bg-white border border-red-200 rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold text-red-700 mb-3">⚠️ Food Allergies / Restrictions</h3>
                <div className="space-y-1.5">
                  {summary.food_allergies.map((a, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium text-gray-800">{a.name}:</span>{' '}
                      <span className="text-gray-600">{a.allergies}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'list' && (
        <div className="space-y-3">
          {signups.length === 0 && <p className="text-gray-400 text-sm">No sign-ups yet.</p>}
          {signups.map(s => (
            <div key={s.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 flex justify-between items-center cursor-pointer"
                onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                <div className="flex items-center gap-3">
                  <div>
                    <div className="font-semibold text-gray-800 flex items-center gap-2">
                      {s.full_name}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[s.member_status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {s.member_status === 'non_member' ? 'Non-Member' : s.member_status.charAt(0).toUpperCase() + s.member_status.slice(1)}
                      </span>
                      {s.playing_tennis && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">🎾 Playing</span>}
                      {s.attending_lunch && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">🍽 Lunch ×{s.lunch_count}</span>}
                    </div>
                    <div className="text-xs text-gray-400">{s.email} · Submitted {parseDate(s.submitted_at).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={e => { e.stopPropagation(); remove(s.id) }}
                    className="text-red-400 hover:text-red-600 text-xs font-medium">Remove</button>
                  <span className="text-gray-400 text-sm">{expanded === s.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {expanded === s.id && (
                <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  {s.phone && <div><span className="text-gray-500">Phone:</span> {formatPhone(s.phone)}</div>}
                  {s.playing_tennis && s.skill_level && <div><span className="text-gray-500">Skill:</span> {s.skill_level}</div>}
                  {s.playing_tennis && s.formats?.length ? <div><span className="text-gray-500">Formats:</span> {s.formats.join(', ')}</div> : null}
                  {s.preferred_partner && <div><span className="text-gray-500">Partner:</span> {s.preferred_partner}</div>}
                  {s.willing_substitute != null && <div><span className="text-gray-500">Sub:</span> {s.willing_substitute ? 'Yes' : 'No'}</div>}
                  {s.lunch_guest_names && <div className="col-span-2"><span className="text-gray-500">Lunch guests:</span> {s.lunch_guest_names}</div>}
                  {s.food_item && <div><span className="text-gray-500">Bringing:</span> {s.food_item} {s.food_servings && `(${s.food_servings} servings)`}</div>}
                  {s.food_allergies && <div className="col-span-2 text-red-700"><span className="font-medium">Allergies:</span> {s.food_allergies}</div>}
                  {s.volunteer_roles?.filter(r => r !== 'Not This Time').length ? (
                    <div className="col-span-2"><span className="text-gray-500">Volunteering:</span> {s.volunteer_roles?.filter(r => r !== 'Not This Time').join(', ')} ({s.volunteer_time})</div>
                  ) : null}
                  {s.emergency_name && <div><span className="text-gray-500">Emergency:</span> {s.emergency_name} {formatPhone(s.emergency_phone)}</div>}
                  {s.comments && <div className="col-span-3 italic text-gray-600">"{s.comments}"</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
