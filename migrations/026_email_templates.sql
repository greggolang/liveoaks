CREATE TABLE email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO email_templates (name, subject, body) VALUES (
'event_announcement',
'🎾 {{event_title}} — Liveoaks Tennis Club',
'<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d;margin-bottom:4px">🎾 Liveoaks Tennis Club</h2>
  <h3 style="color:#1f2937;margin-top:0">{{event_title}}</h3>
  <p style="color:#374151"><strong>📅 Date:</strong> {{event_date}}</p>
  <p style="color:#374151"><strong>📍 Location:</strong> {{event_location}}</p>
  <div style="color:#374151;line-height:1.6;white-space:pre-wrap">{{event_description}}</div>
  <p style="margin:28px 0">
    <a href="{{signup_url}}" style="background:#15803d;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">
      Sign Up / Volunteer
    </a>
  </p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
  <p style="color:#9ca3af;font-size:12px">
    <a href="{{site_url}}/events" style="color:#15803d">View all events →</a>
  </p>
</div>'
);
