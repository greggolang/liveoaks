import { useEffect, useState } from 'react'
import { api } from '../../api/client'

type FieldType = 'number' | 'time' | 'boolean'

interface RuleField {
  key: string
  label: string
  desc: string
  type?: FieldType
  unit?: string
  min?: number
  enforced?: boolean
}

interface RuleSection {
  heading: string
  fields: RuleField[]
}

const SECTIONS: RuleSection[] = [
  {
    heading: 'Reservation Limits',
    fields: [
      {
        key: 'booking_max_advance_per_week',
        label: 'Advance reservations per week',
        desc: 'Maximum number of future court bookings a member may hold within a single calendar week.',
        unit: 'reservations', min: 1, enforced: true,
      },
      {
        key: 'booking_max_future_per_day',
        label: 'Future reservations per day',
        desc: 'Maximum number of upcoming bookings a member may have on any single calendar day.',
        unit: 'reservations', min: 1, enforced: true,
      },
      {
        key: 'booking_max_per_day',
        label: 'Reservations per member per day',
        desc: 'Total court bookings a member may hold on any single calendar day, including completed sessions.',
        unit: 'reservations', min: 1, enforced: true,
      },
      {
        key: 'booking_max_minutes_per_day',
        label: 'Minutes on court per member per day',
        desc: 'Total court time a member may book in a single day. Leave blank for no limit.',
        unit: 'minutes', min: 1, enforced: true,
      },
      {
        key: 'booking_max_courts_per_week',
        label: 'Courts per member per week',
        desc: 'Max number of court sessions per member in a calendar week. Leave blank for no limit.',
        unit: 'courts', min: 1, enforced: true,
      },
      {
        key: 'booking_max_per_week',
        label: 'Total reservations per member per week',
        desc: 'Max total bookings per member per calendar week. Leave blank for no limit.',
        unit: 'reservations', min: 1, enforced: true,
      },
      {
        key: 'booking_max_family_per_day',
        label: 'Courts per family per day',
        desc: 'Combined daily court limit across all family members. Leave blank for no limit.',
        unit: 'courts', min: 1,
      },
      {
        key: 'booking_max_duration_hours',
        label: 'Maximum booking duration',
        desc: 'Longest single reservation allowed, in hours. Leave blank for no limit.',
        unit: 'hours', min: 0.5,
      },
      {
        key: 'booking_max_guest_days_per_month',
        label: 'Days a guest may play per month',
        desc: 'Maximum number of days in a calendar month that a single guest (by email) may appear on bookings.',
        unit: 'days', min: 1,
      },
    ],
  },
  {
    heading: 'Advance Booking',
    fields: [
      {
        key: 'booking_max_days_ahead',
        label: 'Days a reservation can be made in advance',
        desc: 'How far ahead members may book a court. Bookings beyond this window are blocked.',
        unit: 'days', min: 1, enforced: true,
      },
      {
        key: 'booking_open_time',
        label: 'Time the next reservation day opens',
        desc: "When tomorrow's slots become bookable, e.g. 06:00. Leave blank for midnight.",
        type: 'time',
      },
      {
        key: 'booking_cancel_hours',
        label: 'Minimum hours notice to cancel',
        desc: 'Members must cancel at least this many hours before start. Admins can always cancel.',
        unit: 'hours', min: 0, enforced: true,
      },
      {
        key: 'withdrawal_min_notice_hours',
        label: 'Minimum hours notice to withdraw from a match',
        desc: 'Players cannot remove themselves within this window before start. Default 0.5 (30 min). 0 = disabled.',
        unit: 'hours', min: 0, enforced: true,
      },
    ],
  },
  {
    heading: 'Court Hours',
    fields: [
      {
        key: 'court_open_hour',
        label: 'Courts open (24-hour)',
        desc: 'First bookable hour. e.g. 8 = 8 AM.',
        unit: 'hour', min: 0, enforced: true,
      },
      {
        key: 'court_close_hour',
        label: 'Courts close (24-hour)',
        desc: 'Bookings must end by this hour. e.g. 20 = 8 PM.',
        unit: 'hour', min: 1, enforced: true,
      },
      {
        key: 'booking_min_gap_minutes',
        label: 'Minimum gap between a member\'s bookings',
        desc: 'Prevents back-to-back reservations. Set to 30 to require a 30-min buffer. 0 = disabled.',
        unit: 'minutes', min: 0, enforced: true,
      },
    ],
  },
  {
    heading: 'Player Rules',
    fields: [
      {
        key: 'booking_allow_sub',
        label: 'Allow rostered players to sub out',
        desc: 'A player on a reservation can be replaced by another player.',
        type: 'boolean',
      },
      {
        key: 'booking_allow_any_sub',
        label: 'Allow any player to sub another',
        desc: 'Any rostered player may swap without host approval.',
        type: 'boolean',
      },
    ],
  },
]

