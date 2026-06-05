-- Refresh the board-meeting proposal with improved formatting, inline SVG charts,
-- and new sections: Transition Plan, Risks & Mitigations, and Board Resolution.
UPDATE collab_documents
SET
  body = $doc$<h1>Board Meeting Proposal — The LOTA Member Portal</h1>
<p><strong>Live Oaks Tennis Association (LOTA)</strong> · South Pasadena, CA<br>
<strong>Prepared for:</strong> Board of Directors &nbsp;·&nbsp; <strong>Date:</strong> June 2026</p>
<hr>
<h2>1. Executive Summary</h2>
<p>The LOTA Portal is a single, custom-built platform that replaces four separate services the club currently pays for — website hosting, Google Workspace, CourtReserve, and our outside billing person. Consolidating these into one system <strong>lowers monthly costs from $600 to $350</strong>, saving the club <strong>$3,000 per year</strong> — while giving members a far better experience and giving the board more visibility and control than we have ever had.</p>
<table>
  <thead><tr><th></th><th>Today</th><th>With the Portal</th><th>Change</th></tr></thead>
  <tbody>
    <tr><td>Monthly cost</td><td>$600</td><td>$350</td><td>&#8722;$250 / mo</td></tr>
    <tr><td>Annual cost</td><td>$7,200</td><td>$4,200</td><td>&#8722;$3,000 / yr</td></tr>
    <tr><td>Vendors to manage</td><td>4</td><td>1</td><td>&#8722;3 vendors</td></tr>
    <tr><td>Separate logins</td><td>4+</td><td>1</td><td>Simplified</td></tr>
  </tbody>
</table>
<svg viewBox="0 0 440 270" xmlns="http://www.w3.org/2000/svg" width="440" height="270">
  <text x="220" y="18" text-anchor="middle" font-size="13" font-weight="bold" fill="#111827" font-family="sans-serif">Monthly Operating Cost: Before vs. After</text>
  <line x1="68" y1="35" x2="410" y2="35" stroke="#e5e7eb" stroke-width="1"/>
  <line x1="68" y1="80" x2="410" y2="80" stroke="#e5e7eb" stroke-width="1"/>
  <line x1="68" y1="125" x2="410" y2="125" stroke="#e5e7eb" stroke-width="1"/>
  <line x1="68" y1="170" x2="410" y2="170" stroke="#e5e7eb" stroke-width="1"/>
  <line x1="68" y1="215" x2="410" y2="215" stroke="#9ca3af" stroke-width="1"/>
  <text x="62" y="39" text-anchor="end" font-size="10" fill="#6b7280" font-family="sans-serif">$600</text>
  <text x="62" y="84" text-anchor="end" font-size="10" fill="#6b7280" font-family="sans-serif">$450</text>
  <text x="62" y="129" text-anchor="end" font-size="10" fill="#6b7280" font-family="sans-serif">$300</text>
  <text x="62" y="174" text-anchor="end" font-size="10" fill="#6b7280" font-family="sans-serif">$150</text>
  <text x="62" y="219" text-anchor="end" font-size="10" fill="#6b7280" font-family="sans-serif">$0</text>
  <rect x="100" y="35" width="100" height="180" fill="#ef4444" rx="4"/>
  <text x="150" y="29" text-anchor="middle" font-size="12" font-weight="bold" fill="#dc2626" font-family="sans-serif">$600/mo</text>
  <text x="150" y="232" text-anchor="middle" font-size="11" fill="#374151" font-family="sans-serif">Current</text>
  <text x="150" y="246" text-anchor="middle" font-size="10" fill="#6b7280" font-family="sans-serif">(4 services)</text>
  <rect x="260" y="110" width="100" height="105" fill="#16a34a" rx="4"/>
  <text x="310" y="104" text-anchor="middle" font-size="12" font-weight="bold" fill="#15803d" font-family="sans-serif">$350/mo</text>
  <text x="310" y="232" text-anchor="middle" font-size="11" fill="#374151" font-family="sans-serif">LOTA Portal</text>
  <text x="310" y="246" text-anchor="middle" font-size="10" fill="#6b7280" font-family="sans-serif">(all-in-one)</text>
  <line x1="225" y1="35" x2="225" y2="110" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="3,2"/>
  <line x1="221" y1="35" x2="229" y2="35" stroke="#2563eb" stroke-width="1.5"/>
  <line x1="221" y1="110" x2="229" y2="110" stroke="#2563eb" stroke-width="1.5"/>
  <text x="220" y="262" text-anchor="middle" font-size="11" fill="#1d4ed8" font-family="sans-serif" font-weight="bold">Net savings: $250/month &#183; $3,000/year</text>
