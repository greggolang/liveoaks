// Safari/iOS rejects datetime strings without an explicit timezone offset
// (e.g. "2026-06-05T10:00:00" → Invalid Date). Append Z when none is present.
export function parseDate(s: string | null | undefined): Date {
  if (!s) return new Date(NaN)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(s + 'Z')
  }
  return new Date(s)
}
