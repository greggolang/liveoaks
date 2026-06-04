import { useEffect, useState } from 'react'
import { api } from '../api/client'
import HelpPanel from '../components/HelpPanel'

const HELP = [
  { heading: 'What is Fantasy Tennis Pool?', body: 'A season-long prediction game based on Grand Slam tournaments. You pick a pool of professional players and earn points based on how far they advance in each tournament.' },
  { heading: 'Joining a Pool', body: 'When a tournament pool is open you\'ll see a "Join" button. There may be an entry fee — pay at the clubhouse or through your member account. You must join before the tournament begins.' },
  { heading: 'Picking Players', body: 'After joining, select your player picks before the draw closes. You can pick players from both the men\'s and women\'s draws depending on the pool format.' },
  { heading: 'Scoring', body: 'Points are awarded for each round your picked players win. Early rounds are worth fewer points; the final and semifinal are worth the most. The member with the most total points at the end of the tournament wins.' },
  { heading: 'Prize', body: 'The pool entry fees go into a prize pot. The winner receives the pot (minus any club fee if applicable). Winners are announced after the tournament concludes.' },
]

interface Tournament { id: string; name: string; year: number; start_date?: string; end_date?: string; status: string }
interface Player { id: string; name: string; gender: string; country: string }
interface Pick { id: string; tournament_id: string; player_id: string; pick_slot: string; player?: Player }
interface Standing { rank: number; user_id: string; name: string; total_score: number; tournament_scores: Record<string, number> }
interface PickScore {
  tournament_id: string; tournament_name: string; status: string
  pick_slot: string; player_id: string; player_name: string; gender: string
  result: string; prize_money: number; pick_count: number; value: number
}

const SLOTS = ['M1', 'M2', 'W1', 'W2']
const SLOT_LABELS: Record<string, string> = { M1: "Men's Pick 1", M2: "Men's Pick 2", W1: "Women's Pick 1", W2: "Women's Pick 2" }
const RESULT_ORDER = ['Champion', 'F', 'SF', 'QF', 'R4', 'R3', 'R2', 'R1']
const STATUS_LABELS: Record<string, string> = { draft: 'Draft', open: 'Open', locked: 'Locked', completed: 'Completed' }

function fmt(n: number) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

