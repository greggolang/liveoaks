import { useCallback, useEffect, useState } from 'react'
import { api, PendingMatch, MatchResult } from '../api/client'
import ScorecardModal from '../components/ScorecardModal'
import MatchCard from '../components/MatchCard'

export default function Scores() {
  const [pending, setPending] = useState<PendingMatch[]>([])
  const [recent, setRecent] = useState<MatchResult[]>([])
  const [mine, setMine] = useState<MatchResult[]>([])
  const [tab, setTab] = useState<'club' | 'mine'>('club')
  const [loading, setLoading] = useState(true)
  const [scoreFor, setScoreFor] = useState<PendingMatch | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, r, m] = await Promise.all([
        api.matches.pending().catch(() => []),
        api.matches.recent(40).catch(() => []),
        api.matches.mine().catch(() => []),
      ])
      setPending(p); setRecent(r); setMine(m)
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
        {(['club', 'mine'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${tab === t ? 'border-green-700 text-green-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            {t === 'club' ? 'Club Scoreboard' : 'My Matches'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
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
