import { useEffect, useState } from 'react'
import { parseDate } from '../utils/dates'
import { api } from '../api/client'

interface Booking {
  id: string; court_id: number; start_time: string; end_time: string
  user: { first_name: string; last_name: string }
  court: { name: string; number: number }
}
interface Court { id: number; name: string; number: number; has_ball_machine?: boolean }
interface CourtBlock {
  id: string; court_id: number | null; reason: string; block_type: string
  day_of_week?: number; start_time?: string; end_time?: string
  one_time_start?: string; one_time_end?: string
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7) // 7am–8pm

export default function CourtGrid() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [courts, setCourts] = useState<Court[]>([])
  const [blocks, setBlocks] = useState<CourtBlock[]>([])

  useEffect(() => {
    api.courts.list().then(d => setCourts(d as Court[]))
    api.bookings.list(date).then(d => setBookings(d as Booking[]))
    api.courtBlocks.listForDate(date).then(d => setBlocks(d as CourtBlock[])).catch(() => {})
  }, [date])

  const getBooking = (courtId: number, hour: number) =>
    bookings.find(b => {
      const start = parseDate(b.start_time).getHours()
      const end = parseDate(b.end_time).getHours()
      return b.court_id === courtId && hour >= start && hour < end
    })

  const getBlock = (courtId: number, hour: number) =>
    blocks.find(b => {
      if (b.court_id !== null && b.court_id !== courtId) return false
      if (b.block_type === 'recurring_weekly' && b.start_time && b.end_time) {
        const bSH = parseInt(b.start_time.split(':')[0])
        const bEH = parseInt(b.end_time.split(':')[0])
        return hour >= bSH && hour < bEH
      }
      if (b.block_type === 'one_time' && b.one_time_start && b.one_time_end) {
        const start = new Date(b.one_time_start).getHours()
        const end = new Date(b.one_time_end).getHours()
        return hour >= start && hour < end
      }
      return false
    })

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Court Availability</h1>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-gray-500 text-xs font-medium w-20">Time</th>
              {courts.map(c => (
                <th key={c.id} className="px-4 py-3 text-center text-gray-700 font-semibold">
                  {c.name}
                  {c.has_ball_machine && <div className="text-xs font-normal text-green-600">🤖 Ball Machine</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map(hour => (
              <tr key={hour} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2 text-gray-400 text-xs font-medium whitespace-nowrap">
                  {hour % 12 || 12}{hour < 12 ? 'am' : 'pm'}
                </td>
                {courts.map(c => {
                  const b = getBooking(c.id, hour)
                  const blk = !b ? getBlock(c.id, hour) : null
                  return (
                    <td key={c.id} className="px-2 py-1 text-center">
                      {b ? (
                        <div className="bg-green-100 border border-green-300 rounded px-2 py-1 text-xs text-green-800 font-medium">
                          {b.user.first_name} {b.user.last_name[0]}.
                        </div>
                      ) : blk ? (
                        <div title={blk.reason}
                          className="bg-amber-50 border border-amber-200 rounded px-2 py-1 text-xs text-amber-500 font-medium truncate">
                          {blk.reason}
                        </div>
                      ) : (
                        <div className="text-gray-200 text-xs">—</div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 bg-green-100 border border-green-300 rounded"></span> Booked
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 bg-amber-50 border border-amber-200 rounded"></span> Blocked
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 bg-white border border-gray-200 rounded"></span> Available
        </span>
      </div>
    </div>
  )
}
