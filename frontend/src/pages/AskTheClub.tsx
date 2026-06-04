import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'How many guests can I bring?',
  'How far ahead can I book a court?',
  "What's the cancellation policy?",
  'Can I book two courts at once?',
  'What is the guest fee?',
]

export default function AskTheClub() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // When the assistant can't answer, we offer to forward the question to the board.
  const [escalateFor, setEscalateFor] = useState<string | null>(null)
  const [escalating, setEscalating] = useState(false)
  // A court the assistant found that the member can confirm to book.
  type Proposal = { court_id: number; court_name: string; start_time: string; end_time: string; match_type: string; label: string }
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [booking, setBooking] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading, escalateFor, proposal])

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q || loading) return
    setError(''); setEscalateFor(null); setProposal(null)
    const history = messages
    const next = [...messages, { role: 'user' as const, content: q }]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const { answer, answered, booking_proposal } = await api.ai.askClub(q, history)
      setMessages([...next, { role: 'assistant', content: answer }])
      if (booking_proposal) setProposal(booking_proposal)
      else if (!answered) setEscalateFor(q)
    } catch (err: any) {
      setError(err.message || 'Something went wrong.')
      // Roll the failed question back into the input so it isn't lost.
      setMessages(messages)
      setInput(q)
    } finally {
      setLoading(false)
    }
  }

  const sendToBoard = async () => {
    if (!escalateFor) return
    setEscalating(true)
    try {
      await api.ai.escalate(escalateFor)
      setEscalateFor(null)
      setMessages(m => [...m, { role: 'assistant', content: "✅ I've sent your question to the board. They'll follow up, and you'll get a notification on your dashboard with their answer." }])
    } catch (err: any) {
      setError(err.message || 'Could not send your question.')
    } finally { setEscalating(false) }
  }

  const declineBoard = () => {
    setEscalateFor(null)
    setMessages(m => [...m, { role: 'assistant', content: 'No problem — let me know if there\'s anything else I can help with!' }])
  }

  const confirmBooking = async () => {
    if (!proposal) return
    setBooking(true)
    try {
      await api.bookings.create({
        court_id: proposal.court_id,
        start_time: proposal.start_time,
        end_time: proposal.end_time,
        match_type: proposal.match_type,
        players_needed: 0,
      })
      setMessages(m => [...m, { role: 'assistant', content: `✅ Booked! ${proposal.label}. You'll find it under My Bookings.` }])
      setProposal(null)
    } catch (err: any) {
      setMessages(m => [...m, { role: 'assistant', content: `I couldn't book that: ${err.message || 'please try again'}.` }])
      setProposal(null)
    } finally { setBooking(false) }
  }

  return (
    <div className="max-w-3xl flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <span>✨</span> Ask the Club
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Get instant answers from the club bylaws, booking policies, and announcements.
          Answers come only from official club materials.
        </p>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 gap-4 py-8">
            <div className="text-4xl">🎾</div>
            <p className="text-sm">Ask me anything about how the club works.</p>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => ask(s)}
                  className="text-xs bg-green-50 text-green-700 hover:bg-green-100 border border-green-100 rounded-full px-3 py-1.5 transition">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-green-700 text-white rounded-br-sm'
                : 'bg-gray-100 text-gray-800 rounded-bl-sm'
            }`}>
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-500 rounded-2xl rounded-bl-sm px-4 py-3 text-sm">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}

        {/* Confirm a court booking the assistant proposed */}
        {proposal && !loading && (
          <div className="flex justify-start">
            <div className="bg-green-50 border border-green-200 rounded-2xl rounded-bl-sm px-4 py-3 text-sm max-w-[85%]">
              <p className="text-green-900 font-medium">Book this court?</p>
              <p className="text-green-800/80 text-xs mt-0.5">{proposal.label}</p>
              <div className="flex gap-2 mt-2.5">
                <button onClick={confirmBooking} disabled={booking}
                  className="bg-green-700 hover:bg-green-800 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition disabled:opacity-50">
                  {booking ? 'Booking…' : 'Confirm booking'}
                </button>
                <button onClick={() => setProposal(null)} disabled={booking}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition disabled:opacity-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Offer to forward an unanswered question to the board */}
        {escalateFor && !loading && (
          <div className="flex justify-start">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl rounded-bl-sm px-4 py-3 text-sm max-w-[85%]">
              <p className="text-amber-900">I couldn't find that in the club materials. Want me to ask the board for you?</p>
              <div className="flex gap-2 mt-2.5">
                <button onClick={sendToBoard} disabled={escalating}
                  className="bg-green-700 hover:bg-green-800 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition disabled:opacity-50">
                  {escalating ? 'Sending…' : 'Yes, ask the board'}
                </button>
                <button onClick={declineBoard} disabled={escalating}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition disabled:opacity-50">
                  No thanks
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

      {/* Composer */}
      <form onSubmit={e => { e.preventDefault(); ask(input) }} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask a question about the club…"
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <button type="submit" disabled={loading || !input.trim()}
          className="bg-green-700 hover:bg-green-800 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition disabled:opacity-50">
          Ask
        </button>
      </form>
      <p className="text-xs text-gray-400 mt-2">
        The assistant can make mistakes. For official matters, confirm with a board member.
      </p>
    </div>
  )
}
