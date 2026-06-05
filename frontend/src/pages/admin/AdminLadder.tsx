import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { parseDate } from '../../utils/dates'

interface Ladder { id: string; name: string; type: string; season_year: number; status: string; challenge_range: number; challenge_expiry_days: number; response_window_hours: number; play_window_days: number; challenge_frequency_days: number; description: string }
interface Entry {
  user_id: string; name: string; rank: number; wins: number; losses: number; season_points: number
  player_status: string; current_streak: number; longest_streak: number; last_match_date?: string
}
interface Registration { id: string; ladder_id: string; user_id: string; name: string; email: string; usta_rating: string; self_rating?: number; preference: string; availability: string; notes: string; status: string; created_at: string }
interface Challenge {
  id: string; challenger_id: string; challenger_name: string; challenger_rank: number
  challenged_id: string; challenged_name: string; challenged_rank: number
  status: string; winner_id?: string; score: string; score_status: string
  match_format: string; match_date?: string; match_time?: string
  created_at: string; play_by?: string; respond_by?: string
}
interface AuditRow { id: string; admin_name: string; action: string; target_name: string; note: string; created_at: string }
interface ConductRow { id: string; user_id: string; user_name: string; type: string; reason: string; issued_by_name: string; expires_at?: string; created_at: string }

