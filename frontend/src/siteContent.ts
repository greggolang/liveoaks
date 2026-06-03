// Editable content for the public website (the page shown before login).
// The admin "Content" editor saves a SiteContent object; the public Home page
// renders from it, falling back to DEFAULT_CONTENT for any missing field.

export interface SiteContent {
  hero: { eyebrow: string; title: string; subtitle: string }
  stats: { value: string; label: string }[]
  about: { heading: string; paragraphs: string[]; benefitsHeading: string; benefits: string[] }
  facilities: { heading: string; cards: { icon: string; title: string; desc: string }[] }
  coaching: { heading: string; intro: string; programs: { title: string; desc: string }[]; contactEmail: string }
  cta: { heading: string; text: string }
  contact: { address: string; phone: string; email: string }
}

export const DEFAULT_CONTENT: SiteContent = {
  hero: {
    eyebrow: 'Founded 1912 · South Pasadena, California',
    title: 'Live Oaks Tennis Association',
    subtitle: 'One of the oldest private tennis clubs in Southern California — a friendly community of players for over a century.',
  },
  stats: [
    { value: '1912', label: 'Year Founded' },
    { value: '110+', label: 'Active Members' },
    { value: '4', label: 'Hard Courts' },
    { value: '1926', label: 'Historic Clubhouse' },
  ],
  about: {
    heading: 'A Club With History',
    paragraphs: [
      'Founded in 1912, Live Oaks Tennis Association (LOTA) is one of the oldest private tennis clubs in Southern California. Nestled in South Pasadena, our club has been a gathering place for tennis enthusiasts for over a century.',
      'Our historic 1926 clubhouse and four well-maintained hard courts provide the perfect setting for both competitive play and social tennis. With approximately 110 active members, we maintain an intimate community where everyone knows each other.',
      'We field USTA teams for men\'s, women\'s, and mixed doubles, and host regular social events and tournaments throughout the year.',
    ],
    benefitsHeading: 'Membership Benefits',
    benefits: [
      '🎾 Access to 4 hard courts year-round',
      '🤖 Complimentary ball machine access',
      '🎯 Free match balls and practice basket',
      '🏆 USTA team participation',
      '🎉 Social events and club tournaments',
      '📱 Online court reservation system',
      '👨‍🏫 Professional coaching programs',
      '🤝 Friendly, welcoming community',
    ],
  },
  facilities: {
    heading: 'Our Facilities',
    cards: [
      { icon: '🎾', title: '4 Hard Courts', desc: 'Well-maintained hard courts available for reservations. Courts can be booked online by members.' },
      { icon: '🏠', title: 'Historic Clubhouse', desc: 'Our 1926 clubhouse provides a beautiful gathering space for members before and after play.' },
      { icon: '🤖', title: 'Ball Machine', desc: 'A ball machine is available for members to practice their strokes and improve their game.' },
    ],
  },
  coaching: {
    heading: 'Coaching Programs',
    intro: 'Professional instruction for all ages and skill levels.',
    programs: [
      { title: 'Adult Clinics', desc: 'Weekly clinics for 3.0–3.5 skill levels. Improve your game alongside fellow members in a structured group setting.' },
      { title: 'Junior Programs', desc: 'Fundamental learning and development programs for juniors. Summer camp and year-round instruction available.' },
      { title: 'Private Lessons', desc: 'One-on-one instruction tailored to your specific needs and goals. All levels welcome.' },
      { title: 'USTA Team Prep', desc: 'Coaching support for our competitive USTA teams in men\'s, women\'s, and mixed doubles.' },
    ],
    contactEmail: 'membership@liveoakstennis.com',
  },
  cta: {
    heading: 'Interested in Joining?',
    text: 'Membership is currently full. Join our waitlist and we\'ll reach out when a spot opens.',
  },
  contact: {
    address: '1500 Oak Meadow Lane\nSouth Pasadena, CA 91030',
    phone: '(626) 247-4411',
    email: 'membership@liveoakstennis.com',
  },
}

// Deep-merge stored content over the defaults so missing/!new fields stay
// populated. Arrays are replaced wholesale when present; scalars use the stored
// value when defined (including empty strings, so an admin can clear a field).
export function mergeContent<T>(def: T, over: any): T {
  if (over === null || over === undefined) return def
  if (Array.isArray(def)) return (Array.isArray(over) ? over : def) as T
  if (typeof def === 'object') {
    const out: any = Array.isArray(def) ? [] : { ...def }
    for (const k of Object.keys(def as any)) out[k] = mergeContent((def as any)[k], over?.[k])
    return out
  }
  return (over === undefined ? def : over) as T
}
