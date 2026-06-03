import { useEffect, useRef, useState } from 'react'
import { api, TaxDocument, TaxContractor } from '../../api/client'

type Tab = 'documents' | 'contractors' | 'sales' | 'exempt'
const TABS: { key: Tab; label: string }[] = [
  { key: 'documents', label: 'Documents' },
  { key: 'contractors', label: '1099 Contractors' },
  { key: 'sales', label: 'Sales Tax' },
  { key: 'exempt', label: 'Tax-Exempt Status' },
]

const fmtMoney = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const thisYear = new Date().getFullYear()

export default function AdminTaxes() {
  const [tab, setTab] = useState<Tab>('documents')
  const [docs, setDocs] = useState<TaxDocument[]>([])
  const [contractors, setContractors] = useState<TaxContractor[]>([])
  const [settings, setSettings] = useState({ ein: '', sales_tax_rate: '0' })

  const loadDocs = () => api.tax.documents.list().then(setDocs).catch(() => {})
  const loadContractors = () => api.tax.contractors.list().then(setContractors).catch(() => {})
  const loadSettings = () => api.tax.settings.get().then(setSettings).catch(() => {})

  useEffect(() => { loadDocs(); loadContractors(); loadSettings() }, [])

  return (
    <div className="max-w-4xl">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Taxes</h2>
      <div className="flex gap-1 mb-5 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${tab === t.key ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'documents' && (
        <Documents docs={docs.filter(d => d.category !== 'exemption')} reload={loadDocs}
          categories={[['filing', 'Tax filing / return'], ['other', 'Other']]} defaultCategory="filing" />
      )}
      {tab === 'contractors' && (
        <Contractors contractors={contractors} reload={loadContractors} />
      )}
      {tab === 'sales' && (
        <SalesTax settings={settings} setSettings={setSettings} />
      )}
      {tab === 'exempt' && (
        <Exempt settings={settings} setSettings={setSettings}
          docs={docs.filter(d => d.category === 'exemption')} reload={loadDocs} />
      )}
    </div>
  )
}

