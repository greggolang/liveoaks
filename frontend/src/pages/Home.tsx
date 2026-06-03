import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { APP_VERSION } from '../version'
import { api } from '../api/client'
import { SiteContent, DEFAULT_CONTENT, mergeContent } from '../siteContent'

export default function Home() {
  const [content, setContent] = useState<SiteContent>(DEFAULT_CONTENT)

  useEffect(() => {
    api.siteContent.get()
      .then(stored => setContent(mergeContent(DEFAULT_CONTENT, stored)))
      .catch(() => {})
  }, [])

  const { hero, stats, about, facilities, coaching, cta, contact } = content

  return (
    <div className="min-h-screen bg-white font-serif text-gray-800">

      {/* Nav */}
      <nav className="bg-lota-700 text-white px-4 sm:px-6 py-3">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link to="/" className="flex items-center gap-3">
            <img src="/lota-logo.png" alt="Live Oaks Tennis Association crest"
                 className="h-11 w-11 rounded-full bg-white/95 p-0.5 shadow-sm" />
            <span className="font-semibold text-base sm:text-lg tracking-wide leading-tight">
              Live Oaks Tennis Association
              <span className="ml-2 text-lota-200 text-xs font-normal align-middle">v{APP_VERSION}</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex gap-6 text-sm font-medium tracking-wide uppercase">
              <a href="#about" className="text-lota-100 hover:text-white transition">About</a>
              <a href="#facilities" className="text-lota-100 hover:text-white transition">Facilities</a>
              <a href="#coaching" className="text-lota-100 hover:text-white transition">Coaching</a>
              <a href="#contact" className="text-lota-100 hover:text-white transition">Contact</a>
            </div>
            <Link to="/login" className="bg-white text-lota-700 px-4 py-1.5 rounded-full font-semibold hover:bg-lota-50 transition text-sm whitespace-nowrap">
              Member Login
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero — real club court photo */}
      <header
        className="relative bg-lota-900 bg-cover bg-center"
        style={{ backgroundImage: "url('/lota-court.jpg')" }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-lota-900/80 via-lota-900/55 to-lota-900/85" />
        <div className="relative text-center text-white py-28 px-6">
          <img src="/lota-logo.png" alt="Live Oaks Tennis Association crest"
               className="h-28 w-28 mx-auto mb-6 rounded-full bg-white/95 p-1 shadow-xl" />
          <p className="text-lota-100 text-sm font-semibold tracking-[0.25em] uppercase mb-3">
            {hero.eyebrow}
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold mb-5 leading-tight drop-shadow">
            {hero.title}
          </h1>
          <p className="text-lota-50 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            {hero.subtitle}
          </p>
        </div>
      </header>

      {/* Stats */}
      <div className="bg-lota-600 text-white py-8">
        <div className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-4 text-center px-6">
          {stats.map((s, i) => (
            <div key={i}>
              <div className="text-3xl font-bold">{s.value}</div>
              <div className="text-lota-100 text-sm mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* About */}
      <section id="about" className="py-20 px-6 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold text-lota-800 mb-4">{about.heading}</h2>
            {about.paragraphs.map((p, i) => (
              <p key={i} className="text-gray-600 leading-relaxed mb-4">{p}</p>
            ))}
          </div>
          <div className="bg-lota-50 rounded-2xl p-8 border border-lota-100">
            <h3 className="font-semibold text-lota-800 mb-4">{about.benefitsHeading}</h3>
            <ul className="space-y-3 text-gray-700 text-sm">
              {about.benefits.map((b, i) => (
                <li key={i} className="flex items-start gap-2">{b}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Facilities */}
      <section id="facilities" className="bg-lota-50 py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-lota-800 text-center mb-12">{facilities.heading}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {facilities.cards.map((f, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-lota-100 text-center">
                <div className="text-4xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-lota-800 mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Coaching */}
      <section id="coaching" className="py-20 px-6 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-lota-800 mb-3">{coaching.heading}</h2>
          <p className="text-gray-500 max-w-xl mx-auto">{coaching.intro}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {coaching.programs.map((p, i) => (
            <div key={i} className="bg-white border border-lota-100 rounded-2xl p-6 shadow-sm">
              <h3 className="font-semibold text-lota-800 mb-2">🎓 {p.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
        {coaching.contactEmail && (
          <p className="text-center text-sm text-gray-400 mt-8">
            Contact us at <a href={`mailto:${coaching.contactEmail}`} className="text-lota-700 hover:underline">{coaching.contactEmail}</a> for coaching inquiries.
          </p>
        )}
      </section>

      {/* Waitlist CTA */}
      <section className="bg-lota-600 text-white py-16 px-6 text-center">
        <h2 className="text-3xl font-bold mb-3">{cta.heading}</h2>
        <p className="text-lota-100 mb-8 max-w-md mx-auto">{cta.text}</p>
        <Link to="/waitlist"
          className="bg-white text-lota-700 font-bold px-8 py-3 rounded-full hover:bg-lota-50 transition shadow-lg inline-block">
          Join the Waitlist
        </Link>
      </section>

      {/* Contact */}
      <section id="contact" className="py-16 px-6">
        <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
          <div>
            <div className="text-2xl mb-2">📍</div>
            <h3 className="font-semibold text-lota-800 mb-1">Location</h3>
            <p className="text-gray-500 text-sm whitespace-pre-line">{contact.address}</p>
          </div>
          <div>
            <div className="text-2xl mb-2">📞</div>
            <h3 className="font-semibold text-lota-800 mb-1">Phone</h3>
            <p className="text-gray-500 text-sm">{contact.phone}</p>
          </div>
          <div>
            <div className="text-2xl mb-2">✉️</div>
            <h3 className="font-semibold text-lota-800 mb-1">Email</h3>
            <a href={`mailto:${contact.email}`} className="text-lota-700 text-sm hover:underline">
              {contact.email}
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-lota-900 text-lota-200 text-center py-8 text-sm">
        <img src="/lota-logo.png" alt="Live Oaks Tennis Association crest"
             className="h-12 w-12 mx-auto mb-3 rounded-full bg-white/95 p-0.5" />
        <p>© {new Date().getFullYear()} Live Oaks Tennis Association · South Pasadena, CA · Founded 1912</p>
        <div className="mt-2 flex gap-4 justify-center">
          <Link to="/login" className="hover:text-white transition">Member Login</Link>
          <Link to="/waitlist" className="hover:text-white transition">Join Waitlist</Link>
        </div>
      </footer>

    </div>
  )
}
