import { useEffect, useState } from 'react'
import { parseDate } from '../utils/dates'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface Event { id: string; title: string; start_time: string; location?: string; signup_enabled: boolean; signup_deadline?: string }

const FORMATS = ['Men\'s Doubles', 'Women\'s Doubles', 'Mixed Doubles', 'Singles', 'Any Format']
const FOOD_ITEMS = ['Main Dish', 'Side Dish', 'Salad', 'Dessert', 'Drinks', 'Paper Goods / Supplies', 'Not This Time']
const VOLUNTEER_ROLES = ['Court Setup', 'Registration Check-In', 'Food Setup', 'Scorekeeping / Match Coordination', 'Cleanup', 'Event Photography', 'Not This Time']
const SKILL_LEVELS = ['2.5', '3.0', '3.5', '4.0', '4.5+', 'Not Sure']
const LUNCH_COUNTS = [1, 2, 3, 4, 5]

const empty = {
  full_name: '', email: '', phone: '', member_status: 'member',
  playing_tennis: false, skill_level: '', formats: [] as string[], preferred_partner: '', willing_substitute: null as boolean | null,
  attending_lunch: false, lunch_count: 1, lunch_guest_names: '',
  food_contributions: [] as string[], food_item: '', food_servings: '', food_allergies: '',
  volunteer_roles: [] as string[], volunteer_time: '',
  emergency_name: '', emergency_phone: '', comments: '',
}

function CheckGroup({ label, options, selected, onChange }: { label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (o: string) => onChange(selected.includes(o) ? selected.filter(x => x !== o) : [...selected, o])
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="grid grid-cols-2 gap-2">
        {options.map(o => (
          <label key={o} className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)}
              className="w-4 h-4 text-green-600 rounded" />
            {o}
          </label>
        ))}
      </div>
    </div>
  )
}

function RadioGroup({ label, options, value, onChange, required }: { label: string; options: string[]; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      <div className="flex flex-wrap gap-3">
        {options.map(o => (
          <label key={o} className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="radio" value={o} checked={value === o} onChange={() => onChange(o)}
              className="w-4 h-4 text-green-600" />
            {o}
          </label>
        ))}
      </div>
    </div>
  )
}

