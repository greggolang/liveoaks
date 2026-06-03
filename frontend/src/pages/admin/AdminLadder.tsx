import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { parseDate } from '../../utils/dates'

interface Ladder { id: string; name: string; type: string; season_year: number; status: string; challenge_range: number; challenge_expiry_days: number; response_window_hours: number; play_window_days: number; description: string }
interface Entry { user_id: string; name: string; rank: number; wins: number; losses: number; season_points: number }
interface Registration { id: string; ladder_id: string; user_id: string; name: string; email: string; usta_rating: string; self_rating?: number; preference: string; availability: string; notes: string; status: string; created_at: string }
interface Challenge { id: string; challenger_id: string; challenger_name: string; challenger_rank: number; challenged_id: string; challenged_name: string; challenged_rank: number; status: string; winner_id?: string; score: string; created_at: string; play_by?: string }

const STATUSES = ['draft', 'active', 'completed']
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

function fmtDate(iso?: string) {
  if (!iso) return '—'
  return parseDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AdminLadder() {
  const [tab, setTab] = useState<'ladders' | 'registrations' | 'rankings' | 'challenges' | 'points'>('ladders')

  // Ladders
  const [ladders, setLadders] = useState<Ladder[]>([])
  const [activeLid, setActiveLid] = useState('')
  const [lForm, setLForm] = useState({ name: '', type: 'singles', season_year: new Date().getFullYear(), status: 'draft', challenge_range: 3, challenge_expiry_days: 7, response_window_hours: 72, play_window_days: 14, description: '' })
  const [editingL, setEditingL] = useState<Ladder | null>(null)
  const [lSaving, setLSaving] = useState(false)
  const [lErr, setLErr] = useState('')

  // Registrations
  const [regs, setRegs] = useState<Registration[]>([])

  // Rankings
  const [entries, setEntries] = useState<Entry[]>([])
  const [rankUserId, setRankUserId] = useState('')
  const [rankVal, setRankVal] = useState('')
  const [rankSaving, setRankSaving] = useState(false)

  // Challenges
  const [challenges, setChallenges] = useState<Challenge[]>([])
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

  useEffect(() => {
    api.ladder.admin.list().then(d => {
      const ls = d as Ladder[]
      setLadders(ls)
      if (ls.length > 0) setActiveLid(ls[0].id)
    })
  }, [])

  useEffect(() => {
    if (!activeLid) return
    api.ladder.admin.registrations(activeLid).then(d => setRegs(d as Registration[]))
    api.ladder.get(activeLid).then((d: any) => setEntries(d.entries ?? []))
    api.ladder.admin.challenges(activeLid).then(d => setChallenges(d as Challenge[]))
  }, [activeLid])

  const activeLadder = ladders.find(l => l.id === activeLid)

  // Ladder CRUD
  const startEditL = (l: Ladder) => {
    setEditingL(l)
    setLForm({ name: l.name, type: l.type, season_year: l.season_year, status: l.status, challenge_range: l.challenge_range, challenge_expiry_days: l.challenge_expiry_days, response_window_hours: l.response_window_hours, play_window_days: l.play_window_days, description: l.description })
    setLErr('')
  }
  const resetLForm = () => { setEditingL(null); setLForm({ name: '', type: 'singles', season_year: new Date().getFullYear(), status: 'draft', challenge_range: 3, challenge_expiry_days: 7, response_window_hours: 72, play_window_days: 14, description: '' }); setLErr('') }

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

  // Registration
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
      const d: any = await api.ladder.get(activeLid)
      setEntries(d.entries ?? [])
      setRankUserId(''); setRankVal('')
    } finally { setRankSaving(false) }
  }

  // Challenges
  const enterResult = async () => {
    if (!resultCid || !resultWinner) return
    setResultSaving(true); setResultErr('')
    try {
      await api.ladder.admin.enterResult(resultCid, resultWinner, resultScore)
      const updated = await api.ladder.admin.challenges(activeLid) as Challenge[]
      setChallenges(updated)
      const d: any = await api.ladder.get(activeLid)
      setEntries(d.entries ?? [])
      setResultCid(''); setResultWinner(''); setResultScore('')
    } catch (e: any) { setResultErr(e.message) } finally { setResultSaving(false) }
  }

  const forfeit = async (challengeId: string) => {
    if (!confirm('Forfeit this challenge in favour of the challenger?')) return
    await api.ladder.admin.forfeit(challengeId)
    const updated = await api.ladder.admin.challenges(activeLid) as Challenge[]
    setChallenges(updated)
    const d: any = await api.ladder.get(activeLid)
    setEntries(d.entries ?? [])
  }

  // Points
  const awardPoints = async () => {
    if (!ptUserId || !ptPoints) return
    setPtSaving(true)
    try {
      await api.ladder.admin.awardPoints(activeLid, { user_id: ptUserId, points: parseInt(ptPoints), source_type: ptType, note: ptNote })
      const d: any = await api.ladder.get(activeLid)
      setEntries(d.entries ?? [])
      setPtUserId(''); setPtPoints(''); setPtNote('')
    } finally { setPtSaving(false) }
  }

  const activeChallenges = challenges.filter(c => c.status === 'pending' || c.status === 'accepted')
  const completedChallenges = challenges.filter(c => c.status === 'completed' || c.status === 'forfeited')

  const approvedRegs = regs.filter(r => r.status === 'approved')

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
        {(['ladders', 'registrations', 'rankings', 'challenges', 'points'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 capitalize transition ${
              tab === t ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t}
            {t === 'registrations' && regs.filter(r => r.status === 'pending').length > 0 && (
              <span className="ml-1.5 bg-yellow-400 text-white text-xs rounded-full px-1.5 py-0.5">
                {regs.filter(r => r.status === 'pending').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ LADDERS ═══ */}
      {tab === 'ladders' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
            <h2 className="font-semibold text-gray-700">{editingL ? 'Edit Ladder' : 'Create Ladder'}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input value={lForm.name} onChange={e => setLForm(f => ({ ...f, name: e.target.value }))} placeholder="Ladder name (e.g. Singles 2026)"
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
                <label className="text-xs text-gray-500 whitespace-nowrap">Play window (days)</label>
                <input type="number" min={1} value={lForm.play_window_days} onChange={e => setLForm(f => ({ ...f, play_window_days: +e.target.value }))}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
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
                      <td className="px-4 py-3 text-xs text-gray-400">±{l.challenge_range} spots · {l.play_window_days}d play</td>
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
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[160px] truncate">{r.availability || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${REG_STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
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
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">Place / Move Player</h2>
            <p className="text-xs text-gray-400 mb-3">Set a player's rank. Others shift automatically.</p>
            <div className="flex gap-3 flex-wrap">
              <select value={rankUserId} onChange={e => setRankUserId(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 flex-1 min-w-[200px]">
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

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {entries.length === 0 ? <p className="text-gray-400 text-sm text-center py-8">No players ranked yet.</p> : (
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left w-12">Rank</th>
                    <th className="px-4 py-3 text-left">Player</th>
                    <th className="px-4 py-3 text-center">W–L</th>
                    <th className="px-4 py-3 text-right">Season Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {entries.map(e => (
                    <tr key={e.user_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-bold text-gray-400">#{e.rank}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{e.name}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{e.wins}–{e.losses}</td>
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
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Play by</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {activeChallenges.map(ch => (
                    <tr key={ch.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">#{ch.challenger_rank} {ch.challenger_name}</td>
                      <td className="px-4 py-2.5 text-gray-600">#{ch.challenged_rank} {ch.challenged_name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CHAL_STATUS_COLORS[ch.status]}`}>{ch.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{fmtDate(ch.play_by)}</td>
                      <td className="px-4 py-2.5 text-right space-x-2">
                        <button onClick={() => { setResultCid(ch.id); setResultWinner('') }}
                          className="text-xs text-green-600 hover:underline font-medium">Enter Result</button>
                        <button onClick={() => forfeit(ch.id)}
                          className="text-xs text-orange-500 hover:underline">Forfeit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Result entry */}
              {resultCid && (() => {
                const ch = activeChallenges.find(c => c.id === resultCid)
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
                        placeholder="Score (e.g. 6-3, 7-5)" className="border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 flex-1" />
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
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{ch.score || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{fmtDate(ch.created_at)}</td>
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
            <p className="text-xs text-gray-400 mb-3">Manually grant points for volunteering, bonuses, etc. (Ladder match results award points automatically.)</p>
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
            <p>🏆 Ladder Win = <strong>100 pts</strong></p>
            <p>📉 Ladder Loss = <strong>25 pts</strong></p>
            <p>🤝 Volunteer = <strong>25 pts</strong></p>
            <p>⭐ Bonus (admin-defined)</p>
          </div>
        </div>
      )}
    </div>
  )
}
