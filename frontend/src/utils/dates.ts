// Safari/iOS rejects ISO datetime strings without a timezone offset (Invalid Date).
// For naive datetimes (no offset), use the "YYYY/MM/DD HH:MM:SS" form so all
// browsers parse them as local time — appending Z would shift to UTC and break times.
export function parseDate(s: string | null | undefined): Date {
  if (!s) return new Date(NaN)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(s.replace(/-/g, '/').replace('T', ' '))
  }
  return new Date(s)
}
