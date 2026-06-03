import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { SiteContent, DEFAULT_CONTENT, mergeContent } from '../../siteContent'

// ── small building blocks ────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
    </div>
  )
}
function Area({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <textarea value={value} rows={rows} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y" />
    </div>
  )
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-3">
      <h3 className="font-semibold text-gray-800">{title}</h3>
      {children}
    </div>
  )
}
function RemoveBtn({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="text-xs text-red-500 hover:text-red-700 font-medium shrink-0">Remove</button>
}
function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return <button type="button" onClick={onClick} className="text-xs text-green-700 hover:text-green-900 font-semibold">+ {label}</button>
}

export default function AdminContent() {
  const [c, setC] = useState<SiteContent | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    api.siteContent.get()
      .then(stored => setC(mergeContent(DEFAULT_CONTENT, stored)))
      .catch(() => setC(DEFAULT_CONTENT))
  }, [])

  // Immutable update via a mutable draft.
  const edit = (fn: (draft: SiteContent) => void) =>
    setC(prev => { const next = structuredClone(prev!); fn(next); return next })

  const save = async () => {
    if (!c) return
    setSaving(true); setStatus('idle'); setError('')
    try {
      await api.siteContent.save(c)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 3000)
    } catch (e: any) {
      setStatus('error'); setError(e?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!c) return <div className="text-sm text-gray-400">Loading…</div>

  return (
    <div className="max-w-3xl space-y-5 pb-24">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Public Website Content</h2>
          <p className="text-sm text-gray-500">Edit the landing page shown to the public before login.</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <a href="/" target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">View site ↗</a>
          {status === 'saved' && <span className="text-sm font-medium text-green-700">✓ Saved</span>}
          {status === 'error' && <span className="text-sm font-medium text-red-600">{error}</span>}
          <button onClick={save} disabled={saving}
            className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-5 py-2 rounded-lg transition disabled:opacity-50">
            {saving ? 'Saving…' : 'Save & Publish'}
          </button>
        </div>
      </div>

      {/* Hero */}
      <Section title="Hero">
        <Field label="Eyebrow (small text above title)" value={c.hero.eyebrow} onChange={v => edit(d => { d.hero.eyebrow = v })} />
        <Field label="Title" value={c.hero.title} onChange={v => edit(d => { d.hero.title = v })} />
        <Area label="Subtitle" value={c.hero.subtitle} onChange={v => edit(d => { d.hero.subtitle = v })} rows={2} />
      </Section>

      {/* Stats */}
      <Section title="Stats banner">
        {c.stats.map((s, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="w-28"><Field label="Value" value={s.value} onChange={v => edit(d => { d.stats[i].value = v })} /></div>
            <div className="flex-1"><Field label="Label" value={s.label} onChange={v => edit(d => { d.stats[i].label = v })} /></div>
            <div className="pb-2"><RemoveBtn onClick={() => edit(d => { d.stats.splice(i, 1) })} /></div>
          </div>
        ))}
        <AddBtn label="Add stat" onClick={() => edit(d => { d.stats.push({ value: '', label: '' }) })} />
      </Section>

      {/* About */}
      <Section title="About">
        <Field label="Heading" value={c.about.heading} onChange={v => edit(d => { d.about.heading = v })} />
        <label className="block text-xs font-medium text-gray-600">Paragraphs</label>
        {c.about.paragraphs.map((p, i) => (
          <div key={i} className="flex items-start gap-2">
            <textarea value={p} rows={3} onChange={e => edit(d => { d.about.paragraphs[i] = e.target.value })}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y" />
            <div className="pt-2"><RemoveBtn onClick={() => edit(d => { d.about.paragraphs.splice(i, 1) })} /></div>
          </div>
        ))}
        <AddBtn label="Add paragraph" onClick={() => edit(d => { d.about.paragraphs.push('') })} />

        <div className="border-t border-gray-100 pt-3">
          <Field label="Benefits box heading" value={c.about.benefitsHeading} onChange={v => edit(d => { d.about.benefitsHeading = v })} />
          <label className="block text-xs font-medium text-gray-600 mt-2 mb-1">Benefits (one per line, emoji allowed)</label>
          {c.about.benefits.map((b, i) => (
            <div key={i} className="flex items-center gap-2 mb-1.5">
              <input value={b} onChange={e => edit(d => { d.about.benefits[i] = e.target.value })}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <RemoveBtn onClick={() => edit(d => { d.about.benefits.splice(i, 1) })} />
            </div>
          ))}
          <AddBtn label="Add benefit" onClick={() => edit(d => { d.about.benefits.push('') })} />
        </div>
      </Section>

      {/* Facilities */}
      <Section title="Facilities">
        <Field label="Heading" value={c.facilities.heading} onChange={v => edit(d => { d.facilities.heading = v })} />
        {c.facilities.cards.map((f, i) => (
          <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2">
            <div className="flex items-end gap-2">
              <div className="w-20"><Field label="Icon" value={f.icon} onChange={v => edit(d => { d.facilities.cards[i].icon = v })} /></div>
              <div className="flex-1"><Field label="Title" value={f.title} onChange={v => edit(d => { d.facilities.cards[i].title = v })} /></div>
              <div className="pb-2"><RemoveBtn onClick={() => edit(d => { d.facilities.cards.splice(i, 1) })} /></div>
            </div>
            <Area label="Description" value={f.desc} onChange={v => edit(d => { d.facilities.cards[i].desc = v })} rows={2} />
          </div>
        ))}
        <AddBtn label="Add facility" onClick={() => edit(d => { d.facilities.cards.push({ icon: '🎾', title: '', desc: '' }) })} />
      </Section>

      {/* Coaching */}
      <Section title="Coaching">
        <Field label="Heading" value={c.coaching.heading} onChange={v => edit(d => { d.coaching.heading = v })} />
        <Field label="Intro" value={c.coaching.intro} onChange={v => edit(d => { d.coaching.intro = v })} />
        {c.coaching.programs.map((p, i) => (
          <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2">
            <div className="flex items-end gap-2">
              <div className="flex-1"><Field label="Program title" value={p.title} onChange={v => edit(d => { d.coaching.programs[i].title = v })} /></div>
              <div className="pb-2"><RemoveBtn onClick={() => edit(d => { d.coaching.programs.splice(i, 1) })} /></div>
            </div>
            <Area label="Description" value={p.desc} onChange={v => edit(d => { d.coaching.programs[i].desc = v })} rows={2} />
          </div>
        ))}
        <AddBtn label="Add program" onClick={() => edit(d => { d.coaching.programs.push({ title: '', desc: '' }) })} />
        <div className="border-t border-gray-100 pt-3">
          <Field label="Coaching inquiries email" value={c.coaching.contactEmail} onChange={v => edit(d => { d.coaching.contactEmail = v })} />
        </div>
      </Section>

      {/* CTA */}
      <Section title="Join / Waitlist banner">
        <Field label="Heading" value={c.cta.heading} onChange={v => edit(d => { d.cta.heading = v })} />
        <Area label="Text" value={c.cta.text} onChange={v => edit(d => { d.cta.text = v })} rows={2} />
      </Section>

      {/* Contact */}
      <Section title="Contact">
        <Area label="Address (line breaks preserved)" value={c.contact.address} onChange={v => edit(d => { d.contact.address = v })} rows={2} />
        <Field label="Phone" value={c.contact.phone} onChange={v => edit(d => { d.contact.phone = v })} />
        <Field label="Email" value={c.contact.email} onChange={v => edit(d => { d.contact.email = v })} />
      </Section>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-end gap-3 z-30">
        {status === 'saved' && <span className="text-sm font-medium text-green-700">✓ Saved — live on the public site</span>}
        {status === 'error' && <span className="text-sm font-medium text-red-600">{error}</span>}
        <button onClick={save} disabled={saving}
          className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-6 py-2 rounded-lg transition disabled:opacity-50">
          {saving ? 'Saving…' : 'Save & Publish'}
        </button>
      </div>
    </div>
  )
}
