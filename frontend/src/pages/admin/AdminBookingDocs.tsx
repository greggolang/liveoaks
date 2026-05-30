export default function AdminBookingDocs() {
  return (
    <div className="max-w-4xl space-y-8 text-sm text-gray-700">
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Booking System — How It Works</h2>
        <p className="text-gray-500">A complete reference for administrators on how court reservations are created, managed, and enforced.</p>
      </div>

      {/* Overview */}
      <Section title="Overview">
        <p>
          Members book courts through the Bookings page, which shows an hourly grid (8 AM–8 PM) across all courts.
          Each booking has a host (the member who created it), a match type, an optional roster of players, and
          configurable admin limits that are enforced on the backend at save time.
        </p>
      </Section>

      {/* Booking fields */}
      <Section title="Booking Data">
        <Table
          headers={['Field', 'Description']}
          rows={[
            ['Court', 'Which court is reserved. Cannot be changed after creation.'],
            ['Start Time', 'When the booking begins. Cannot be changed after creation.'],
            ['End Time', 'When the booking ends. Can be extended by the owner or an admin.'],
            ['Match Type', 'One of: Hit Session, Singles, Doubles, Ball Machine.'],
            ['Players Needed', 'Additional open spots advertised to other members (Singles/Doubles only).'],
            ['Notes', 'Optional free-text note from the host (max 80 characters).'],
          ]}
        />
      </Section>

      {/* Match types */}
      <Section title="Match Types">
        <p className="mb-3">Match type controls the roster capacity and whether open spots can be advertised.</p>
        <Table
          headers={['Type', 'Roster Max', 'Open Spots', 'Notes']}
          rows={[
            ['Hit Session', '2 (host + 1)', 'No', 'Informal hitting. Guest fee applies if a guest is added.'],
            ['Singles', '2 (host + 1)', '0 or 1', 'One-on-one match.'],
            ['Doubles', '4 (host + 3)', '1, 2, or 3', 'Two-on-two match.'],
            ['Ball Machine', '1 (host only)', 'No', 'Solo machine session. Court 3 only.'],
          ]}
        />
      </Section>

      {/* Time rules */}
      <Section title="Time Rules">
        <ul className="space-y-2 list-disc list-inside">
          <li><strong>Earliest start:</strong> 8:00 AM (America/Los_Angeles time).</li>
          <li><strong>Latest end:</strong> 8:00 PM. No booking may end after this.</li>
          <li><strong>Durations:</strong> Members choose 1 hour or 1.5 hours at creation time.</li>
          <li><strong>No past bookings:</strong> Start time must be in the future.</li>
          <li><strong>Days ahead limit:</strong> Controlled by <Code>booking_max_days_ahead</Code> in Settings. Enforced on save.</li>
          <li><strong>Open time:</strong> Controlled by <Code>booking_open_time</Code>. When set, slots for the next day only become available at that time (e.g. 6:00 AM). Currently informational only — not enforced by the backend.</li>
        </ul>
      </Section>

      {/* Admin limits */}
      <Section title="Admin-Configurable Limits">
        <p className="mb-3">
          All limits below are set in <strong>Admin → Settings → Court Limits / Time Rules</strong>.
          Items marked <Badge>Enforced</Badge> are validated by the backend on every create or edit — members cannot bypass them.
          Items without the badge are stored but not yet enforced by the backend.
        </p>
        <Table
          headers={['Setting', 'Default', 'Enforced', 'Description']}
          rows={[
            ['booking_max_per_day', '1', 'Yes', 'Max reservations a member may make in a single calendar day.'],
            ['booking_max_minutes_per_day', '—', 'Yes', 'Total court minutes a member may book in a day. Leave blank for no limit.'],
            ['booking_max_per_week', '—', 'Yes', 'Max total bookings per member in a calendar week. Leave blank for no limit.'],
            ['booking_max_courts_per_week', '—', 'Yes', 'Max distinct court sessions per member per week. Leave blank for no limit.'],
            ['booking_max_days_ahead', '5', 'Yes', 'How many days ahead a member can book. Enforced on save.'],
            ['booking_min_gap_minutes', '30', 'Yes', 'Minimum gap required between a member\'s bookings on the same court. Prevents back-to-back reservations. Set to 0 to disable.'],
            ['booking_max_family_per_day', '—', 'No', 'Combined daily limit across all family members. Stored but not yet enforced.'],
            ['booking_max_duration_hours', '—', 'No', 'Maximum single reservation length in hours. Stored but not yet enforced.'],
            ['booking_allow_sub', '—', 'No', 'Allow rostered players to swap out. Stored but not yet enforced.'],
            ['booking_allow_any_sub', '—', 'No', 'Allow any member to sub for another without host approval. Stored but not yet enforced.'],
          ]}
        />
      </Section>

      {/* Creating a booking */}
      <Section title="How a Booking Is Created (Member Flow)">
        <ol className="list-decimal list-inside space-y-1.5">
          <li>Member clicks an available slot on the court grid (white cell).</li>
          <li>Selects a duration: 1 hour or 1.5 hours.</li>
          <li>Selects a match type (Hit Session, Singles, Doubles, Ball Machine).</li>
          <li>For Singles/Doubles, chooses how many open spots to advertise.</li>
          <li>Optionally invites friends from their saved friend list or adds players directly to the roster.</li>
          <li>Optionally adds a note (up to 80 characters).</li>
          <li>Confirms and submits — the backend validates all limits before saving.</li>
        </ol>
        <p className="mt-3">
          On success the host is automatically added to the roster as the booking host.
          Any email invitations are sent asynchronously.
        </p>
      </Section>

      {/* Editing */}
      <Section title="Editing a Booking">
        <p className="mb-2">The booking owner <em>or</em> any board/admin member may edit the following fields after creation:</p>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Notes</strong> — free-text note, can be cleared.</li>
          <li><strong>Match Type</strong> — can switch between types.</li>
          <li><strong>Players Needed</strong> — change the number of open spots.</li>
          <li><strong>End Time</strong> — can extend the booking. Must remain at or before 8:00 PM and cannot conflict with another reservation on the same court.</li>
        </ul>
        <p className="mt-2 text-gray-500">Court and start time cannot be changed — the member must cancel and rebook if those need to change.</p>
      </Section>

      {/* Cancellation */}
      <Section title="Cancelling a Booking">
        <p>
          The booking owner or any board/admin member may cancel a booking at any time.
          Cancellation permanently deletes the record and cascades to all pending invitations and the roster.
          The cancellation is logged as a <Code>booking_cancelled</Code> event in the Activity Log.
        </p>
      </Section>

      {/* Player roster */}
      <Section title="Player Roster & Invitations">
        <p className="mb-3">
          Each booking has a roster tracked in <Code>match_players</Code> and a set of pending invitations in <Code>match_invitations</Code>.
        </p>
        <SubHeading>Adding players — two methods:</SubHeading>
        <Table
          headers={['Method', 'How It Works']}
          rows={[
            ['Send Invitation', 'An email is sent to the invitee with Accept / Decline links. The link expires after 7 days. On acceptance the player is added to the roster automatically.'],
            ['Direct Add', 'Host or admin adds the player directly — no email invite. If the player is a guest, a $5.00 guest fee is recorded in guest_passes.'],
          ]}
        />
        <SubHeading className="mt-4">Roster status values:</SubHeading>
        <Table
          headers={['Status', 'Meaning']}
          rows={[
            ['Confirmed', 'Player accepted or was directly added.'],
            ['Pending', 'Invitation sent; awaiting response.'],
            ['Declined', 'Player declined the invitation.'],
            ['Cancelled', 'Invitation was cancelled (e.g. match became full before they responded).'],
            ['Expired', 'Player did not respond within 7 days.'],
          ]}
        />
        <SubHeading className="mt-4">When the match becomes full:</SubHeading>
        <ul className="list-disc list-inside space-y-1">
          <li>All remaining pending invitations are automatically set to <Code>cancelled</Code>.</li>
          <li>Pending invitees receive a "match is now full" email.</li>
          <li>The host receives a "your match is full" confirmation email.</li>
        </ul>
        <SubHeading className="mt-4">Removing players:</SubHeading>
        <p>Only non-host players can be removed. The booking owner or an admin/board member may remove any non-host player from the roster.</p>
      </Section>

      {/* Email notifications */}
      <Section title="Email Notifications">
        <Table
          headers={['Trigger', 'Recipient', 'Subject']}
          rows={[
            ['Invitation sent', 'Invitee', '{Host Name} invited you to play at Liveoaks!'],
            ['Invitation accepted', 'Host', '{Player Name} accepted your match invitation'],
            ['Match becomes full', 'Remaining pending invitees', 'Match is now full'],
            ['Match becomes full', 'Host', 'Your match is full! Remaining invites cancelled'],
          ]}
        />
        <p className="mt-3 text-gray-500">
          Email templates can be customised in <strong>Admin → Email Templates</strong>.
          SMTP settings and a connection test are available in <strong>Admin → Settings → Email / SMTP</strong>.
        </p>
      </Section>

      {/* Grid colors */}
      <Section title="Court Grid Colour Guide">
        <Table
          headers={['Colour', 'Meaning']}
          rows={[
            ['White', 'Available — member can click to book.'],
            ['Light gray', 'Past or outside bookable window — unavailable.'],
            ['Light green', 'Booked by another member.'],
            ['Dark green', 'Your own booking.'],
          ]}
        />
      </Section>

      {/* API endpoints */}
      <Section title="Backend Endpoints (Reference)">
        <Table
          headers={['Method', 'Path', 'Description']}
          rows={[
            ['GET', '/bookings', 'List bookings. Optional ?date=YYYY-MM-DD filter.'],
            ['POST', '/bookings', 'Create a booking. All limits are validated.'],
            ['PATCH', '/bookings/:id', 'Edit notes, match type, players needed, or end time.'],
            ['DELETE', '/bookings/:id', 'Cancel (delete) a booking.'],
            ['POST', '/bookings/:id/invite', 'Send an email invitation to a member or guest.'],
            ['POST', '/bookings/:id/add-player', 'Directly add a player to the roster.'],
            ['DELETE', '/bookings/:id/players/:userId', 'Remove a non-host player from the roster.'],
          ]}
        />
      </Section>
    </div>
  )
}

/* ── helpers ─────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-base font-semibold text-gray-800 border-b border-gray-200 pb-1 mb-3">{title}</h3>
      {children}
    </section>
  )
}

function SubHeading({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`font-medium text-gray-700 mt-3 mb-1 ${className}`}>{children}</p>
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="bg-gray-100 text-gray-700 text-xs px-1.5 py-0.5 rounded font-mono">{children}</code>
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">{children}</span>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-gray-50 text-gray-500 uppercase tracking-wide text-left">
            {headers.map(h => (
              <th key={h} className="px-3 py-2 font-semibold border-b border-gray-200">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 border-b border-gray-100 align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