</svg>
<p><strong>Beyond the dollars</strong>, the Portal replaces four logins, four vendors, and a manual billing process with one system the board controls — purpose-built for our 4 courts, our dues, our USTA teams, and our events.</p>
<hr>
<h2>2. What the Portal Replaces (and the Savings)</h2>
<table>
  <thead>
    <tr><th>Current Service</th><th>Cost</th><th>How the Portal Replaces It</th></tr>
  </thead>
  <tbody>
    <tr><td>Website hosting</td><td>$25 / mo ($300/yr)</td><td>The Portal serves our public website and member site from the same server. Board members edit the public site directly through the built-in Content editor — no separate hosting account or web developer needed.</td></tr>
    <tr><td>Google Workspace</td><td>$125 / mo ($1,500/yr)</td><td>The Portal includes its own email system (club inboxes, member messaging, broadcast email, shared files, and collaborative documents), removing the need for paid Google Workspace seats.</td></tr>
    <tr><td>CourtReserve</td><td>$150 / mo ($1,800/yr)</td><td>The Portal has a complete court-reservation system — online booking, the live court grid, waitlists, cancellations, guest passes, and court blocks — purpose-built for our 4 courts.</td></tr>
    <tr><td>Billing person</td><td>$300 / mo ($3,600/yr)</td><td>The Portal automates dues and billing: it issues dues, accepts member card payments through Stripe, tracks balances, generates receipts, and handles accounting and tax reporting.</td></tr>
    <tr><td><strong>Total replaced</strong></td><td><strong>$600 / mo ($7,200/yr)</strong></td><td></td></tr>
  </tbody>
</table>
<hr>
<h2>3. What the Portal Costs</h2>
<table>
  <thead>
    <tr><th>Item</th><th>Cost</th><th>Notes</th></tr>
  </thead>
  <tbody>
    <tr><td>Server hosting</td><td>$50 / mo ($600/yr)</td><td>Runs the entire platform — website, email, bookings, and billing.</td></tr>
    <tr><td>Portal software</td><td>$300 / mo ($3,600/yr)</td><td>Ongoing license, hosting management, updates, and new features. Support is included — no separate contract or hourly billing.</td></tr>
    <tr><td>Stripe payment processing</td><td>2.9% + $0.30 per card transaction</td><td>Applies only when members pay dues by credit/debit card. If $50,000 in annual dues flow through Stripe, the fee is approximately $1,500/yr. The board may add a small convenience fee to offset this, or absorb it as a club expense.</td></tr>
    <tr><td><strong>Fixed monthly total</strong></td><td><strong>$350 / mo ($4,200/yr)</strong></td><td>Stripe fees are separate and vary with card payment volume.</td></tr>
  </tbody>
