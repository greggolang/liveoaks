-- Collaborative documents: rich-text docs that members can create and edit
-- together. Concurrency is protected with an integer version (optimistic lock);
-- a lightweight presence table tracks who currently has a doc open.
-- Written idempotently so it is safe to re-run on every deploy.

CREATE TABLE IF NOT EXISTS collab_documents (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title      TEXT NOT NULL DEFAULT 'Untitled document',
    body       TEXT NOT NULL DEFAULT '',
    version    INTEGER NOT NULL DEFAULT 1,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collab_document_presence (
    document_id UUID NOT NULL REFERENCES collab_documents(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    editing     BOOLEAN NOT NULL DEFAULT FALSE,
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (document_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_collab_documents_updated_at ON collab_documents (updated_at DESC);

-- Seed the board-meeting proposal so it can be opened and edited right away.
-- Fixed id + ON CONFLICT keeps this a one-time insert that is safe to re-run.
INSERT INTO collab_documents (id, title, body)
VALUES (
    '00000000-0000-0000-0000-0000000000aa',
    'Board Meeting Proposal — The LOTA Member Portal',
    $doc$<h1>Board Meeting Proposal — The LOTA Member Portal</h1>
<p><strong>Live Oaks Tennis Association (LOTA)</strong> · South Pasadena, CA<br>
<strong>Prepared for:</strong> Board of Directors</p>
<hr>
<h2>1. Executive Summary</h2>
<p>The LOTA Portal is a single, custom-built platform that replaces four separate services the club pays for today — website hosting, Google Workspace, CourtReserve, and our outside billing person. Consolidating these into one system <strong>lowers our monthly software/services spend from $600 to $350</strong>, a <strong>net savings of $250/month ($3,000/year)</strong> — while giving members a far better experience and giving the board more control and visibility than we have ever had.</p>
<table>
  <tr><th></th><th>Today</th><th>With the Portal</th><th>Difference</th></tr>
  <tr><td>Monthly cost</td><td>$600</td><td>$350</td><td>−$250 / mo</td></tr>
  <tr><td>Annual cost</td><td>$7,200</td><td>$4,200</td><td>−$3,000 / yr</td></tr>
</table>
<hr>
<h2>2. What the Portal Replaces (and the Savings)</h2>
<table>
  <tr><th>What we pay for today</th><th>Current cost</th><th>How the Portal replaces it</th></tr>
  <tr><td>Website hosting</td><td>$25 / mo ($300/yr)</td><td>The Portal serves our public website and the member site from the same server. The board edits the public site directly through the built-in Content editor — no separate hosting account or web developer needed.</td></tr>
  <tr><td>Google Workspace</td><td>$125 / mo ($1,500/yr)</td><td>The Portal includes its own email system (club inboxes, member messaging, mass broadcast email, and file storage), removing the need for paid Google Workspace seats.</td></tr>
  <tr><td>CourtReserve</td><td>$1,800 / yr ($150/mo)</td><td>The Portal has a complete court-reservation system — online booking, the live court grid, waitlists, cancellations, guest passes, and court blocks — purpose-built for our 4 courts.</td></tr>
  <tr><td>Billing person</td><td>$300 / mo ($3,600/yr)</td><td>The Portal automates dues and billing: it issues dues, takes member card payments through Stripe, tracks balances, generates receipts, and handles accounting and tax reporting.</td></tr>
  <tr><td><strong>Total replaced</strong></td><td><strong>$600 / mo ($7,200/yr)</strong></td><td></td></tr>
</table>
<hr>
<h2>3. What the Portal Costs</h2>
<table>
  <tr><th>Item</th><th>Cost</th><th>Notes</th></tr>
  <tr><td>Server hosting</td><td>$50 / mo ($600/yr)</td><td>Runs the entire platform — website, email, bookings, and billing.</td></tr>
  <tr><td>Portal software</td><td>$300 / mo ($3,600/yr)</td><td>Ongoing license, hosting management, updates, and new features.</td></tr>
  <tr><td>Support</td><td>Included</td><td>No additional charge — see Section 4.</td></tr>
  <tr><td><strong>Total</strong></td><td><strong>$350 / mo ($4,200/yr)</strong></td><td></td></tr>
</table>
<p><strong>Net result: $600/mo − $350/mo = $250/mo saved ($3,000/year), with more capability than all four services combined.</strong></p>
<hr>
<h2>4. How Support Works</h2>
<p>Support is included in the $300/month — there is no separate support contract or hourly billing.</p>
<ul>
  <li><strong>Built-in bug reporting.</strong> Every member can report an issue from inside the Portal. Reports go straight to the admin team, tagged with the page the member was on.</li>
  <li><strong>Admin tools for the board.</strong> Day-to-day questions are handled in-house with the Portal's admin tools — password resets, page-access controls, and a secure impersonate feature for troubleshooting.</li>
  <li><strong>Direct support from the provider.</strong> Anything the board can't resolve is escalated to the software provider, who maintains the software, applies updates, and monitors the server. Updates roll out automatically.</li>
  <li><strong>Continuous improvement.</strong> Member feedback and bug reports feed directly into ongoing improvements at no extra cost.</li>
</ul>
<hr>
<h2>5. Who Provides the Portal</h2>
<p>[FILL IN: company / provider name, who is behind it, and any relevant background or relationship to the club.]</p>
<p>The LOTA Portal is custom-built specifically for Live Oaks Tennis Association — it is not generic off-the-shelf software. Features map directly to how our club actually operates, and the board can request changes rather than waiting on a large vendor's roadmap.</p>
<hr>
<h2>6. Complete Feature List</h2>
<h3>Court Reservations (replaces CourtReserve)</h3>
<ul><li>Online court booking with a live, real-time court grid</li><li>Booking rules and limits</li><li>Court waitlist with automatic notifications</li><li>Cancellations and self-service booking changes</li><li>Court blocks for lessons, clinics, and events</li><li>Automatic booking reminders</li><li>Guest passes and guest tracking</li><li>Court &amp; weather conditions display</li></ul>
<h3>Billing &amp; Payments (replaces the billing person)</h3>
<ul><li>Automated dues issuance and tracking</li><li>Online card payments (Stripe)</li><li>Member balances and statements</li><li>Receipt generation</li><li>Accounting and financial rules</li><li>Tax reporting</li><li>Pro Shop sales and a self-service Kiosk</li></ul>
<h3>Communication &amp; Email (replaces Google Workspace)</h3>
<ul><li>Built-in club email inboxes</li><li>Mail filters, contacts, and import tools</li><li>Member-to-member private messaging</li><li>Club-wide broadcast email</li><li>Announcements feed</li><li>Per-member notification preferences</li></ul>
<h3>Public Website (replaces website hosting)</h3>
<ul><li>Public-facing club website</li><li>Board-editable content — no web developer required</li><li>Membership waitlist sign-up</li><li>Photo gallery</li></ul>
<h3>Member Experience</h3>
<ul><li>Personal dashboard</li><li>Member directory and player profiles</li><li>Friends / connections</li><li>Club info and bylaws</li><li>"Ask the Club" AI assistant</li><li>File/document library and collaborative documents</li></ul>
<h3>Events &amp; Programs</h3>
<ul><li>Event listings and online sign-ups</li><li>USTA team rosters</li><li>Score tracking and match results</li><li>Tennis ladder</li><li>Fantasy pool</li><li>Liveball events</li><li>Polls and surveys</li></ul>
<h3>Board &amp; Admin Tools</h3>
<ul><li>Full admin dashboard</li><li>User and member management; member-request approvals</li><li>Granular permissions and page-access control</li><li>Board communications, board meetings, and RSVPs</li><li>Email templates</li><li>Activity log / audit trail</li><li>Member feedback and bug tracking</li><li>Password management (resets, impersonate-for-support)</li><li>Teaching-pro tools</li><li>Smart-device integration (YoLink)</li><li>On-site cameras</li><li>Ball / equipment tracking</li></ul>
<hr>
<h2>7. Recommendation</h2>
<p>Approve adoption of the LOTA Portal to replace our website hosting, Google Workspace, CourtReserve, and outside billing service. The change <strong>saves the club $3,000 per year</strong>, consolidates four vendors into one, automates dues and billing, and gives members a modern, all-in-one experience tailored to LOTA.</p>$doc$
)
ON CONFLICT (id) DO NOTHING;