// ── Documents (reused for filings and exemption letters) ─────────────────────
function Documents({ docs, reload, categories, defaultCategory }: {
  docs: TaxDocument[]; reload: () => void
  categories: [string, string][]; defaultCategory: string
}) {
  const [label, setLabel] = useState('')
  const [category, setCategory] = useState(defaultCategory)
  const [year, setYear] = useState<string>(String(thisYear))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    const file = fileRef.current?.files?.[0]
    if (!label.trim()) { setErr('Label is required'); return }
    if (!file) { setErr('Choose a file'); return }
    const form = new FormData()
    form.set('label', label.trim())
    form.set('category', category)
    if (year) form.set('tax_year', year)
    form.set('file', file)
    setBusy(true)
    try {
      await api.tax.documents.upload(form)
      setLabel(''); if (fileRef.current) fileRef.current.value = ''
      reload()
    } catch (e: any) { setErr(e?.message ?? 'Upload failed') }
    finally { setBusy(false) }
  }

  const del = async (d: TaxDocument) => {
    if (!confirm(`Delete "${d.label}"?`)) return
    await api.tax.documents.delete(d.id); reload()
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
        <div className="sm:col-span-5">
          <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. 2025 Form 990"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        {categories.length > 1 && (
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
              {categories.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        )}
        <div className={categories.length > 1 ? 'sm:col-span-2' : 'sm:col-span-3'}>
          <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
          <input value={year} onChange={e => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2025"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div className="sm:col-span-12 flex items-center gap-3">
          <input ref={fileRef} type="file" className="text-sm flex-1" />
          <button type="submit" disabled={busy}
            className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-5 py-2 rounded-lg transition disabled:opacity-50 shrink-0">
            {busy ? 'Uploading…' : 'Upload'}
          </button>
        </div>
        {err && <p className="sm:col-span-12 text-xs text-red-600">{err}</p>}
      </form>

      {docs.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-10">No documents yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100">
          {docs.map(d => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-lg">📄</span>
              <div className="flex-1 min-w-0">
                <a href={`/uploads/tax-documents/${d.filename}`} target="_blank" rel="noreferrer"
                  className="text-sm font-medium text-gray-800 hover:text-green-700 truncate block">{d.label}</a>
                <p className="text-xs text-gray-400">
                  {d.tax_year ? `${d.tax_year} · ` : ''}{d.original_name}{d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ''}
                </p>
              </div>
              <button onClick={() => del(d)} className="text-xs text-red-500 hover:text-red-700 font-medium shrink-0">Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 1099 contractors ─────────────────────────────────────────────────────────
const emptyContractor = (): Partial<TaxContractor> => ({
  tax_year: thisYear, name: '', amount_paid: 0, w9_received: false, form_1099_sent: false, notes: '',
})

function Contractors({ contractors, reload }: { contractors: TaxContractor[]; reload: () => void }) {
  const [form, setForm] = useState<Partial<TaxContractor> | null>(null)
  const [busy, setBusy] = useState(false)
  const setF = (p: Partial<TaxContractor>) => setForm(f => ({ ...f, ...p }))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form?.name?.trim() || !form.tax_year) return
    setBusy(true)
    try {
      if (form.id) await api.tax.contractors.update(form.id, form)
      else await api.tax.contractors.create(form)
      setForm(null); reload()
    } catch (e: any) { alert(e?.message ?? 'Save failed') }
    finally { setBusy(false) }
  }
  const toggle = async (ct: TaxContractor, patch: Partial<TaxContractor>) => {
    await api.tax.contractors.update(ct.id, { ...ct, ...patch }); reload()
  }
  const del = async (ct: TaxContractor) => {
    if (!confirm(`Delete ${ct.name}?`)) return
    await api.tax.contractors.delete(ct.id); reload()
  }

  const flagged = contractors.filter(c => c.amount_paid >= 600 && !c.form_1099_sent).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Track contractors paid during the year. {flagged > 0 && <span className="text-amber-700 font-medium">{flagged} at/over $600 still need a 1099.</span>}
        </p>
        {!form && <button onClick={() => setForm(emptyContractor())} className="bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-green-800 shrink-0">+ Add contractor</button>}
      </div>

      {form && (
        <form onSubmit={save} className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 grid grid-cols-2 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
            <input value={form.tax_year ?? ''} onChange={e => setF({ tax_year: parseInt(e.target.value.replace(/\D/g, '')) || 0 })}
              className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="sm:col-span-5">
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input value={form.name ?? ''} onChange={e => setF({ name: e.target.value })} placeholder="Contractor or vendor"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount paid ($)</label>
            <input type="number" step="0.01" value={form.amount_paid ?? 0} onChange={e => setF({ amount_paid: parseFloat(e.target.value) || 0 })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="sm:col-span-2 flex flex-col gap-1 pb-1 text-xs text-gray-600">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.w9_received ?? false} onChange={e => setF({ w9_received: e.target.checked })} className="accent-green-600" /> W-9</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.form_1099_sent ?? false} onChange={e => setF({ form_1099_sent: e.target.checked })} className="accent-green-600" /> 1099 sent</label>
          </div>
          <div className="col-span-2 sm:col-span-10">
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <input value={form.notes ?? ''} onChange={e => setF({ notes: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="col-span-2 flex gap-2 justify-end">
            <button type="button" onClick={() => setForm(null)} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={busy} className="bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-800 disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      )}

      {contractors.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-10">No contractors recorded.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Year</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-right">Paid</th>
                <th className="px-3 py-2 text-center">W-9</th>
                <th className="px-3 py-2 text-center">1099</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contractors.map(ct => (
                <tr key={ct.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-500">{ct.tax_year}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">{ct.name}{ct.notes && <span className="block text-xs text-gray-400 font-normal">{ct.notes}</span>}</td>
                  <td className={`px-3 py-2 text-right ${ct.amount_paid >= 600 && !ct.form_1099_sent ? 'text-amber-700 font-semibold' : 'text-gray-700'}`}>{fmtMoney(ct.amount_paid)}</td>
                  <td className="px-3 py-2 text-center"><input type="checkbox" checked={ct.w9_received} onChange={e => toggle(ct, { w9_received: e.target.checked })} className="accent-green-600" /></td>
                  <td className="px-3 py-2 text-center"><input type="checkbox" checked={ct.form_1099_sent} onChange={e => toggle(ct, { form_1099_sent: e.target.checked })} className="accent-green-600" /></td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => setForm({ ...ct })} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium mr-2">Edit</button>
                    <button onClick={() => del(ct)} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Sales tax ────────────────────────────────────────────────────────────────
function SalesTax({ settings, setSettings }: { settings: { ein: string; sales_tax_rate: string }; setSettings: (s: { ein: string; sales_tax_rate: string }) => void }) {
  const [start, setStart] = useState(`${thisYear}-01-01`)
  const [end, setEnd] = useState(`${thisYear}-12-31`)
  const [result, setResult] = useState<{ taxable_sales: number; rate: number; tax_collected: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [rate, setRate] = useState(settings.sales_tax_rate)
  const [savedRate, setSavedRate] = useState(false)

  useEffect(() => { setRate(settings.sales_tax_rate) }, [settings.sales_tax_rate])

  const saveRate = async () => {
    await api.tax.settings.save({ ein: settings.ein, sales_tax_rate: rate })
    setSettings({ ...settings, sales_tax_rate: rate })
    setSavedRate(true); setTimeout(() => setSavedRate(false), 2000)
  }
  const compute = async () => {
    setBusy(true)
    try { setResult(await api.tax.salesSummary(start, end)) }
    catch (e: any) { alert(e?.message ?? 'Failed') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Sales-tax rate (%)</label>
          <input value={rate} onChange={e => setRate(e.target.value)} className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <button onClick={saveRate} className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg">Save rate</button>
        {savedRate && <span className="text-sm text-green-700 font-medium">✓ Saved</span>}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input type="date" value={start} onChange={e => setStart(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <button onClick={compute} disabled={busy} className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-50">{busy ? 'Computing…' : 'Compute'}</button>
      </div>

      {result && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">Taxable sales</div>
            <div className="text-2xl font-bold text-gray-800 mt-1">{fmtMoney(result.taxable_sales)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">Rate</div>
            <div className="text-2xl font-bold text-gray-800 mt-1">{result.rate}%</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">Tax collected</div>
            <div className="text-2xl font-bold text-green-700 mt-1">{fmtMoney(result.tax_collected)}</div>
          </div>
        </div>
      )}
      <p className="text-xs text-gray-400">Taxable sales are totaled from Pro Shop / kiosk purchases over the selected dates.</p>
    </div>
  )
}

// ── Tax-exempt status ────────────────────────────────────────────────────────
function Exempt({ settings, setSettings, docs, reload }: {
  settings: { ein: string; sales_tax_rate: string }; setSettings: (s: { ein: string; sales_tax_rate: string }) => void
  docs: TaxDocument[]; reload: () => void
}) {
  const [ein, setEin] = useState(settings.ein)
  const [saved, setSaved] = useState(false)
  useEffect(() => { setEin(settings.ein) }, [settings.ein])

  const saveEin = async () => {
    await api.tax.settings.save({ ein, sales_tax_rate: settings.sales_tax_rate })
    setSettings({ ...settings, ein })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">EIN (Employer Identification Number)</label>
          <input value={ein} onChange={e => setEin(e.target.value)} placeholder="95-XXXXXXX"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <button onClick={saveEin} className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-5 py-2 rounded-lg">Save</button>
        {saved && <span className="text-sm text-green-700 font-medium">✓ Saved</span>}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Exemption documents</h3>
        <Documents docs={docs} reload={reload} categories={[['exemption', 'Exemption document']]} defaultCategory="exemption" />
      </div>
    </div>
  )
}