</table>
<p><strong>Net result: $600/mo &#8722; $350/mo = $250/mo saved ($3,000/year), with more capability than all four current services combined.</strong></p>
<svg viewBox="0 0 440 220" xmlns="http://www.w3.org/2000/svg" width="440" height="220">
  <text x="220" y="14" text-anchor="middle" font-size="13" font-weight="bold" fill="#111827" font-family="sans-serif">Cumulative Savings &#8212; First 3 Years</text>
  <line x1="68" y1="25" x2="410" y2="25" stroke="#e5e7eb" stroke-width="1"/>
  <line x1="68" y1="78" x2="410" y2="78" stroke="#e5e7eb" stroke-width="1"/>
  <line x1="68" y1="132" x2="410" y2="132" stroke="#e5e7eb" stroke-width="1"/>
  <line x1="68" y1="185" x2="410" y2="185" stroke="#9ca3af" stroke-width="1"/>
  <text x="62" y="29" text-anchor="end" font-size="10" fill="#6b7280" font-family="sans-serif">$9,000</text>
  <text x="62" y="82" text-anchor="end" font-size="10" fill="#6b7280" font-family="sans-serif">$6,000</text>
  <text x="62" y="136" text-anchor="end" font-size="10" fill="#6b7280" font-family="sans-serif">$3,000</text>
  <text x="62" y="189" text-anchor="end" font-size="10" fill="#6b7280" font-family="sans-serif">$0</text>
  <polygon points="70,185 180,132 290,78 400,25 400,185" fill="#dbeafe" opacity="0.6"/>
  <polyline points="70,185 180,132 290,78 400,25" fill="none" stroke="#2563eb" stroke-width="2.5"/>
  <circle cx="70" cy="185" r="4" fill="#2563eb"/>
  <circle cx="180" cy="132" r="4" fill="#2563eb"/>
  <circle cx="290" cy="78" r="4" fill="#2563eb"/>
  <circle cx="400" cy="25" r="4" fill="#2563eb"/>
  <text x="180" y="124" text-anchor="middle" font-size="10" fill="#1d4ed8" font-family="sans-serif" font-weight="bold">$3,000</text>
  <text x="290" y="70" text-anchor="middle" font-size="10" fill="#1d4ed8" font-family="sans-serif" font-weight="bold">$6,000</text>
  <text x="400" y="17" text-anchor="middle" font-size="10" fill="#1d4ed8" font-family="sans-serif" font-weight="bold">$9,000</text>
  <text x="70" y="202" text-anchor="middle" font-size="10" fill="#6b7280" font-family="sans-serif">Year 0</text>
  <text x="180" y="202" text-anchor="middle" font-size="10" fill="#6b7280" font-family="sans-serif">Year 1</text>
  <text x="290" y="202" text-anchor="middle" font-size="10" fill="#6b7280" font-family="sans-serif">Year 2</text>
  <text x="400" y="202" text-anchor="middle" font-size="10" fill="#6b7280" font-family="sans-serif">Year 3</text>
</svg>
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
<blockquote><strong>Action required before presenting:</strong> Fill in the provider name, background, relationship to the club, and any conflict-of-interest disclosures (e.g., if a board member or club member has a financial interest in the provider).</blockquote>
<p>The LOTA Portal is custom-built specifically for Live Oaks Tennis Association — it is not generic off-the-shelf software. Features map directly to how our club actually operates, and the board can request changes rather than waiting on a large vendor's roadmap.</p>
<hr>
<h2>6. Complete Feature List</h2>
<h3>Court Reservations (replaces CourtReserve)</h3>
<ul>
  <li>Online court booking with a live, real-time court grid</li>
  <li>Booking rules and limits</li>
  <li>Court waitlist with automatic notifications</li>
  <li>Cancellations and self-service booking changes</li>
  <li>Court blocks for lessons, clinics, and events</li>
  <li>Automatic booking reminders</li>
  <li>Guest passes and guest tracking</li>
  <li>Court &amp; weather conditions display</li>
</ul>
<h3>Billing &amp; Payments (replaces the billing person)</h3>
<ul>
  <li>Automated dues issuance and tracking</li>
  <li>Online card payments (Stripe)</li>
  <li>Member balances and statements</li>
  <li>Receipt generation</li>
  <li><strong>AI receipt scanning</strong> — auto-fills vendor, amount, date, and category from an uploaded receipt</li>
  <li>Accounting and financial rules</li>
  <li>Tax reporting (1099 contractors, sales-tax summaries)</li>
  <li>Pro Shop sales and a self-service Kiosk</li>