export default function Fantasy() {
  const [tab, setTab] = useState<'picks' | 'leaderboard' | 'scores'>('leaderboard')
  const [joined, setJoined] = useState<boolean | null>(null)
  const [entryPaid, setEntryPaid] = useState(false)
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [myPicks, setMyPicks] = useState<Pick[]>([])
  const [leaderboard, setLeaderboard] = useState<{ standings: Standing[]; tournaments: Tournament[] } | null>(null)
  const [myScores, setMyScores] = useState<PickScore[]>([])
  const [activeTid, setActiveTid] = useState<string>('')
  const [draftPicks, setDraftPicks] = useState<Record<string, string>>({}) // slot → player_id
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    api.fantasy.myStatus().then((d: any) => {
      setJoined(d.joined)
      setEntryPaid(d.entry_paid)
    })
    api.fantasy.tournaments().then(d => setTournaments(d as Tournament[]))
    api.fantasy.players().then(d => setPlayers(d as Player[]))
    api.fantasy.myPicks().then(d => setMyPicks(d as Pick[]))
    api.fantasy.leaderboard().then(d => setLeaderboard(d as any))
    api.fantasy.myScores().then(d => setMyScores(d as PickScore[]))
  }, [])

  // Pick up first open tournament as default
  useEffect(() => {
    if (!activeTid && tournaments.length > 0) {
      const open = tournaments.find(t => t.status === 'open') ?? tournaments[0]
      setActiveTid(open.id)
    }
  }, [tournaments, activeTid])

  // Sync draftPicks from saved picks when activeTid changes
  useEffect(() => {
    const draft: Record<string, string> = {}
    myPicks.filter(p => p.tournament_id === activeTid).forEach(p => {
      draft[p.pick_slot] = p.player_id
    })
    setDraftPicks(draft)
    setSaveMsg('')
  }, [activeTid, myPicks])

  const activeTournament = tournaments.find(t => t.id === activeTid)
  const isLocked = activeTournament?.status === 'locked' || activeTournament?.status === 'completed'

  const handleJoin = async () => {
    setJoining(true)
    try {
      await api.fantasy.join()
      setJoined(true)
      setTab('picks')
    } finally { setJoining(false) }
  }

  const handleSavePicks = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      const picks = SLOTS.map(slot => ({ slot, player_id: draftPicks[slot] ?? '' }))
      await api.fantasy.savePicks(activeTid, picks)
      // Refresh
      const updated = await api.fantasy.myPicks() as Pick[]
      setMyPicks(updated)
      setSaveMsg('Picks saved!')
    } catch (e: any) {
      setSaveMsg(e.message || 'Error saving picks')
    } finally { setSaving(false) }
  }

  const menPlayers = players.filter(p => p.gender === 'M')
  const womenPlayers = players.filter(p => p.gender === 'W')

  // My scores grouped by tournament
  const scoresByTournament: Record<string, PickScore[]> = {}
  myScores.forEach(s => {
    if (!scoresByTournament[s.tournament_name]) scoresByTournament[s.tournament_name] = []
    scoresByTournament[s.tournament_name].push(s)
  })

  if (joined === null) return <div className="text-center text-gray-400 py-20">Loading…</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🎾 Fantasy Tennis Pool</h1>
          <p className="text-gray-500 text-sm mt-0.5">Pick your players, track the scores, win the season.</p>
          <div className="mt-2"><HelpPanel items={HELP} /></div>
        </div>
        {joined && (
          <span className={`text-xs px-3 py-1 rounded-full font-semibold ${entryPaid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-800'}`}>
            {entryPaid ? '✓ Entry paid' : '⚠ Entry fee pending'}
          </span>
        )}
      </div>

      {/* Join prompt */}
      {!joined && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center space-y-3">
          <p className="text-green-800 font-semibold text-lg">Join the Fantasy Tennis Pool</p>
          <p className="text-green-700 text-sm">Pick 2 men's and 2 women's players for each Grand Slam tournament. Earn points based on how far your players advance.</p>
          <button onClick={handleJoin} disabled={joining}
            className="bg-green-700 hover:bg-green-800 text-white font-semibold px-8 py-2.5 rounded-lg transition disabled:opacity-50">
            {joining ? 'Joining…' : 'Join the Pool'}
          </button>
        </div>
      )}

      {/* Tabs */}
      {joined && (
        <>
          <div className="flex gap-1 border-b border-gray-200">
            {(['leaderboard', 'picks', 'scores'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                  tab === t ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {t === 'leaderboard' ? 'Leaderboard' : t === 'picks' ? 'My Picks' : 'My Scores'}
              </button>
            ))}
          </div>

          {/* ── Leaderboard ── */}
          {tab === 'leaderboard' && leaderboard && (
            <div className="space-y-4">
              {leaderboard.standings.length === 0 ? (
                <div className="text-center text-gray-400 py-10">No participants yet.</div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                        <th className="px-4 py-3 text-left w-10">#</th>
                        <th className="px-4 py-3 text-left">Participant</th>
                        {leaderboard.tournaments.map(t => (
                          <th key={t.id} className="px-3 py-3 text-right whitespace-nowrap">{t.name.replace(/ \d{4}$/, '')}</th>
                        ))}
                        <th className="px-4 py-3 text-right font-bold text-gray-700">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {leaderboard.standings.map(s => (
                        <tr key={s.user_id} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-3 font-bold text-gray-400">{s.rank}</td>
                          <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                          {leaderboard.tournaments.map(t => (
                            <td key={t.id} className="px-3 py-3 text-right text-gray-500 text-xs">
                              {s.tournament_scores[t.name] ? fmt(s.tournament_scores[t.name]) : '—'}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-right font-bold text-green-700">{fmt(s.total_score)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-xs text-gray-400 text-center">
                Values update automatically as results are entered. Prize money is split equally among all participants who picked that player.
              </p>
            </div>
          )}

          {/* ── My Picks ── */}
          {tab === 'picks' && (
            <div className="space-y-4">
              {/* Tournament selector */}
              {tournaments.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {tournaments.map(t => (
                    <button key={t.id} onClick={() => setActiveTid(t.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                        activeTid === t.id
                          ? 'bg-green-700 text-white border-green-700'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'
                      }`}>
                      {t.name}
                      <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                        t.status === 'open' ? 'bg-green-100 text-green-700' :
                        t.status === 'locked' ? 'bg-yellow-100 text-yellow-700' :
                        t.status === 'completed' ? 'bg-gray-100 text-gray-500' : 'bg-gray-100 text-gray-400'
                      }`}>{STATUS_LABELS[t.status]}</span>
                    </button>
                  ))}
                </div>
              )}

              {activeTournament && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-gray-800">{activeTournament.name}</h2>
                    {isLocked && (
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-medium">
                        🔒 Picks locked
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {SLOTS.map(slot => {
                      const isMen = slot.startsWith('M')
                      const options = isMen ? menPlayers : womenPlayers
                      const selectedId = draftPicks[slot] ?? ''
                      return (
                        <div key={slot}>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{SLOT_LABELS[slot]}</label>
                          <select
                            disabled={isLocked}
                            value={selectedId}
                            onChange={e => setDraftPicks(d => ({ ...d, [slot]: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-400">
                            <option value="">— Select player —</option>
                            {options.map(p => (
                              <option key={p.id} value={p.id}>{p.name}{p.country ? ` (${p.country})` : ''}</option>
                            ))}
                          </select>
                        </div>
                      )
                    })}
                  </div>

                  {!isLocked && (
                    <div className="flex items-center gap-3 pt-2">
                      <button onClick={handleSavePicks} disabled={saving}
                        className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-5 py-2 rounded-lg transition disabled:opacity-50">
                        {saving ? 'Saving…' : 'Save Picks'}
                      </button>
                      {saveMsg && (
                        <span className={`text-xs font-medium ${saveMsg.includes('Error') ? 'text-red-500' : 'text-green-600'}`}>
                          {saveMsg}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {tournaments.length === 0 && (
                <div className="text-center text-gray-400 py-10">No tournaments open for picks yet.</div>
              )}
            </div>
          )}

          {/* ── My Scores ── */}
          {tab === 'scores' && (
            <div className="space-y-6">
              {Object.keys(scoresByTournament).length === 0 ? (
                <div className="text-center text-gray-400 py-10">Make picks to see your scores here.</div>
              ) : (
                Object.entries(scoresByTournament).map(([tName, picks]) => {
                  const total = picks.reduce((s, p) => s + p.value, 0)
                  return (
                    <div key={tName} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                        <span className="font-semibold text-gray-800 text-sm">{tName}</span>
                        <span className="font-bold text-green-700 text-sm">{fmt(total)}</span>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                            <th className="px-4 py-2 text-left">Slot</th>
                            <th className="px-4 py-2 text-left">Player</th>
                            <th className="px-4 py-2 text-center">Result</th>
                            <th className="px-4 py-2 text-right">Prize $</th>
                            <th className="px-4 py-2 text-right">Picked by</th>
                            <th className="px-4 py-2 text-right font-bold text-gray-600">Your Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {picks.sort((a, b) => SLOTS.indexOf(a.pick_slot) - SLOTS.indexOf(b.pick_slot)).map(p => (
                            <tr key={p.pick_slot} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5 text-xs text-gray-500">{SLOT_LABELS[p.pick_slot]}</td>
                              <td className="px-4 py-2.5 font-medium text-gray-800">{p.player_name}</td>
                              <td className="px-4 py-2.5 text-center">
                                {p.result ? (
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                    p.result === 'Champion' ? 'bg-yellow-100 text-yellow-700' :
                                    p.result === 'F' ? 'bg-green-100 text-green-700' :
                                    p.result === 'SF' ? 'bg-blue-100 text-blue-700' :
                                    'bg-gray-100 text-gray-600'
                                  }`}>{p.result === 'F' ? 'Finalist' : p.result === 'SF' ? 'Semifinal' : p.result === 'QF' ? 'Quarterfinal' : p.result}</span>
                                ) : <span className="text-gray-300 text-xs">TBD</span>}
                              </td>
                              <td className="px-4 py-2.5 text-right text-gray-500">{p.prize_money > 0 ? fmt(p.prize_money) : '—'}</td>
                              <td className="px-4 py-2.5 text-right text-gray-400 text-xs">{p.pick_count > 0 ? `${p.pick_count}` : '—'}</td>
                              <td className={`px-4 py-2.5 text-right font-semibold ${p.value > 0 ? 'text-green-700' : 'text-gray-300'}`}>
                                {p.value > 0 ? fmt(p.value) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-gray-200 bg-gray-50">
                            <td colSpan={5} className="px-4 py-2 text-xs text-gray-500 font-medium">Tournament Total</td>
                            <td className="px-4 py-2 text-right font-bold text-green-700">{fmt(total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )
                })
              )}

              {myScores.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex justify-between items-center">
                  <span className="text-sm font-semibold text-green-800">Season Total</span>
                  <span className="text-lg font-bold text-green-700">
                    {fmt(myScores.reduce((s, p) => s + p.value, 0))}
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