const STATUSES = ['draft', 'active', 'completed']
const PLAYER_STATUSES = ['active', 'injury_reserve', 'vacation_hold', 'inactive', 'suspended']
const PLAYER_STATUS_LABELS: Record<string, string> = {
  active: 'Active', injury_reserve: 'Injury Reserve', vacation_hold: 'Vacation Hold', inactive: 'Inactive', suspended: 'Suspended',
}
const PLAYER_STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  injury_reserve: 'bg-red-100 text-red-600',
  vacation_hold: 'bg-purple-100 text-purple-600',
  inactive: 'bg-gray-100 text-gray-500',
  suspended: 'bg-red-200 text-red-800',
}
const REG_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
}
const CHAL_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  declined: 'bg-gray-100 text-gray-500',
  expired: 'bg-gray-100 text-gray-400',
  forfeited: 'bg-orange-100 text-orange-700',
}
const ACTION_LABELS: Record<string, string> = {
  create_ladder: 'Created Ladder',
  update_ladder: 'Updated Ladder',
  registration_approved: 'Approved Registration',
  registration_rejected: 'Rejected Registration',
  set_rank: 'Set Rank',
  set_player_status: 'Changed Status',
  enter_result: 'Entered Result',
  forfeit: 'Forfeited Match',
  reverse_result: 'Reversed Result',
  award_points: 'Awarded Points',
  conduct_warning: 'Issued Warning',
  conduct_suspension: 'Issued Suspension',
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  return parseDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fmtDateTime(iso?: string) {
  if (!iso) return '—'
  return parseDate(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function winPct(wins: number, losses: number): string {
  const total = wins + losses
  if (total === 0) return '—'
  return (wins / total * 100).toFixed(0) + '%'
}

export default function AdminLadder() {
  type Tab = 'ladders' | 'registrations' | 'rankings' | 'challenges' | 'points' | 'conduct' | 'audit'
  const [tab, setTab] = useState<Tab>('ladders')

  const [ladders, setLadders] = useState<Ladder[]>([])
  const [activeLid, setActiveLid] = useState('')
  const [lForm, setLForm] = useState({ name: '', type: 'singles', season_year: new Date().getFullYear(), status: 'draft', challenge_range: 3, challenge_expiry_days: 7, response_window_hours: 48, play_window_days: 10, challenge_frequency_days: 0, description: '' })
  const [editingL, setEditingL] = useState<Ladder | null>(null)
  const [lSaving, setLSaving] = useState(false)
  const [lErr, setLErr] = useState('')

  const [regs, setRegs] = useState<Registration[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [auditLog, setAuditLog] = useState<AuditRow[]>([])
  const [conductRecords, setConductRecords] = useState<ConductRow[]>([])

  // Rankings
  const [rankUserId, setRankUserId] = useState('')
  const [rankVal, setRankVal] = useState('')
  const [rankSaving, setRankSaving] = useState(false)
  const [statusUserId, setStatusUserId] = useState('')
  const [statusVal, setStatusVal] = useState('active')
  const [statusNote, setStatusNote] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)

  // Challenges
  const [resultCid, setResultCid] = useState('')
  const [resultWinner, setResultWinner] = useState('')
  const [resultScore, setResultScore] = useState('')
  const [resultSaving, setResultSaving] = useState(false)
  const [resultErr, setResultErr] = useState('')

  // Points
  const [ptUserId, setPtUserId] = useState('')
  const [ptPoints, setPtPoints] = useState('')
  const [ptType, setPtType] = useState('volunteer')
  const [ptNote, setPtNote] = useState('')
  const [ptSaving, setPtSaving] = useState(false)

  // Conduct
  const [conductUserId, setConductUserId] = useState('')
  const [conductType, setConductType] = useState('warning')
  const [conductReason, setConductReason] = useState('')
  const [conductExpires, setConductExpires] = useState('')
  const [conductSaving, setConductSaving] = useState(false)
  const [conductErr, setConductErr] = useState('')

  const refreshData = async (lid: string) => {
    const [regsData, ladderData, challengesData] = await Promise.all([
      api.ladder.admin.registrations(lid) as Promise<Registration[]>,
      api.ladder.get(lid) as Promise<any>,
      api.ladder.admin.challenges(lid) as Promise<Challenge[]>,
    ])
    setRegs(regsData)
    setEntries(ladderData.entries ?? [])
    setChallenges(challengesData)
  }

  useEffect(() => {
    api.ladder.admin.list().then(d => {
      const ls = d as Ladder[]
      setLadders(ls)
      if (ls.length > 0) setActiveLid(ls[0].id)
    })
  }, [])

  useEffect(() => {
    if (!activeLid) return
    refreshData(activeLid)
  }, [activeLid])

  useEffect(() => {
    if (!activeLid || tab !== 'audit') return
    api.ladder.admin.auditLog(activeLid).then(d => setAuditLog(d as AuditRow[]))
  }, [activeLid, tab])

  useEffect(() => {
    if (!activeLid || tab !== 'conduct') return
    api.ladder.admin.conduct(activeLid).then(d => setConductRecords(d as ConductRow[]))
  }, [activeLid, tab])

  const activeLadder = ladders.find(l => l.id === activeLid)

  // Ladder CRUD
  const startEditL = (l: Ladder) => {
    setEditingL(l)
    setLForm({ name: l.name, type: l.type, season_year: l.season_year, status: l.status, challenge_range: l.challenge_range, challenge_expiry_days: l.challenge_expiry_days, response_window_hours: l.response_window_hours, play_window_days: l.play_window_days, challenge_frequency_days: l.challenge_frequency_days, description: l.description })
    setLErr('')
  }
  const resetLForm = () => {
    setEditingL(null)
    setLForm({ name: '', type: 'singles', season_year: new Date().getFullYear(), status: 'draft', challenge_range: 3, challenge_expiry_days: 7, response_window_hours: 48, play_window_days: 10, challenge_frequency_days: 0, description: '' })
    setLErr('')
  }
  const saveL = async () => {
    setLSaving(true); setLErr('')
    try {
      if (editingL) {
        const u = await api.ladder.admin.update(editingL.id, lForm) as Ladder
        setLadders(ls => ls.map(l => l.id === u.id ? u : l))
      } else {
        const c = await api.ladder.admin.create(lForm) as Ladder
        setLadders(ls => [...ls, c])
        setActiveLid(c.id)
      }
      resetLForm()
    } catch (e: any) { setLErr(e.message) } finally { setLSaving(false) }
  }
  const deleteL = async (id: string) => {
    if (!confirm('Delete this ladder and ALL its data?')) return
    await api.ladder.admin.delete(id)
    setLadders(ls => ls.filter(l => l.id !== id))
    if (activeLid === id) setActiveLid(ladders[0]?.id ?? '')
  }

  // Registrations
  const approveReg = async (userId: string, status: string) => {
    await api.ladder.admin.approveReg(activeLid, userId, status)
    setRegs(rs => rs.map(r => r.user_id === userId ? { ...r, status } : r))
  }

  // Rankings
  const setRank = async () => {
    if (!rankUserId || !rankVal) return
    setRankSaving(true)
    try {
      await api.ladder.admin.setRank(activeLid, rankUserId, parseInt(rankVal))
      await refreshData(activeLid)
      setRankUserId(''); setRankVal('')
    } finally { setRankSaving(false) }
  }
  const setPlayerStatus = async () => {
    if (!statusUserId) return
    setStatusSaving(true)
    try {
      await api.ladder.admin.setPlayerStatus(activeLid, statusUserId, statusVal, statusNote)
      await refreshData(activeLid)
      setStatusUserId(''); setStatusNote('')
    } finally { setStatusSaving(false) }
  }

  // Challenges
  const enterResult = async () => {
    if (!resultCid || !resultWinner) return
    setResultSaving(true); setResultErr('')
    try {
      await api.ladder.admin.enterResult(resultCid, resultWinner, resultScore)
      await refreshData(activeLid)
      setResultCid(''); setResultWinner(''); setResultScore('')
    } catch (e: any) { setResultErr(e.message) } finally { setResultSaving(false) }
  }
  const forfeit = async (challengeId: string) => {
    if (!confirm('Forfeit this challenge in favour of the challenger?')) return
    await api.ladder.admin.forfeit(challengeId)
    await refreshData(activeLid)
  }
  const reverseResult = async (challengeId: string) => {
    const note = prompt('Reason for reversing this result (optional):') ?? ''
    await api.ladder.admin.reverseResult(challengeId, note)
    await refreshData(activeLid)
  }

  // Points
  const awardPoints = async () => {
    if (!ptUserId || !ptPoints) return
    setPtSaving(true)
    try {
      await api.ladder.admin.awardPoints(activeLid, { user_id: ptUserId, points: parseInt(ptPoints), source_type: ptType, note: ptNote })
      await refreshData(activeLid)
      setPtUserId(''); setPtPoints(''); setPtNote('')
    } finally { setPtSaving(false) }
  }

  // Conduct
  const issueConductAction = async () => {
    if (!conductUserId || !conductReason) return
    setConductSaving(true); setConductErr('')
    try {
      await api.ladder.admin.issueConductAction(activeLid, {
        user_id: conductUserId,
        type: conductType,
        reason: conductReason,
        expires_at: conductExpires || undefined,
      })
      const updated = await api.ladder.admin.conduct(activeLid) as ConductRow[]
      setConductRecords(updated)
      await refreshData(activeLid)
      setConductUserId(''); setConductReason(''); setConductExpires('')
    } catch (e: any) { setConductErr(e.message) } finally { setConductSaving(false) }
  }

  const activeChallenges = challenges.filter(c => c.status === 'pending' || c.status === 'accepted')
  const disputedChallenges = challenges.filter(c => c.score_status === 'disputed')
  const completedChallenges = challenges.filter(c => c.status === 'completed' || c.status === 'forfeited')
  const approvedRegs = regs.filter(r => r.status === 'approved')
  const pendingRegs = regs.filter(r => r.status === 'pending')

  const tabDef: { key: Tab; label: string; badge?: number }[] = [
    { key: 'ladders', label: 'Ladders' },
    { key: 'registrations', label: 'Registrations', badge: pendingRegs.length },
    { key: 'rankings', label: 'Rankings' },
    { key: 'challenges', label: 'Challenges', badge: disputedChallenges.length },
    { key: 'points', label: 'Points' },
    { key: 'conduct', label: 'Conduct' },
    { key: 'audit', label: 'Audit Log' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Tennis Ladder Management</h1>
        <p className="text-gray-500 text-sm mt-0.5">Create and manage ladders, seed rankings, enter results, award points.</p>
      </div>

      {/* Ladder selector */}
      {ladders.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-gray-500 font-medium">Active ladder:</span>
          {ladders.map(l => (
            <button key={l.id} onClick={() => setActiveLid(l.id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                activeLid === l.id ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'
              }`}>
              {l.name} {l.season_year}
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {tabDef.map(({ key, label, badge }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 capitalize transition ${
              tab === key ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {label}
            {badge ? (
              <span className="ml-1.5 bg-yellow-400 text-white text-xs rounded-full px-1.5 py-0.5">{badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ═══ LADDERS ═══ */}
      {tab === 'ladders' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
            <h2 className="font-semibold text-gray-700">{editingL ? 'Edit Ladder' : 'Create Ladder'}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input value={lForm.name} onChange={e => setLForm(f => ({ ...f, name: e.target.value }))} placeholder="Ladder name (e.g. Men's Singles 2026)"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <select value={lForm.type} onChange={e => setLForm(f => ({ ...f, type: e.target.value }))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="singles">Singles</option>
                <option value="doubles">Doubles</option>
              </select>
              <select value={lForm.status} onChange={e => setLForm(f => ({ ...f, status: e.target.value }))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
              <input type="number" value={lForm.season_year} onChange={e => setLForm(f => ({ ...f, season_year: +e.target.value }))} placeholder="Year"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <div className="flex gap-2 items-center">
                <label className="text-xs text-gray-500 whitespace-nowrap">Challenge range</label>
                <input type="number" min={1} max={10} value={lForm.challenge_range} onChange={e => setLForm(f => ({ ...f, challenge_range: +e.target.value }))}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="flex gap-2 items-center">
                <label className="text-xs text-gray-500 whitespace-nowrap">Response window (h)</label>
                <input type="number" min={1} value={lForm.response_window_hours} onChange={e => setLForm(f => ({ ...f, response_window_hours: +e.target.value }))}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="flex gap-2 items-center">
                <label className="text-xs text-gray-500 whitespace-nowrap">Play window (days)</label>
                <input type="number" min={1} value={lForm.play_window_days} onChange={e => setLForm(f => ({ ...f, play_window_days: +e.target.value }))}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="flex gap-2 items-center">
                <label className="text-xs text-gray-500 whitespace-nowrap">Frequency cap (days)</label>
                <input type="number" min={0} value={lForm.challenge_frequency_days} onChange={e => setLForm(f => ({ ...f, challenge_frequency_days: +e.target.value }))}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="0 = off" />
              </div>
              <textarea value={lForm.description} onChange={e => setLForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Description (optional)" rows={2}
                className="sm:col-span-3 border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            {lErr && <p className="text-red-500 text-xs">{lErr}</p>}
            <div className="flex gap-2">
              <button onClick={saveL} disabled={lSaving || !lForm.name}
                className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
                {lSaving ? 'Saving…' : editingL ? 'Update' : 'Create Ladder'}
              </button>
              {editingL && <button onClick={resetLForm} className="text-sm text-gray-500 hover:text-gray-700 px-3">Cancel</button>}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {ladders.length === 0 ? <p className="text-gray-400 text-sm text-center py-8">No ladders yet.</p> : (
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Year</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Rules</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {ladders.map(l => (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{l.name}</td>
                      <td className="px-4 py-3 text-gray-500 capitalize">{l.type}</td>
                      <td className="px-4 py-3 text-gray-500">{l.season_year}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${l.status === 'active' ? 'bg-green-100 text-green-700' : l.status === 'draft' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        ±{l.challenge_range} spots · {l.response_window_hours}h respond · {l.play_window_days}d play
                        {l.challenge_frequency_days > 0 && ` · 1 challenge/${l.challenge_frequency_days}d`}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button onClick={() => startEditL(l)} className="text-xs text-blue-600 hover:underline">Edit</button>
                        <button onClick={() => deleteL(l.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ═══ REGISTRATIONS ═══ */}
      {tab === 'registrations' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {regs.length === 0 ? <p className="text-gray-400 text-sm text-center py-10">No registrations yet.</p> : (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 uppercase border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">USTA</th>
                  <th className="px-4 py-3 text-left">Self</th>
                  <th className="px-4 py-3 text-left">Pref</th>
                  <th className="px-4 py-3 text-left">Availability</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {regs.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{r.name}</div>
                      <div className="text-xs text-gray-400">{r.email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{r.usta_rating || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{r.self_rating ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 capitalize">{r.preference}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[140px] truncate">{r.availability || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[140px] truncate">{r.notes || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${REG_STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                      {r.status !== 'approved' && (
                        <button onClick={() => approveReg(r.user_id, 'approved')} className="text-xs text-green-600 hover:underline font-medium">Approve</button>
                      )}
                      {r.status !== 'rejected' && (
                        <button onClick={() => approveReg(r.user_id, 'rejected')} className="text-xs text-red-500 hover:underline">Reject</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ═══ RANKINGS ═══ */}
      {tab === 'rankings' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Place / Move Player */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-semibold text-gray-700 mb-1">Place / Move Player</h2>
              <p className="text-xs text-gray-400 mb-3">Set a player's rank — others shift automatically.</p>
              <div className="flex gap-3 flex-wrap">
                <select value={rankUserId} onChange={e => setRankUserId(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 flex-1 min-w-[160px]">
                  <option value="">— Select player —</option>
                  {approvedRegs.map(r => <option key={r.user_id} value={r.user_id}>{r.name}</option>)}
                </select>
                <input type="number" min={1} value={rankVal} onChange={e => setRankVal(e.target.value)}
                  placeholder="Rank #" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-green-500" />
                <button onClick={setRank} disabled={rankSaving || !rankUserId || !rankVal}
                  className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
                  {rankSaving ? 'Saving…' : 'Set Rank'}
                </button>
              </div>
            </div>

            {/* Change Player Status */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-semibold text-gray-700 mb-1">Change Player Status</h2>
              <p className="text-xs text-gray-400 mb-3">Update availability, suspend, or reactivate a player.</p>
              <div className="space-y-2">
                <div className="flex gap-2 flex-wrap">
                  <select value={statusUserId} onChange={e => setStatusUserId(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 flex-1 min-w-[160px]">
                    <option value="">— Select player —</option>
                    {entries.map(e => <option key={e.user_id} value={e.user_id}>{e.name} (#{e.rank})</option>)}
                  </select>
                  <select value={statusVal} onChange={e => setStatusVal(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                    {PLAYER_STATUSES.map(s => <option key={s} value={s}>{PLAYER_STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
                <input value={statusNote} onChange={e => setStatusNote(e.target.value)} placeholder="Note (optional)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                <button onClick={setPlayerStatus} disabled={statusSaving || !statusUserId}
                  className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
                  {statusSaving ? 'Saving…' : 'Update Status'}
                </button>
              </div>
            </div>
          </div>

          {/* Rankings table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
            {entries.length === 0 ? <p className="text-gray-400 text-sm text-center py-8">No players ranked yet.</p> : (
              <table className="w-full text-sm min-w-[640px]">
                <thead className="text-xs text-gray-500 uppercase border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left w-12">Rank</th>
                    <th className="px-4 py-3 text-left">Player</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">W–L</th>
                    <th className="px-4 py-3 text-center">Win%</th>
                    <th className="px-4 py-3 text-center">Streak</th>
                    <th className="px-4 py-3 text-center">Last Match</th>
                    <th className="px-4 py-3 text-right">Season Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {entries.map(e => (
                    <tr key={e.user_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-bold text-gray-400">#{e.rank}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{e.name}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAYER_STATUS_COLORS[e.player_status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {PLAYER_STATUS_LABELS[e.player_status] ?? e.player_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500">{e.wins}–{e.losses}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{winPct(e.wins, e.losses)}</td>
                      <td className="px-4 py-3 text-center">
                        {e.current_streak > 0 ? <span className="text-orange-600 font-semibold">{e.current_streak}W</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-400 text-xs">{fmtDate(e.last_match_date)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700">{e.season_points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ═══ CHALLENGES ═══ */}
      {tab === 'challenges' && (
        <div className="space-y-4">
          {/* Disputed scores — requires admin resolution */}
          {disputedChallenges.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-red-100 font-semibold text-sm text-red-700">
                Disputed Scores — Admin Review Required ({disputedChallenges.length})
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-400 uppercase border-b border-red-100">
                  <tr>
                    <th className="px-4 py-2 text-left">Match</th>
                    <th className="px-4 py-2 text-left">Submitted Score</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-50">
                  {disputedChallenges.map(ch => (
                    <tr key={ch.id} className="hover:bg-red-50/60">
                      <td className="px-4 py-2.5 text-gray-800">
                        #{ch.challenger_rank} {ch.challenger_name} vs #{ch.challenged_rank} {ch.challenged_name}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-sm text-gray-600">{ch.score || '—'}</td>
                      <td className="px-4 py-2.5 text-right space-x-2">
                        <button onClick={() => { setResultCid(ch.id); setResultWinner('') }}
                          className="text-xs text-green-700 hover:underline font-medium">Enter Correct Result</button>
                        <button onClick={() => forfeit(ch.id)} className="text-xs text-orange-500 hover:underline">Forfeit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Active challenges */}
          {activeChallenges.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 font-semibold text-sm text-gray-700">
                Active Challenges ({activeChallenges.length})
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-400 uppercase border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left">Challenger</th>
                    <th className="px-4 py-2 text-left">vs</th>
                    <th className="px-4 py-2 text-left">Format</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Play by</th>
                    <th className="px-4 py-2 text-left">Score Status</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {activeChallenges.map(ch => (
                    <tr key={ch.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">#{ch.challenger_rank} {ch.challenger_name}</td>
                      <td className="px-4 py-2.5 text-gray-600">#{ch.challenged_rank} {ch.challenged_name}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{ch.match_format === 'pro_set' ? 'Pro Set' : 'Best of 3'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CHAL_STATUS_COLORS[ch.status]}`}>{ch.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{fmtDate(ch.play_by)}</td>
                      <td className="px-4 py-2.5 text-xs">
                        {ch.score_status === 'pending_approval' && <span className="text-yellow-700 font-medium">Pending approval</span>}
                        {ch.score_status === 'disputed' && <span className="text-red-700 font-bold">Disputed</span>}
                        {!ch.score_status && <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right space-x-2 whitespace-nowrap">
                        <button onClick={() => { setResultCid(ch.id); setResultWinner('') }}
                          className="text-xs text-green-600 hover:underline font-medium">Enter Result</button>
                        <button onClick={() => forfeit(ch.id)}
                          className="text-xs text-orange-500 hover:underline">Forfeit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Result entry panel */}
              {resultCid && (() => {
                const ch = challenges.find(c => c.id === resultCid)
                if (!ch) return null
                return (
                  <div className="border-t border-gray-100 bg-blue-50 px-4 py-4 space-y-3">
                    <p className="text-sm font-semibold text-blue-800">
                      Enter result: #{ch.challenger_rank} {ch.challenger_name} vs #{ch.challenged_rank} {ch.challenged_name}
                    </p>
                    <div className="flex gap-3 flex-wrap items-center">
                      <select value={resultWinner} onChange={e => setResultWinner(e.target.value)}
                        className="border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                        <option value="">— Winner —</option>
                        <option value={ch.challenger_id}>{ch.challenger_name} (challenger)</option>
                        <option value={ch.challenged_id}>{ch.challenged_name} (challenged)</option>
                      </select>
                      <input value={resultScore} onChange={e => setResultScore(e.target.value)}
                        placeholder={ch.match_format === 'pro_set' ? 'e.g. 8-5' : 'e.g. 6-3, 7-5'}
                        className="border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 flex-1" />
                      <button onClick={enterResult} disabled={resultSaving || !resultWinner}
                        className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
                        {resultSaving ? 'Saving…' : 'Save Result'}
                      </button>
                      <button onClick={() => setResultCid('')} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
                    </div>
                    {resultErr && <p className="text-red-500 text-xs">{resultErr}</p>}
                  </div>
                )
              })()}
            </div>
          )}

          {/* Completed / resolved */}
          {completedChallenges.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 font-semibold text-sm text-gray-700">
                Completed / Resolved ({completedChallenges.length})
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-400 uppercase border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left">Challenger</th>
                    <th className="px-4 py-2 text-left">vs</th>
                    <th className="px-4 py-2 text-left">Result</th>
                    <th className="px-4 py-2 text-left">Score</th>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {completedChallenges.map(ch => (
                    <tr key={ch.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-700">#{ch.challenger_rank} {ch.challenger_name}</td>
                      <td className="px-4 py-2.5 text-gray-500">#{ch.challenged_rank} {ch.challenged_name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CHAL_STATUS_COLORS[ch.status]}`}>{ch.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{ch.score || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{fmtDate(ch.created_at)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => reverseResult(ch.id)} className="text-xs text-gray-400 hover:text-red-600 hover:underline">Reverse</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {challenges.length === 0 && (
            <div className="text-center text-gray-400 py-10">No challenges yet.</div>
          )}
        </div>
      )}

      {/* ═══ POINTS ═══ */}
      {tab === 'points' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-1">Award Points</h2>
            <p className="text-xs text-gray-400 mb-3">Manually grant points for volunteering, bonuses, etc.</p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <select value={ptUserId} onChange={e => setPtUserId(e.target.value)}
                className="sm:col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">— Select player —</option>
                {entries.map(e => <option key={e.user_id} value={e.user_id}>{e.name} (#{e.rank})</option>)}
              </select>
              <input type="number" value={ptPoints} onChange={e => setPtPoints(e.target.value)} placeholder="Points"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <select value={ptType} onChange={e => setPtType(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="volunteer">Volunteer (25 pts)</option>
                <option value="bonus">Bonus</option>
              </select>
              <input value={ptNote} onChange={e => setPtNote(e.target.value)} placeholder="Note (optional)"
                className="sm:col-span-3 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <button onClick={awardPoints} disabled={ptSaving || !ptUserId || !ptPoints}
              className="mt-3 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
              {ptSaving ? 'Saving…' : 'Award Points'}
            </button>
          </div>

          <div className="text-sm text-gray-500 bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-1">
            <p className="font-semibold text-gray-700 mb-2">Season Points Reference</p>
            <p>Ladder Win = <strong>100 pts</strong></p>
            <p>Ladder Loss = <strong>25 pts</strong></p>
            <p>Volunteer = <strong>25 pts</strong></p>
            <p>Bonus (admin-defined)</p>
          </div>
        </div>
      )}

      {/* ═══ CONDUCT ═══ */}
      {tab === 'conduct' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
            <h2 className="font-semibold text-gray-700">Issue Warning or Suspension</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select value={conductUserId} onChange={e => setConductUserId(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500">
                <option value="">— Select player —</option>
                {entries.map(e => <option key={e.user_id} value={e.user_id}>{e.name} (#{e.rank})</option>)}
              </select>
              <select value={conductType} onChange={e => setConductType(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500">
                <option value="warning">Warning</option>
                <option value="suspension">Suspension</option>
              </select>
              <input type="date" value={conductExpires} onChange={e => setConductExpires(e.target.value)}
                placeholder="Expires (optional)"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
              <textarea value={conductReason} onChange={e => setConductReason(e.target.value)}
                placeholder="Reason (required)" rows={2}
                className="sm:col-span-3 border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
            {conductErr && <p className="text-red-500 text-xs">{conductErr}</p>}
            <button onClick={issueConductAction} disabled={conductSaving || !conductUserId || !conductReason}
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
              {conductSaving ? 'Saving…' : `Issue ${conductType.charAt(0).toUpperCase() + conductType.slice(1)}`}
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {conductRecords.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">No conduct records.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">Player</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Reason</th>
                    <th className="px-4 py-3 text-left">Issued By</th>
                    <th className="px-4 py-3 text-left">Expires</th>
                    <th className="px-4 py-3 text-left">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {conductRecords.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{r.user_name}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.type === 'suspension' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-800'}`}>
                          {r.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-sm max-w-[260px]">{r.reason}</td>
                      <td className="px-4 py-3 text-gray-500 text-sm">{r.issued_by_name}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{r.expires_at ? fmtDate(r.expires_at) : 'Indefinite'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{fmtDateTime(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ═══ AUDIT LOG ═══ */}
      {tab === 'audit' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {auditLog.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-10">No audit entries yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 uppercase border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">When</th>
                  <th className="px-4 py-3 text-left">Admin</th>
                  <th className="px-4 py-3 text-left">Action</th>
                  <th className="px-4 py-3 text-left">Player</th>
                  <th className="px-4 py-3 text-left">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {auditLog.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-700 text-xs">{r.admin_name}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {ACTION_LABELS[r.action] ?? r.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-sm">{r.target_name || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs max-w-[280px] truncate">{r.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
