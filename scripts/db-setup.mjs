// Create the database tables and seed them from lib/data/ (events + shops).
// Safe to run more than once: tables are created only if missing, and
// seeding only happens into an empty table.
//
//   DATABASE_URL=postgres://… npm run db:setup
//
// (Get DATABASE_URL from Vercel → Storage → the Neon database → .env.local tab,
// or `vercel env pull`.) Needs Node 22.18+ to import the .ts data files.

import { neon } from '@neondatabase/serverless'
import { events } from '../lib/data/events.ts'
import { tenants } from '../lib/data/tenants.ts'

if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL first.')
  process.exit(1)
}
const sql = neon(process.env.DATABASE_URL)

const schema = [
  `create table if not exists events (
    id text primary key,
    title text not null,
    date text not null,
    time text,
    venue text not null default 'Music Hall',
    summary text not null,
    details text,
    price text,
    ticket_url text,
    flyer text,
    sample boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists tenants (
    id text primary key,
    name text not null,
    status text not null default 'open',
    blurb text not null,
    hours jsonb,
    hours_note text,
    link text,
    link_label text,
    sort int not null default 0,
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists bookings (
    id serial primary key,
    created_at timestamptz not null default now(),
    type text,
    name text not null,
    email text not null,
    date text,
    headcount text,
    message text not null,
    status text not null default 'new',
    notes text,
    archived_at timestamptz
  )`,
  // For databases created before archiving existed.
  `alter table bookings add column if not exists archived_at timestamptz`,
  `create table if not exists subscribers (
    id serial primary key,
    email text not null unique,
    token uuid not null default gen_random_uuid(),
    created_at timestamptz not null default now(),
    unsubscribed_at timestamptz
  )`,
  `create table if not exists announcements (
    id serial primary key,
    created_at timestamptz not null default now(),
    subject text not null,
    body text not null,
    recipients int not null,
    sent int not null
  )`,
  `create table if not exists login_attempts (
    ip text not null,
    at timestamptz not null default now()
  )`,
  `create index if not exists login_attempts_ip_at on login_attempts (ip, at)`,
  // Online ticket sales (Stripe). Price in cents; null = no online sales.
  `alter table events add column if not exists ticket_price_cents int`,
  `alter table events add column if not exists capacity int`,
  `create table if not exists orders (
    id serial primary key,
    created_at timestamptz not null default now(),
    stripe_session_id text not null unique,
    payment_intent text,
    event_id text not null,
    name text,
    email text not null,
    quantity int not null,
    amount_cents int not null,
    checked_in boolean not null default false,
    refunded_at timestamptz
  )`,
  `create index if not exists orders_event on orders (event_id)`,
  // Seats held while a buyer is on Stripe's checkout page (30 min max), so
  // two people can't both buy the last tickets.
  `create table if not exists ticket_holds (
    stripe_session_id text primary key,
    event_id text not null,
    quantity int not null,
    expires_at timestamptz not null
  )`,
  // One login per person. The first one is created by signing in with
  // ADMIN_PASSWORD; after that, admins add each other under Team.
  // Site-wide choices made in the admin, e.g. booking_form_url.
  `create table if not exists settings (
    key text primary key,
    value text,
    updated_at timestamptz not null default now()
  )`,
  // V2 design: event category/kind/subtitle/CTA label, space type/unit/socials/photo/fill,
  // and the fuller booking request form.
  `alter table events add column if not exists category text not null default 'music'`,
  `alter table events add column if not exists kind text`,
  `alter table events add column if not exists subtitle text`,
  `alter table events add column if not exists cta text`,
  `alter table tenants add column if not exists type text`,
  `alter table tenants add column if not exists unit text`,
  `alter table tenants add column if not exists instagram text`,
  `alter table tenants add column if not exists photo text`,
  `alter table tenants add column if not exists fill text not null default 'teal'`,
  `alter table events add column if not exists start_time text`,
  `alter table events add column if not exists end_time text`,
  `alter table events add column if not exists display text[] not null default '{website,calendar}'`,
  // The lineup: [{ name, instagram?, facebook?, headliner? }], in billing order.
  `alter table events add column if not exists artists jsonb not null default '[]'`,
  // Who saved an event last, for the "someone else changed this" screen in the admin.
  `alter table events add column if not exists updated_by text`,
  // Extra photos for an event's page, in order: [{url, caption?}].
  `alter table events add column if not exists gallery jsonb not null default '[]'`,
  // Links emailed to an artist so they can send their own name, bio, photo
  // and links. Only a hash of the link's secret is stored. status: sent →
  // submitted (they filled the form; can still edit) → approved or discarded
  // by an admin; or replaced (a newer link went out) / revoked.
  `create table if not exists artist_links (
    id serial primary key,
    token_hash text not null unique,
    event_id text not null references events(id) on delete cascade,
    artist_name text not null,
    email text not null,
    status text not null default 'sent',
    created_at timestamptz not null default now(),
    created_by text,
    expires_at timestamptz not null,
    submitted_at timestamptz,
    submission jsonb,
    reviewed_at timestamptz,
    reviewed_by text
  )`,
  `create index if not exists artist_links_event on artist_links (event_id)`,
  // One record per artist, shared by every event they play. Each entry in an
  // event's lineup (events.artists) keeps a copy of their details plus this id.
  `create table if not exists artists (
    id serial primary key,
    name text not null,
    instagram text,
    facebook text,
    website text,
    bio text,
    photo text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    updated_by text
  )`,
  `create index if not exists artists_name on artists (lower(name))`,
  `alter table artist_links add column if not exists artist_id int references artists(id) on delete set null`,
  // The artist asset library: a show's photos, flyers and documents, filed by
  // artist (null = the show itself) and event. Files are kept; deleting one
  // in the admin only hides it (deleted_at).
  `create table if not exists artist_assets (
    id serial primary key,
    artist_id int references artists(id) on delete set null,
    event_id text references events(id) on delete set null,
    link_id int references artist_links(id) on delete set null,
    kind text not null,
    url text not null,
    pathname text not null,
    filename text not null,
    content_type text,
    size int,
    uploaded_by text not null,
    created_at timestamptz not null default now(),
    deleted_at timestamptz
  )`,
  `create index if not exists artist_assets_artist on artist_assets (artist_id)`,
  `create index if not exists artist_assets_event on artist_assets (event_id)`,
  `alter table bookings add column if not exists org text`,
  `alter table bookings add column if not exists phone text`,
  `alter table bookings add column if not exists backup_date text`,
  `alter table bookings add column if not exists needs text`,
  // Hall booking requests and leasing inquiries share this table; leasing has its own stages.
  `alter table bookings add column if not exists kind text not null default 'hall'`,
  `alter table bookings add column if not exists space text`,
  // Leasing inquiries saved before \`kind\` existed are marked only by their type, e.g. "Leasing · Retail".
  `update bookings set kind = 'leasing', space = coalesce(space, nullif(regexp_replace(type, '^Leasing · ', ''), ''))
   where kind = 'hall' and type like 'Leasing · %'`,
  `create table if not exists admins (
    id serial primary key,
    email text not null unique,
    name text not null,
    password_hash text,
    created_at timestamptz not null default now(),
    created_by int,
    last_login_at timestamptz
  )`,
  // When a "forgot password" email last went out, to stop repeat sends.
  `alter table admins add column if not exists reset_sent_at timestamptz`,
  // Roles: admins manage the team, members use everything else. Everyone
  // who existed before roles keeps full access; people added later default to member.
  `alter table admins add column if not exists role text not null default 'admin'`,
  `alter table admins alter column role set default 'member'`,
  // Which email alerts each person gets: hall, leasing, tickets, backup.
  `alter table admins add column if not exists alerts text[]`,
  // Site analytics, kept here instead of a third-party service. No cookies,
  // no IP addresses: `visitor` is a hash that changes every day, so a person
  // can be counted once per day but not followed from one day to the next.
  // kind: 'view' (a page was shown) or a click such as 'ticket'.
  `create table if not exists analytics (
    id bigserial primary key,
    at timestamptz not null default now(),
    kind text not null default 'view',
    path text not null,
    event_id text,
    referrer text,
    device text,
    visitor text
  )`,
  `create index if not exists analytics_at on analytics (at)`,
]

