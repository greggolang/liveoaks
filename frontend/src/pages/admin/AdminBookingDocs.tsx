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
          Members book courts through the Bookings page, which shows a half-hour grid (8:00 AM – 7:30 PM)
          across all courts. Each booking has a host (the member who created it), a match type, a duration,
          an optional roster of players, and configurable admin limits enforced on the backend at save time.
        </p>
      </Section>

      {/* Courts */}
      <Section title="Courts">
        <p className="mb-3">
          The club has four courts. Two are designated <strong>Pro Courts</strong> and restrict which
          match types can be booked on them.
        </p>
        <Table
          headers={['Court', 'Type', 'Notes']}
          rows={[
            ['Court 1', 'Standard', 'Available for all match types.'],
            ['Court 2', 'Standard', 'Available for all match types.'],
            ['Court 3', 'Pro Court', 'Teaching Pro and Ball Machine sessions only.'],
            ['Court 4', 'Pro Court', 'Teaching Pro sessions only.'],
          ]}
        />
      </Section>

      {/* Match types */}
      <Section title="Match Types">
        <p className="mb-3">Match type controls roster capacity, open spots, and which courts can be booked.</p>
        <Table
          headers={['Type', 'Total Players', 'Additional (excl. host)', 'Court', 'Notes']}
          rows={[
            ['Hit Session', '2', '1', 'Any', 'Informal hitting. Guest fee applies if a guest is added.'],
            ['Singles', '2', '1', 'Any', 'One-on-one match.'],
            ['Doubles', '4', '3', 'Any', 'Two-on-two match.'],
            ['Ball Machine', '1', '0', 'Court 3 only', 'Solo machine session.'],
            ['Teaching Pro', 'varies', '0', 'Courts 3 & 4 only', 'Requires Teaching Pro Booking permission. See section below.'],
          ]}
        />
      </Section>

      {/* Teaching Pro */}
      <Section title="Teaching Pro Bookings">
        <p className="mb-3">
          Teaching Pro is a restricted match type — only members whose role has been granted the
          <Code>teaching_pro_booking</Code> permission in <strong>Admin → Permissions</strong> can see
          and book it. The <em>Pro</em> role has this permission by default; admins always have it.
        </p>
        <p className="mb-3">Teaching Pro bookings default to <strong>1 hour</strong> and can only be placed on Courts 3 and 4.</p>
        <SubHeading>Lesson types:</SubHeading>
        <Table
          headers={['Lesson Type', 'Description']}
          rows={[
            ['Individual — Member', 'One-to-one lesson with a single club member. Searched by name/email from the member directory.'],
            ['Individual — Guest', 'One-to-one lesson with a non-member guest. Name required, email optional.'],
            ['Group — Adults', 'Group adult lesson. Add any mix of members (looked up from directory) and guests (free-text name).'],
            ['Group — Juniors', 'Group junior lesson. Same member/guest split as Group Adults.'],
          ]}
        />
        <SubHeading className="mt-4">Group participant entry:</SubHeading>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Members</strong> — search the member directory by name; select from the dropdown. Added as a blue badge.</li>
          <li><strong>Guests</strong> — type the guest name and press Enter or click Add. Added as a green badge marked "guest".</li>
          <li>At least one participant (member or guest) is required before the booking can be confirmed.</li>
        </ul>
        <SubHeading className="mt-4">How participants are stored:</SubHeading>
        <Table
          headers={['Type', 'Stored as', 'is_guest']}
          rows={[
            ['Member', 'user_id linked to their account', 'false'],
            ['Guest', 'player_name text only', 'true'],
          ]}
        />
      </Section>

      {/* Booking fields */}
      <Section title="Booking Data">
        <Table
          headers={['Field', 'Description']}
          rows={[
            ['Court', 'Which court is reserved. Cannot be changed after creation.'],
            ['Start Time', 'When the booking begins. Cannot be changed after creation.'],
            ['End Time', 'Derived from duration at creation (1 hr or 1.5 hrs). Can be extended by the owner or admin.'],
            ['Match Type', 'One of: Hit Session, Singles, Doubles, Ball Machine, Teaching Pro.'],
            ['Players Needed', 'Additional open spots advertised to other members (Singles/Doubles only).'],
            ['Notes', 'Optional free-text note from the host. Auto-generated for Teaching Pro bookings.'],
          ]}
        />
      </Section>

      {/* Time rules */}
      <Section title="Time Rules">
        <ul className="space-y-2 list-disc list-inside">
          <li><strong>Grid hours:</strong> 8:00 AM – 7:30 PM in 30-minute slots.</li>
          <li><strong>Durations:</strong> Members choose 1 hour or 1.5 hours. Teaching Pro defaults to 1 hour.</li>
          <li><strong>No past bookings:</strong> Start time must be in the future.</li>
          <li><strong>Days ahead limit:</strong> Controlled by <Code>booking_max_days_ahead</Code> in Settings. Enforced on save.</li>
          <li><strong>Open time:</strong> Controlled by <Code>booking_open_time</Code>. When set, next-day slots only become available at that time (e.g. 06:00).</li>
        </ul>
      </Section>

      {/* Admin limits */}
      <Section title="Admin-Configurable Limits">
        <p className="mb-3">
          All limits below are set in <strong>Admin → Settings → Court Limits / Time Rules</strong>.
          Items marked <Badge>Enforced</Badge> are validated by the backend on every create — members cannot bypass them.
        </p>
        <Table
          headers={['Setting', 'Default', 'Enforced', 'Description']}
          rows={[
            ['booking_max_per_day', '1', 'Yes', 'Max reservations per member per calendar day. LiveBall event court blocks are exempt from this limit.'],
            ['booking_max_minutes_per_day', '—', 'Yes', 'Total court minutes per member per day. Leave blank for no limit.'],
            ['booking_max_per_week', '—', 'Yes', 'Max total bookings per member per calendar week. Leave blank for no limit.'],
            ['booking_max_courts_per_week', '—', 'Yes', 'Max distinct court sessions per member per week. Leave blank for no limit.'],
            ['booking_max_days_ahead', '5', 'Yes', 'How many days ahead a member may book.'],
            ['booking_min_gap_minutes', '30', 'Yes', 'Minimum gap required between a member\'s bookings. Prevents back-to-back reservations. Set to 0 to disable.'],
            ['booking_cancel_hours', '—', 'Yes', 'Min hours notice required to cancel. Admins/board can always cancel. Leave blank for no restriction.'],
            ['withdrawal_min_notice_hours', '0.5', 'Yes', 'Min hours notice for a rostered player to withdraw from a match. Default 30 minutes.'],
            ['booking_max_duration_hours', '—', 'Yes', 'Maximum single reservation length in hours. Leave blank for no limit.'],
            ['booking_max_family_per_day', '—', 'No', 'Combined daily court limit across all family members. Stored but not enforced.'],
            ['booking_allow_sub', '—', 'No', 'Allow rostered players to swap out. Stored but not enforced.'],
            ['booking_allow_any_sub', '—', 'No', 'Allow any member to sub without host approval. Stored but not enforced.'],
          ]}
        />
      </Section>

      {/* Creating a booking */}
      <Section title="How a Booking Is Created (Member Flow)">
        <ol className="list-decimal list-inside space-y-1.5">
          <li>Member clicks an available slot on the court grid (white cell).</li>
          <li>Selects a duration (1 hour or 1.5 hours).</li>
          <li>Selects a match type from the dropdown. Only valid types for that court are shown.</li>
          <li><strong>Teaching Pro:</strong> chooses a lesson type and enters participants (see Teaching Pro section above). Duration defaults to 1 hour.</li>
          <li><strong>Singles / Doubles:</strong> chooses how many open spots to advertise, then optionally invites friends or adds players directly.</li>
          <li>Optionally adds a note (up to 80 characters).</li>
          <li>Reviews the booking summary and confirms — the backend validates all limits before saving.</li>
        </ol>
        <p className="mt-3">
          On success, the host is automatically added to the roster as the booking host.
          Any email invitations are sent asynchronously.
        </p>
      </Section>

      {/* Editing */}
      <Section title="Editing a Booking">
        <p className="mb-2">The booking owner <em>or</em> any board/admin member may edit the following after creation:</p>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Notes</strong> — free-text, can be cleared.</li>
          <li><strong>Match Type</strong> — can switch between types.</li>
          <li><strong>Players Needed</strong> — change open spots.</li>
          <li><strong>End Time (Duration)</strong> — can extend the booking. Must not conflict with another reservation on the same court.</li>
        </ul>
        <p className="mt-2 text-gray-500">Court and start time cannot be changed — cancel and rebook if those need to change.</p>
      </Section>

      {/* Cancellation */}
      <Section title="Cancelling a Booking">
        <p className="mb-2">
          The booking owner or any board/admin member may cancel a booking, subject to the
          <Code>booking_cancel_hours</Code> notice requirement (admins/board are exempt).
          Cancellation permanently deletes the record and cascades to all invitations and the roster.
        </p>
        <SubHeading>Cancellation reasons:</SubHeading>
        <p>
          Members are shown a list of canned reasons (configured in <strong>Admin → Settings → Booking Cancellation Reasons</strong>)
          and may also type a custom reason. The selected reason is stored on the booking record and
          appears in the Activity Log.
        </p>
      </Section>

      {/* Player roster */}
      <Section title="Player Roster & Invitations">
        <p className="mb-3">
          Each booking has a roster tracked in <Code>match_players</Code> and pending invitations in <Code>match_invitations</Code>.
        </p>
        <SubHeading>Adding players — two methods:</SubHeading>
        <Table
          headers={['Method', 'How It Works']}
          rows={[
            ['Send Invitation', 'An email is sent with Accept / Decline links. Link expires after 7 days. On acceptance the player joins the roster automatically.'],
            ['Direct Add', 'Host or admin adds the player immediately — no email invite. If a guest, a guest fee is recorded.'],
          ]}
        />
        <SubHeading className="mt-4">Roster status values:</SubHeading>
        <Table
          headers={['Status', 'Meaning']}
          rows={[
            ['Confirmed', 'Player accepted or was directly added.'],
            ['Pending', 'Invitation sent; awaiting response.'],
            ['Declined', 'Player declined the invitation.'],
            ['Cancelled', 'Invitation cancelled (e.g. match became full first).'],
            ['Expired', 'Player did not respond within 7 days.'],
            ['Withdrew', 'Confirmed player removed themselves within the withdrawal notice window.'],
          ]}
        />
        <SubHeading className="mt-4">When the match becomes full:</SubHeading>
        <ul className="list-disc list-inside space-y-1">
          <li>All remaining pending invitations are automatically set to <Code>cancelled</Code>.</li>
          <li>Pending invitees receive a "match is now full" email.</li>
          <li>The host receives a "your match is full" confirmation email.</li>
        </ul>
        <SubHeading className="mt-4">Player withdrawal:</SubHeading>
        <p>
          A confirmed player may withdraw from a booking from the Bookings page. Withdrawal is blocked within
          <Code>withdrawal_min_notice_hours</Code> of the booking start (default 30 minutes). Admins and board
          members can remove any non-host player at any time.
        </p>
      </Section>

      {/* Email notifications */}
      <Section title="Email Notifications">
        <Table
          headers={['Trigger', 'Recipient', 'Notes']}
          rows={[
            ['Invitation sent', 'Invitee', 'Accept / Decline links included.'],
            ['Invitation accepted', 'Host', 'Player name and booking details.'],
            ['Match becomes full', 'Remaining pending invitees', '"Match is now full" notice.'],
            ['Match becomes full', 'Host', '"Your match is full" confirmation.'],
            ['Player withdraws', 'Host', 'Withdrawal notification.'],
          ]}
        />
        <p className="mt-3 text-gray-500">
          Email templates can be customised in <strong>Admin → Email Templates</strong>.
          SMTP settings are in <strong>Admin → Settings</strong>.
        </p>
      </Section>

      {/* Grid colors */}
      <Section title="Court Grid Colour Guide">
        <Table
          headers={['Colour', 'Meaning']}
          rows={[
            ['White', 'Available — click to book.'],
            ['Light gray', 'Past or outside the bookable window — unavailable.'],
            ['Dark green', 'Your own booking (you are the host).'],
            ['Light green', 'A booking you are on the roster for (not the host).'],
            ['Slate / gray-blue', 'Another member\'s booking you are not involved in.'],
          ]}
        />
      </Section>

      {/* LiveBall */}
      <Section title="LiveBall Event Court Blocks">
        <p>
          When an admin creates a LiveBall event through <strong>Admin → LiveBall Events</strong>, a court booking
          is automatically created alongside it to block the court for the duration of the event.
          These bookings use match type <Code>liveball</Code> and are <strong>exempt from the per-day booking
          limit</strong> — the admin host is not charged against their daily quota for creating the event court block.
        </p>
      </Section>

      {/* Backend endpoints */}
      <Section title="Backend Endpoints (Reference)">
        <Table
          headers={['Method', 'Path', 'Description']}
          rows={[
            ['GET', '/bookings', 'List bookings. Optional ?date=YYYY-MM-DD filter.'],
            ['POST', '/bookings', 'Create a booking. All limits are validated.'],
            ['PUT', '/bookings/:id', 'Edit match type, duration, players needed, or notes.'],
            ['DELETE', '/bookings/:id', 'Cancel (delete) a booking.'],
            ['GET', '/booking-cancel-reasons', 'List configured cancellation reasons.'],
            ['POST', '/bookings/:id/invite', 'Send an email invitation to a member or guest.'],
            ['POST', '/bookings/:id/add-player', 'Directly add a player to the roster.'],
            ['DELETE', '/bookings/:id/players/:userId', 'Remove a non-host player from the roster.'],
            ['POST', '/admin/bookings', 'Admin: create a booking on behalf of a member (board+ only).'],
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