</ul>
<h3>Communication &amp; Email (replaces Google Workspace)</h3>
<ul>
  <li>Built-in club email inboxes</li>
  <li>Mail filters, contacts, and import tools</li>
  <li>Member-to-member messaging and group conversations</li>
  <li>Club-wide broadcast email</li>
  <li><strong>AI writing assistant</strong> — polishes the tone, clarity, and subject line of announcements and broadcasts</li>
  <li>Announcements feed with read tracking</li>
  <li>Per-member notification preferences</li>
</ul>
<h3>Documents &amp; Files (replaces Google Drive / Docs)</h3>
<ul>
  <li>Shared file library with folders and role-based access</li>
  <li><strong>Collaborative documents</strong> — members write and edit rich-text docs together with live sync, presence, and auto-save (this proposal lives here)</li>
  <li>Bylaws and board-document storage</li>
</ul>
<h3>Public Website (replaces website hosting)</h3>
<ul>
  <li>Public-facing club website</li>
  <li>Board-editable content — no web developer required</li>
  <li>Membership waitlist sign-up</li>
  <li>Photo gallery</li>
</ul>
<h3>Member Experience</h3>
<ul>
  <li>Personal dashboard</li>
  <li>Member directory and player profiles</li>
  <li>Friends / connections</li>
  <li>Club info and bylaws</li>
  <li><strong>&#8220;Ask the Club&#8221; AI assistant</strong> — answers questions from the bylaws, booking policies, and announcements</li>
</ul>
<h3>Events &amp; Programs</h3>
<ul>
  <li>Event listings and online sign-ups</li>
  <li>USTA team rosters</li>
  <li>Score tracking and match results</li>
  <li><strong>Natural-language score entry</strong> — type &#8220;beat Mark 6-4 6-3&#8221; and the scorecard fills itself in</li>
  <li>Tennis ladder</li>
  <li>Fantasy pool</li>
  <li>Liveball events</li>
  <li>Polls and surveys</li>
</ul>
<h3>Board &amp; Admin Tools</h3>
<ul>
  <li>Full admin dashboard</li>
  <li>User and member management; member-request approvals</li>
  <li>Granular permissions and page-access control</li>
  <li>Board communications, board meetings, and RSVPs</li>
  <li><strong>AI board-minutes drafting</strong> — turns rough notes into polished minutes and extracts action items</li>
  <li>Email templates</li>
  <li>Activity log / audit trail</li>
  <li>Member feedback and bug tracking</li>
  <li><strong>AI feedback triage</strong> — groups duplicate feedback into a prioritized, board-ready digest</li>
  <li>Password management (resets, impersonate-for-support)</li>
  <li>Teaching-pro tools</li>
  <li>Smart-device integration (YoLink)</li>
  <li>On-site cameras</li>
  <li>Ball / equipment tracking</li>
</ul>
<hr>
<h2>7. Transition &amp; Implementation Plan</h2>
<p>The transition is designed to be low-risk: current services remain fully active until the board is satisfied, and the Portal is introduced in phases with no forced cutover until members are comfortable.</p>
<table>
  <thead>
    <tr><th>Phase</th><th>Timeline</th><th>Key Activities</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Phase 1 &#8212; Setup</strong></td>
      <td>Weeks 1&#8211;2</td>
      <td>Server provisioning; member data import from CourtReserve and existing records; club settings configured; Stripe account set up with test transactions; board orientation session</td>
    </tr>
    <tr>
      <td><strong>Phase 2 &#8212; Soft Launch</strong></td>
      <td>Weeks 3&#8211;6</td>
      <td>Portal opens alongside current services; court booking and member directory go live; board and admin staff complete training; members receive welcome email and login instructions; feedback collected and issues resolved</td>
    </tr>
    <tr>
      <td><strong>Phase 3 &#8212; Billing Cutover</strong></td>
      <td>Weeks 7&#8211;8</td>
      <td>Dues billing moves to the Portal; Stripe card payments activated for members; outside billing arrangement concludes</td>
    </tr>
    <tr>
      <td><strong>Phase 4 &#8212; Full Cutover</strong></td>
      <td>Weeks 9&#8211;12</td>
      <td>CourtReserve subscription cancelled; Google Workspace reviewed for remaining dependencies; Portal email and file system become primary; website hosting cancelled</td>
    </tr>
  </tbody>
