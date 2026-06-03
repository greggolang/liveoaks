// Standard best-of-3 tennis validation, mirroring the server so the host gets
// live feedback while filling out the scorecard. The server re-validates on
// submit and is authoritative.

export interface TennisSet {
  a: number | null
  b: number | null
  tba?: number | null
  tbb?: number | null
}

export interface TennisResult {
  ok: boolean
  error?: string
  winnerSide?: 1 | 2
  summary?: string
}

// A 7-6 set needs a tiebreak score; this reports whether the games entered make
// it a tiebreak set, so the form can reveal the tiebreak inputs.
export function isTiebreakSet(a: number | null, b: number | null): boolean {
  return (a === 7 && b === 6) || (a === 6 && b === 7)
}

function legalSet(a: number, b: number): boolean {
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  return (hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6))
}

export function validateTennis(sets: TennisSet[]): TennisResult {
  if (sets.length < 2 || sets.length > 3) {
    return { ok: false, error: 'A match has 2 or 3 sets.' }
  }
  let wonA = 0
  let wonB = 0
  const parts: string[] = []
  for (let i = 0; i < sets.length; i++) {
    const { a, b } = sets[i]
    const n = i + 1
    if (a === null || b === null || a === undefined || b === undefined) {
      return { ok: false, error: `Enter both game scores for set ${n}.` }
    }
    if (a < 0 || b < 0 || a > 7 || b > 7) {
      return { ok: false, error: `Set ${n}: games must be between 0 and 7.` }
    }
    if (a === b) {
      return { ok: false, error: `Set ${n} can't be tied at ${a}-${b}.` }
    }
    if (!legalSet(a, b)) {
      return { ok: false, error: `Set ${n}: ${a}-${b} isn't a valid set score.` }
    }
    let part = `${a}-${b}`
    if (isTiebreakSet(a, b)) {
      const tba = sets[i].tba
      const tbb = sets[i].tbb
      if (tba != null && tbb != null) {
        const loserTB = b > a ? tba : tbb
        if (loserTB < 0) return { ok: false, error: `Set ${n}: tiebreak points can't be negative.` }
        part = `${a}-${b}(${loserTB})`
      }
    }
    parts.push(part)
    if (a > b) wonA++
    else wonB++
  }
  if (sets.length === 2 && wonA !== 2 && wonB !== 2) {
    return { ok: false, error: 'In a 2-set match one player must win both sets.' }
  }
  if (sets.length === 3 && !((wonA === 2 && wonB === 1) || (wonB === 2 && wonA === 1))) {
    return { ok: false, error: 'A 3-set match must be decided 2 sets to 1.' }
  }
  return { ok: true, winnerSide: wonB > wonA ? 2 : 1, summary: parts.join(' ') }
}