for (const stmt of schema) await sql.query(stmt)

// First run with alerts: whoever is in INQUIRY_TO (pass it in the env to seed)
// keeps getting every alert. Everyone else starts with none.
const inquiryTo = (process.env.INQUIRY_TO ?? '').split(',').map((a) => a.trim().toLowerCase()).filter(Boolean)
await sql.query(
  `update admins set alerts = case when lower(email) = any($1::text[]) then '{hall,leasing,tickets,backup}'::text[] else '{}'::text[] end
   where alerts is null`,
  [inquiryTo],
)
await sql.query(`alter table admins alter column alerts set default '{}'`)
await sql.query(`alter table admins alter column alerts set not null`)
console.log('Tables ready.')

const [{ n: eventCount }] = await sql.query('select count(*)::int as n from events')
if (eventCount === 0) {
  for (const e of events) {
    await sql.query(
      `insert into events (id, title, date, time, venue, summary, details, price, ticket_url, flyer, sample,
         category, kind, subtitle, cta)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [e.id, e.title, e.date, e.time ?? null, e.venue, e.summary, e.details ?? null, e.price ?? null,
       e.ticketUrl ?? null, e.flyer ?? null, Boolean(e.sample), e.category ?? 'music', e.kind ?? null,
       e.subtitle ?? null, e.cta ?? null],
    )
  }
  console.log(`Seeded ${events.length} events.`)
} else {
  console.log(`events already has ${eventCount} rows; not seeding.`)
}

const [{ n: tenantCount }] = await sql.query('select count(*)::int as n from tenants')
if (tenantCount === 0) {
  for (const [i, t] of tenants.entries()) {
    await sql.query(
      `insert into tenants (id, name, status, blurb, hours, hours_note, link, link_label, type, unit, instagram, photo, fill, sort)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [t.id, t.name, t.status, t.blurb, t.hours ? JSON.stringify(t.hours) : null, t.hoursNote ?? null,
       t.link ?? null, t.linkLabel ?? null, t.type ?? null, t.unit ?? null, t.instagram ?? null,
       t.photo ?? null, t.fill ?? 'teal', i + 1],
    )
  }
  console.log(`Seeded ${tenants.length} shops.`)
} else {
  console.log(`tenants already has ${tenantCount} rows; not seeding.`)
}

