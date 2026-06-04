import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { parseDate } from '../utils/dates'
import HelpPanel from '../components/HelpPanel'

const HELP = [
  { heading: 'How the Ladder Works', body: 'The Tennis Ladder is a continuous ranking competition. All registered members are ranked by position. You move up by challenging players ranked above you and winning.' },
  { heading: 'Registering', body: 'Click "Join Ladder" to register. Your spot is pending until an admin approves your registration. Once approved you\'ll appear in the standings.' },
  { heading: 'Sending a Challenge', body: 'You may challenge players ranked up to a set number of positions above you. Click their name and select "Challenge". They\'ll receive a notification and can accept or decline.' },
  { heading: 'Recording Results', body: 'After your match, enter the score from the Scores page. Once both players confirm the score the ladder rankings update automatically.' },
  { heading: 'Ranking Movement', body: 'Win a challenge and you swap positions with your opponent (or move ahead if they were ranked much higher). Losing a challenge keeps you in your current position.' },
]

interface Ladder { id: string; name: string; type: string; season_year: number; status: string; challenge_range: number; description: string }
interface Entry { user_id: string; name: string; rank: number; wins: number; losses: number; season_points: number }
interface Challenge {
  id: string; ladder_id: string
  challenger_id: string; challenger_name: string; challenger_rank: number
  challenged_id: string; challenged_name: string; challenged_rank: number
  status: string; winner_id?: string; score: string; message: string
  created_at: string; expires_at: string; respond_by: string; play_by?: string; completed_at?: string
}
interface MyStatus { registered: boolean; registration_status: string; entry: Entry; challenges: Challenge[] }
interface LeaderRow { user_id: string; name: string; rank: number; wins: number; losses: number; season_points: number; points_rank: number }

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

