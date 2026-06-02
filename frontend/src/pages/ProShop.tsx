import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface Product {
  id: string
  name: string
  description: string
  price: number
  category: string
  emoji: string
  in_stock: boolean
  sort_order: number
}

export default function ProShop() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [ordered, setOrdered] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()

  useEffect(() => {
    api.proShop.list()
      .then(d => setProducts(d as Product[]))
      .finally(() => setLoading(false))
  }, [])

  const setQty = (id: string, qty: number) =>
    setCart(c => qty <= 0 ? (({ [id]: _, ...rest }) => rest)(c) : { ...c, [id]: qty })

  const cartItems = products.filter(p => (cart[p.id] ?? 0) > 0)
  const total = cartItems.reduce((sum, p) => sum + p.price * cart[p.id], 0)
  const itemCount = Object.values(cart).reduce((a, b) => a + b, 0)

  const placeOrder = async () => {
    if (!user || cartItems.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      await api.kiosk.purchase({
        user_id: user.id,
        items: cartItems.map(p => ({
          item_id: p.id,
          item_name: p.name,
          price: p.price,
          quantity: cart[p.id],
        })),
      })
      setCart({})
      setOrdered(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to place order')
    } finally {
      setSubmitting(false)
    }
  }

  const categories = [...new Set(products.map(p => p.category))]

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Pro Shop</h1>
          <p className="text-gray-500 text-sm mt-0.5">Drinks and balls available at the clubhouse</p>
        </div>
        {itemCount > 0 && (
          <div className="bg-green-100 text-green-800 text-sm font-semibold px-4 py-2 rounded-full">
            {itemCount} item{itemCount !== 1 ? 's' : ''} in cart
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : products.length === 0 ? (
        <p className="text-gray-400 text-sm">No items available right now.</p>
      ) : (
        <div className="space-y-8">
          {categories.map(cat => {
            const items = products.filter(p => p.category === cat)
            const label = cat.charAt(0).toUpperCase() + cat.slice(1)
            return (
              <div key={cat}>
                <h2 className="text-lg font-semibold text-gray-700 mb-3">{label}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {items.map(p => (
                    <ProductCard key={p.id} product={p} qty={cart[p.id] ?? 0} onChange={qty => setQty(p.id, qty)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {ordered && (
        <div className="mt-8 bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <p className="text-green-800 font-semibold text-base mb-1">Order recorded!</p>
          <p className="text-green-700 text-sm">Your purchase will be added to your quarterly due invoice.</p>
          <button
            onClick={() => setOrdered(false)}
            className="mt-4 text-xs text-green-700 underline"
          >
            Place another order
          </button>
        </div>
      )}

      {!ordered && cartItems.length > 0 && (
        <div className="mt-8 bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Order Summary</h2>
          <div className="space-y-2 mb-4">
            {cartItems.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  {p.emoji} {p.name}
                  <span className="text-gray-400 ml-1">× {cart[p.id]}</span>
                </span>
                <span className="font-medium text-gray-800">${(p.price * cart[p.id]).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 pt-3 mb-5">
            <span className="font-semibold text-gray-800">Total</span>
            <span className="text-lg font-bold text-gray-900">${total.toFixed(2)}</span>
          </div>
          {error && (
            <p className="text-sm text-red-600 mb-3">{error}</p>
          )}
          <button
            onClick={placeOrder}
            disabled={submitting}
            className="w-full py-3 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white font-semibold rounded-xl transition"
          >
            {submitting ? 'Placing order…' : 'Place Order'}
          </button>
          <p className="text-xs text-gray-400 text-center mt-3">
            This will be added to your quarterly due invoice — no payment is collected now.
          </p>
        </div>
      )}
    </div>
  )
}

function ProductCard({ product, qty, onChange }: { product: Product; qty: number; onChange: (qty: number) => void }) {
  return (
    <div className={`bg-white border rounded-xl p-4 shadow-sm flex items-center gap-4 transition ${qty > 0 ? 'border-green-300' : 'border-gray-200'}`}>
      <div className="text-3xl w-10 text-center shrink-0">{product.emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-800 text-sm">{product.name}</div>
        <div className="text-xs text-gray-500 truncate">{product.description}</div>
        <div className="text-sm font-bold text-green-700 mt-0.5">${product.price.toFixed(2)}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {qty > 0 ? (
          <>
            <button onClick={() => onChange(qty - 1)}
              className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-base flex items-center justify-center transition">−</button>
            <span className="w-5 text-center text-sm font-semibold text-gray-800">{qty}</span>
            <button onClick={() => onChange(qty + 1)}
              className="w-7 h-7 rounded-full bg-green-700 hover:bg-green-800 text-white font-bold text-base flex items-center justify-center transition">+</button>
          </>
        ) : (
          <button onClick={() => onChange(1)}
            className="px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white text-xs font-semibold rounded-lg transition">
            Add
          </button>
        )}
      </div>
    </div>
  )
}