export default function EventSignup() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [event, setEvent] = useState<Event | null>(null)
  const [form, setForm] = useState(empty)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.events.get(id!).then(d => {
      const ev = d as Event
      setEvent(ev)
      if (user) {
        setForm(f => ({
          ...f,
          full_name: `${user.first_name} ${user.last_name}`,
          email: user.email,
          member_status: 'member',
        }))
      }
    })
  }, [id, user])

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  const setBool = (field: string) => (val: boolean) => setForm(f => ({ ...f, [field]: val }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.signups.submit(id!, form)
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!event) return <div className="min-h-screen bg-green-50 flex items-center justify-center"><p className="text-gray-400">Loading…</p></div>

  if (!event.signup_enabled) return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow p-8 text-center max-w-md">
        <div className="text-4xl mb-3">🎾</div>
        <h2 className="font-bold text-gray-800 text-lg mb-2">{event.title}</h2>
        <p className="text-gray-500 text-sm">Sign-ups are not currently open for this event.</p>
        <Link to="/events" className="block mt-4 text-green-700 text-sm hover:underline">← Back to Events</Link>
      </div>
    </div>
  )

  if (submitted) return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-md">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-2xl font-bold text-green-800 mb-2">You're signed up!</h2>
        <p className="text-gray-600 mb-6">Thank you for signing up for <strong>{event.title}</strong>. We'll see you there!</p>
        <Link to="/events" className="text-green-700 font-medium hover:underline">← Back to Events</Link>
      </div>
    </div>
  )

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
  const sectionCls = "bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-5"
  const sectionTitle = "text-base font-bold text-green-800 border-b border-gray-100 pb-2 mb-2"

  return (
    <div className="min-h-screen bg-green-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🎾</div>
          <h1 className="text-2xl font-bold text-green-800">Live Oaks Tennis Event</h1>
          <h2 className="text-lg font-semibold text-gray-700 mt-1">{event.title}</h2>
          <p className="text-gray-500 text-sm mt-1">
            {parseDate(event.start_time).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            {event.location && ` · ${event.location}`}
          </p>
          {event.signup_deadline && (
            <p className="text-orange-600 text-xs mt-2 font-medium">
              Sign-up deadline: {parseDate(event.signup_deadline).toLocaleDateString()}
            </p>
          )}
          <p className="text-gray-500 text-sm mt-3 max-w-lg mx-auto">
            Please sign up for tennis, lunch, and volunteer opportunities. Your responses help us organize courts, plan food, and coordinate volunteers.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Participant Info */}
          <div className={sectionCls}>
            <h3 className={sectionTitle}>Section 1 — Participant Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
                <input value={form.full_name} onChange={set('full_name')} required className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address <span className="text-red-500">*</span></label>
                <input type="email" value={form.email} onChange={set('email')} required className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Phone <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="tel" value={form.phone} onChange={set('phone')} className={inputCls} />
              </div>
            </div>
            <RadioGroup label="Are you a Live Oaks Member?" required
              options={['member', 'non_member', 'guest']}
              value={form.member_status} onChange={v => setForm(f => ({ ...f, member_status: v }))} />
          </div>

          {/* Section 2: Tennis */}
          <div className={sectionCls}>
            <h3 className={sectionTitle}>Section 2 — Tennis Participation</h3>
            <RadioGroup label="Will you be playing tennis?" required
              options={['yes', 'no']}
              value={form.playing_tennis ? 'yes' : 'no'}
              onChange={v => setBool('playing_tennis')(v === 'yes')} />

            {form.playing_tennis && (
              <>
                <RadioGroup label="Tennis Skill Level"
                  options={SKILL_LEVELS} value={form.skill_level}
                  onChange={v => setForm(f => ({ ...f, skill_level: v }))} />
                <CheckGroup label="Preferred Format"
                  options={FORMATS} selected={form.formats}
                  onChange={v => setForm(f => ({ ...f, formats: v }))} />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Playing Partner <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input value={form.preferred_partner} onChange={set('preferred_partner')} className={inputCls} placeholder="Name of preferred partner" />
                </div>
                <RadioGroup label="Willing to serve as substitute player if needed?"
                  options={['yes', 'no']}
                  value={form.willing_substitute === true ? 'yes' : form.willing_substitute === false ? 'no' : ''}
                  onChange={v => setForm(f => ({ ...f, willing_substitute: v === 'yes' }))} />
              </>
            )}
          </div>

          {/* Section 3: Lunch */}
          <div className={sectionCls}>
            <h3 className={sectionTitle}>Section 3 — Lunch Attendance</h3>
            <RadioGroup label="Will you stay for lunch?" required
              options={['yes', 'no']}
              value={form.attending_lunch ? 'yes' : 'no'}
              onChange={v => setBool('attending_lunch')(v === 'yes')} />
            {form.attending_lunch && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total attending lunch (including yourself)</label>
                  <select value={form.lunch_count} onChange={e => setForm(f => ({ ...f, lunch_count: +e.target.value }))}
                    className={inputCls}>
                    {LUNCH_COUNTS.map(n => <option key={n} value={n}>{n}{n === 5 ? '+' : ''}</option>)}
                  </select>
                </div>
                {form.lunch_count > 1 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Names of additional lunch guests <span className="text-gray-400 font-normal">(optional)</span></label>
                    <textarea value={form.lunch_guest_names} onChange={set('lunch_guest_names')} rows={2} className={inputCls} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Section 4: Potluck */}
          <div className={sectionCls}>
            <h3 className={sectionTitle}>Section 4 — Potluck &amp; Food Contributions</h3>
            <CheckGroup label="Would you like to bring something?"
              options={FOOD_ITEMS} selected={form.food_contributions}
              onChange={v => setForm(f => ({ ...f, food_contributions: v }))} />
            {form.food_contributions.some(c => c !== 'Not This Time') && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">What will you bring?</label>
                  <input value={form.food_item} onChange={set('food_item')} className={inputCls} placeholder="e.g. Caesar salad, lemonade" />
                </div>
                {!form.food_contributions.includes('Drinks') && !form.food_contributions.includes('Paper Goods / Supplies') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Number of servings your dish will provide</label>
                    <select value={form.food_servings} onChange={set('food_servings')} className={inputCls}>
                      <option value="">Select…</option>
                      {['4–6', '8–10', '10–15', '15+'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
              </>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Food Restrictions or Allergies <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea value={form.food_allergies} onChange={set('food_allergies')} rows={2} className={inputCls} placeholder="e.g. gluten-free, nut allergy" />
            </div>
          </div>

          {/* Section 5: Volunteer */}
          <div className={sectionCls}>
            <h3 className={sectionTitle}>Section 5 — Volunteer Opportunities</h3>
            <CheckGroup label="Would you like to volunteer? (optional)"
              options={VOLUNTEER_ROLES} selected={form.volunteer_roles}
              onChange={v => setForm(f => ({ ...f, volunteer_roles: v }))} />
            {form.volunteer_roles.some(r => r !== 'Not This Time') && (
              <RadioGroup label="Preferred volunteer time"
                options={['Before Event', 'During Event', 'After Event', 'Anytime']}
                value={form.volunteer_time}
                onChange={v => setForm(f => ({ ...f, volunteer_time: v }))} />
            )}
          </div>

          {/* Section 6: Additional */}
          <div className={sectionCls}>
            <h3 className={sectionTitle}>Section 6 — Additional Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact Name <span className="text-gray-400 font-normal">(optional)</span></label>
                <input value={form.emergency_name} onChange={set('emergency_name')} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact Phone <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="tel" value={form.emergency_phone} onChange={set('emergency_phone')} className={inputCls} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Additional Comments or Requests <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea value={form.comments} onChange={set('comments')} rows={3} className={inputCls} />
            </div>
          </div>

          {error && <p className="text-red-600 text-sm text-center">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full bg-green-700 hover:bg-green-800 text-white font-bold py-3 rounded-xl text-base transition disabled:opacity-50 shadow-lg">
            {loading ? 'Submitting…' : 'Submit Sign-Up'}
          </button>
          <p className="text-center text-xs text-gray-400">Thank you for supporting Live Oaks Tennis!</p>
        </form>
      </div>
    </div>
  )
}