export default function TennisLadder() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'ladder' | 'challenges' | 'leaderboard' | 'register'>('ladder')
  const [ladders, setLadders] = useState<Ladder[]>([])
  const [activeLid, setActiveLid] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [myStatus, setMyStatus] = useState<MyStatus | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([])
  const [challenging, setChallenging] = useState<Entry | null>(null)
  const [challengeMsg, setChallengeMsg] = useState('')
  const [challengeSending, setChallengeSending] = useState(false)
  const [challengeError, setChallengeError] = useState('')
  const [regForm, setRegForm] = useState({ usta_rating: '', self_rating: '', preference: 'singles', availability: '', notes: '' })
  const [regSaving, setRegSaving] = useState(false)
  const [regMsg, setRegMsg] = useState('')

  useEffect(() => {
    api.ladder.list().then(d => {
      const ls = d as Ladder[]
      setLadders(ls)
      if (ls.length > 0) setActiveLid(ls[0].id)
    })
  }, [])

  useEffect(() => {
    if (!activeLid) return
    api.ladder.get(activeLid).then((d: any) => setEntries(d.entries ?? []))
    api.ladder.myStatus(activeLid).then(d => setMyStatus(d as MyStatus))
    api.ladder.leaderboard(activeLid).then(d => setLeaderboard(d as LeaderRow[]))
  }, [activeLid])

  const activeLadder = ladders.find(l => l.id === activeLid)
  const myEntry = myStatus?.entry
  const isRegistered = myStatus?.registered && myStatus?.registration_status === 'approved'
  const myChallenges = myStatus?.challenges ?? []
  const hasActiveChallenge = myChallenges.some(ch =>
    ch.challenger_id === user?.id && (ch.status === 'pending' || ch.status === 'accepted')
  )

  const canChallenge = (entry: Entry) => {
    if (!isRegistered || !myEntry?.rank || !activeLadder) return false
    if (entry.user_id === user?.id) return false
    if (hasActiveChallenge) return false
    const diff = myEntry.rank - entry.rank
    return diff > 0 && diff <= activeLadder.challenge_range
  }

  const sendChallenge = async () => {
    if (!challenging || !activeLid) return
    setChallengeSending(true)
    setChallengeError('')
    try {
      await api.ladder.createChallenge(activeLid, { challenged_id: challenging.user_id, message: challengeMsg })
      const updated = await api.ladder.myStatus(activeLid) as MyStatus
      setMyStatus(updated)
      setChallenging(null)
      setChallengeMsg('')
      setTab('challenges')
    } catch (e: any) { setChallengeError(e.message) } finally { setChallengeSending(false) }
  }

  const respond = async (challengeId: string, action: 'accept' | 'decline') => {
    await api.ladder.respondChallenge(challengeId, action)
    const updated = await api.ladder.myStatus(activeLid) as MyStatus
    setMyStatus(updated)
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🎾 Tennis Ladder</h1>
          <p className="text-gray-500 text-sm mt-0.5">Challenge your way to the top of the rankings.</p>
          <div className="mt-2"><HelpPanel items={HELP} /></div>
        </div>
        {myEntry?.rank ? (
          <div className="flex gap-3">
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-center">
              <div className="text-2xl font-bold text-green-700">#{myEntry.rank}</div>
              <div className="text-xs text-green-600">Ladder Rank</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-center">
              <div className="text-2xl font-bold text-blue-700">{myEntry.season_points}</div>
              <div className="text-xs text-blue-600">Season Pts</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-center">
              <div className="text-lg font-bold text-gray-700">{myEntry.wins}–{myEntry.losses}</div>
              <div className="text-xs text-gray-500">W–L</div>
            </div>
          </div>
        ) : myStatus?.registered ? (
          <span className="text-sm bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded-full font-medium">
            ⏳ Registration pending approval
          </span>
        ) : null}
      </div>

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
      <div className="flex gap-1 border-b border-gray-200">
        {(['ladder', 'challenges', 'leaderboard', ...(!isRegistered ? ['register'] : [])] as const).map(t => (
          <button key={t} onClick={() => setTab(t as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 capitalize transition ${
              tab === t ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'register' ? 'Join Ladder' : t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'challenges' && myChallenges.length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                {myChallenges.length}
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
              Challenge up to <strong>{activeLadder.challenge_range} spots</strong> above you · 1 active challenge at a time
            </p>
          )}

          {/* Challenge modal */}
          {challenging && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <p className="font-semibold text-blue-800 text-sm">
                Challenge #{challenging.rank} {challenging.name}
              </p>
              <textarea value={challengeMsg} onChange={e => setChallengeMsg(e.target.value)}
                placeholder="Optional message to your opponent…" rows={2}
                className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
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

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 uppercase border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left w-12">Rank</th>
                  <th className="px-4 py-3 text-left">Player</th>
                  <th className="px-4 py-3 text-center">W–L</th>
                  <th className="px-4 py-3 text-center">Pts</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.map(e => {
                  const isMe = e.user_id === user?.id
                  return (
                    <tr key={e.user_id} className={`${isMe ? 'bg-green-50' : 'hover:bg-gray-50'} transition`}>
                      <td className="px-4 py-3">
                        <span className={`font-bold text-lg ${isMe ? 'text-green-700' : 'text-gray-400'}`}>#{e.rank}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-medium ${isMe ? 'text-green-800' : 'text-gray-800'}`}>
                          {e.name}{isMe && <span className="ml-2 text-xs text-green-600 font-normal">(you)</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{e.wins}–{e.losses}</td>
                      <td className="px-4 py-3 text-center font-semibold text-blue-700">{e.season_points}</td>
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
                  <tr><td colSpan={5} className="text-center text-gray-400 py-10 text-sm">No players on the ladder yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-gray-400 space-y-0.5">
            <p>🏆 <strong>Ladder Win</strong> = 100 pts · <strong>Loss</strong> = 25 pts · <strong>Volunteer</strong> = 25 pts</p>
            <p>⏱ 72h to accept · 14 days to play · Challenge expires after 7 days</p>
          </div>
        </div>
      )}

      {/* ── CHALLENGES TAB ── */}
      {tab === 'challenges' && (
        <div className="space-y-4">
          {myChallenges.length === 0 ? (
            <div className="text-center text-gray-400 py-10">No active challenges.</div>
          ) : (
            myChallenges.map(ch => {
              const iChallenger = ch.challenger_id === user?.id
              const opponent = iChallenger ? ch.challenged_name : ch.challenger_name
              const opponentRank = iChallenger ? ch.challenged_rank : ch.challenger_rank
              const isIncoming = !iChallenger && ch.status === 'pending'

              return (
                <div key={ch.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-800">
                          {iChallenger ? `You challenged ` : `Challenge from `}
                          <span className="text-green-700">#{opponentRank} {opponent}</span>
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CHALLENGE_COLORS[ch.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {ch.status}
                        </span>
                      </div>
                      {ch.message && <p className="text-sm text-gray-500 mt-1 italic">"{ch.message}"</p>}
                      <div className="text-xs text-gray-400 mt-1.5 space-x-3">
                        <span>Sent {fmtDate(ch.created_at)}</span>
                        {ch.status === 'pending' && <span className="text-yellow-600">Respond by {fmtDate(ch.respond_by)} ({fmtDue(ch.respond_by)})</span>}
                        {ch.status === 'accepted' && ch.play_by && <span className="text-blue-600">Play by {fmtDate(ch.play_by)} ({fmtDue(ch.play_by)})</span>}
                        {ch.score && <span>Score: <strong>{ch.score}</strong></span>}
                      </div>
                    </div>
                    {isIncoming && (
                      <div className="flex gap-2 shrink-0">
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
                  </div>
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
                    <td className="px-4 py-3 text-right font-bold text-blue-700">{row.season_points}</td>
                  </tr>
                )
              })}
              {leaderboard.length === 0 && (
                <tr><td colSpan={5} className="text-center text-gray-400 py-10 text-sm">No points yet.</td></tr>
              )}
            </tbody>
          </table>
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
