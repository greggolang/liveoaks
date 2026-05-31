import { useEffect, useState } from 'react'
import { api } from '../../api/client'

interface Tournament { id: string; name: string; year: number; start_date?: string; end_date?: string; status: string }
interface Player { id: string; name: string; gender: string; country: string }
interface Participant { id: string; user_id: string; name: string; entry_paid: boolean; joined_at: string }
interface Result { id: string; player_id: string; tournament_id: string; result: string; prize_money: number; player?: Player; pick_count?: number; value_per_pick?: number }
interface PopRow { player_id: string; player_name: string; gender: string; pick_slot: string; count: number }

const RESULTS_ORDER = ['Champion', 'F', 'SF', 'QF', 'R4', 'R3', 'R2', 'R1']
const STATUSES = ['draft', 'open', 'locked', 'completed']
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  open: 'bg-green-100 text-green-700',
  locked: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-blue-100 text-blue-700',
}

function fmt(n: number) { return '$' + Math.round(n).toLocaleString('en-US') }

export default function AdminFantasy() {
  const [tab, setTab] = useState<'tournaments' | 'players' | 'results' | 'participants'>('tournaments')

  // ── Tournaments ──
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [tForm, setTForm] = useState({ name: '', year: new Date().getFullYear(), start_date: '', end_date: '', status: 'draft' })
  const [editingT, setEditingT] = useState<Tournament | null>(null)
  const [tSaving, setTSaving] = useState(false)
  const [tErr, setTErr] = useState('')

  // ── Players ──
  const [players, setPlayers] = useState<Player[]>([])
  const [pForm, setPForm] = useState({ name: '', gender: 'M', country: '' })
  const [editingP, setEditingP] = useState<Player | null>(null)
  const [pSaving, setPSaving] = useState(false)
  const [pErr, setPErr] = useState('')

  // ── Results ──
  const [activeTid, setActiveTid] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [popularity, setPopularity] = useState<PopRow[]>([])
  const [rForm, setRForm] = useState({ player_id: '', result: 'Champion', prize_money: '' })
  const [rSaving, setRSaving] = useState(false)
  const [rErr, setRErr] = useState('')

  // ── Participants ──
  const [participants, setParticipants] = useState<Participant[]>([])

  useEffect(() => {
    api.fantasy.admin.tournaments().then(d => setTournaments(d as Tournament[]))
    api.fantasy.admin.players().then(d => setPlayers(d as Player[]))
    api.fantasy.admin.participants().then(d => setParticipants(d as Participant[]))
  }, [])

  useEffect(() => {
    if (!activeTid && tournaments.length > 0) setActiveTid(tournaments[0].id)
  }, [tournaments, activeTid])

  useEffect(() => {
    if (!activeTid) return
    api.fantasy.results(activeTid).then(d => setResults(d as Result[]))
    api.fantasy.admin.pickPopularity(activeTid).then(d => setPopularity(d as PopRow[]))
  }, [activeTid])

  // ── Tournament handlers ──
  const startEditT = (t: Tournament) => {
    setEditingT(t)
    setTForm({ name: t.name, year: t.year, start_date: t.start_date ?? '', end_date: t.end_date ?? '', status: t.status })
    setTErr('')
  }
  const resetTForm = () => { setEditingT(null); setTForm({ name: '', year: new Date().getFullYear(), start_date: '', end_date: '', status: 'draft' }); setTErr('') }

  const saveT = async () => {
    setTSaving(true); setTErr('')
    try {
      if (editingT) {
        const updated = await api.fantasy.admin.updateTournament(editingT.id, tForm) as Tournament
        setTournaments(ts => ts.map(t => t.id === updated.id ? updated : t))
      } else {
        const created = await api.fantasy.admin.createTournament(tForm) as Tournament
        setTournaments(ts => [...ts, created])
      }
      resetTForm()
    } catch (e: any) { setTErr(e.message) } finally { setTSaving(false) }
  }

  const deleteT = async (id: string) => {
    if (!confirm('Delete this tournament and all its picks and results?')) return
    await api.fantasy.admin.deleteTournament(id)
    setTournaments(ts => ts.filter(t => t.id !== id))
  }

  // ── Player handlers ──
  const startEditP = (p: Player) => {
    setEditingP(p); setPForm({ name: p.name, gender: p.gender, country: p.country }); setPErr('')
  }
  const resetPForm = () => { setEditingP(null); setPForm({ name: '', gender: 'M', country: '' }); setPErr('') }

  const saveP = async () => {
    setPSaving(true); setPErr('')
    try {
      if (editingP) {
        const updated = await api.fantasy.admin.updatePlayer(editingP.id, pForm) as Player
        setPlayers(ps => ps.map(p => p.id === updated.id ? updated : p))
      } else {
        const created = await api.fantasy.admin.createPlayer(pForm) as Player
        setPlayers(ps => [...ps, created])
      }
      resetPForm()
    } catch (e: any) { setPErr(e.message) } finally { setPSaving(false) }
  }

  const deleteP = async (id: string) => {
    if (!confirm('Delete this player? This will remove all their picks.')) return
    await api.fantasy.admin.deletePlayer(id)
    setPlayers(ps => ps.filter(p => p.id !== id))
  }

  // ── Result handlers ──
  const saveR = async () => {
    if (!rForm.player_id || !activeTid) return
    setRSaving(true); setRErr('')
    try {
      await api.fantasy.admin.saveResult({
        player_id: rForm.player_id,
        tournament_id: activeTid,
        result: rForm.result,
        prize_money: parseFloat(rForm.prize_money) || 0,
      })
      const updated = await api.fantasy.results(activeTid) as Result[]
      setResults(updated)
      setRForm(f => ({ ...f, player_id: '', prize_money: '' }))
    } catch (e: any) { setRErr(e.message) } finally { setRSaving(false) }
  }

  const deleteR = async (tid: string, pid: string) => {
    await api.fantasy.admin.deleteResult(tid, pid)
    setResults(rs => rs.filter(r => !(r.tournament_id === tid && r.player_id === pid)))
  }

  const togglePaid = async (userId: string, paid: boolean) => {
    await api.fantasy.admin.updatePaid(userId, paid)
    setParticipants(ps => ps.map(p => p.user_id === userId ? { ...p, entry_paid: paid } : p))
  }

  const activeTournament = tournaments.find(t => t.id === activeTid)
  const menPlayers = players.filter(p => p.gender === 'M')
  const womenPlayers = players.filter(p => p.gender === 'W')
  const allPlayersMap = Object.fromEntries(players.map(p => [p.id, p]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Fantasy Tennis Pool Management</h1>
        <p className="text-gray-500 text-sm mt-0.5">Manage tournaments, players, results, and participants.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['tournaments', 'players', 'results', 'participants'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 capitalize transition ${
              tab === t ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* ═══ TOURNAMENTS ═══ */}
      {tab === 'tournaments' && (
        <div className="space-y-5">
          {/* Form */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-4">{editingT ? 'Edit Tournament' : 'Add Tournament'}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input value={tForm.name} onChange={e => setTForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Tournament name" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <input type="number" value={tForm.year} onChange={e => setTForm(f => ({ ...f, year: +e.target.value }))}
                placeholder="Year" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <select value={tForm.status} onChange={e => setTForm(f => ({ ...f, status: e.target.value }))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
              <input type="date" value={tForm.start_date} onChange={e => setTForm(f => ({ ...f, start_date: e.target.value }))}
                placeholder="Start date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <input type="date" value={tForm.end_date} onChange={e => setTForm(f => ({ ...f, end_date: e.target.value }))}
                placeholder="End date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            {tErr && <p className="text-red-500 text-xs mt-2">{tErr}</p>}
            <div className="flex gap-2 mt-3">
              <button onClick={saveT} disabled={tSaving || !tForm.name}
                className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
                {tSaving ? 'Saving…' : editingT ? 'Update' : 'Add Tournament'}
              </button>
              {editingT && <button onClick={resetTForm} className="text-sm text-gray-500 hover:text-gray-700 px-3">Cancel</button>}
            </div>
          </div>

          {/* List */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {tournaments.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">No tournaments yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Year</th>
                    <th className="px-4 py-3 text-left">Dates</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tournaments.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{t.name}</td>
                      <td className="px-4 py-3 text-gray-500">{t.year}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{t.start_date ?? '—'}{t.end_date ? ` – ${t.end_date}` : ''}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[t.status]}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button onClick={() => startEditT(t)} className="text-xs text-blue-600 hover:underline">Edit</button>
                        <button onClick={() => deleteT(t.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ═══ PLAYERS ═══ */}
      {tab === 'players' && (
        <div className="space-y-5">
          {/* Form */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-4">{editingP ? 'Edit Player' : 'Add Player'}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input value={pForm.name} onChange={e => setPForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Full name" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <select value={pForm.gender} onChange={e => setPForm(f => ({ ...f, gender: e.target.value }))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="M">Men's (M)</option>
                <option value="W">Women's (W)</option>
              </select>
              <input value={pForm.country} onChange={e => setPForm(f => ({ ...f, country: e.target.value }))}
                placeholder="Country (optional)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            {pErr && <p className="text-red-500 text-xs mt-2">{pErr}</p>}
            <div className="flex gap-2 mt-3">
              <button onClick={saveP} disabled={pSaving || !pForm.name}
                className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
                {pSaving ? 'Saving…' : editingP ? 'Update' : 'Add Player'}
              </button>
              {editingP && <button onClick={resetPForm} className="text-sm text-gray-500 hover:text-gray-700 px-3">Cancel</button>}
            </div>
          </div>

          {/* Lists */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[{ label: "Men's Players", list: menPlayers }, { label: "Women's Players", list: womenPlayers }].map(({ label, list }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 font-semibold text-sm text-gray-700">{label} ({list.length})</div>
                {list.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-6">None added yet.</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {list.map(p => (
                      <div key={p.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50">
                        <div>
                          <span className="text-sm font-medium text-gray-800">{p.name}</span>
                          {p.country && <span className="ml-2 text-xs text-gray-400">{p.country}</span>}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => startEditP(p)} className="text-xs text-blue-600 hover:underline">Edit</button>
                          <button onClick={() => deleteP(p.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ RESULTS ═══ */}
      {tab === 'results' && (
        <div className="space-y-5">
          {/* Tournament selector */}
          <div className="flex gap-2 flex-wrap">
            {tournaments.map(t => (
              <button key={t.id} onClick={() => setActiveTid(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                  activeTid === t.id ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'
                }`}>
                {t.name} {t.year}
              </button>
            ))}
          </div>

          {activeTournament && (
            <>
              {/* Enter result form */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h2 className="font-semibold text-gray-700 mb-4">Enter / Update Result for {activeTournament.name}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <select value={rForm.player_id} onChange={e => setRForm(f => ({ ...f, player_id: e.target.value }))}
                    className="sm:col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                    <option value="">— Select player —</option>
                    <optgroup label="Men's">
                      {menPlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>
                    <optgroup label="Women's">
                      {womenPlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>
                  </select>
                  <select value={rForm.result} onChange={e => setRForm(f => ({ ...f, result: e.target.value }))}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                    {RESULTS_ORDER.map(r => <option key={r} value={r}>{r === 'F' ? 'Finalist (F)' : r === 'SF' ? 'Semifinal' : r === 'QF' ? 'Quarterfinal' : r}</option>)}
                  </select>
                  <input type="number" value={rForm.prize_money} onChange={e => setRForm(f => ({ ...f, prize_money: e.target.value }))}
                    placeholder="Prize money $" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                {rErr && <p className="text-red-500 text-xs mt-2">{rErr}</p>}
                <button onClick={saveR} disabled={rSaving || !rForm.player_id}
                  className="mt-3 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
                  {rSaving ? 'Saving…' : 'Save Result'}
                </button>
              </div>

              {/* Results table */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 font-semibold text-sm text-gray-700">Results Entered ({results.length})</div>
                  {results.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-6">No results yet.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="text-xs text-gray-400 uppercase border-b border-gray-100">
                        <tr>
                          <th className="px-4 py-2 text-left">Player</th>
                          <th className="px-4 py-2 text-center">Result</th>
                          <th className="px-4 py-2 text-right">Prize $</th>
                          <th className="px-4 py-2 text-right">Picks</th>
                          <th className="px-4 py-2 text-right">$/Pick</th>
                          <th className="px-4 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {results.map(r => (
                          <tr key={r.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5">
                              <div className="font-medium text-gray-800">{allPlayersMap[r.player_id]?.name ?? r.player_id}</div>
                              <div className="text-xs text-gray-400">{allPlayersMap[r.player_id]?.gender === 'M' ? "Men's" : "Women's"}</div>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                r.result === 'Champion' ? 'bg-yellow-100 text-yellow-700' :
                                r.result === 'F' ? 'bg-green-100 text-green-700' :
                                r.result === 'SF' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                              }`}>{r.result}</span>
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-600">{fmt(r.prize_money)}</td>
                            <td className="px-4 py-2.5 text-right text-gray-400">{r.pick_count ?? 0}</td>
                            <td className="px-4 py-2.5 text-right text-green-700 font-medium">
                              {r.pick_count && r.pick_count > 0 ? fmt(r.value_per_pick ?? 0) : fmt(r.prize_money)}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button onClick={() => deleteR(r.tournament_id, r.player_id)} className="text-xs text-red-400 hover:text-red-600">×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Pick popularity */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 font-semibold text-sm text-gray-700">Pick Popularity</div>
                  {popularity.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-6">No picks submitted yet.</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {popularity.map((row, i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-2.5">
                          <div>
                            <span className="text-sm font-medium text-gray-800">{row.player_name}</span>
                            <span className="ml-2 text-xs text-gray-400">{row.gender === 'M' ? "Men's" : "Women's"} · {row.pick_slot}</span>
                          </div>
                          <span className="text-sm font-semibold text-green-700">{row.count} pick{row.count !== 1 ? 's' : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ PARTICIPANTS ═══ */}
      {tab === 'participants' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{participants.length} participant{participants.length !== 1 ? 's' : ''} · {participants.filter(p => p.entry_paid).length} paid</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {participants.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-10">No participants yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Joined</th>
                    <th className="px-4 py-3 text-center">Entry Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {participants.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{p.joined_at}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => togglePaid(p.user_id, !p.entry_paid)}
                          className={`text-xs px-3 py-1 rounded-full font-semibold transition ${
                            p.entry_paid ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}>
                          {p.entry_paid ? '✓ Paid' : 'Mark Paid'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