// Give every artist in every lineup an artist record (once; safe to re-run).
// Same name, ignoring case and spaces = same artist. Walks events oldest
// first, so the newest details win.
{
  const key = (n) => String(n ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  const byName = new Map(
    (await sql.query('select id, name from artists order by updated_at')).map((r) => [key(r.name), r.id]),
  )
  const FIELDS = ['instagram', 'facebook', 'website', 'bio', 'photo']
  let linked = 0
  let created = 0
  for (const ev of await sql.query(`select id, artists from events where jsonb_array_length(artists) > 0 order by date`)) {
    let changed = false
    const lineup = []
    for (const a of ev.artists) {
      if (!a?.name) {
        lineup.push(a)
        continue
      }
      let id = Number.isInteger(a.id) ? a.id : byName.get(key(a.name))
      if (!id) {
        ;[{ id }] = await sql.query(
          `insert into artists (name, ${FIELDS.join(', ')}, updated_by) values ($1, $2, $3, $4, $5, $6, 'setup') returning id`,
          [a.name, ...FIELDS.map((f) => a[f] ?? null)],
        )
        byName.set(key(a.name), id)
        created++
      } else if (!Number.isInteger(a.id)) {
        // A later event: its details are newer.
        await sql.query(
          `update artists set name = $2, ${FIELDS.map((f, i) => `${f} = coalesce($${i + 3}, ${f})`).join(', ')}, updated_at = now() where id = $1`,
          [id, a.name, ...FIELDS.map((f) => a[f] ?? null)],
        )
      }
      if (a.id !== id) {
        changed = true
        linked++
      }
      lineup.push({ ...a, id })
    }
    if (changed) await sql.query(`update events set artists = $2 where id = $1`, [ev.id, JSON.stringify(lineup)])
  }
  await sql.query(
    `update artist_links l set artist_id = (a->>'id')::int
     from events e, jsonb_array_elements(e.artists) a
     where l.artist_id is null and e.id = l.event_id and lower(a->>'name') = lower(l.artist_name) and a ? 'id'`,
  )
  if (linked) console.log(`Linked ${linked} lineup entries to artist records (${created} new).`)
}
