import { Link } from 'react-router-dom'
import HelpPanel from '../components/HelpPanel'

const HELP = [
  { heading: 'Bylaws & Documents', body: 'Link to the official club bylaws and any other governing documents. These are updated by the board as needed.' },
  { heading: 'Updating This Page', body: 'The text on this page is managed by admins under Admin → Settings. Contact a board member if any information needs correcting.' },
]

export default function ClubInfo() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-3">About Liveoaks Tennis Club</h1>
      <HelpPanel items={HELP} />

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

      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm mb-6">
        <h2 className="font-semibold text-gray-800 mb-2">📍 Location</h2>
        <p className="text-gray-600 text-sm">1500 Oak Meadow Lane<br />South Pasadena, CA 91030</p>
      </div>
    </div>
  )
}
