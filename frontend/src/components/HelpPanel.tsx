import { useState } from 'react'

interface HelpItem {
  heading: string
  body: string | React.ReactNode
}

interface Props {
  items: HelpItem[]
  title?: string
}

export default function HelpPanel({ items, title = 'How this page works' }: Props) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  return (
    <div className="mb-5">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-xs font-medium text-gray-400 hover:text-green-700 transition"
      >
        <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center shrink-0 text-[10px] font-bold leading-none">
          ?
        </span>
        {title}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 bg-blue-50 border border-blue-100 rounded-xl divide-y divide-blue-100 text-sm">
          {items.map((item, i) => (
            <div key={i}>
              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left text-blue-800 font-medium hover:bg-blue-100/50 transition rounded-xl"
              >
                {item.heading}
                <svg className={`w-3.5 h-3.5 shrink-0 transition-transform ${expanded === i ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expanded === i && (
                <div className="px-4 pb-3 text-blue-700 text-xs leading-relaxed space-y-1.5">
                  {typeof item.body === 'string'
                    ? <p>{item.body}</p>
                    : item.body}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
