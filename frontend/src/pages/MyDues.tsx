import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

const ZELLE_EMAIL = 'billing@liveoakstennis.com'
const ZELLE_NAME = 'Live Oaks Tennis'
const ZELLE_QR_URL = `https://enroll.zellepay.com/qr-codes?data=${btoa(JSON.stringify({ name: ZELLE_NAME, token: ZELLE_EMAIL, type: 'EMAIL' }))}`
const CHECK_PAYABLE_TO = 'Live Oaks Tennis Association'
const CHECK_ADDRESS = '1500 Oak Meadow Lane\nSouth Pasadena, CA 91030'

interface Due { id: string; amount: number; due_date: string; paid_at?: string; status: string }
type PayMethod = 'zelle' | 'check' | 'stripe'

function StripeForm({ clientSecret, onSuccess, onBack }: { clientSecret: string; onSuccess: () => void; onBack: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setLoading(true)
    setError(null)
    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    })
    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed')
      setLoading(false)
    } else {
      onSuccess()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || loading}
        className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition"
      >
        {loading ? 'Processing…' : 'Pay Now'}
      </button>
      <button type="button" onClick={onBack} className="text-xs text-indigo-600 hover:underline w-full text-center">← Back</button>
    </form>
  )
}

export default function MyDues() {
  const [dues, setDues] = useState<Due[]>([])
  const [payFor, setPayFor] = useState<Due | null>(null)
  const [payMethod, setPayMethod] = useState<PayMethod | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [stripePaid, setStripePaid] = useState(false)
  const { user } = useAuth()

  useEffect(() => { api.dues.myDues().then(d => setDues(d as Due[])) }, [])

  useEffect(() => {
    api.stripe.getConfig().then(cfg => {
      if (cfg.publishable_key) setStripePromise(loadStripe(cfg.publishable_key))
    })
  }, [])

  const openStripe = async (due: Due) => {
    setClientSecret(null)
    setStripePaid(false)
    setPayMethod('stripe')
    const { client_secret } = await api.stripe.createPaymentIntent(due.id)
    setClientSecret(client_secret)
  }

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const statusColor: Record<string, string> = {
    paid: 'bg-green-100 text-green-700',
    unpaid: 'bg-yellow-100 text-yellow-700',
    waived: 'bg-gray-100 text-gray-500',
  }

  const memo = `Dues – ${user ? `${user.first_name} ${user.last_name}` : ''}`

  const closeModal = () => { setPayFor(null); setPayMethod(null); setCopied(null); setClientSecret(null); setStripePaid(false) }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">My Dues</h1>
      {dues.length === 0 ? (
        <p className="text-gray-400 text-sm">No dues on record.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Due Date</th>
                <th className="px-4 py-3 text-left">Amount</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Paid</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dues.map(d => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{new Date(d.due_date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-medium">${d.amount.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[d.status]}`}>{d.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{d.paid_at ? new Date(d.paid_at).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3">
                    {d.status === 'unpaid' && (
                      <button
                        onClick={() => { setPayFor(d); setPayMethod(null); setCopied(null) }}
                        className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium px-3 py-1.5 rounded-lg transition"
                      >
                        Pay
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {payFor && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-5">
              <h2 className="text-base font-bold text-gray-800">
                {payMethod === 'zelle' ? 'Pay with Zelle' : payMethod === 'check' ? 'Send a Check' : payMethod === 'stripe' ? 'Pay by Card' : 'Choose Payment Method'}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            {!payMethod && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 mb-4">How would you like to pay <span className="font-semibold text-gray-800">${payFor.amount.toFixed(2)}</span>?</p>
                <button
                  onClick={() => setPayMethod('zelle')}
                  className="w-full flex items-center gap-3 border border-gray-200 rounded-xl p-4 hover:bg-indigo-50 hover:border-indigo-200 transition text-left"
                >
                  <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600 font-bold text-sm flex-shrink-0">Z</div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Zelle</p>
                    <p className="text-xs text-gray-400">Instant bank transfer, no fees</p>
                  </div>
                </button>
                <button
                  onClick={() => setPayMethod('check')}
                  className="w-full flex items-center gap-3 border border-gray-200 rounded-xl p-4 hover:bg-indigo-50 hover:border-indigo-200 transition text-left"
                >
                  <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 text-lg flex-shrink-0">✉</div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Send a Check</p>
                    <p className="text-xs text-gray-400">Mail a check to the club address</p>
                  </div>
                </button>
                {stripePromise && (
                  <button
                    onClick={() => openStripe(payFor)}
                    className="w-full flex items-center gap-3 border border-gray-200 rounded-xl p-4 hover:bg-indigo-50 hover:border-indigo-200 transition text-left"
                  >
                    <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 font-bold text-sm flex-shrink-0">$</div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Credit / Debit Card</p>
                      <p className="text-xs text-gray-400">Pay securely via Stripe (2.9% + 30¢ fee)</p>
                    </div>
                  </button>
                )}
              </div>
            )}

            {payMethod === 'zelle' && (
              <>
                <div className="bg-gray-50 rounded-xl p-4 space-y-3 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Send to</p>
                      <p className="text-sm font-semibold text-gray-800">{ZELLE_EMAIL}</p>
                    </div>
                    <button onClick={() => copy(ZELLE_EMAIL, 'email')} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                      {copied === 'email' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="border-t border-gray-200" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Amount</p>
                      <p className="text-sm font-semibold text-gray-800">${payFor.amount.toFixed(2)}</p>
                    </div>
                    <button onClick={() => copy(payFor.amount.toFixed(2), 'amount')} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                      {copied === 'amount' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="border-t border-gray-200" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Memo</p>
                      <p className="text-sm font-semibold text-gray-800">{memo}</p>
                    </div>
                    <button onClick={() => copy(memo, 'memo')} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                      {copied === 'memo' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2 my-2">
                  <p className="text-xs text-gray-500 font-medium">Scan with Zelle</p>
                  <div className="p-3 bg-white border border-gray-200 rounded-xl shadow-sm">
                    <QRCodeSVG value={ZELLE_QR_URL} size={160} level="M" />
                  </div>
                </div>
                <p className="text-xs text-gray-400 text-center mt-3">An admin will mark your dues as paid after receiving your payment.</p>
                <button onClick={() => setPayMethod(null)} className="mt-3 text-xs text-indigo-600 hover:underline w-full text-center">← Back</button>
              </>
            )}

            {payMethod === 'check' && (
              <>
                <div className="bg-gray-50 rounded-xl p-4 space-y-3 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Make check payable to</p>
                      <p className="text-sm font-semibold text-gray-800">{CHECK_PAYABLE_TO}</p>
                    </div>
                    <button onClick={() => copy(CHECK_PAYABLE_TO, 'payable')} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                      {copied === 'payable' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="border-t border-gray-200" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Amount</p>
                      <p className="text-sm font-semibold text-gray-800">${payFor.amount.toFixed(2)}</p>
                    </div>
                    <button onClick={() => copy(payFor.amount.toFixed(2), 'amount')} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                      {copied === 'amount' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="border-t border-gray-200" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Memo</p>
                      <p className="text-sm font-semibold text-gray-800">{memo}</p>
                    </div>
                    <button onClick={() => copy(memo, 'memo')} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                      {copied === 'memo' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="border-t border-gray-200" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Mail to</p>
                      <p className="text-sm font-semibold text-gray-800 whitespace-pre-line">{CHECK_ADDRESS}</p>
                    </div>
                    <button onClick={() => copy(CHECK_ADDRESS.replace('\n', ', '), 'address')} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                      {copied === 'address' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-400 text-center">An admin will mark your dues as paid after receiving your check.</p>
                <button onClick={() => setPayMethod(null)} className="mt-3 text-xs text-indigo-600 hover:underline w-full text-center">← Back</button>
              </>
            )}

            {payMethod === 'stripe' && stripePromise && (
              <>
                {stripePaid ? (
                  <div className="text-center py-6">
                    <div className="text-4xl mb-3">✓</div>
                    <p className="text-sm font-semibold text-gray-800">Payment successful!</p>
                    <p className="text-xs text-gray-400 mt-1">Your dues will be marked as paid shortly.</p>
                    <button onClick={closeModal} className="mt-4 text-xs text-indigo-600 hover:underline">Close</button>
                  </div>
                ) : clientSecret ? (
                  <Elements stripe={stripePromise} options={{ clientSecret }}>
                    <StripeForm
                      clientSecret={clientSecret}
                      onSuccess={() => setStripePaid(true)}
                      onBack={() => setPayMethod(null)}
                    />
                  </Elements>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-6">Loading…</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
