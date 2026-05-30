import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div className="min-h-screen bg-white">

      {/* Nav */}
      <nav className="bg-green-700 text-white px-6 py-4 flex justify-between items-center">
        <span className="font-bold text-lg tracking-wide">🎾 Live Oaks Tennis Association</span>
        <div className="flex gap-4 text-sm font-medium">
          <a href="#about" className="text-green-200 hover:text-white transition">About</a>
          <a href="#facilities" className="text-green-200 hover:text-white transition">Facilities</a>
          <a href="#coaching" className="text-green-200 hover:text-white transition">Coaching</a>
          <a href="#contact" className="text-green-200 hover:text-white transition">Contact</a>
          <Link to="/login" className="bg-white text-green-700 px-4 py-1 rounded-full font-semibold hover:bg-green-50 transition">
            Member Login
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="bg-gradient-to-br from-green-800 to-green-600 text-white py-24 px-6 text-center">
        <p className="text-green-300 text-sm font-semibold tracking-widest uppercase mb-3">Est. 1912 · South Pasadena, CA</p>
        <h1 className="text-5xl font-bold mb-4 leading-tight">
          Live Oaks Tennis<br />Association
        </h1>
        <p className="text-green-200 text-xl max-w-xl mx-auto mb-10">
          One of the oldest private tennis clubs in Southern California — a friendly community of players for over a century.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link to="/login"
            className="bg-white text-green-700 font-bold px-8 py-3 rounded-full hover:bg-green-50 transition shadow-lg text-sm">
            Member Login
          </Link>
          <Link to="/waitlist"
            className="border-2 border-white text-white font-bold px-8 py-3 rounded-full hover:bg-white hover:text-green-700 transition text-sm">
            Join the Waitlist
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-green-700 text-white py-8">
        <div className="max-w-4xl mx-auto grid grid-cols-4 gap-4 text-center px-6">
          {[
            ['1912', 'Year Founded'],
            ['110+', 'Active Members'],
            ['4', 'Hard Courts'],
            ['1926', 'Historic Clubhouse'],
          ].map(([val, label]) => (
            <div key={label}>
              <div className="text-3xl font-bold">{val}</div>
              <div className="text-green-300 text-sm mt-1">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* About */}
      <section id="about" className="py-20 px-6 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-800 mb-4">A Club With History</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              Founded in 1912, Live Oaks Tennis Association (LOTA) is one of the oldest private tennis clubs in Southern California. Nestled in South Pasadena, our club has been a gathering place for tennis enthusiasts for over a century.
            </p>
            <p className="text-gray-600 leading-relaxed mb-4">
              Our historic 1926 clubhouse and four well-maintained hard courts provide the perfect setting for both competitive play and social tennis. With approximately 110 active members, we maintain an intimate community where everyone knows each other.
            </p>
            <p className="text-gray-600 leading-relaxed">
              We field USTA teams for men's, women's, and mixed doubles, and host regular social events and tournaments throughout the year.
            </p>
          </div>
          <div className="bg-green-50 rounded-2xl p-8 border border-green-100">
            <h3 className="font-semibold text-green-800 mb-4">Membership Benefits</h3>
            <ul className="space-y-3 text-gray-700 text-sm">
              {[
                '🎾 Access to 4 hard courts year-round',
                '🤖 Complimentary ball machine access',
                '🎯 Free match balls and practice basket',
                '🏆 USTA team participation',
                '🎉 Social events and club tournaments',
                '📱 Online court reservation system',
                '👨‍🏫 Professional coaching programs',
                '🤝 Friendly, welcoming community',
              ].map(b => (
                <li key={b} className="flex items-start gap-2">{b}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Facilities */}
      <section id="facilities" className="bg-gray-50 py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-800 text-center mb-12">Our Facilities</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: '🎾', title: '4 Hard Courts', desc: 'Well-maintained hard courts available for reservations. Courts can be booked online by members.' },
              { icon: '🏠', title: 'Historic Clubhouse', desc: 'Our 1926 clubhouse provides a beautiful gathering space for members before and after play.' },
              { icon: '🤖', title: 'Ball Machine', desc: 'A ball machine is available for members to practice their strokes and improve their game.' },
            ].map(f => (
              <div key={f.title} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 text-center">
                <div className="text-4xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-gray-800 mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Coaching */}
      <section id="coaching" className="py-20 px-6 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-800 mb-3">Coaching Programs</h2>
          <p className="text-gray-500 max-w-xl mx-auto">Professional instruction for all ages and skill levels.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { title: 'Adult Clinics', desc: 'Weekly clinics for 3.0–3.5 skill levels. Improve your game alongside fellow members in a structured group setting.' },
            { title: 'Junior Programs', desc: 'Fundamental learning and development programs for juniors. Summer camp and year-round instruction available.' },
            { title: 'Private Lessons', desc: 'One-on-one instruction tailored to your specific needs and goals. All levels welcome.' },
            { title: 'USTA Team Prep', desc: 'Coaching support for our competitive USTA teams in men\'s, women\'s, and mixed doubles.' },
          ].map(p => (
            <div key={p.title} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h3 className="font-semibold text-gray-800 mb-2">🎓 {p.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-gray-400 mt-8">
          Contact us at <a href="mailto:membership@liveoakstennis.com" className="text-green-700 hover:underline">membership@liveoakstennis.com</a> for coaching inquiries.
        </p>
      </section>

      {/* Waitlist CTA */}
      <section className="bg-green-700 text-white py-16 px-6 text-center">
        <h2 className="text-3xl font-bold mb-3">Interested in Joining?</h2>
        <p className="text-green-200 mb-8 max-w-md mx-auto">
          Membership is currently full. Join our waitlist and we'll reach out when a spot opens.
        </p>
        <Link to="/waitlist"
          className="bg-white text-green-700 font-bold px-8 py-3 rounded-full hover:bg-green-50 transition shadow-lg inline-block">
          Join the Waitlist
        </Link>
      </section>

      {/* Contact */}
      <section id="contact" className="py-16 px-6">
        <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
          <div>
            <div className="text-2xl mb-2">📍</div>
            <h3 className="font-semibold text-gray-800 mb-1">Location</h3>
            <p className="text-gray-500 text-sm">1500 Oak Meadow Lane<br />South Pasadena, CA 91030</p>
          </div>
          <div>
            <div className="text-2xl mb-2">📞</div>
            <h3 className="font-semibold text-gray-800 mb-1">Phone</h3>
            <p className="text-gray-500 text-sm">(626) 247-4411</p>
          </div>
          <div>
            <div className="text-2xl mb-2">✉️</div>
            <h3 className="font-semibold text-gray-800 mb-1">Email</h3>
            <a href="mailto:membership@liveoakstennis.com" className="text-green-700 text-sm hover:underline">
              membership@liveoakstennis.com
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-400 text-center py-6 text-sm">
        <p>© {new Date().getFullYear()} Live Oaks Tennis Association · South Pasadena, CA · Est. 1912</p>
        <div className="mt-2 flex gap-4 justify-center">
          <Link to="/login" className="hover:text-white transition">Member Login</Link>
          <Link to="/waitlist" className="hover:text-white transition">Join Waitlist</Link>
        </div>
      </footer>

    </div>
  )
}
