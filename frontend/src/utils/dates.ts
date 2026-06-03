// Safari/iOS has two known Date-parsing bugs:
// 1. Rejects ISO datetimes with no timezone offset (Invalid Date).
// 2. Rejects fractional seconds beyond 3 digits (Go serializes time.Time as
//    RFC3339Nano which can produce 6-digit microseconds, e.g. ".123456Z").
export function parseDate(s: string | null | undefined): Date {
  if (!s) return new Date(NaN)
  // Truncate microseconds/nanoseconds to milliseconds so Safari accepts them.
  s = s.replace(/(\.\d{3})\d+/, '$1')
  // For naive datetimes (no timezone), use slash format so all browsers treat
  // them as local time — appending Z would shift to UTC and break displayed times.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(s.replace(/-/g, '/').replace('T', ' '))
  }
  return new Date(s)
}
