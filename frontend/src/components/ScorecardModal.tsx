import { useEffect, useMemo, useRef, useState } from 'react'
import { api, PendingMatch } from '../api/client'
import { TennisSet, validateTennis, isTiebreakSet } from '../utils/tennis'

interface Member { id: string; first_name: string; last_name: string; email: string }

type Slot = { user_id: string | null; name: string; is_guest: boolean }
type SetRow = { a: number | null; b: number | null; tba: number | null; tbb: number | null }

const GAMES = [0, 1, 2, 3, 4, 5, 6, 7]

// Split the booking roster into two sides, padding/truncating to the size the
// match type needs (1 per side for singles, 2 for doubles).
function initialTeams(match: PendingMatch): [Slot[], Slot[]] {
  const perSide = match.match_type === 'doubles' ? 2 : 1
  const blank = (): Slot => ({ user_id: null, name: '', is_guest: false })
  const fromPlayer = (p: PendingMatch['players'][number]): Slot => ({ user_id: p.user_id, name: p.name, is_guest: p.is_guest })
  const slots = match.players.map(fromPlayer)
  const teamA: Slot[] = []
  const teamB: Slot[] = []
  for (let i = 0; i < perSide; i++) teamA.push(slots[i] ?? blank())
  for (let i = 0; i < perSide; i++) teamB.push(slots[perSide + i] ?? blank())
  return [teamA, teamB]
}

