import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, PlayerStats } from '../api/client'
import MatchCard from '../components/MatchCard'

function pct(n: number, d: number) { return d > 0 ? Math.round((n / d) * 100) : 0 }

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center">
      <div className="text-2xl font-bold text-gray-800 tabular-nums">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
    </div>
  )
}

export default function PlayerProfile() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<PlayerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true); setNotFound(false)
    api.matches.player(id)
      .then(setData)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" /></div>
  }
  if (notFound || !data) {
    return <p className="text-center text-gray-400 text-sm py-20">Member not found.</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/scores" className="text-sm text-green-700 hover:text-green-900 font-medium">← Scores</Link>
        <h1 className="text-2xl font-bold text-gray-800 mt-1">{data.name}</h1>
        <p className="text-sm text-gray-500">
          {data.played === 0 ? 'No public matches yet' : `${data.wins}–${data.losses} · ${data.win_pct}% win rate`}
        </p>
      </div>

      {data.played > 0 && (
        <>
          {/* Performance analytics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Matches" value={`${data.played}`} sub={`${data.wins}W · ${data.losses}L`} />
            <Stat label="Win rate" value={`${data.win_pct}%`} />
            <Stat label="Sets won" value={`${pct(data.sets_won, data.sets_won + data.sets_lost)}%`} sub={`${data.sets_won}–${data.sets_lost}`} />
            <Stat label="Games won" value={`${pct(data.games_won, data.games_won + data.games_lost)}%`} sub={`${data.games_won}–${data.games_lost}`} />
          </div>

          {/* Recent form */}
          {data.form.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent form</span>
              <div className="flex gap-1">
                {data.form.map((f, i) => (
                  <span key={i} className={`w-6 h-6 rounded-md text-xs font-bold flex items-center justify-center ${f === 'W' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {f}
                  </span>
                ))}
              </div>
              <span className="text-[11px] text-gray-400">most recent first</span>
            </div>
          )}

          {/* Head-to-head */}
          {data.head_to_head.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-700 mb-2">Head-to-head</h2>
              <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 bg-white">
                {data.head_to_head.map(h => (
                  <div key={h.user_id} className="flex items-center justify-between px-4 py-2.5">
                    <Link to={`/players/${h.user_id}`} className="text-sm text-gray-700 hover:underline">{h.name}</Link>
                    <span className="text-sm tabular-nums">
                      <span className={h.wins >= h.losses ? 'text-green-700 font-semibold' : 'text-gray-700'}>{h.wins}</span>
                      <span className="text-gray-400"> – </span>
                      <span className={h.losses > h.wins ? 'text-red-600 font-semibold' : 'text-gray-700'}>{h.losses}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Match history */}
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-2">Match history</h2>
            <div className="space-y-3">
              {data.matches.map(m => <MatchCard key={m.id} match={m} />)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