const ALL_KEYS = SECTIONS.flatMap(s => s.fields.map(f => f.key))

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
      for (const key of ALL_KEYS) init[key] = s[key] ?? ''
      setLoaded(init)
      setValues(init)
    }).finally(() => setLoading(false))
  }, [])

  const save = async (field: RuleField) => {
    const raw = values[field.key]?.trim()
    setErrors(e => ({ ...e, [field.key]: '' }))

    if (field.type === 'boolean') {
      // no validation needed
    } else if (field.type === 'time') {
      // allow blank or HH:MM
      if (raw && !/^\d{2}:\d{2}$/.test(raw)) {
        setErrors(e => ({ ...e, [field.key]: 'Use HH:MM format, e.g. 06:00' }))
        return
      }
    } else {
      const num = parseFloat(raw)
      if (raw !== '' && (isNaN(num) || (field.min !== undefined && num < field.min))) {
        setErrors(e => ({ ...e, [field.key]: field.min !== undefined ? `Enter a number ≥ ${field.min}, or leave blank` : 'Invalid number' }))
        return
      }
    }

    setSaving(s => ({ ...s, [field.key]: true }))
    try {
      await api.admin.saveSetting(field.key, raw)
      setLoaded(l => ({ ...l, [field.key]: raw }))
      setValues(v => ({ ...v, [field.key]: raw }))
      setSaved(s => ({ ...s, [field.key]: true }))
      setTimeout(() => setSaved(s => ({ ...s, [field.key]: false })), 2000)
    } catch {
      setErrors(e => ({ ...e, [field.key]: 'Failed to save — try again.' }))
    } finally {
      setSaving(s => ({ ...s, [field.key]: false }))
    }
  }

  const dirty = (key: string) => values[key] !== loaded[key]

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-800">Booking Rules</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Configure how members may reserve courts. Changes take effect immediately.
          Leave numeric fields blank to disable that limit.
        </p>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-12 text-sm">Loading…</p>
      ) : (
        <div className="space-y-6">
          {SECTIONS.map(section => (
            <div key={section.heading} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{section.heading}</p>
              </div>
              <div className="divide-y divide-gray-50">
                {section.fields.map(field => (
                  <div key={field.key} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-800">{field.label}</p>
                        {field.enforced && (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-normal">enforced</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{field.desc}</p>
                      {errors[field.key] && (
                        <p className="text-xs text-red-500 mt-1">{errors[field.key]}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {field.type === 'boolean' ? (
                        <select
                          value={values[field.key] ?? 'true'}
                          onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                        >
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      ) : field.type === 'time' ? (
                        <input
                          type="time"
                          value={values[field.key] ?? ''}
                          onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      ) : (
                        <>
                          <input
                            type="number"
                            min={field.min}
                            step={field.min === 0.5 ? 0.5 : 1}
                            value={values[field.key] ?? ''}
                            placeholder="—"
                            onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && dirty(field.key) && save(field)}
                            className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                          {field.unit && <span className="text-xs text-gray-400 w-16">{field.unit}</span>}
                        </>
                      )}
                      <button
                        onClick={() => save(field)}
                        disabled={saving[field.key] || (!dirty(field.key) && !saved[field.key])}
                        className={`w-16 py-1.5 rounded-lg text-xs font-medium transition ${
                          saved[field.key]
                            ? 'bg-green-100 text-green-700 border border-green-200'
                            : dirty(field.key)
                            ? 'bg-green-700 text-white hover:bg-green-800'
                            : 'bg-gray-100 text-gray-400 cursor-default'
                        }`}
                      >
                        {saving[field.key] ? '…' : saved[field.key] ? 'Saved ✓' : 'Save'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <p className="font-medium mb-1">Notes</p>
        <ul className="space-y-0.5 text-amber-700 list-disc list-inside text-xs">
          <li>Teaching pros and admins are exempt from all booking limits.</li>
          <li>Weekly and daily counts reset at midnight local club time.</li>
          <li>Guest day limits are tracked per guest email address per calendar month.</li>
          <li>Fields marked <strong>enforced</strong> are actively checked when a member submits a booking.</li>
          <li>Leave a numeric field blank to disable that rule entirely.</li>
        </ul>
      </div>
    </div>
  )
}
