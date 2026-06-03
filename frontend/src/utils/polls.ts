// Convert raw poll vote counts into whole-number percentages that always sum to
// exactly 100. Rounding each option independently (Math.round per option) makes
// percentages drift away from the counts and fail to total 100 (e.g. a 1/1/1
// split shows 33/33/33 = 99). The largest-remainder method floors every share,
// then hands the leftover points to the options with the biggest fractional
// remainders — so the percentages stay faithful to the counts and sum to 100.
export function votePercents(
  options: string[],
  results: Record<string, number>,
  total: number,
): Record<string, number> {
  const pct: Record<string, number> = {}
  if (total <= 0) {
    for (const opt of options) pct[opt] = 0
    return pct
  }
  const rows = options.map(opt => {
    const exact = ((results[opt] ?? 0) / total) * 100
    const floor = Math.floor(exact)
    return { opt, floor, remainder: exact - floor }
  })
  let leftover = 100 - rows.reduce((sum, r) => sum + r.floor, 0)
  // Hand each remaining point to the next-largest remainder. Ties keep the
  // earlier option, matching the order options are displayed in.
  rows
    .slice()
    .sort((a, b) => b.remainder - a.remainder)
    .forEach(r => {
      if (leftover > 0) {
        r.floor += 1
        leftover -= 1
      }
    })
  for (const r of rows) pct[r.opt] = r.floor
  return pct
}
