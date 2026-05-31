import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

// Kiosk is a public page — it must never be subject to session timeouts.
// On mount we clear any active login so the idle timer in AuthContext can't fire.

type Step = 'welcome' | 'member' | 'shop' | 'confirm' | 'done'

interface Member { id: string; name: string; member_number: number }
interface Item   { id: string; name: string; description: string; price: number; category: string; emoji: string; in_stock: boolean }
interface CartItem { item: Item; qty: number }

const RESET_SECONDS = 8

function avatarInitials(name: string) {
  return name.split(' ').map(n => n[0] ?? '').join('').slice(0, 2).toUpperCase()
}

export default function KioskProShop() {
  const [step, setStep]           = useState<Step>('welcome')
  const [members, setMembers]     = useState<Member[]>([])
  const [items, setItems]         = useState<Item[]>([])
  const [search, setSearch]       = useState('')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [cart, setCart]           = useState<CartItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [receipt, setReceipt]     = useState<{ member_name: string; grand_total: number } | null>(null)
  const [countdown, setCountdown] = useState(RESET_SECONDS)
  const [kioskEnabled, setKioskEnabled] = useState<boolean | null>(null) // null = loading
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Immediately clear any active session so auto-logout can never affect this page.
    // Fire-and-forget — kiosk endpoints are all public.
    api.auth.logout().catch(() => {})

    // Check whether the kiosk is enabled in admin settings.
    fetch('/api/session-config')
      .then(r => r.json())
      .then((d: any) => setKioskEnabled(d.kiosk_enabled !== 'false'))
      .catch(() => setKioskEnabled(true))

    api.kiosk.members().then(d => setMembers(d))
    api.kiosk.items().then(d => setItems(d.filter(i => i.in_stock)))
  }, [])

  const reset = useCallback(() => {
    setStep('welcome')
    setSearch('')
    setSelectedMember(null)
    setCart([])
    setReceipt(null)
    setCountdown(RESET_SECONDS)
  }, [])

  // Auto-reset countdown on 'done' screen
  useEffect(() => {
    if (step !== 'done') return
    setCountdown(RESET_SECONDS)
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(interval); reset(); return RESET_SECONDS }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [step, reset])

  // Focus search when member step opens
  useEffect(() => {
    if (step === 'member') setTimeout(() => searchRef.current?.focus(), 100)
  }, [step])

  const filteredMembers = search.length >= 1
    ? members.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
    : members

  const cartTotal = cart.reduce((s, ci) => s + ci.item.price * ci.qty, 0)
  const cartCount = cart.reduce((s, ci) => s + ci.qty, 0)

  const changeQty = (item: Item, delta: number) => {
    setCart(prev => {
      const existing = prev.find(ci => ci.item.id === item.id)
      if (!existing) {
        if (delta > 0) return [...prev, { item, qty: 1 }]
        return prev
      }
      const newQty = existing.qty + delta
      if (newQty <= 0) return prev.filter(ci => ci.item.id !== item.id)
      return prev.map(ci => ci.item.id === item.id ? { ...ci, qty: newQty } : ci)
    })
  }

  const getQty = (itemId: string) => cart.find(ci => ci.item.id === itemId)?.qty ?? 0

  const handleConfirm = async () => {
    if (!selectedMember || cart.length === 0) return
    setSubmitting(true)
    try {
      const result = await api.kiosk.purchase({
        user_id: selectedMember.id,
        items: cart.map(ci => ({
          item_id: ci.item.id,
          item_name: ci.item.name,
          price: ci.item.price,
          quantity: ci.qty,
        })),
      })
      setReceipt({ member_name: result.member_name, grand_total: result.grand_total })
      setStep('done')
    } catch {
      // On error stay on confirm and let them retry
    } finally {
      setSubmitting(false)
    }
  }

  // ─── LOADING / DISABLED ──────────────────────────────────────────────────
  if (kioskEnabled === null) return (
    <div className="min-h-screen bg-green-700 flex items-center justify-center">
      <div className="text-4xl animate-pulse">🎾</div>
    </div>
  )

  if (!kioskEnabled) return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="text-6xl">🔒</div>
      <h1 className="text-3xl font-bold text-gray-700">Kiosk Unavailable</h1>
      <p className="text-gray-500 text-lg max-w-sm">
        The pro shop kiosk is temporarily disabled. Please see a staff member for assistance.
      </p>
    </div>
  )

  // ─── WELCOME ─────────────────────────────────────────────────────────────
  if (step === 'welcome') return (
    <div className="min-h-screen bg-green-700 flex flex-col items-center justify-center gap-8 select-none"
      onClick={() => setStep('member')}>
      <div className="text-center space-y-4">
        <div className="text-8xl">🎾</div>
        <h1 className="text-5xl font-bold text-white tracking-tight">Pro Shop</h1>
        <p className="text-green-200 text-2xl font-medium">Liveoaks Tennis Club</p>
      </div>
      <div className="bg-white/20 rounded-3xl px-10 py-5 text-white text-xl font-semibold animate-pulse">
        Tap anywhere to start
      </div>
    </div>
  )

  // ─── MEMBER SELECTION ────────────────────────────────────────────────────
  if (step === 'member') return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-green-700 text-white px-6 py-5 flex items-center gap-4">
        <button onClick={reset}
          className="text-green-200 hover:text-white transition text-2xl leading-none">←</button>
        <div>
          <h1 className="text-2xl font-bold">Who are you?</h1>
          <p className="text-green-200 text-sm">Select your name to continue</p>
        </div>
      </div>

      <div className="px-4 py-4 sticky top-0 bg-gray-50 z-10 shadow-sm">
        <input ref={searchRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Type your name…"
          className="w-full border-2 border-gray-300 focus:border-green-500 rounded-2xl px-5 py-4 text-xl focus:outline-none bg-white" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {filteredMembers.length === 0 ? (
          <p className="text-center text-gray-400 py-10 text-lg">No members found — try a different name.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
            {filteredMembers.map(m => (
              <button key={m.id}
                onClick={() => { setSelectedMember(m); setCart([]); setStep('shop') }}
                className="bg-white border-2 border-gray-200 hover:border-green-500 active:bg-green-50 rounded-2xl p-4 text-left transition flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-green-700 text-white flex items-center justify-center font-bold text-lg shrink-0">
                  {avatarInitials(m.name)}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800 text-base leading-tight truncate">{m.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">#{m.member_number}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // ─── SHOP ────────────────────────────────────────────────────────────────
  if (step === 'shop') {
    const categories = [...new Set(items.map(i => i.category))]
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header */}
        <div className="bg-green-700 text-white px-6 py-4 flex items-center gap-4">
          <button onClick={() => setStep('member')}
            className="text-green-200 hover:text-white transition text-2xl leading-none">←</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">Hi, {selectedMember?.name.split(' ')[0]}!</h1>
            <p className="text-green-200 text-sm">Choose what you'd like</p>
          </div>
          {cartCount > 0 && (
            <button onClick={() => setStep('confirm')}
              className="relative bg-white text-green-800 font-bold px-5 py-2.5 rounded-2xl text-sm flex items-center gap-2 hover:bg-green-50 transition shrink-0">
              🛒 {cartCount} item{cartCount !== 1 ? 's' : ''}
              <span className="font-semibold">${cartTotal.toFixed(2)}</span>
            </button>
          )}
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-4 pb-24 pt-4 space-y-6">
          {categories.map(cat => {
            const catItems = items.filter(i => i.category === cat)
            if (catItems.length === 0) return null
            return (
              <div key={cat}>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1 capitalize">{cat}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {catItems.map(item => {
                    const qty = getQty(item.id)
                    return (
                      <div key={item.id}
                        className={`bg-white rounded-2xl border-2 transition ${qty > 0 ? 'border-green-400 shadow-md' : 'border-gray-100'}`}>
                        <div className="p-4">
                          <div className="text-4xl mb-2">{item.emoji}</div>
                          <p className="font-semibold text-gray-800 leading-tight">{item.name}</p>
                          {item.description && <p className="text-xs text-gray-400 mt-0.5 leading-tight">{item.description}</p>}
                          <p className="text-green-700 font-bold text-lg mt-2">${item.price.toFixed(2)}</p>
                        </div>
                        <div className="border-t border-gray-100 px-4 py-3 flex items-center gap-3">
                          {qty === 0 ? (
                            <button onClick={() => changeQty(item, 1)}
                              className="w-full bg-green-700 hover:bg-green-800 active:bg-green-900 text-white font-semibold py-2.5 rounded-xl transition text-sm">
                              + Add
                            </button>
                          ) : (
                            <>
                              <button onClick={() => changeQty(item, -1)}
                                className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xl flex items-center justify-center transition">
                                −
                              </button>
                              <span className="flex-1 text-center font-bold text-gray-800 text-lg">{qty}</span>
                              <button onClick={() => changeQty(item, 1)}
                                className="w-10 h-10 rounded-xl bg-green-700 hover:bg-green-800 text-white font-bold text-xl flex items-center justify-center transition">
                                +
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Sticky checkout bar */}
        {cartCount > 0 && (
          <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-gradient-to-t from-gray-50 via-gray-50">
            <button onClick={() => setStep('confirm')}
              className="w-full bg-green-700 hover:bg-green-800 text-white font-bold py-5 rounded-2xl text-xl transition flex items-center justify-between px-6 shadow-xl">
              <span>Review Order</span>
              <span>${cartTotal.toFixed(2)}</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  // ─── CONFIRM ─────────────────────────────────────────────────────────────
  if (step === 'confirm') return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-green-700 text-white px-6 py-4 flex items-center gap-4">
        <button onClick={() => setStep('shop')}
          className="text-green-200 hover:text-white transition text-2xl leading-none">←</button>
        <div>
          <h1 className="text-xl font-bold">Confirm Order</h1>
          <p className="text-green-200 text-sm">{selectedMember?.name}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-3 max-w-lg mx-auto w-full">
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          {cart.map((ci, i) => (
            <div key={ci.item.id} className={`flex items-center gap-4 px-4 py-3.5 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
              <span className="text-3xl shrink-0">{ci.item.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">{ci.item.name}</p>
                <p className="text-sm text-gray-400">${ci.item.price.toFixed(2)} × {ci.qty}</p>
              </div>
              <p className="font-bold text-gray-800 shrink-0">${(ci.item.price * ci.qty).toFixed(2)}</p>
            </div>
          ))}
          <div className="border-t-2 border-gray-200 flex items-center justify-between px-4 py-4 bg-gray-50">
            <span className="font-bold text-gray-700 text-lg">Total</span>
            <span className="font-bold text-green-700 text-2xl">${cartTotal.toFixed(2)}</span>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 text-sm text-blue-700">
          This will be added to <strong>{selectedMember?.name}</strong>'s account. No payment is collected at this time.
        </div>
      </div>

      <div className="px-4 pb-8 pt-3 max-w-lg mx-auto w-full space-y-3">
        <button onClick={handleConfirm} disabled={submitting}
          className="w-full bg-green-700 hover:bg-green-800 active:bg-green-900 disabled:opacity-50 text-white font-bold py-5 rounded-2xl text-xl transition shadow-xl">
          {submitting ? 'Processing…' : 'Confirm Purchase'}
        </button>
        <button onClick={() => setStep('shop')}
          className="w-full bg-white border-2 border-gray-200 text-gray-600 font-semibold py-4 rounded-2xl text-lg transition hover:bg-gray-50">
          ← Back to Shop
        </button>
      </div>
    </div>
  )

  // ─── DONE ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-green-700 flex flex-col items-center justify-center gap-8 px-6 text-center select-none">
      <div className="space-y-4">
        <div className="text-7xl">✅</div>
        <h1 className="text-4xl font-bold text-white">All set, {receipt?.member_name.split(' ')[0]}!</h1>
        <p className="text-green-200 text-xl">
          ${receipt?.grand_total.toFixed(2)} added to your account.
        </p>
        <p className="text-green-300 text-sm">A staff member will reconcile this on your next bill.</p>
      </div>

      <div className="bg-white/20 rounded-3xl px-8 py-4 text-white font-semibold text-lg space-y-1">
        <p>Returning to home in {countdown}s</p>
        <div className="w-full bg-white/20 rounded-full h-2 mt-2">
          <div className="bg-white h-2 rounded-full transition-all duration-1000"
            style={{ width: `${(countdown / RESET_SECONDS) * 100}%` }} />
        </div>
      </div>

      <button onClick={reset}
        className="bg-white/20 hover:bg-white/30 text-white font-semibold px-8 py-4 rounded-2xl text-lg transition">
        Done — Next Customer →
      </button>
    </div>
  )
}