export default function ScorecardModal({ match, onClose, onSubmitted }: {
  match: PendingMatch
  onClose: () => void
  onSubmitted: () => void
}) {
  const [[teamA, teamB], setTeams] = useState<[Slot[], Slot[]]>(() => initialTeams(match))
  const [sets, setSets] = useState<SetRow[]>([
    { a: null, b: null, tba: null, tbb: null },
    { a: null, b: null, tba: null, tbb: null },
  ])
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [step, setStep] = useState<'edit' | 'review'>('edit')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Inline player picker: which slot is open + its search state.
  const [picker, setPicker] = useState<{ team: 0 | 1; pos: number } | null>(null)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Member[]>([])
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current)
    if (search.length < 2) { setResults([]); return }
    searchRef.current = setTimeout(async () => {
      setSearching(true)
      try { setResults(await api.friends.searchMembers(search) as Member[]) }
      finally { setSearching(false) }
    }, 300)
    return () => { if (searchRef.current) clearTimeout(searchRef.current) }
  }, [search])

  const setSlot = (team: 0 | 1, pos: number, slot: Slot) => {
    setTeams(prev => {
      const next: [Slot[], Slot[]] = [[...prev[0]], [...prev[1]]]
      next[team][pos] = slot
      return next
    })
  }
  const openPicker = (team: 0 | 1, pos: number) => { setPicker({ team, pos }); setSearch(''); setResults([]) }

  const setGames = (i: number, key: 'a' | 'b', val: number | null) =>
    setSets(prev => prev.map((s, idx) => idx === i ? { ...s, [key]: val } : s))
  const setTB = (i: number, key: 'tba' | 'tbb', val: number | null) =>
    setSets(prev => prev.map((s, idx) => idx === i ? { ...s, [key]: val } : s))
  const addSet = () => setSets(prev => prev.length < 3 ? [...prev, { a: null, b: null, tba: null, tbb: null }] : prev)
  const removeSet = () => setSets(prev => prev.length > 2 ? prev.slice(0, -1) : prev)

  const teamsComplete = [...teamA, ...teamB].every(s => s.name.trim() !== '')
  const tennisSets: TennisSet[] = sets.map(s => ({ a: s.a, b: s.b, tba: s.tba, tbb: s.tbb }))
  const result = useMemo(() => validateTennis(tennisSets), [sets])
  const canReview = teamsComplete && result.ok

  const teamName = (team: Slot[]) => team.map(s => s.name.trim() || '—').join(' & ')

  async function submit() {
    setSaving(true); setError('')
    try {
      await api.matches.create({
        booking_id: match.booking_id,
        visibility,
        teams: [
          teamA.map(s => ({ user_id: s.user_id, name: s.name.trim(), is_guest: s.is_guest })),
          teamB.map(s => ({ user_id: s.user_id, name: s.name.trim(), is_guest: s.is_guest })),
        ],
        sets: sets.map(s => ({ a: s.a as number, b: s.b as number, tba: s.tba, tbb: s.tbb })),
      })
      onSubmitted()
    } catch (e: any) {
      setError(e.message || 'Could not save the score.')
      setStep('edit')
    } finally { setSaving(false) }
  }

  const playedAt = new Date(match.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-semibold text-gray-800">{step === 'edit' ? 'Enter match score' : 'Review score'}</h3>
            <p className="text-xs text-gray-400">
              {match.match_type === 'doubles' ? 'Doubles' : 'Singles'} · {match.court_name} · {playedAt}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {step === 'edit' ? (
          <div className="px-5 py-4 space-y-5 overflow-y-auto flex-1">
            {/* Players */}
            <div className="grid grid-cols-2 gap-3">
              {([teamA, teamB] as Slot[][]).map((team, ti) => (
                <div key={ti} className="border border-gray-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Team {ti === 0 ? 'A' : 'B'}</p>
                  <div className="space-y-2">
                    {team.map((slot, pi) => {
                      const open = picker?.team === ti && picker?.pos === pi
                      return (
                        <div key={pi} className="relative">
                          <button onClick={() => open ? setPicker(null) : openPicker(ti as 0 | 1, pi)}
                            className="w-full text-left border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm hover:border-green-400 transition flex items-center justify-between gap-1">
                            <span className={slot.name ? 'text-gray-800' : 'text-gray-400'}>
                              {slot.name || 'Add player'}
                              {slot.is_guest && slot.name && <span className="text-gray-400 font-normal"> · guest</span>}
                            </span>
                            <svg className="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                          {open && (
                            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-2 space-y-1">
                              <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Search members…"
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-green-500" />
                              <div className="max-h-40 overflow-y-auto">
                                {searching && <p className="px-2 py-1.5 text-xs text-gray-400">Searching…</p>}
                                {!searching && results.map(m => (
                                  <button key={m.id}
                                    onClick={() => { setSlot(ti as 0 | 1, pi, { user_id: m.id, name: `${m.first_name} ${m.last_name}`, is_guest: false }); setPicker(null) }}
                                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-gray-50 text-sm text-gray-800">
                                    {m.first_name} {m.last_name}
                                  </button>
                                ))}
                                {!searching && search.trim().length >= 2 && (
                                  <button
                                    onClick={() => { setSlot(ti as 0 | 1, pi, { user_id: null, name: search.trim(), is_guest: true }); setPicker(null) }}
                                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-amber-50 text-sm text-amber-700">
                                    Use “{search.trim()}” as a guest
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 -mt-3">Players are filled from the booking. Tap a name to swap in a last-minute member or guest.</p>

            {/* Sets */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Set scores</p>
              <div className="space-y-2">
                {sets.map((s, i) => {
                  const tb = s.a !== null && s.b !== null && isTiebreakSet(s.a, s.b)
                  return (
                    <div key={i} className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-400 w-10">Set {i + 1}</span>
                      <select value={s.a ?? ''} onChange={e => setGames(i, 'a', e.target.value === '' ? null : Number(e.target.value))}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                        <option value="">–</option>
                        {GAMES.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                      <span className="text-gray-400">–</span>
                      <select value={s.b ?? ''} onChange={e => setGames(i, 'b', e.target.value === '' ? null : Number(e.target.value))}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                        <option value="">–</option>
                        {GAMES.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                      {tb && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          tiebreak
                          <input type="number" min={0} value={s.tba ?? ''} onChange={e => setTB(i, 'tba', e.target.value === '' ? null : Number(e.target.value))}
                            className="w-12 border border-gray-200 rounded-lg px-1.5 py-1 text-sm" placeholder="–" />
                          <span className="text-gray-400">–</span>
                          <input type="number" min={0} value={s.tbb ?? ''} onChange={e => setTB(i, 'tbb', e.target.value === '' ? null : Number(e.target.value))}
                            className="w-12 border border-gray-200 rounded-lg px-1.5 py-1 text-sm" placeholder="–" />
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-3 mt-2">
                {sets.length < 3 && <button onClick={addSet} className="text-xs text-green-700 font-medium hover:underline">+ Add 3rd set</button>}
                {sets.length > 2 && <button onClick={removeSet} className="text-xs text-gray-400 hover:underline">Remove set</button>}
              </div>
            </div>

            {/* Validation / winner preview */}
            {!result.ok
              ? <p className="text-xs text-amber-600">{result.error}</p>
              : <p className="text-xs text-green-700 font-medium">Winner: {teamName(result.winnerSide === 1 ? teamA : teamB)} ({result.summary})</p>}

            {/* Visibility */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Who can see this?</p>
              <div className="space-y-2">
                {([
                  ['public', 'Public', 'Shown on the club scoreboard and recent activity.'],
                  ['private', 'Private', 'Only the players in this match can see it.'],
                ] as const).map(([val, label, desc]) => (
                  <label key={val} className={`flex items-start gap-2.5 border rounded-xl px-3 py-2 cursor-pointer transition ${visibility === val ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <input type="radio" name="visibility" checked={visibility === val} onChange={() => setVisibility(val)} className="mt-0.5 accent-green-700" />
                    <span>
                      <span className="text-sm font-medium text-gray-800">{label}</span>
                      <span className="block text-xs text-gray-400">{desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        ) : (
          // Review step
          <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              {([teamA, teamB] as Slot[][]).map((team, ti) => {
                const isWinner = result.winnerSide === (ti + 1)
                return (
                  <div key={ti} className={`flex items-center justify-between px-4 py-3 ${ti === 0 ? 'border-b border-gray-100' : ''} ${isWinner ? 'bg-green-50' : ''}`}>
                    <span className={`text-sm ${isWinner ? 'font-semibold text-green-800' : 'text-gray-700'}`}>
                      {teamName(team)} {isWinner && <span className="text-xs">🏆</span>}
                    </span>
                    <span className="flex gap-3 text-sm tabular-nums text-gray-700">
                      {sets.map((s, i) => (
                        <span key={i}>
                          {ti === 0 ? s.a : s.b}
                          {isTiebreakSet(s.a, s.b) && (ti === 0 ? s.tbb : s.tba) != null &&
                            <sup className="text-[10px] text-gray-400">{ti === 0 ? s.tbb : s.tba}</sup>}
                        </span>
                      ))}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="text-sm text-gray-600">
              Visibility: <span className="font-medium text-gray-800">{visibility === 'public' ? 'Public — club scoreboard' : 'Private — players only'}</span>
            </p>
            <p className="text-xs text-gray-400">Please double-check the score and players before submitting.</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 shrink-0">
          {step === 'edit' ? (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">Cancel</button>
              <button onClick={() => setStep('review')} disabled={!canReview}
                className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-5 py-2 rounded-xl transition disabled:opacity-50">
                Review →
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setStep('edit')} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">← Back</button>
              <button onClick={submit} disabled={saving}
                className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-5 py-2 rounded-xl transition disabled:opacity-50">
                {saving ? 'Submitting…' : 'Submit score'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
