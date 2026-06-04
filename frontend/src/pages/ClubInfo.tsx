import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import HelpPanel from '../components/HelpPanel'

const HELP = [
  { heading: 'Club History', body: 'Background on the founding and history of Live Oaks Tennis Association (LOTA). Content is maintained by the club admin.' },
  { heading: 'Contact & Location', body: 'Club address, main phone number, and general contact email. Use these for questions not covered in the portal.' },
  { heading: 'Bylaws & Documents', body: 'Link to the official club bylaws and any other governing documents. These are updated by the board as needed.' },
  { heading: 'Updating This Page', body: 'The text on this page is managed by admins under Admin → Settings. Contact a board member if any information needs correcting.' },
]

export default function ClubInfo() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  useEffect(() => { api.admin.settings().then(d => setSettings(d as Record<string, string>)) }, [])

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-3">About Liveoaks Tennis Club</h1>
      <HelpPanel items={HELP} />

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Our History</h2>
        <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">
          {settings.club_history || 'Founded in 1912, Live Oaks Tennis Association (LOTA) is one of the oldest private tennis clubs in Southern California. The club features four hard courts and a historic 1926 clubhouse in South Pasadena.'}
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-800">📋 Association Bylaws</h2>
          <p className="text-gray-500 text-sm mt-0.5">Restated January 1, 2007 including amendments to date</p>
        </div>
        <Link
          to="/bylaws"
          className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition shrink-0"
        >
          View Bylaws
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-2">📍 Location</h2>
          <p className="text-gray-600 text-sm">1500 Oak Meadow Lane<br />South Pasadena, CA 91030</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-2">🎾 Facilities</h2>
          <p className="text-gray-600 text-sm">4 hard courts<br />Historic 1926 clubhouse<br />Ball machine available</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-2">👥 Membership</h2>
          <p className="text-gray-600 text-sm">Limited to 110 active members<br />Annual dues: ${settings.dues_amount || '100'}<br />{settings.dues_period || 'Annual'}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-2">📞 Contact</h2>
          <p className="text-gray-600 text-sm">
            <a href="mailto:membership@liveoakstennis.com" className="text-green-700 hover:underline">membership@liveoakstennis.com</a>
          </p>
        </div>
      </div>

      {settings.weather_camera_url && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm mb-6">
          <h2 className="font-semibold text-gray-800 mb-3">📷 Live Court Camera</h2>
          <img src={settings.weather_camera_url} alt="Court camera" className="w-full rounded-lg" />
        </div>
      )}

      {settings.coaching_bio && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-3">🎓 Coaching</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{settings.coaching_bio}</p>
          {settings.coaching_contact && (
            <p className="text-sm mt-2">
              Contact: <a href={`mailto:${settings.coaching_contact}`} className="text-green-700 hover:underline">{settings.coaching_contact}</a>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
