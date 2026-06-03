import { MatchResult } from '../api/client'

function sideNames(m: MatchResult, side: number): string {
  return m.participants
    .filter(p => p.side === side)
    .sort((a, b) => a.position - b.position)
    .map(p => p.name)
    .join(' & ') || '—'
}

// Compact result row: each side with its per-set games (winner's side highlighted).
export default function MatchCard({ match }: { match: MatchResult }) {
  const played = new Date(match.played_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      {[1, 2].map(side => {
        const win = match.winner_side === side
        return (
          <div key={side} className={`flex items-center justify-between px-4 py-2.5 ${side === 1 ? 'border-b border-gray-100' : ''} ${win ? 'bg-green-50' : ''}`}>
            <span className={`text-sm truncate ${win ? 'font-semibold text-green-800' : 'text-gray-700'}`}>
              {win && <span className="mr-1">🏆</span>}{sideNames(match, side)}
            </span>
            <span className="flex gap-2.5 text-sm tabular-nums text-gray-600 shrink-0 ml-3">
              {match.sets.map((s, i) => {
                const games = side === 1 ? s.a : s.b
                const tb = (s.a === 7 && s.b === 6) || (s.a === 6 && s.b === 7)
                const loserTB = side === 1 ? s.tbb : s.tba
                return (
                  <span key={i} className={win ? 'font-semibold text-green-700' : ''}>
                    {games}{tb && loserTB != null && <sup className="text-[10px] text-gray-400">{loserTB}</sup>}
                  </span>
                )
              })}
            </span>
          </div>
        )
      })}
      <div className="px-4 py-1.5 bg-gray-50/60 flex items-center justify-between text-[11px] text-gray-400">
        <span>{match.match_type === 'doubles' ? 'Doubles' : 'Singles'}{match.court_name ? ` · ${match.court_name}` : ''} · {played}</span>
        {match.visibility === 'private' && <span className="text-gray-400">Private</span>}
      </div>
    </div>
  )
}
