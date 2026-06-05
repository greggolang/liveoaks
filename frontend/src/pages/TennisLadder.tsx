import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { parseDate } from '../utils/dates'
import HelpPanel from '../components/HelpPanel'

const HELP = [
  { heading: 'How the Ladder Works', body: 'The Tennis Ladder is a continuous ranking competition. All registered members are ranked by position. Move up by challenging players ranked above you and winning.' },
  { heading: 'Challenge Rules', body: 'You may challenge players up to 3 spots above you. You can only have one active outgoing challenge at a time. Players on Injury Reserve or Vacation Hold cannot be challenged.' },
  { heading: 'After the Match', body: 'The winner submits the score from the Challenges tab. The opponent has 48 hours to approve or dispute. Once approved the rankings update automatically.' },
  { heading: 'Ranking Movement', body: 'Win a challenge and you swap positions with your opponent. Losing keeps you in your current position but statistics are updated.' },
  { heading: 'Player Status', body: 'If you are injured or going on vacation, set your status to Injury Reserve or Vacation Hold — you will be removed from the active challenge pool. Activity is required every 30 days to remain active.' },
]

interface Ladder { id: string; name: string; type: string; season_year: number; status: string; challenge_range: number; response_window_hours: number; play_window_days: number; challenge_frequency_days: number; description: string }
interface Entry {
  user_id: string; name: string; rank: number; wins: number; losses: number; season_points: number
  player_status: string; current_streak: number; longest_streak: number; last_match_date?: string; date_joined: string
}
interface Challenge {
  id: string; ladder_id: string
  challenger_id: string; challenger_name: string; challenger_rank: number
  challenged_id: string; challenged_name: string; challenged_rank: number
  status: string; winner_id?: string; score: string; score_status: string; score_submitted_by?: string
  message: string; match_format: string; match_date?: string; match_time?: string
  created_at: string; expires_at: string; respond_by: string; play_by?: string; completed_at?: string
}
interface MyStatus {
  registered: boolean; registration_status: string; entry: Entry; challenges: Challenge[]
  suspended: boolean; suspend_reason: string
}
interface LeaderRow { user_id: string; name: string; rank: number; wins: number; losses: number; season_points: number; current_streak: number; points_rank: number }
interface Stats {
  total_players: number; active_players: number; total_matches: number
  most_active_player: string; most_active_count: number
  longest_streak: number; longest_streak_player: string
  highest_climber: string; highest_climber_rank_gain: number
  most_challenges_issued: string; most_challenges_count: number
  avg_match_days: number
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  completed: 'bg-gray-100 text-gray-500',
  draft: 'bg-yellow-100 text-yellow-700',
}
const CHALLENGE_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  declined: 'bg-gray-100 text-gray-500',
  expired: 'bg-gray-100 text-gray-400',
  forfeited: 'bg-orange-100 text-orange-700',
}
const PLAYER_STATUS_COLORS: Record<string, string> = {
  active: '',
  injury_reserve: 'bg-red-50 text-red-600',
  vacation_hold: 'bg-purple-50 text-purple-600',
  inactive: 'bg-gray-100 text-gray-400',
  suspended: 'bg-red-100 text-red-700',
}
const PLAYER_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  injury_reserve: 'Injury Reserve',
  vacation_hold: 'Vacation Hold',
  inactive: 'Inactive',
  suspended: 'Suspended',
}
const FORMAT_LABELS: Record<string, string> = {
  best_of_3: 'Best of 3 Sets',
  pro_set: '8-Game Pro Set',
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  return parseDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDue(iso?: string) {
  if (!iso) return ''
  const d = parseDate(iso)
  const diff = Math.ceil((d.getTime() - Date.now()) / 86400000)
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'due today'
  return `${diff}d left`
}
function winPct(wins: number, losses: number): string {
  const total = wins + losses
  if (total === 0) return '—'
  return (wins / total * 100).toFixed(0) + '%'
}

export default function TennisLadder() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'ladder' | 'challenges' | 'leaderboard' | 'stats' | 'register'>('ladder')
  const [ladders, setLadders] = useState<Ladder[]>([])
  const [activeLid, setActiveLid] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [myStatus, setMyStatus] = useState<MyStatus | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([])
  const [stats, setStats] = useState<Stats | null>(null)

  // Challenge flow
  const [challenging, setChallenging] = useState<Entry | null>(null)
  const [challengeMsg, setChallengeMsg] = useState('')
  const [challengeFormat, setChallengeFormat] = useState('best_of_3')
  const [challengeSending, setChallengeSending] = useState(false)
  const [challengeError, setChallengeError] = useState('')

  // Score submission
  const [scoringChallengeId, setScoringChallengeId] = useState('')
  const [scoreInput, setScoreInput] = useState('')
  const [scoreSaving, setScoreSaving] = useState(false)
  const [scoreError, setScoreError] = useState('')

  // Schedule
  const [schedulingChallengeId, setSchedulingChallengeId] = useState('')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduleSaving, setScheduleSaving] = useState(false)

  // Status management
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  // Registration form
  const [regForm, setRegForm] = useState({ usta_rating: '', self_rating: '', preference: 'singles', availability: '', notes: '' })
  const [regSaving, setRegSaving] = useState(false)
  const [regMsg, setRegMsg] = useState('')

  const refreshLadder = async (lid: string) => {
    const [ladderData, statusData, lbData] = await Promise.all([
      api.ladder.get(lid) as Promise<any>,
      api.ladder.myStatus(lid) as Promise<MyStatus>,
      api.ladder.leaderboard(lid) as Promise<LeaderRow[]>,
    ])
    setEntries(ladderData.entries ?? [])
    setMyStatus(statusData)
    setLeaderboard(lbData)
  }

  useEffect(() => {
    api.ladder.list().then(d => {
      const ls = d as Ladder[]
      setLadders(ls)
      if (ls.length > 0) setActiveLid(ls[0].id)
    })
  }, [])

  useEffect(() => {
    if (!activeLid) return
    refreshLadder(activeLid)
  }, [activeLid])

  useEffect(() => {
    if (!activeLid || tab !== 'stats') return
    api.ladder.stats(activeLid).then(d => setStats(d as Stats))
  }, [activeLid, tab])

  const activeLadder = ladders.find(l => l.id === activeLid)
  const myEntry = myStatus?.entry
  const isRegistered = myStatus?.registered && myStatus?.registration_status === 'approved'
  const myChallenges = myStatus?.challenges ?? []
  const activeChallenges = myChallenges.filter(ch => ch.status === 'pending' || ch.status === 'accepted')
  const hasActiveChallenge = activeChallenges.some(ch => ch.challenger_id === user?.id)
  const pendingScoreApproval = myChallenges.filter(ch =>
    ch.score_status === 'pending_approval' && ch.score_submitted_by !== user?.id
  )

  const canChallenge = (entry: Entry) => {
    if (!isRegistered || !myEntry?.rank || !activeLadder) return false
    if (entry.user_id === user?.id) return false
    if (hasActiveChallenge) return false
    if (myStatus?.suspended) return false
    const ps = myEntry.player_status
    if (ps === 'inactive' || ps === 'injury_reserve' || ps === 'vacation_hold' || ps === 'suspended') return false
    const ts = entry.player_status
    if (ts === 'inactive' || ts === 'injury_reserve' || ts === 'vacation_hold' || ts === 'suspended') return false
    const diff = myEntry.rank - entry.rank
    return diff > 0 && diff <= activeLadder.challenge_range
  }

  const sendChallenge = async () => {
    if (!challenging || !activeLid) return
    setChallengeSending(true)
    setChallengeError('')
    try {
      await api.ladder.createChallenge(activeLid, {
        challenged_id: challenging.user_id,
        message: challengeMsg,
        match_format: challengeFormat,
      })
      await refreshLadder(activeLid)
      setChallenging(null)
      setChallengeMsg('')
      setChallengeFormat('best_of_3')
      setTab('challenges')
    } catch (e: any) { setChallengeError(e.message) } finally { setChallengeSending(false) }
  }

  const respond = async (challengeId: string, action: 'accept' | 'decline') => {
    await api.ladder.respondChallenge(challengeId, action)
    await refreshLadder(activeLid)
  }

  const submitScore = async () => {
    if (!scoringChallengeId || !scoreInput.trim()) return
    setScoreSaving(true)
    setScoreError('')
    try {
      await api.ladder.submitScore(scoringChallengeId, scoreInput.trim())
      await refreshLadder(activeLid)
      setScoringChallengeId('')
      setScoreInput('')
    } catch (e: any) { setScoreError(e.message) } finally { setScoreSaving(false) }
  }

  const handleApproveScore = async (challengeId: string, action: 'approve' | 'dispute') => {
    await api.ladder.approveScore(challengeId, action)
    await refreshLadder(activeLid)
  }

  const saveSchedule = async () => {
    if (!schedulingChallengeId || !scheduleDate) return
    setScheduleSaving(true)
    try {
      await api.ladder.scheduleMatch(schedulingChallengeId, scheduleDate, scheduleTime)
      await refreshLadder(activeLid)
      setSchedulingChallengeId('')
      setScheduleDate('')
      setScheduleTime('')
    } finally { setScheduleSaving(false) }
  }

  const setPlayerStatus = async (status: string) => {
    setStatusSaving(true)
    setStatusMsg('')
    try {
      await api.ladder.setMyStatus(activeLid, status)
      await refreshLadder(activeLid)
      setStatusMsg('Status updated.')
    } catch (e: any) { setStatusMsg(e.message) } finally { setStatusSaving(false) }
  }

  const saveReg = async () => {
    setRegSaving(true); setRegMsg('')
    try {
      await api.ladder.register(activeLid, {
        ...regForm,
        self_rating: regForm.self_rating ? parseFloat(regForm.self_rating) : null,
      })
      const updated = await api.ladder.myStatus(activeLid) as MyStatus
      setMyStatus(updated)
      setRegMsg('Registration submitted! An admin will approve your request.')
    } catch (e: any) { setRegMsg(e.message) } finally { setRegSaving(false) }
  }

  if (ladders.length === 0) return (
    <div className="text-center text-gray-400 py-20">
      <p className="text-lg font-medium">No active ladder yet.</p>
      <p className="text-sm mt-1">Check back soon or contact an admin.</p>
    </div>
  )

  const tabList = [
    'ladder', 'challenges', 'leaderboard', 'stats',
    ...(!isRegistered ? ['register'] : []),
  ] as const

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Tennis Ladder</h1>
          <p className="text-gray-500 text-sm mt-0.5">Challenge your way to the top of the rankings.</p>
          <div className="mt-2"><HelpPanel items={HELP} /></div>
        </div>
        {myEntry?.rank ? (
          <div className="flex gap-3 flex-wrap">
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-center min-w-[72px]">
              <div className="text-2xl font-bold text-green-700">#{myEntry.rank}</div>
              <div className="text-xs text-green-600">Ladder Rank</div>
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
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-center min-w-[72px]">
              <div className="text-2xl font-bold text-blue-700">{myEntry.season_points}</div>
              <div className="text-xs text-blue-600">Season Pts</div>
            </div>
          </div>
        ) : myStatus?.registered ? (
          <span className="text-sm bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded-full font-medium">
            Registration pending approval
          </span>
        ) : null}
      </div>

      {/* Suspension banner */}
      {myStatus?.suspended && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <strong>Account suspended:</strong> {myStatus.suspend_reason} — Contact an admin to resolve.
        </div>
      )}

      {/* Pending score approvals banner */}
      {pendingScoreApproval.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-3 text-sm text-yellow-800">
          <strong>Action required:</strong> You have {pendingScoreApproval.length} match score{pendingScoreApproval.length > 1 ? 's' : ''} waiting for your approval.
          <button onClick={() => setTab('challenges')} className="ml-2 underline font-semibold">Review now</button>
        </div>
      )}

      {/* Ladder selector */}
      {ladders.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {ladders.map(l => (
            <button key={l.id} onClick={() => setActiveLid(l.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                activeLid === l.id ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'
              }`}>
              {l.name} {l.season_year}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[l.status] ?? 'bg-gray-100 text-gray-500'}`}>{l.status}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {tabList.map(t => (
          <button key={t} onClick={() => setTab(t as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 capitalize transition ${
              tab === t ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'register' ? 'Join Ladder' : t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'challenges' && activeChallenges.length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                {activeChallenges.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── LADDER TAB ── */}
      {tab === 'ladder' && (
        <div className="space-y-3">
          {activeLadder?.description && (
            <p className="text-sm text-gray-500">{activeLadder.description}</p>
          )}
          {activeLadder && (
            <p className="text-xs text-gray-400">
              Challenge up to <strong>{activeLadder.challenge_range} spots</strong> above you · {activeLadder.response_window_hours}h to respond · {activeLadder.play_window_days} days to play{activeLadder.challenge_frequency_days > 0 ? ` · each player challengeable once per ${activeLadder.challenge_frequency_days}d` : ''}
            </p>
          )}

          {/* Player status controls */}
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
                  <button onClick={() => setPlayerStatus('injury_reserve')} disabled={statusSaving}
                    className="text-xs text-red-600 hover:text-red-800 border border-red-200 bg-red-50 px-2.5 py-1 rounded-lg transition disabled:opacity-50">
                    Injury Reserve
                  </button>
                  <button onClick={() => setPlayerStatus('vacation_hold')} disabled={statusSaving}
                    className="text-xs text-purple-600 hover:text-purple-800 border border-purple-200 bg-purple-50 px-2.5 py-1 rounded-lg transition disabled:opacity-50">
                    Vacation Hold
                  </button>
                </div>
              )}
              {(myEntry.player_status === 'injury_reserve' || myEntry.player_status === 'vacation_hold') && (
                <button onClick={() => setPlayerStatus('active')} disabled={statusSaving}
                  className="ml-auto text-xs text-green-700 border border-green-200 bg-green-50 px-2.5 py-1 rounded-lg transition disabled:opacity-50">
                  Return to Active
                </button>
              )}
              {statusMsg && <span className="text-xs text-gray-500">{statusMsg}</span>}
            </div>
          )}

          {/* Challenge modal */}
          {challenging && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <p className="font-semibold text-blue-800 text-sm">
                Challenge #{challenging.rank} {challenging.name}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-blue-700 font-medium mb-1">Match Format</label>
                  <select value={challengeFormat} onChange={e => setChallengeFormat(e.target.value)}
                    className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="best_of_3">Best of 3 Sets</option>
                    <option value="pro_set">8-Game Pro Set</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-blue-700 font-medium mb-1">Optional Message</label>
                  <input value={challengeMsg} onChange={e => setChallengeMsg(e.target.value)}
                    placeholder="Message to your opponent…"
                    className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                </div>
              </div>
              {challengeError && <p className="text-red-500 text-xs">{challengeError}</p>}
              <div className="flex gap-2">
                <button onClick={sendChallenge} disabled={challengeSending}
                  className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition disabled:opacity-50">
                  {challengeSending ? 'Sending…' : 'Send Challenge'}
                </button>
                <button onClick={() => { setChallenging(null); setChallengeError('') }}
                  className="text-sm text-gray-500 hover:text-gray-700 px-3">Cancel</button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="text-xs text-gray-500 uppercase border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left w-12">Rank</th>
                  <th className="px-4 py-3 text-left">Player</th>
                  <th className="px-4 py-3 text-center">W–L</th>
                  <th className="px-4 py-3 text-center">Win%</th>
                  <th className="px-4 py-3 text-center">Streak</th>
                  <th className="px-4 py-3 text-center">Last Match</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.map(e => {
                  const isMe = e.user_id === user?.id
                  const unavailable = e.player_status !== 'active'
                  return (
                    <tr key={e.user_id} className={`${isMe ? 'bg-green-50' : unavailable ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'} transition`}>
                      <td className="px-4 py-3">
                        <span className={`font-bold text-lg ${isMe ? 'text-green-700' : 'text-gray-400'}`}>#{e.rank}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`font-medium ${isMe ? 'text-green-800' : 'text-gray-800'}`}>
                          {e.name}{isMe && <span className="ml-2 text-xs text-green-600 font-normal">(you)</span>}
                        </div>
                        {e.player_status !== 'active' && (
                          <div className={`text-xs mt-0.5 font-medium ${PLAYER_STATUS_COLORS[e.player_status]}`}>
                            {PLAYER_STATUS_LABELS[e.player_status]}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{e.wins}–{e.losses}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{winPct(e.wins, e.losses)}</td>
                      <td className="px-4 py-3 text-center">
                        {e.current_streak > 0
                          ? <span className="text-orange-600 font-semibold">{e.current_streak}W</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-400 text-xs">{fmtDate(e.last_match_date)}</td>
                      <td className="px-4 py-3 text-right">
                        {canChallenge(e) && !challenging && (
                          <button onClick={() => { setChallenging(e); setChallengeError('') }}
                            className="text-xs bg-green-700 hover:bg-green-800 text-white px-3 py-1.5 rounded-lg font-semibold transition">
                            Challenge
                          </button>
                        )}
                        {hasActiveChallenge && canChallenge(e) && (
                          <span className="text-xs text-gray-400">busy</span>
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
            <p>Win = 100 pts · Loss = 25 pts · Volunteer = 25 pts</p>
            <p>{activeLadder?.response_window_hours ?? 48}h to accept · {activeLadder?.play_window_days ?? 10} days to play · No response = auto forfeit</p>
          </div>
        </div>
      )}

      {/* ── CHALLENGES TAB ── */}
      {tab === 'challenges' && (
        <div className="space-y-4">
          {myChallenges.length === 0 ? (
            <div className="text-center text-gray-400 py-10">No challenges yet.</div>
          ) : (
            myChallenges.map(ch => {
              const iChallenger = ch.challenger_id === user?.id
              const opponent = iChallenger ? ch.challenged_name : ch.challenger_name
              const opponentRank = iChallenger ? ch.challenged_rank : ch.challenger_rank
              const isIncoming = !iChallenger && ch.status === 'pending'
              const isAccepted = ch.status === 'accepted'
              const canSubmitScore = isAccepted && !ch.score_status && (iChallenger || !iChallenger)
              const needsScoreApproval = ch.score_status === 'pending_approval' && ch.score_submitted_by !== user?.id
              const isScheduling = schedulingChallengeId === ch.id
              const isScoring = scoringChallengeId === ch.id

              return (
                <div key={ch.id} className={`bg-white rounded-xl border shadow-sm p-4 ${
                  needsScoreApproval ? 'border-yellow-300' : ch.status === 'completed' ? 'border-green-200' : 'border-gray-200'
                }`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-800">
                          {iChallenger ? 'You challenged ' : 'Challenge from '}
                          <span className="text-green-700">#{opponentRank} {opponent}</span>
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CHALLENGE_COLORS[ch.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {ch.status}
                        </span>
                        <span className="text-xs text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded">
                          {FORMAT_LABELS[ch.match_format] ?? ch.match_format}
                        </span>
                      </div>

                      {ch.message && <p className="text-sm text-gray-500 mt-1 italic">"{ch.message}"</p>}

                      <div className="text-xs text-gray-400 mt-1.5 space-x-3">
                        <span>Sent {fmtDate(ch.created_at)}</span>
                        {ch.status === 'pending' && (
                          <span className="text-yellow-600">Respond by {fmtDate(ch.respond_by)} ({fmtDue(ch.respond_by)})</span>
                        )}
                        {ch.status === 'accepted' && ch.play_by && (
                          <span className="text-blue-600">Play by {fmtDate(ch.play_by)} ({fmtDue(ch.play_by)})</span>
                        )}
                        {ch.match_date && (
                          <span className="text-green-700 font-medium">Scheduled: {fmtDate(ch.match_date)} {ch.match_time}</span>
                        )}
                        {ch.score && <span>Score: <strong>{ch.score}</strong></span>}
                      </div>

                      {/* Score status indicators */}
                      {ch.score_status === 'pending_approval' && (
                        <p className="text-xs mt-1.5 font-medium text-yellow-700 bg-yellow-50 px-2 py-1 rounded inline-block">
                          Score awaiting approval
                        </p>
                      )}
                      {ch.score_status === 'disputed' && (
                        <p className="text-xs mt-1.5 font-medium text-red-700 bg-red-50 px-2 py-1 rounded inline-block">
                          Score disputed — admin review in progress
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2 shrink-0">
                      {isIncoming && (
                        <div className="flex gap-2">
                          <button onClick={() => respond(ch.id, 'accept')}
                            className="text-xs bg-green-700 hover:bg-green-800 text-white px-3 py-1.5 rounded-lg font-semibold transition">
                            Accept
                          </button>
                          <button onClick={() => respond(ch.id, 'decline')}
                            className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded-lg font-semibold transition">
                            Decline
                          </button>
                        </div>
                      )}
                      {isAccepted && !ch.match_date && !isScheduling && (
                        <button onClick={() => setSchedulingChallengeId(ch.id)}
                          className="text-xs border border-gray-300 text-gray-600 hover:border-green-400 hover:text-green-700 px-3 py-1.5 rounded-lg transition">
                          Schedule Match
                        </button>
                      )}
                      {canSubmitScore && !isScoring && !ch.score_status && (
                        <button onClick={() => setScoringChallengeId(ch.id)}
                          className="text-xs bg-blue-700 hover:bg-blue-800 text-white px-3 py-1.5 rounded-lg font-semibold transition">
                          Submit Score
                        </button>
                      )}
                      {needsScoreApproval && (
                        <div className="flex gap-2">
                          <button onClick={() => handleApproveScore(ch.id, 'approve')}
                            className="text-xs bg-green-700 hover:bg-green-800 text-white px-3 py-1.5 rounded-lg font-semibold transition">
                            Approve Score
                          </button>
                          <button onClick={() => handleApproveScore(ch.id, 'dispute')}
                            className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg font-semibold transition">
                            Dispute
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Schedule form */}
                  {isScheduling && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex gap-3 flex-wrap items-end">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Match Date</label>
                        <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Time (optional)</label>
                        <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                      </div>
                      <button onClick={saveSchedule} disabled={scheduleSaving || !scheduleDate}
                        className="text-xs bg-green-700 text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50">
                        {scheduleSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => setSchedulingChallengeId('')} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                    </div>
                  )}

                  {/* Score submit form */}
                  {isScoring && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                      <p className="text-xs font-medium text-gray-600">
                        Submit score — you are claiming the win. Format: <span className="font-mono">6-4, 3-6, 10-7</span> or <span className="font-mono">8-5</span>
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        <input value={scoreInput} onChange={e => setScoreInput(e.target.value)}
                          placeholder={ch.match_format === 'pro_set' ? 'e.g. 8-5' : 'e.g. 6-4, 3-6, 10-7'}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[180px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <button onClick={submitScore} disabled={scoreSaving || !scoreInput.trim()}
                          className="text-xs bg-blue-700 text-white px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50">
                          {scoreSaving ? 'Saving…' : 'Submit'}
                        </button>
                        <button onClick={() => { setScoringChallengeId(''); setScoreInput('') }}
                          className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                      </div>
                      {scoreError && <p className="text-red-500 text-xs">{scoreError}</p>}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── LEADERBOARD TAB ── */}
      {tab === 'leaderboard' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 uppercase border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left w-12">Pts Rank</th>
                <th className="px-4 py-3 text-left">Player</th>
                <th className="px-4 py-3 text-center">Ladder Rank</th>
                <th className="px-4 py-3 text-center">W–L</th>
                <th className="px-4 py-3 text-center">Streak</th>
                <th className="px-4 py-3 text-right font-bold text-blue-700">Season Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {leaderboard.map(row => {
                const isMe = row.user_id === user?.id
                return (
                  <tr key={row.user_id} className={`${isMe ? 'bg-blue-50' : 'hover:bg-gray-50'} transition`}>
                    <td className="px-4 py-3 font-bold text-gray-400">#{row.points_rank}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {row.name}{isMe && <span className="ml-2 text-xs text-blue-600">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">#{row.rank}</td>
                    <td className="px-4 py-3 text-center text-gray-500">{row.wins}–{row.losses}</td>
                    <td className="px-4 py-3 text-center">
                      {row.current_streak > 0
                        ? <span className="text-orange-600 font-semibold">{row.current_streak}W</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-blue-700">{row.season_points}</td>
                  </tr>
                )
              })}
              {leaderboard.length === 0 && (
                <tr><td colSpan={6} className="text-center text-gray-400 py-10 text-sm">No points yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── STATS TAB ── */}
      {tab === 'stats' && (
        <div className="space-y-4">
          {!stats ? (
            <div className="text-center text-gray-400 py-10">Loading…</div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total Players', value: stats.total_players },
                  { label: 'Active Players', value: stats.active_players },
                  { label: 'Matches Played', value: stats.total_matches },
                  { label: 'Avg Match Interval', value: stats.avg_match_days > 0 ? `${stats.avg_match_days.toFixed(1)}d` : '—' },
                ].map(s => (
                  <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 text-center shadow-sm">
                    <div className="text-2xl font-bold text-gray-800">{s.value}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { icon: '🏆', label: 'Most Active Player', value: stats.most_active_player || '—', sub: stats.most_active_count > 0 ? `${stats.most_active_count} wins` : '' },
                  { icon: '🔥', label: 'Longest Win Streak', value: stats.longest_streak_player || '—', sub: stats.longest_streak > 0 ? `${stats.longest_streak} wins` : '' },
                  { icon: '📈', label: 'Highest Climber', value: stats.highest_climber || '—', sub: stats.highest_climber_rank_gain > 0 ? `+${stats.highest_climber_rank_gain} spots` : '' },
                  { icon: '🎾', label: 'Most Challenges Issued', value: stats.most_challenges_issued || '—', sub: stats.most_challenges_count > 0 ? `${stats.most_challenges_count} challenges` : '' },
                ].map(s => (
                  <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
                    <span className="text-2xl">{s.icon}</span>
                    <div>
                      <div className="text-xs text-gray-500 font-medium">{s.label}</div>
                      <div className="font-semibold text-gray-800">{s.value}</div>
                      {s.sub && <div className="text-xs text-gray-400">{s.sub}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── REGISTER TAB ── */}
      {tab === 'register' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-lg space-y-4">
          <div>
            <h2 className="font-semibold text-gray-800">Join the Ladder</h2>
            <p className="text-sm text-gray-500 mt-0.5">An admin will place you on the rankings after reviewing your registration.</p>
          </div>
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Preference</label>
              <select value={regForm.preference} onChange={e => setRegForm(f => ({ ...f, preference: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="singles">Singles</option>
                <option value="doubles">Doubles</option>
                <option value="both">Both</option>
              </select>
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
          </div>
          {regMsg && <p className={`text-sm ${regMsg.includes('error') || regMsg.includes('Error') ? 'text-red-500' : 'text-green-600'}`}>{regMsg}</p>}
          <button onClick={saveReg} disabled={regSaving}
            className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-6 py-2 rounded-lg transition disabled:opacity-50">
            {regSaving ? 'Submitting…' : 'Submit Registration'}
          </button>
        </div>
      )}
    </div>
  )
}
