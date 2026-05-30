import { useState } from 'react'

interface Product {
  id: string
  name: string
  description: string
  price: number
  category: 'drinks' | 'balls'
  emoji: string
}

const PRODUCTS: Product[] = [
  // Drinks
  { id: 'water',        category: 'drinks', emoji: '💧', name: 'Water',             description: 'Bottled water, 16.9 oz',         price: 1.50 },
  { id: 'sports',       category: 'drinks', emoji: '🥤', name: 'Sports Drink',      description: 'Gatorade, assorted flavors',     price: 2.50 },
  { id: 'soda',         category: 'drinks', emoji: '🥫', name: 'Soda',              description: 'Coke, Diet Coke, or Sprite',     price: 2.00 },
  { id: 'energy',       category: 'drinks', emoji: '⚡', name: 'Energy Drink',      description: 'Red Bull, 8.4 oz',               price: 3.50 },
  // Balls
  { id: 'balls_penn',   category: 'balls',  emoji: '🎾', name: 'Penn Championship', description: 'Regular duty, can of 3',         price: 5.00 },
  { id: 'balls_wilson', category: 'balls',  emoji: '🎾', name: 'Wilson US Open',    description: 'Extra duty, can of 3',           price: 5.50 },
]

export default function ProShop() {
  const [cart, setCart] = useState<Record<string, number>>({})

  const setQty = (id: string, qty: number) =>
    setCart(c => qty <= 0 ? (({ [id]: _, ...rest }) => rest)(c) : { ...c, [id]: qty })

  const cartItems = PRODUCTS.filter(p => (cart[p.id] ?? 0) > 0)
  const total = cartItems.reduce((sum, p) => sum + p.price * cart[p.id], 0)
  const itemCount = Object.values(cart).reduce((a, b) => a + b, 0)

  const drinks = PRODUCTS.filter(p => p.category === 'drinks')
  const balls  = PRODUCTS.filter(p => p.category === 'balls')

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

      <div className="space-y-8">
        <Section title="Drinks">
          {drinks.map(p => <ProductCard key={p.id} product={p} qty={cart[p.id] ?? 0} onChange={qty => setQty(p.id, qty)} />)}
        </Section>

        <Section title="Balls">
          {balls.map(p => <ProductCard key={p.id} product={p} qty={cart[p.id] ?? 0} onChange={qty => setQty(p.id, qty)} />)}
        </Section>
      </div>

      {/* Cart summary */}
      {cartItems.length > 0 && (
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
          <button
            disabled
            className="w-full bg-gray-100 text-gray-400 font-semibold py-3 rounded-lg text-sm cursor-not-allowed"
          >
            Checkout — Coming Soon
          </button>
          <p className="text-xs text-gray-400 text-center mt-2">
            Online purchasing will be available soon. Items can be purchased at the clubhouse.
          </p>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-700 mb-3">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {children}
      </div>
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
            <button
              onClick={() => onChange(qty - 1)}
              className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-base flex items-center justify-center transition"
            >
              −
            </button>
            <span className="w-5 text-center text-sm font-semibold text-gray-800">{qty}</span>
            <button
              onClick={() => onChange(qty + 1)}
              className="w-7 h-7 rounded-full bg-green-700 hover:bg-green-800 text-white font-bold text-base flex items-center justify-center transition"
            >
              +
            </button>
          </>
        ) : (
          <button
            onClick={() => onChange(1)}
            className="px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white text-xs font-semibold rounded-lg transition"
          >
            Add
          </button>
        )}
      </div>
    </div>
  )
}