</table>
<p><strong>Member data</strong> &#8212; existing member records, USTA team rosters, and contact information are imported before members see the Portal. No member needs to re-enter information they have already provided.</p>
<p><strong>Member communication</strong> &#8212; members are notified by email in advance of each phase with step-by-step login instructions and a one-page guide. A short FAQ is available inside the Portal from day one.</p>
<hr>
<h2>8. Risks and Mitigations</h2>
<table>
  <thead>
    <tr><th>Risk</th><th>Likelihood</th><th>Mitigation</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>Members resist change or find the new system confusing</td>
      <td>Medium</td>
      <td>The soft-launch phase keeps existing services running in parallel for 6+ weeks; no member is forced onto the Portal before they are ready</td>
    </tr>
    <tr>
      <td>Data migration errors or missing records</td>
      <td>Low</td>
      <td>Data is reviewed and confirmed by the board before any cutover; all existing records are preserved as a backup</td>
    </tr>
    <tr>
      <td>Provider continuity (what if the provider changes or closes?)</td>
      <td>Low</td>
      <td>All club data (members, bookings, financials, documents) is exportable at any time in standard formats; the club is not locked in and can migrate to another system with its data intact</td>
    </tr>
    <tr>
      <td>Email deliverability for new club email domain</td>
      <td>Medium</td>
      <td>New domain is warmed up during Phase 2 while Google Workspace is still active; SPF, DKIM, and DMARC records configured from day one to ensure reliable inbox delivery</td>
    </tr>
    <tr>
      <td>Payment or Stripe issues at billing cutover</td>
      <td>Low</td>
      <td>Test transactions run during Phase 1; first real dues run is supervised; fallback to manual collection exists if needed</td>
    </tr>
    <tr>
      <td>Server downtime</td>
      <td>Low</td>
      <td>Server is monitored 24/7; standard VPS uptime SLA applies (99.9%); critical outages are addressed by the provider within hours</td>
    </tr>
  </tbody>
</table>
<hr>
<h2>9. Recommendation</h2>
<p>Approve adoption of the LOTA Portal to replace our website hosting, Google Workspace, CourtReserve, and outside billing service. The change <strong>saves the club $3,000 per year</strong>, consolidates four vendors into one, automates dues and billing, and gives members a modern, all-in-one experience tailored to LOTA.</p>
<p>The phased transition plan ensures no disruption to ongoing operations — current services remain active in parallel until the board is satisfied. Members gain a significantly better experience from day one, and the board gains tools and visibility that no current service provides.</p>
<hr>
<h2>10. Proposed Board Resolution</h2>
<blockquote><strong>RESOLVED,</strong> that the Board of Directors of the Live Oaks Tennis Association approves the adoption of the LOTA Member Portal as the club's primary platform for court reservations, member billing, communications, and website, at a fixed cost not to exceed $350 per month (exclusive of Stripe payment processing fees), effective upon completion of a satisfactory transition and parallel-running period; and further authorizes the Board President to execute any service agreements necessary to effect this transition.</blockquote>$doc$,
  version    = version + 1,
  updated_at = NOW()
WHERE id = '00000000-0000-0000-0000-0000000000aa';
