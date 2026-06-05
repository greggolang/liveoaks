import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { parseDate } from '../utils/dates'

interface Ladder { id: string; name: string; type: string; season_year: number; status: string; challenge_range: number; response_window_hours: number; play_window_days: number; challenge_frequency_days: number; description: string }
interface Entry { user_id: string; name: string; rank: number; wins: number; losses: number; season_points: number; player_status: string; current_streak: number; last_match_date?: string }
interface Challenge {
  id: string; ladder_id: string
  challenger_id: string; challenger_name: string; challenger_rank: number
  challenged_id: string; challenged_name: string; challenged_rank: number
  status: string; winner_id?: string; score: string; score_status: string; score_submitted_by?: string
  message: string; match_format: string; match_date?: string; match_time?: string
  created_at: string; expires_at: string; respond_by: string; play_by?: string
}
interface MyStatus { registered: boolean; registration_status: string; entry: Entry; challenges: Challenge[]; suspended: boolean; suspend_reason: string }

const CHAL_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  declined: 'bg-gray-100 text-gray-500',
  expired: 'bg-gray-100 text-gray-400',
  forfeited: 'bg-orange-100 text-orange-700',
}
const PLAYER_STATUS_LABELS: Record<string, string> = {
  active: 'Active', injury_reserve: 'Injury Reserve', vacation_hold: 'Vacation Hold', inactive: 'Inactive', suspended: 'Suspended',
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  return parseDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDue(iso?: string) {
  if (!iso) return ''
  const diff = Math.ceil((parseDate(iso).getTime() - Date.now()) / 86400000)
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'due today'
  return `${diff}d left`
}
function winPct(w: number, l: number) {
  return w + l === 0 ? '—' : (w / (w + l) * 100).toFixed(0) + '%'
}

export default function TennisChallengeLadder() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'ladder' | 'challenges' | 'register'>('ladder')

  const [ladders, setLadders] = useState<Ladder[]>([])
  const [activeLid, setActiveLid] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [myStatus, setMyStatus] = useState<MyStatus | null>(null)

  // Challenge flow
  const [challenging, setChallenging] = useState<Entry | null>(null)
  const [challengeMsg, setChallengeMsg] = useState('')
  const [challengeFormat, setChallengeFormat] = useState('best_of_3')
  const [challengeSending, setChallengeSending] = useState(false)
  const [challengeError, setChallengeError] = useState('')

  // Score / schedule
  const [scoringId, setScoringId] = useState('')
  const [scoreInput, setScoreInput] = useState('')
  const [scoreSaving, setScoreSaving] = useState(false)
  const [scoreError, setScoreError] = useState('')
  const [schedulingId, setSchedulingId] = useState('')
  const [schedDate, setSchedDate] = useState('')
  const [schedTime, setSchedTime] = useState('')
  const [schedSaving, setSchedSaving] = useState(false)

  // Status / reg
  const [statusSaving, setStatusSaving] = useState(false)
  const [regForm, setRegForm] = useState({ usta_rating: '', self_rating: '', preference: 'singles', availability: '', notes: '' })
  const [regSaving, setRegSaving] = useState(false)
  const [regMsg, setRegMsg] = useState('')

  const refresh = async (lid: string) => {
    const [ladderData, statusData] = await Promise.all([
      api.ladder.get(lid) as Promise<any>,
      api.ladder.myStatus(lid) as Promise<MyStatus>,
    ])
    setEntries(ladderData.entries ?? [])
    setMyStatus(statusData)
  }

  useEffect(() => {
    api.ladder.list().then(d => {
      const ls = d as Ladder[]
      setLadders(ls)
      if (ls.length > 0) setActiveLid(ls[0].id)
    })
  }, [])

  useEffect(() => { if (activeLid) refresh(activeLid) }, [activeLid])

  const activeLadder = ladders.find(l => l.id === activeLid)
  const myEntry = myStatus?.entry
  const isRegistered = myStatus?.registered && myStatus?.registration_status === 'approved'
  const myChallenges = myStatus?.challenges ?? []
  const activeChallenges = myChallenges.filter(c => c.status === 'pending' || c.status === 'accepted')
  const hasActiveOutgoing = activeChallenges.some(c => c.challenger_id === user?.id)
  const pendingApproval = myChallenges.filter(c => c.score_status === 'pending_approval' && c.score_submitted_by !== user?.id)

  // Players this user can challenge right now
  const challengeable = entries.filter(e => {
    if (!isRegistered || !myEntry?.rank || !activeLadder) return false
    if (e.user_id === user?.id) return false
    if (hasActiveOutgoing) return false
    if (myStatus?.suspended) return false
    const myPs = myEntry.player_status
    if (myPs !== 'active') return false
    if (e.player_status !== 'active') return false
    const diff = myEntry.rank - e.rank
    return diff > 0 && diff <= activeLadder.challenge_range
  })

  const sendChallenge = async () => {
    if (!challenging || !activeLid) return
    setChallengeSending(true); setChallengeError('')
    try {
      await api.ladder.createChallenge(activeLid, {
        challenged_id: challenging.user_id,
        message: challengeMsg,
        match_format: challengeFormat,
      })
      await refresh(activeLid)
      setChallenging(null); setChallengeMsg(''); setChallengeFormat('best_of_3')
      setTab('challenges')
    } catch (e: any) { setChallengeError(e.message) } finally { setChallengeSending(false) }
  }

  const respond = async (id: string, action: 'accept' | 'decline') => {
    await api.ladder.respondChallenge(id, action)
    await refresh(activeLid)
  }

  const submitScore = async () => {
    if (!scoringId || !scoreInput.trim()) return
    setScoreSaving(true); setScoreError('')
    try {
      await api.ladder.submitScore(scoringId, scoreInput.trim())
      await refresh(activeLid)
      setScoringId(''); setScoreInput('')
    } catch (e: any) { setScoreError(e.message) } finally { setScoreSaving(false) }
  }

  const approveScore = async (id: string, action: 'approve' | 'dispute') => {
    await api.ladder.approveScore(id, action)
    await refresh(activeLid)
  }

  const saveSchedule = async () => {
    if (!schedulingId || !schedDate) return
    setSchedSaving(true)
    try {
      await api.ladder.scheduleMatch(schedulingId, schedDate, schedTime)
      await refresh(activeLid)
      setSchedulingId(''); setSchedDate(''); setSchedTime('')
    } finally { setSchedSaving(false) }
  }

  const setMyPlayerStatus = async (status: string) => {
    setStatusSaving(true)
    try { await api.ladder.setMyStatus(activeLid, status); await refresh(activeLid) }
    finally { setStatusSaving(false) }
  }

  const saveReg = async () => {
    setRegSaving(true); setRegMsg('')
    try {
      await api.ladder.register(activeLid, { ...regForm, self_rating: regForm.self_rating ? parseFloat(regForm.self_rating) : null })
      const updated = await api.ladder.myStatus(activeLid) as MyStatus
      setMyStatus(updated)
      setRegMsg('Registration submitted! An admin will review your request.')
    } catch (e: any) { setRegMsg(e.message) } finally { setRegSaving(false) }
  }

  if (ladders.length === 0) return (
    <div className="text-center text-gray-400 py-20">
      <p className="text-lg font-medium">No active challenge ladder yet.</p>
      <p className="text-sm mt-1">Check back soon or contact an admin.</p>
    </div>
  )

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Tennis Challenge Ladder</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Challenge anyone ranked up to <strong>{activeLadder?.challenge_range ?? 2} spot{(activeLadder?.challenge_range ?? 2) !== 1 ? 's' : ''}</strong> above you and climb the rankings.
          </p>
        </div>
        {myEntry?.rank && (
          <div className="flex gap-3 flex-wrap">
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-center min-w-[72px]">
              <div className="text-2xl font-bold text-green-700">#{myEntry.rank}</div>
              <div className="text-xs text-green-600">Your Rank</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-center min-w-[72px]">
              <div className="text-lg font-bold text-gray-700">{myEntry.wins}–{myEntry.losses}</div>
              <div className="text-xs text-gray-500">W–L ({winPct(myEntry.wins, myEntry.losses)})</div>
            </div>
            {myEntry.current_streak > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-2 text-center min-w-[72px]">
                <div className="text-lg font-bold text-orange-600">{myEntry.current_streak}W</div>
                <div className="text-xs text-orange-500">Streak</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Banners */}
      {myStatus?.suspended && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <strong>Account suspended:</strong> {myStatus.suspend_reason} — Contact an admin to resolve.
        </div>
      )}
      {pendingApproval.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-3 text-sm text-yellow-800 flex items-center justify-between gap-3">
          <span><strong>Action required:</strong> You have {pendingApproval.length} match score{pendingApproval.length > 1 ? 's' : ''} waiting for your approval.</span>
          <button onClick={() => setTab('challenges')} className="underline font-semibold whitespace-nowrap">Review now</button>
        </div>
      )}

      {/* Ladder selector (multiple ladders) */}
      {ladders.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {ladders.map(l => (
            <button key={l.id} onClick={() => setActiveLid(l.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                activeLid === l.id ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'
              }`}>
              {l.name} {l.season_year}
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {([
          { key: 'ladder', label: 'Standings' },
          { key: 'challenges', label: 'My Challenges', badge: activeChallenges.length },
          ...(!isRegistered ? [{ key: 'register', label: 'Join Ladder' }] : []),
        ] as { key: string; label: string; badge?: number }[]).map(({ key, label, badge }) => (
          <button key={key} onClick={() => setTab(key as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === key ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {label}
            {badge ? <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{badge}</span> : null}
          </button>
        ))}
      </div>

      {/* ── STANDINGS TAB ── */}
      {tab === 'ladder' && (
        <div className="space-y-4">
          {activeLadder?.description && (
            <p className="text-sm text-gray-500">{activeLadder.description}</p>
          )}

          {/* Player status bar */}
          {isRegistered && myEntry && (
            <div className="flex items-center gap-3 flex-wrap bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
              <span className="text-xs text-gray-500 font-medium">Your status:</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                myEntry.player_status === 'active' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-orange-100 text-orange-700 border-orange-200'
              }`}>
                {PLAYER_STATUS_LABELS[myEntry.player_status] ?? myEntry.player_status}
              </span>
              {myEntry.player_status === 'active' && (
                <div className="flex gap-2 ml-auto">
                  <button onClick={() => setMyPlayerStatus('injury_reserve')} disabled={statusSaving}
                    className="text-xs text-red-600 border border-red-200 bg-red-50 px-2.5 py-1 rounded-lg transition disabled:opacity-50">
                    Injury Reserve
                  </button>
                  <button onClick={() => setMyPlayerStatus('vacation_hold')} disabled={statusSaving}
                    className="text-xs text-purple-600 border border-purple-200 bg-purple-50 px-2.5 py-1 rounded-lg transition disabled:opacity-50">
                    Vacation Hold
                  </button>
                </div>
              )}
              {(myEntry.player_status === 'injury_reserve' || myEntry.player_status === 'vacation_hold') && (
                <button onClick={() => setMyPlayerStatus('active')} disabled={statusSaving}
                  className="ml-auto text-xs text-green-700 border border-green-200 bg-green-50 px-2.5 py-1 rounded-lg transition disabled:opacity-50">
                  Return to Active
                </button>
              )}
            </div>
          )}

          {/* Challenge zone — players you can challenge right now */}
          {isRegistered && challengeable.length > 0 && !hasActiveOutgoing && !challenging && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-green-800 mb-3">
                You can challenge {challengeable.length === 1 ? 'this player' : `${challengeable.length} players`} right now
              </p>
              <div className="flex gap-3 flex-wrap">
                {challengeable.map(e => (
                  <button key={e.user_id}
                    onClick={() => { setChallenging(e); setChallengeError('') }}
                    className="flex items-center gap-3 bg-white border border-green-300 hover:border-green-500 hover:bg-green-50 rounded-xl px-4 py-3 transition group">
                    <div className="text-left">
                      <div className="text-xs text-green-600 font-semibold">#{e.rank} — {myEntry!.rank - e.rank} spot{myEntry!.rank - e.rank !== 1 ? 's' : ''} above you</div>
                      <div className="font-semibold text-gray-800 group-hover:text-green-700 transition">{e.name}</div>
                      <div className="text-xs text-gray-400">{e.wins}–{e.losses} · {winPct(e.wins, e.losses)}</div>
                    </div>
                    <span className="ml-2 text-xs bg-green-700 text-white px-2.5 py-1 rounded-lg font-semibold">Challenge</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Already has an active challenge */}
          {isRegistered && hasActiveOutgoing && !challenging && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
              You have an active outgoing challenge. Wait for it to complete before issuing another.
              <button onClick={() => setTab('challenges')} className="ml-2 underline font-semibold">View challenge</button>
            </div>
          )}

          {/* Challenge compose form */}
          {challenging && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-blue-800">
                  Challenge <span className="text-green-700">#{challenging.rank} {challenging.name}</span>
                  <span className="ml-2 text-xs font-normal text-blue-600">({myEntry!.rank - challenging.rank} spot{myEntry!.rank - challenging.rank !== 1 ? 's' : ''} above you)</span>
                </p>
                <button onClick={() => { setChallenging(null); setChallengeError('') }} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-blue-700 mb-1">Match Format</label>
                  <select value={challengeFormat} onChange={e => setChallengeFormat(e.target.value)}
                    className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="best_of_3">Best of 3 Sets</option>
                    <option value="pro_set">8-Game Pro Set</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-blue-700 mb-1">Optional Message</label>
                  <input value={challengeMsg} onChange={e => setChallengeMsg(e.target.value)}
                    placeholder="Message to your opponent…"
                    className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>
              {challengeError && <p className="text-red-500 text-xs">{challengeError}</p>}
              <div className="flex gap-2 items-center">
                <button onClick={sendChallenge} disabled={challengeSending}
                  className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-5 py-2 rounded-lg transition disabled:opacity-50">
                  {challengeSending ? 'Sending…' : 'Send Challenge'}
                </button>
                <button onClick={() => { setChallenging(null); setChallengeError('') }} className="text-sm text-gray-500 hover:text-gray-700 px-3">
                  Cancel
                </button>
                <p className="text-xs text-gray-400 ml-auto">
                  {challenging.name} has {activeLadder?.response_window_hours ?? 48}h to respond
                </p>
              </div>
            </div>
          )}

          {/* Full standings table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="text-xs text-gray-500 uppercase border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left w-14">Rank</th>
                  <th className="px-4 py-3 text-left">Player</th>
                  <th className="px-4 py-3 text-center">W–L</th>
                  <th className="px-4 py-3 text-center">Win%</th>
                  <th className="px-4 py-3 text-center">Streak</th>
                  <th className="px-4 py-3 text-center">Last Match</th>
                  <th className="px-4 py-3 w-28" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.map((e, i) => {
                  const isMe = e.user_id === user?.id
                  const canChallenge = challengeable.some(c => c.user_id === e.user_id)
                  const unavailable = e.player_status !== 'active'
                  return (
                    <tr key={e.user_id} className={`transition ${
                      isMe ? 'bg-green-50' : canChallenge ? 'bg-amber-50/50' : unavailable ? 'opacity-50' : 'hover:bg-gray-50'
                    }`}>
                      <td className="px-4 py-3">
                        <span className={`font-bold text-base ${
                          i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : isMe ? 'text-green-700' : 'text-gray-300'
                        }`}>#{e.rank}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`font-medium ${isMe ? 'text-green-800' : 'text-gray-800'}`}>
                          {e.name}
                          {isMe && <span className="ml-1.5 text-xs text-green-600 font-normal">(you)</span>}
                          {canChallenge && <span className="ml-1.5 text-xs text-amber-600 font-semibold">↑ challengeable</span>}
                        </div>
                        {e.player_status !== 'active' && (
                          <div className="text-xs text-gray-400 mt-0.5">{PLAYER_STATUS_LABELS[e.player_status]}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{e.wins}–{e.losses}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{winPct(e.wins, e.losses)}</td>
                      <td className="px-4 py-3 text-center">
                        {e.current_streak > 0
                          ? <span className="text-orange-500 font-semibold text-xs">{e.current_streak}W</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-400 text-xs">{fmtDate(e.last_match_date)}</td>
                      <td className="px-4 py-3 text-right">
                        {canChallenge && !challenging && !hasActiveOutgoing && (
                          <button onClick={() => { setChallenging(e); setChallengeError('') }}
                            className="text-xs bg-green-700 hover:bg-green-800 text-white px-3 py-1.5 rounded-lg font-semibold transition">
                            Challenge
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {entries.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-gray-400 py-10 text-sm">No players on the ladder yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-gray-400 space-y-0.5">
            <p>Challenge up to <strong>{activeLadder?.challenge_range ?? 2} spots</strong> above your current rank · {activeLadder?.response_window_hours ?? 48}h to respond · {activeLadder?.play_window_days ?? 10} days to play</p>
            <p>Win = move up to your opponent's rank · Loss = stay in place · One active challenge at a time</p>
          </div>
        </div>
      )}

      {/* ── CHALLENGES TAB ── */}
      {tab === 'challenges' && (
        <div className="space-y-4">
          {myChallenges.length === 0 && (
            <div className="text-center text-gray-400 py-12 text-sm">
              No challenges yet.{isRegistered && challengeable.length > 0 && (
                <> <button onClick={() => setTab('ladder')} className="text-green-600 hover:underline font-medium">Go to Standings</button> to issue one.</>
              )}
            </div>
          )}

          {myChallenges.map(ch => {
            const iAm = ch.challenger_id === user?.id
            const opponent = iAm ? ch.challenged_name : ch.challenger_name
            const oppRank = iAm ? ch.challenged_rank : ch.challenger_rank
            const isIncoming = !iAm && ch.status === 'pending'
            const isAccepted = ch.status === 'accepted'
            const canScore = isAccepted && !ch.score_status
            const needsApproval = ch.score_status === 'pending_approval' && ch.score_submitted_by !== user?.id
            const isScoring = scoringId === ch.id
            const isSched = schedulingId === ch.id

            return (
              <div key={ch.id} className={`bg-white rounded-xl border shadow-sm p-4 space-y-3 ${
                needsApproval ? 'border-yellow-300' : ch.status === 'completed' ? 'border-green-200' : 'border-gray-200'
              }`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800">
                        {iAm ? 'You challenged ' : 'Challenge from '}
                        <span className="text-green-700">#{oppRank} {opponent}</span>
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CHAL_COLORS[ch.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {ch.status}
                      </span>
                      <span className="text-xs border border-gray-200 px-1.5 py-0.5 rounded text-gray-400">
                        {ch.match_format === 'pro_set' ? '8-Game Pro Set' : 'Best of 3'}
                      </span>
                    </div>
                    {ch.message && <p className="text-sm text-gray-500 mt-1 italic">"{ch.message}"</p>}
                    <div className="text-xs text-gray-400 mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>Sent {fmtDate(ch.created_at)}</span>
                      {ch.status === 'pending' && <span className="text-yellow-600">Respond by {fmtDate(ch.respond_by)} ({fmtDue(ch.respond_by)})</span>}
                      {ch.status === 'accepted' && ch.play_by && <span className="text-blue-600">Play by {fmtDate(ch.play_by)} ({fmtDue(ch.play_by)})</span>}
                      {ch.match_date && <span className="text-green-700 font-medium">Scheduled: {fmtDate(ch.match_date)}{ch.match_time ? ` at ${ch.match_time}` : ''}</span>}
                      {ch.score && <span>Score: <strong>{ch.score}</strong></span>}
                    </div>
                    {ch.score_status === 'pending_approval' && (
                      <p className="text-xs mt-1.5 font-medium text-yellow-700 bg-yellow-50 px-2 py-1 rounded inline-block">Score awaiting approval</p>
                    )}
                    {ch.score_status === 'disputed' && (
                      <p className="text-xs mt-1.5 font-medium text-red-700 bg-red-50 px-2 py-1 rounded inline-block">Score disputed — admin review in progress</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    {isIncoming && (
                      <div className="flex gap-2">
                        <button onClick={() => respond(ch.id, 'accept')}
                          className="text-xs bg-green-700 hover:bg-green-800 text-white px-3 py-1.5 rounded-lg font-semibold transition">Accept</button>
                        <button onClick={() => respond(ch.id, 'decline')}
                          className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded-lg font-semibold transition">Decline</button>
                      </div>
                    )}
                    {isAccepted && !ch.match_date && !isSched && (
                      <button onClick={() => setSchedulingId(ch.id)}
                        className="text-xs border border-gray-300 text-gray-600 hover:border-green-400 hover:text-green-700 px-3 py-1.5 rounded-lg transition">
                        Schedule Match
                      </button>
                    )}
                    {canScore && !isScoring && (
                      <button onClick={() => setScoringId(ch.id)}
                        className="text-xs bg-blue-700 hover:bg-blue-800 text-white px-3 py-1.5 rounded-lg font-semibold transition">
                        Submit Score
                      </button>
                    )}
                    {needsApproval && (
                      <div className="flex gap-2">
                        <button onClick={() => approveScore(ch.id, 'approve')}
                          className="text-xs bg-green-700 hover:bg-green-800 text-white px-3 py-1.5 rounded-lg font-semibold transition">Approve Score</button>
                        <button onClick={() => approveScore(ch.id, 'dispute')}
                          className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg font-semibold transition">Dispute</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Schedule form */}
                {isSched && (
                  <div className="pt-3 border-t border-gray-100 flex gap-3 flex-wrap items-end">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Date</label>
                      <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)}
                        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Time (optional)</label>
                      <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}
                        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                    <button onClick={saveSchedule} disabled={schedSaving || !schedDate}
                      className="text-xs bg-green-700 text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50">
                      {schedSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => setSchedulingId('')} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                  </div>
                )}

                {/* Score submit form */}
                {isScoring && (
                  <div className="pt-3 border-t border-gray-100 space-y-2">
                    <p className="text-xs font-medium text-gray-600">
                      Submit score — you are claiming the win. Format: <span className="font-mono bg-gray-100 px-1 rounded">6-4, 3-6, 10-7</span>
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <input value={scoreInput} onChange={e => setScoreInput(e.target.value)}
                        placeholder={ch.match_format === 'pro_set' ? 'e.g. 8-5' : 'e.g. 6-4, 3-6, 10-7'}
                        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[160px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <button onClick={submitScore} disabled={scoreSaving || !scoreInput.trim()}
                        className="text-xs bg-blue-700 text-white px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50">
                        {scoreSaving ? 'Saving…' : 'Submit'}
                      </button>
                      <button onClick={() => { setScoringId(''); setScoreInput('') }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                    </div>
                    {scoreError && <p className="text-red-500 text-xs">{scoreError}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── REGISTER TAB ── */}
      {tab === 'register' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-lg space-y-4">
          <div>
            <h2 className="font-semibold text-gray-800">Join the Challenge Ladder</h2>
            <p className="text-sm text-gray-500 mt-0.5">An admin will place you in the rankings after reviewing your request.</p>
          </div>
          {myStatus?.registered && myStatus.registration_status === 'pending' ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800">
              Your registration is pending approval. An admin will review it shortly.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">USTA Rating</label>
                  <input value={regForm.usta_rating} onChange={e => setRegForm(f => ({ ...f, usta_rating: e.target.value }))}
                    placeholder="e.g. 3.5" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Self Rating</label>
                  <input type="number" step="0.5" min="1" max="7" value={regForm.self_rating}
                    onChange={e => setRegForm(f => ({ ...f, self_rating: e.target.value }))}
                    placeholder="e.g. 3.5" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Availability</label>
                <input value={regForm.availability} onChange={e => setRegForm(f => ({ ...f, availability: e.target.value }))}
                  placeholder="e.g. Weekday mornings, weekends" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                <textarea value={regForm.notes} onChange={e => setRegForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Anything else the admin should know…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              {regMsg && <p className={`text-sm ${regMsg.includes('error') || regMsg.includes('Error') ? 'text-red-500' : 'text-green-600'}`}>{regMsg}</p>}
              <button onClick={saveReg} disabled={regSaving}
                className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-6 py-2 rounded-lg transition disabled:opacity-50">
                {regSaving ? 'Submitting…' : 'Submit Registration'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
