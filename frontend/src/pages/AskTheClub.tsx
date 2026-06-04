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
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q || loading) return
    setError('')
    const history = messages
    const next = [...messages, { role: 'user' as const, content: q }]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const { answer } = await api.ai.askClub(q, history)
      setMessages([...next, { role: 'assistant', content: answer }])
    } catch (err: any) {
      setError(err.message || 'Something went wrong.')
      // Roll the failed question back into the input so it isn't lost.
      setMessages(messages)
      setInput(q)
    } finally {
      setLoading(false)
    }
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
