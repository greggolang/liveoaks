import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, PendingMatch, MatchResult, LeaderboardRow } from '../api/client'
import ScorecardModal from '../components/ScorecardModal'
import MatchCard from '../components/MatchCard'
import HelpPanel from '../components/HelpPanel'

const HELP = [
  { heading: 'Pending Scores', body: 'Matches you played that haven\'t been scored yet appear here. Click "Enter Score" to record the result. Both players must agree on the score — if your entry matches the other player\'s, the result is confirmed automatically.' },
  { heading: 'Club Feed', body: 'Shows recently completed matches across all members. You can see who played, the score, and the match type. Click any match card to view the full scorecard.' },
  { heading: 'My Matches', body: 'Filtered view of only your own match history — wins, losses, and scores in chronological order.' },
  { heading: 'Leaderboard', body: 'Rankings by win percentage among members who have played at least a few matches. Tap any name to visit their player profile.' },
]

export default function Scores() {
  const [pending, setPending] = useState<PendingMatch[]>([])
  const [recent, setRecent] = useState<MatchResult[]>([])
  const [mine, setMine] = useState<MatchResult[]>([])
  const [leaders, setLeaders] = useState<LeaderboardRow[]>([])
  const [tab, setTab] = useState<'club' | 'mine' | 'leaderboard'>('club')
  const [loading, setLoading] = useState(true)
  const [scoreFor, setScoreFor] = useState<PendingMatch | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, r, m, l] = await Promise.all([
        api.matches.pending().catch(() => []),
        api.matches.recent(40).catch(() => []),
        api.matches.mine().catch(() => []),
        api.matches.leaderboard().catch(() => []),
      ])
      setPending(p); setRecent(r); setMine(m); setLeaders(l)
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const list = tab === 'club' ? recent : mine

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Scores</h1>
        <p className="text-sm text-gray-500 mt-1">Club match scoreboard & recent activity</p>
      </div>
      <HelpPanel items={HELP} />

      {/* Matches waiting to be scored */}
      {pending.length > 0 && (
        <div className="space-y-2">
          {pending.map(pm => (
            <div key={pm.booking_id} className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-900">Enter your match score</p>
                <p className="text-xs text-amber-700/80 truncate">
                  {pm.match_type === 'doubles' ? 'Doubles' : 'Singles'} · {pm.court_name} · {new Date(pm.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
              </div>
              <button onClick={() => setScoreFor(pm)}
                className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition shrink-0">
                Enter score
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([['club', 'Club Scoreboard'], ['mine', 'My Matches'], ['leaderboard', 'Leaderboard']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${tab === t ? 'border-green-700 text-green-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'leaderboard' ? (
        leaders.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-16">No public match results yet.</p>
        ) : (
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            <div className="grid grid-cols-[2rem_1fr_2.5rem_2.5rem_2.5rem_3.5rem] gap-2 px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <span>#</span><span>Member</span><span className="text-right" title="Matches played">P</span><span className="text-right">W</span><span className="text-right">L</span><span className="text-right">Win%</span>
            </div>
            <div className="divide-y divide-gray-100">
              {leaders.map((r, i) => (
                <div key={r.user_id} className="grid grid-cols-[2rem_1fr_2.5rem_2.5rem_2.5rem_3.5rem] gap-2 px-4 py-2.5 items-center text-sm">
                  <span className="text-gray-400 tabular-nums">{i + 1}</span>
                  <Link to={`/players/${r.user_id}`} className="text-gray-800 hover:underline truncate">{r.name}</Link>
                  <span className="text-right tabular-nums text-gray-500">{r.played}</span>
                  <span className="text-right tabular-nums font-semibold text-green-700">{r.wins}</span>
                  <span className="text-right tabular-nums text-gray-500">{r.losses}</span>
                  <span className="text-right tabular-nums text-gray-700">{r.win_pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )
      ) : list.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-16">
          {tab === 'club' ? 'No public match results yet. Played a match? Score it above.' : 'You have no recorded matches yet.'}
        </p>
      ) : (
        <div className="space-y-3">
          {list.map(m => <MatchCard key={m.id} match={m} />)}
        </div>
      )}

      {scoreFor && (
        <ScorecardModal match={scoreFor}
          onClose={() => setScoreFor(null)}
          onSubmitted={() => { setScoreFor(null); load() }} />
      )}
    </div>
  )
}
