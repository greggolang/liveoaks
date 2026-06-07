import { useEffect, useState } from 'react'
import { api } from '../../api/client'

interface Rule {
  key: string
  label: string
  desc: string
  unit: string
  min: number
}

const RULES: Rule[] = [
  {
    key: 'booking_max_advance_per_week',
    label: 'Advance reservations per week',
    desc: 'Maximum number of future court bookings a member may hold within a single calendar week.',
    unit: 'reservations',
    min: 1,
  },
  {
    key: 'booking_max_future_per_day',
    label: 'Future reservations per day',
    desc: 'Maximum number of upcoming bookings a member may have on any single calendar day.',
    unit: 'reservations',
    min: 1,
  },
  {
    key: 'booking_max_per_day',
    label: 'Reservations bookable in a day after completing one',
    desc: 'Total court bookings a member may hold on any single calendar day (including completed sessions).',
    unit: 'reservations',
    min: 1,
  },
  {
    key: 'booking_max_days_ahead',
    label: 'Days a reservation can be made in advance',
    desc: 'How many calendar days ahead members can reserve a court. Bookings beyond this window are blocked.',
    unit: 'days',
    min: 1,
  },
  {
    key: 'booking_max_guest_days_per_month',
    label: 'Days a guest may play in a month',
    desc: 'Maximum number of days per calendar month that a single guest may appear on court bookings.',
    unit: 'days',
    min: 1,
  },
]

export default function AdminBookingRules() {
  const [loaded, setLoaded] = useState<Record<string, string>>({})
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.admin.settings().then((s: any) => {
      const init: Record<string, string> = {}
      for (const rule of RULES) {
        init[rule.key] = s[rule.key] ?? ''
      }
      setLoaded(init)
      setValues(init)
    }).finally(() => setLoading(false))
  }, [])

  const save = async (key: string) => {
    const raw = values[key]?.trim()
    const num = parseInt(raw, 10)
    const rule = RULES.find(r => r.key === key)!
    if (!raw || isNaN(num) || num < rule.min) {
      setErrors(e => ({ ...e, [key]: `Enter a number ≥ ${rule.min}` }))
      return
    }
    setErrors(e => ({ ...e, [key]: '' }))
    setSaving(s => ({ ...s, [key]: true }))
    try {
      await api.admin.saveSetting(key, String(num))
      setLoaded(l => ({ ...l, [key]: String(num) }))
      setValues(v => ({ ...v, [key]: String(num) }))
      setSaved(s => ({ ...s, [key]: true }))
      setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2000)
    } catch {
      setErrors(e => ({ ...e, [key]: 'Failed to save — try again.' }))
    } finally {
      setSaving(s => ({ ...s, [key]: false }))
    }
  }

  const dirty = (key: string) => values[key] !== loaded[key]

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-800">Booking Rules</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Set limits on how members may reserve courts. Changes take effect immediately.
          Leave a field blank to disable that rule.
        </p>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-12 text-sm">Loading…</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100">
          {RULES.map((rule, i) => (
            <div key={rule.key} className={`flex items-center gap-4 px-5 py-4 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{rule.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{rule.desc}</p>
                {errors[rule.key] && (
                  <p className="text-xs text-red-500 mt-1">{errors[rule.key]}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  min={rule.min}
                  value={values[rule.key] ?? ''}
                  placeholder="—"
                  onChange={e => setValues(v => ({ ...v, [rule.key]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && dirty(rule.key) && save(rule.key)}
                  className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <span className="text-xs text-gray-400 w-20">{rule.unit}</span>
                <button
                  onClick={() => save(rule.key)}
                  disabled={saving[rule.key] || (!dirty(rule.key) && !saved[rule.key])}
                  className={`w-16 py-1.5 rounded-lg text-xs font-medium transition ${
                    saved[rule.key]
                      ? 'bg-green-100 text-green-700 border border-green-200'
                      : dirty(rule.key)
                      ? 'bg-green-700 text-white hover:bg-green-800'
                      : 'bg-gray-100 text-gray-400 cursor-default'
                  }`}
                >
                  {saving[rule.key] ? '…' : saved[rule.key] ? 'Saved ✓' : 'Save'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <p className="font-medium mb-1">Notes</p>
        <ul className="space-y-0.5 text-amber-700 list-disc list-inside">
          <li>Teaching pros and admins are exempt from all booking limits.</li>
          <li>Weekly and daily counts reset at midnight local club time.</li>
          <li>Guest day limits are tracked per guest email address per calendar month.</li>
          <li>A blank value means no limit is enforced for that rule.</li>
        </ul>
      </div>
    </div>
  )
}
