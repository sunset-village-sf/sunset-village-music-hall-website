// Vercel serverless function: /api/admin?action=…
// Everything behind the /admin page. One function routes on `action` to stay
// well under the Hobby plan's function limit.
//
// Env: ADMIN_PASSWORD (session key + owner master key), DATABASE_URL (Neon),
// BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN (image uploads), RESEND_API_KEY + INQUIRY_FROM
// (emails), STRIPE_SECRET_KEY (online tickets).

import { isStatusFor, type RequestKind } from '@/lib/requests'
import { isAlertKind, type Role } from '@/lib/team'
import { hasAlertRecipient } from '../alerts'
import { put } from '@vercel/blob'
import { query, hasDb, eventFromRow, tenantFromRow, getSettings } from '../db'
import {
  currentAdmin,
  isMasterPassword,
  hashPassword,
  checkPassword,
  tempPassword,
  resetToken,
  adminForResetToken,
  setSession,
  clearSession,
  type Admin,
} from '../auth'
import { hasStripe } from '../stripe'
import { hasCalendar, upsertCalendarEvent, deleteCalendarEvent } from '../gcal'
import {
  hasEmail,
  inquiryTo,
  sendEmail,
  sendBatch,
  unsubscribeUrl,
  SITE_URL,
  type Email,
} from '../email'
import {
  announcementHtml,
  announcementText,
  defaultSubject,
  issueHtml,
  issueText,
  type Issue,
} from '../newsletter-email'
import { noteText } from '@/lib/note-markup'
import { loadContent } from '../content'
import { todayISO, upcoming } from '@/lib/events'
import { str, opt, clientIp, isEmail, type VercelReq, type VercelRes } from '../http'
import { ALL_PLACES, showsOn, type DisplayPlace, type VillageEvent } from '@/lib/data/events'
import { MAX_ARTISTS, MAX_BIO, facebookUrl, instagramHandle, isUploadedImage, websiteUrl, type Artist } from '@/lib/artists'
import { VOICE_DAYS, setSetting, voiceState } from '../voice-schedule'
import { InvalidArtist, LINK_DAYS, cleanArtist, createLink, emailLink, findArtist, type ArtistLinkRow } from '../artist-links'

type Body = Record<string, any>

class BadRequest extends Error {}
class Forbidden extends Error {}
/** Team management is for admins only; members can use the rest of the admin. */
const requireAdmin = (me: Admin) => {
  if (me.role !== 'admin') throw new Forbidden('Only admins can change the team. Ask Tom or Jason.')
}
const need = (v: string | null, what: string): string => {
  if (!v) throw new BadRequest(`${what} is required`)
  return v
}

// Newer Blob stores connect with BLOB_STORE_ID and sign in with Vercel's
// short-lived OIDC token; older ones use a long-lived BLOB_READ_WRITE_TOKEN.
// @vercel/blob handles both.
const hasBlob = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN)

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)

async function uniqueId(table: 'events' | 'tenants', base: string): Promise<string> {
  const root = base || 'item'
  for (let n = 1; ; n++) {
    const id = n === 1 ? root : `${root}-${n}`
    const rows = await query(`select 1 from ${table} where id = $1`, [id])
    if (rows.length === 0) return id
  }
}

// ── Login ──────────────────────────────────────────────────────────────

/** Sign-in, reset-request and reset attempts from one IP share a limit of 10 per 15 minutes. */
async function tooManyTries(ip: string) {
  const [{ n }] = await query<{ n: number }>(
    `select count(*)::int as n from login_attempts where ip = $1 and at > now() - interval '15 minutes'`,
    [ip],
  )
  return n >= 10
}
const TOO_MANY = { error: 'Too many tries. Wait 15 minutes and try again.' }

async function login(req: VercelReq, res: VercelRes, b: Body) {
  const ip = clientIp(req)
  if (await tooManyTries(ip)) return res.status(429).json(TOO_MANY)

  const email = str(b.email).trim().toLowerCase()
  const password = str(b.password)
  const [admin] = await query<Admin & { password_hash: string | null }>(`select * from admins where email = $1`, [email])
  let id = admin && (checkPassword(password, admin.password_hash) || isMasterPassword(password)) ? admin.id : null

  // Very first sign-in: no admins yet, so the master password creates the
  // owner's account under the email they typed.
  if (!id && isMasterPassword(password) && isEmail(email)) {
    const [{ count }] = await query<{ count: number }>(`select count(*)::int as count from admins`)
    if (count === 0) {
      const [created] = await query<{ id: number }>(
        `insert into admins (email, name, password_hash, role) values ($1, $2, $3, 'admin') returning id`,
        [email, email.split('@')[0], hashPassword(password)],
      )
      id = created.id
    }
  }

  if (!id) {
    await query(`insert into login_attempts (ip) values ($1)`, [ip])
    return res.status(401).json({ error: 'That email and password don’t match.' })
  }
  await query(`delete from login_attempts where ip = $1 or at < now() - interval '1 day'`, [ip])
  await query(`update admins set last_login_at = now() where id = $1`, [id])
  await setSession(res, id)
  return res.status(200).json({ ok: true })
}

// ── Team ───────────────────────────────────────────────────────────────
// Admins add and remove people, change roles and set anyone's alerts.
// Members see the team list and set their own alerts. Nobody can remove
// themselves or change their own role, and there's always at least one admin.

const PASSWORD_MIN = 10

async function addAdmin(me: Admin, b: Body) {
  requireAdmin(me)
  const role: Role = b.role === 'admin' ? 'admin' : 'member'
  const email = str(b.email).trim().toLowerCase()
  if (!isEmail(email)) throw new BadRequest('Enter their email address')
  const name = need(opt(b.name, 100), 'Name')
  const password = tempPassword()
  const rows = await query<{ id: number }>(
    `insert into admins (email, name, password_hash, created_by, role) values ($1, $2, $3, $4, $5)
     on conflict (email) do nothing returning id`,
    [email, name, hashPassword(password), me.id, role],
  )
  if (!rows.length) throw new BadRequest('That email already has a login')
  // The password itself is shown once to the person adding them, never emailed.
  const emailed = await sendEmail({
    to: [email],
    reply_to: me.email,
    subject: 'You’re on the Sunset Village website team',
    text: [
      `Hi ${name.split(' ')[0]},`,
      '',
      `${me.name} added you to the team that runs sunsetvillagesf.com. You can edit events and shops, see hall booking requests, leasing inquiries and ticket sales, and send newsletter announcements.${role === 'admin' ? ' As an admin you can also add and remove people on the team.' : ''}`,
      '',
      `Sign in at ${SITE_URL}/admin with this email address (${email}).`,
      `${me.name} will give you a temporary password. Change it under Team → Your password once you’re in.`,
    ].join('\n'),
  })
  return { password, emailed }
}

async function changePassword(me: Admin, b: Body) {
  const next = str(b.next)
  if (next.length < PASSWORD_MIN) throw new BadRequest(`Use at least ${PASSWORD_MIN} characters`)
  const [row] = await query<{ password_hash: string | null }>(`select password_hash from admins where id = $1`, [me.id])
  if (!checkPassword(str(b.current), row?.password_hash ?? null) && !isMasterPassword(str(b.current))) {
    throw new BadRequest('Your current password isn’t right')
  }
  await query(`update admins set password_hash = $2 where id = $1`, [me.id, hashPassword(next)])
}

// ── Forgot password ────────────────────────────────────────────────────
// Anyone can ask for a reset link; the answer is the same whether or not the
// email has an admin login, so the form can't be used to find out who does.
// The link goes only to the admin's own address, at most once every 5 minutes.

async function forgotPassword(req: VercelReq, res: VercelRes, b: Body) {
  const ip = clientIp(req)
  if (await tooManyTries(ip)) return res.status(429).json(TOO_MANY)
  await query(`insert into login_attempts (ip) values ($1)`, [ip])
  if (!hasEmail()) return res.status(503).json({ error: 'Email isn’t set up, so reset links can’t be sent. Ask another admin to reset your password under Team.' })

  const email = str(b.email).trim().toLowerCase()
  const [admin] = isEmail(email)
    ? await query<Admin & { password_hash: string | null }>(
        `update admins set reset_sent_at = now()
         where email = $1 and (reset_sent_at is null or reset_sent_at < now() - interval '5 minutes')
         returning id, email, name, password_hash`,
        [email],
      )
    : []
  if (admin) {
    const link = `${SITE_URL}/admin?reset=${resetToken(admin.id, admin.password_hash)}`
    await sendEmail({
      to: [admin.email],
      subject: 'Reset your Sunset Village admin password',
      text: [
        `Hi ${admin.name.split(' ')[0]},`,
        '',
        'Someone (hopefully you) asked to reset your password for the sunsetvillagesf.com admin. Choose a new one here:',
        '',
        link,
        '',
        'The link works once, for the next hour.',
        'If you didn’t ask for this, ignore this email. Your password stays the same.',
      ].join('\n'),
    })
  }
  return res.status(200).json({ ok: true })
}

async function resetPassword(req: VercelReq, res: VercelRes, b: Body) {
  const ip = clientIp(req)
  if (await tooManyTries(ip)) return res.status(429).json(TOO_MANY)
  const admin = await adminForResetToken(str(b.token))
  if (!admin) {
    await query(`insert into login_attempts (ip) values ($1)`, [ip])
    return res.status(400).json({ error: 'This reset link has expired or was already used. Ask for a new one.' })
  }
  const next = str(b.password)
  if (next.length < PASSWORD_MIN) return res.status(400).json({ error: `Use at least ${PASSWORD_MIN} characters` })
  await query(`update admins set password_hash = $2, reset_sent_at = null, last_login_at = now() where id = $1`, [
    admin.id,
    hashPassword(next),
  ])
  await setSession(res, admin.id) // signs in here; sessions elsewhere end because the password changed
  return res.status(200).json({ ok: true })
}

// ── Overview ───────────────────────────────────────────────────────────

async function overview() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const [[counts], bookings, orders, upcoming] = await Promise.all([
    query<Record<string, number>>(
      `select
         (select count(*)::int from bookings where kind = 'hall' and status = 'new' and archived_at is null) as new_bookings,
         (select count(*)::int from bookings where kind = 'leasing' and status = 'new' and archived_at is null) as new_leasing,
         (select count(*)::int from subscribers where unsubscribed_at is null) as subscribers,
         (select coalesce(sum(quantity), 0)::int from orders where refunded_at is null and created_at > now() - interval '30 days') as tickets_30d,
         (select coalesce(sum(amount_cents), 0)::int from orders where refunded_at is null and created_at > now() - interval '30 days') as revenue_30d`,
    ),
    query(`select * from bookings where archived_at is null order by created_at desc limit 5`),
    query(
      `select o.*, e.title as event_title, e.date as event_date from orders o
       left join events e on e.id = o.event_id order by o.created_at desc limit 5`,
    ),
    query(
      `select e.*, (select coalesce(sum(quantity), 0)::int from orders o where o.event_id = e.id and o.refunded_at is null) as sold
       from events e where e.date >= $1 order by e.date limit 6`,
      [today],
    ),
  ])
  return {
    counts,
    bookings,
    orders,
    upcoming: upcoming.map((r) => ({ ...eventFromRow(r), sold: r.sold })),
  }
}

// ── Analytics ──────────────────────────────────────────────────────────
// Counted by /api/collect (see lib/server/handlers/collect.ts). Days are Pacific.
// "Visitors" adds up each day's distinct visitors: someone who comes on two
// days counts twice, because the visitor code changes daily by design.

const ANALYTICS_DAYS = [7, 30, 90, 365]

async function analytics(daysRaw: unknown) {
  const days = ANALYTICS_DAYS.includes(Number(daysRaw)) ? Number(daysRaw) : 30
  const TZ = `'America/Los_Angeles'`
  const since = `((date_trunc('day', now() at time zone ${TZ}) - ($1::int - 1) * interval '1 day') at time zone ${TZ})`
  const inRange = `at >= ${since}`
  const [[totals], daily, pages, referrers, devices, events, [forms]] = await Promise.all([
    query<Record<string, number>>(
      `select
         coalesce(sum(v), 0)::int as visitors,
         (select count(*)::int from analytics where kind = 'view' and ${inRange}) as views,
         (select count(*)::int from analytics where kind = 'ticket' and ${inRange}) as ticket_clicks,
         (select count(distinct visitor || (at at time zone ${TZ})::date)::int from analytics
           where kind = 'view' and referrer is not null and ${inRange}) as from_elsewhere
       from (select count(distinct visitor) as v from analytics
             where kind = 'view' and ${inRange} group by (at at time zone ${TZ})::date) d`,
      [days],
    ),
    query(
      `select to_char(d, 'YYYY-MM-DD') as day,
              coalesce(count(distinct a.visitor), 0)::int as visitors,
              count(a.id)::int as views
       from generate_series((now() at time zone ${TZ})::date - ($1::int - 1), (now() at time zone ${TZ})::date, interval '1 day') d
       left join analytics a on a.kind = 'view' and (a.at at time zone ${TZ})::date = d::date
       group by d order by d`,
      [days],
    ),
    query(
      `select a.path, max(e.title) as title, count(*)::int as views, count(distinct a.visitor)::int as visitors
       from analytics a left join events e on e.id = a.event_id
       where a.kind = 'view' and a.${inRange}
       group by a.path order by views desc limit 12`,
      [days],
    ),
    query(
      `select referrer, count(distinct visitor || (at at time zone ${TZ})::date)::int as visitors
       from analytics where kind = 'view' and referrer is not null and ${inRange}
       group by referrer order by visitors desc limit 10`,
      [days],
    ),
    query(
      `select device, count(distinct visitor || (at at time zone ${TZ})::date)::int as visitors
       from analytics where kind = 'view' and ${inRange} group by device`,
      [days],
    ),
    query(
      `select e.id, e.title, e.date,
              count(*) filter (where a.kind = 'view')::int as views,
              count(*) filter (where a.kind = 'ticket')::int as ticket_clicks
       from analytics a join events e on e.id = a.event_id
       where a.${inRange}
       group by e.id, e.title, e.date order by views desc, ticket_clicks desc limit 12`,
      [days],
    ),
    query<Record<string, number>>(
      `select
         (select count(*)::int from bookings where kind = 'hall' and created_at >= ${since}) as hall_requests,
         (select count(*)::int from bookings where kind = 'leasing' and created_at >= ${since}) as leasing_inquiries,
         (select count(*)::int from subscribers where created_at >= ${since}) as signups,
         (select coalesce(sum(quantity), 0)::int from orders where refunded_at is null and created_at >= ${since}) as tickets_sold`,
      [days],
    ),
  ])
  return { days, totals, daily, pages, referrers, devices, events, forms }
}

// ── Events ─────────────────────────────────────────────────────────────

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/ // 24h "HH:MM"
const CATEGORIES = ['music', 'dj', 'community', 'workshop']
const FILLS = ['fog', 'sun', 'yellow', 'teal', 'pink']

/** Known places only, in a stable order. Not sent (older admin page) → everywhere. */
function cleanDisplay(v: unknown): DisplayPlace[] {
  if (!Array.isArray(v)) return ALL_PLACES
  return ALL_PLACES.filter((p) => v.includes(p))
}

/** The lineup: drops empty rows, tidies social and website links, keeps at most one headliner. */
function cleanArtists(v: unknown): Artist[] {
  const rows = (Array.isArray(v) ? v : []) as Body[]
  const out: Artist[] = []
  for (const r of rows) {
    const name = opt(r?.name, 100)
    const ig = opt(r?.instagram, 200)
    const fb = opt(r?.facebook, 300)
    const web = opt(r?.website, 300)
    const bio = opt(r?.bio, MAX_BIO + 50)
    const photo = opt(r?.photo, 500)
    if (!name && !ig && !fb && !web && !bio && !photo) continue
    if (!name) throw new BadRequest('Give each artist a name')
    const instagram = ig ? instagramHandle(ig) : null
    if (ig && !instagram) throw new BadRequest(`${name}’s Instagram doesn’t look like a username`)
    const facebook = fb ? facebookUrl(fb) : null
    if (fb && !facebook) throw new BadRequest(`${name}’s Facebook doesn’t look like a Facebook page`)
    const website = web ? websiteUrl(web) : null
    if (web && !website) throw new BadRequest(`${name}’s website doesn’t look like a web address`)
    if (bio && bio.length > MAX_BIO) throw new BadRequest(`Keep ${name}’s bio under ${MAX_BIO} characters`)
    if (photo && !isUploadedImage(photo)) throw new BadRequest(`Upload ${name}’s photo with the button`)
    const headliner = r.headliner === true && !out.some((a) => a.headliner)
    out.push({
      name,
      ...(instagram && { instagram }),
      ...(facebook && { facebook }),
      ...(website && { website }),
      ...(bio && { bio }),
      ...(photo && { photo }),
      ...(headliner && { headliner }),
    })
  }
  if (out.length > MAX_ARTISTS) throw new BadRequest(`Up to ${MAX_ARTISTS} artists per event`)
  return out
}

// Columns an admin edits, in the order the insert/update statements use, with
// the form's label (for the "you both changed this" screen) and the draft key
// the form uses for it.
const EVENT_FIELDS = [
  ['title', 'title', 'Event name'],
  ['date', 'date', 'Date'],
  ['time', 'time', 'Time'],
  ['venue', 'venue', 'Where'],
  ['summary', 'summary', 'Short description'],
  ['details', 'details', 'Full description'],
  ['price', 'price', 'Price shown'],
  ['ticket_url', 'ticketUrl', 'Outside ticket link'],
  ['flyer', 'flyer', 'Flyer'],
  ['ticket_price_cents', 'ticketPrice', 'Online ticket price'],
  ['capacity', 'capacity', 'Tickets available online'],
  ['category', 'category', 'Category'],
  ['kind', 'kind', 'Kind line'],
  ['subtitle', 'subtitle', 'Subtitle'],
  ['cta', 'cta', 'Button label'],
  ['start_time', 'startTime', 'Start time'],
  ['end_time', 'endTime', 'End time'],
  ['display', 'display', 'Where it shows'],
  ['artists', 'artists', 'Lineup'],
] as const
type EventColumn = (typeof EVENT_FIELDS)[number][0]
type EventValues = Record<EventColumn, unknown>

/** Check and tidy the form's fields into column values. */
function parseEvent(b: Body): EventValues {
  const date = need(opt(b.date, 10), 'Date')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequest('Date must look like 2026-10-31')
  const title = need(opt(b.title, 200), 'Title')
  const ticketUrl = opt(b.ticketUrl, 500)
  if (ticketUrl && !/^https?:\/\//.test(ticketUrl)) {
    throw new BadRequest('Ticket link must start with https://')
  }
  const priceText = opt(b.ticketPrice, 20)
  const ticketPrice = priceText === null ? null : Math.round(Number(priceText.replace(/[$,\s]/g, '')) * 100)
  if (ticketPrice !== null && !(ticketPrice >= 100 && ticketPrice <= 100000)) {
    throw new BadRequest('Online ticket price must be between $1 and $1,000')
  }
  const startTime = opt(b.startTime, 5)
  const endTime = opt(b.endTime, 5)
  for (const t of [startTime, endTime]) if (t && !TIME.test(t)) throw new BadRequest('Times must look like 19:30')
  if (endTime && !startTime) throw new BadRequest('Add a start time before an end time')
  const capText = opt(b.capacity, 6)
  const capacity = capText === null ? null : Math.floor(Number(capText))
  if (capacity !== null && !(capacity >= 1 && capacity <= 10000)) throw new BadRequest('Capacity must be a number of tickets')
  return {
    title,
    date,
    time: opt(b.time, 100),
    venue: opt(b.venue, 100) ?? 'Music Hall',
    summary: need(opt(b.summary, 500), 'Short description'),
    details: opt(b.details, 5000),
    price: opt(b.price, 50),
    ticket_url: ticketUrl,
    flyer: opt(b.flyer, 500),
    ticket_price_cents: ticketPrice,
    capacity,
    category: CATEGORIES.includes(b.category) ? b.category : 'music',
    kind: opt(b.kind, 100),
    subtitle: opt(b.subtitle, 200),
    cta: opt(b.cta, 40),
    start_time: startTime,
    end_time: endTime,
    display: cleanDisplay(b.display),
    artists: cleanArtists(b.artists),
  }
}

const toParams = (v: EventValues) => EVENT_FIELDS.map(([col]) => (col === 'artists' ? JSON.stringify(v.artists) : v[col]))

/** A saved row in the form's shape (prices in dollars), as the form sends it. */
export const rowToDraft = (r: Record<string, any>) => ({
  ...eventFromRow(r),
  ticketPrice: r.ticket_price_cents ? String(r.ticket_price_cents / 100) : '',
  capacity: r.capacity ? String(r.capacity) : '',
})

// Same value? Blank, null and missing count as equal; objects compare with keys sorted.
const canon = (v: unknown): unknown =>
  v === undefined || v === null || v === ''
    ? null
    : Array.isArray(v)
      ? v.map(canon)
      : typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v as object)
              .sort()
              .map((k) => [k, canon((v as Record<string, unknown>)[k])])
              .filter(([, x]) => x !== null),
          )
        : v
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))

/** Two people changed the same fields of an event: the form shows both versions to choose from. */
export class Conflict extends Error {
  constructor(public data: Record<string, unknown>) {
    super('Someone else changed this event while you were editing it.')
  }
}

/**
 * Save an event. Edits are merged field by field against what the form
 * started from (`b.base`), so changes someone else saved in the meantime
 * aren't overwritten: fields only you changed are saved, fields only they
 * changed are kept, and fields you both changed to different values stop the
 * save with a Conflict listing both versions.
 */
async function saveEvent(b: Body, me: Admin) {
  const mine = parseEvent(b)
  if (b.id) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const [row] = await query(`select *, updated_at::text as version from events where id = $1`, [str(b.id)])
      if (!row) throw new BadRequest('That event no longer exists')
      let theirs: EventValues
      try {
        theirs = parseEvent(rowToDraft(row))
      } catch {
        theirs = Object.fromEntries(EVENT_FIELDS.map(([col]) => [col, row[col]])) as EventValues
      }
      // Without a base (an old open tab from before this change), there's
      // nothing to merge against: treat everything as "mine", as before.
      const base = b.base && typeof b.base === 'object' ? parseEvent(b.base as Body) : theirs
      // Choices from the "you both changed this" screen, if it was made
      // against what's saved now (not an even newer save).
      const picks: Record<string, unknown> =
        b.resolve && typeof b.resolve === 'object' && b.resolve.version === row.version ? b.resolve : {}
      const merged = { ...mine }
      const clashes: { key: string; label: string }[] = []
      const kept: string[] = []
      for (const [col, key, label] of EVENT_FIELDS) {
        if (same(mine[col], base[col])) {
          merged[col] = theirs[col]
          if (!same(theirs[col], base[col])) kept.push(label)
        } else if (!same(theirs[col], base[col]) && !same(theirs[col], mine[col])) {
          if (picks[key] === 'theirs') merged[col] = theirs[col]
          else if (picks[key] !== 'mine') clashes.push({ key, label })
        }
      }
      if (clashes.length) {
        throw new Conflict({
          conflicts: clashes,
          kept,
          current: rowToDraft(row),
          version: row.version,
          updatedBy: row.updated_by ?? null,
          updatedAt: row.updated_at,
        })
      }
      const rows = await query(
        `update events set title=$3, date=$4, time=$5, venue=$6, summary=$7, details=$8, price=$9,
           ticket_url=$10, flyer=$11, ticket_price_cents=$12, capacity=$13, category=$14, kind=$15, subtitle=$16,
           cta=$17, start_time=$18, end_time=$19, display=$20, artists=$21, sample=false, updated_at=now(), updated_by=$22
         where id=$1 and updated_at::text=$2 returning *`,
        [str(b.id), row.version, ...toParams(merged), me.name],
      )
      // Saved by someone else between the read and the write: merge again.
      if (rows.length) {
        const saved = await withCalendar(rows[0])
        return kept.length ? { ...saved, keptFrom: { by: row.updated_by ?? null, fields: kept } } : saved
      }
    }
    throw new BadRequest('This event is being edited by someone else right now. Try saving again.')
  }
  const id = await uniqueId('events', slugify(`${mine.title} ${String(mine.date).slice(5)}`))
  const rows = await query(
    `insert into events (id, title, date, time, venue, summary, details, price, ticket_url, flyer, ticket_price_cents, capacity,
       category, kind, subtitle, cta, start_time, end_time, display, artists, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) returning *`,
    [id, ...toParams(mine), me.name],
  )
  return withCalendar(rows[0])
}

// ── Artist links ───────────────────────────────────────────────────────

/** Links that still matter: everything except ones a newer link replaced. Newest first. */
async function artistLinks() {
  return query(
    `select l.id, l.event_id, l.artist_name, l.email, l.status, l.created_at, l.created_by, l.expires_at,
       l.submitted_at, l.submission, l.reviewed_at, l.reviewed_by, (l.expires_at < now()) as expired,
       e.title as event_title, e.date as event_date, e.artists as event_artists
     from artist_links l join events e on e.id = l.event_id
     where l.status <> 'replaced' order by l.created_at desc limit 300`,
  )
}

async function sendArtistLink(b: Body, me: Admin) {
  const eventId = need(opt(b.eventId, 200), 'Event')
  const artistName = need(opt(b.artistName, 100), 'Artist')
  const email = str(b.email).trim().toLowerCase()
  if (!isEmail(email)) throw new BadRequest('Enter the artist’s email address')
  const [ev] = await query<{ title: string; date: string; artists: Artist[] }>(
    `select title, date, artists from events where id = $1`,
    [eventId],
  )
  if (!ev) throw new BadRequest('That event no longer exists')
  if (findArtist(ev.artists, artistName) < 0) throw new BadRequest(`${artistName} isn’t in this event’s saved lineup. Save the event first.`)
  const { row, url } = await createLink(eventId, artistName, email, me.name)
  const emailed = await emailLink({
    to: email,
    artist: artistName,
    event: ev,
    url,
    expires: row.expires_at,
    replyTo: me.email,
  })
  return { ...row, url, emailed, days: LINK_DAYS }
}

/** Put an artist's submitted details into the event's lineup (keeping their headliner spot). */
async function approveArtistLink(b: Body, me: Admin) {
  const [link] = await query<ArtistLinkRow>(`select * from artist_links where id = $1`, [Number(b.id)])
  if (!link) throw new BadRequest('That link no longer exists')
  if (link.status !== 'submitted' || !link.submission) throw new BadRequest('There’s nothing to approve for this link')
  const submitted = cleanArtist(link.submission as unknown as Body)
  for (let attempt = 0; attempt < 3; attempt++) {
    const [ev] = await query<Record<string, any>>(`select *, updated_at::text as version from events where id = $1`, [link.event_id])
    if (!ev) throw new BadRequest('That event no longer exists')
    const artists: Artist[] = ev.artists ?? []
    const i = findArtist(artists, link.artist_name)
    if (i < 0) {
      throw new BadRequest(
        `${link.artist_name} isn’t in the lineup for ${ev.title} anymore. Add them back (or edit the lineup by hand), then approve.`,
      )
    }
    const next = [...artists]
    next[i] = { ...submitted, ...(artists[i].headliner && { headliner: true }) }
    const rows = await query(
      `update events set artists = $3, updated_at = now(), updated_by = $4 where id = $1 and updated_at::text = $2 returning *`,
      [link.event_id, ev.version, JSON.stringify(next), me.name],
    )
    if (!rows.length) continue // someone saved the event at the same moment: read it again
    await query(`update artist_links set status = 'approved', reviewed_at = now(), reviewed_by = $2 where id = $1`, [
      link.id,
      me.name,
    ])
    return withCalendar(rows[0])
  }
  throw new BadRequest('The event is being edited by someone else right now. Try again.')
}

async function closeArtistLink(b: Body, me: Admin, status: 'discarded' | 'revoked') {
  const from = status === 'discarded' ? ['submitted'] : ['sent', 'submitted']
  const rows = await query(
    `update artist_links set status = $2, reviewed_at = now(), reviewed_by = $3 where id = $1 and status = any($4) returning id`,
    [Number(b.id), status, me.name, from],
  )
  if (!rows.length) throw new BadRequest('That link has already been dealt with. Reload to see the latest.')
  return { ok: true }
}

// ── Google Calendar ────────────────────────────────────────────────────

const toCalendar = (r: Record<string, any>) => ({
  id: r.id,
  title: r.title,
  date: r.date,
  startTime: r.start_time,
  endTime: r.end_time,
  venue: r.venue,
  kind: r.kind,
  subtitle: r.subtitle,
  summary: r.summary,
  details: r.details,
  price: r.price,
  ticketUrl: r.ticket_url,
})

/** Put the event on Google Calendar, or take it off if it isn't marked for the calendar. */
const pushToCalendar = (row: Record<string, any>) =>
  showsOn(eventFromRow(row) as VillageEvent, 'calendar')
    ? upsertCalendarEvent(toCalendar(row))
    : deleteCalendarEvent(row.id)

/** Saved event plus whether Google Calendar took the change ('off' when not set up). */
async function withCalendar(row: Record<string, any>) {
  const calendar = hasCalendar() ? ((await pushToCalendar(row)) ? 'synced' : 'failed') : 'off'
  return { ...eventFromRow(row), calendar }
}

/** Re-send every upcoming event (and remove ones not marked for the calendar): first-time setup, or catching up after Google was unreachable. */
export async function syncCalendar() {
  if (!hasCalendar()) throw new BadRequest('Google Calendar isn’t set up yet')
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const rows = await query(`select * from events where date >= $1 order by date`, [today])
  let synced = 0
  for (const r of rows) if (await pushToCalendar(r)) synced++
  return { synced, total: rows.length }
}

// ── Shops ──────────────────────────────────────────────────────────────

function cleanHours(h: unknown) {
  if (!Array.isArray(h)) return null
  if (h.length !== 7) throw new BadRequest('Hours need all seven days')
  const days = h.map((d) => {
    if (!d) return null
    const open = str(d.open)
    const close = str(d.close)
    if (!TIME.test(open) || !TIME.test(close)) throw new BadRequest('Hours need an opening and closing time')
    if (close <= open) throw new BadRequest('Closing time must be after opening time')
    return { open, close }
  })
  // All days closed means "no regular hours"; the hours note shows instead.
  return days.some(Boolean) ? JSON.stringify(days) : null
}

async function saveTenant(b: Body) {
  const name = need(opt(b.name, 200), 'Name')
  const status = b.status === 'coming-soon' ? 'coming-soon' : 'open'
  const fields = [
    name,
    status,
    need(opt(b.blurb, 1000), 'Description'),
    cleanHours(b.hours),
    opt(b.hoursNote, 200),
    opt(b.link, 500),
    opt(b.linkLabel, 100),
    opt(b.type, 100),
    opt(b.unit, 40),
    opt(b.instagram, 500),
    opt(b.photo, 500),
    FILLS.includes(b.fill) ? b.fill : 'teal',
  ]
  if (b.id) {
    const rows = await query(
      `update tenants set name=$2, status=$3, blurb=$4, hours=$5, hours_note=$6, link=$7, link_label=$8,
         type=$9, unit=$10, instagram=$11, photo=$12, fill=$13, updated_at=now() where id=$1 returning *`,
      [str(b.id), ...fields],
    )
    if (!rows.length) throw new BadRequest('That shop no longer exists')
    return tenantFromRow(rows[0])
  }
  const id = await uniqueId('tenants', slugify(name))
  const rows = await query(
    `insert into tenants (id, name, status, blurb, hours, hours_note, link, link_label, type, unit, instagram, photo, fill, sort)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, (select coalesce(max(sort), 0) + 1 from tenants)) returning *`,
    [id, ...fields],
  )
  return tenantFromRow(rows[0])
}

// ── Flyer upload ───────────────────────────────────────────────────────
// The admin page shrinks photos in the browser first, so the base64 body
// stays well under Vercel's 4.5MB request limit.

async function upload(b: Body) {
  if (!hasBlob()) throw new BadRequest('Image storage isn’t set up yet')
  const type = str(b.contentType)
  if (!['image/webp', 'image/jpeg', 'image/png'].includes(type)) throw new BadRequest('Use a JPG, PNG, or WebP image')
  const data = Buffer.from(str(b.data), 'base64')
  if (data.length === 0 || data.length > 3_500_000) throw new BadRequest('Image is too large')
  const ext = type.split('/')[1].replace('jpeg', 'jpg')
  const folder = b.folder === 'newsletter' ? 'newsletter' : b.folder === 'artists' ? 'artists' : 'flyers'
  const blob = await put(`${folder}/${slugify(str(b.name)) || 'image'}.${ext}`, data, {
    access: 'public',
    contentType: type,
    addRandomSuffix: true,
  })
  return { url: blob.url }
}

// ── Newsletter: announcements and the weekly Village Voice ─────────────

type Render = (unsub: string) => { text: string; html: string }

/**
 * A test to one address, or the real send to every active subscriber (each
 * with their own unsubscribe link), logged under Sent in the admin.
 */
async function sendToList(b: Body, subject: string, render: Render, logBody: string) {
  if (!hasEmail()) throw new BadRequest('Email sending isn’t set up yet')

  if (b.test) {
    const to = opt(b.testTo, 200) ?? inquiryTo()[0] ?? ''
    if (!isEmail(to)) throw new BadRequest('Enter an email address to send the test to')
    const ok = await sendEmail({ to: [to], subject: `[Test] ${subject}`, ...render(unsubscribeUrl('test-preview')) })
    if (!ok) throw new BadRequest('The test email didn’t go through')
    return { sent: 1, test: true }
  }

  const subs = await query<{ email: string; token: string }>(
    `select email, token::text as token from subscribers where unsubscribed_at is null order by id`,
  )
  if (!subs.length) throw new BadRequest('There are no subscribers yet')

  const emails: Email[] = subs.map((s) => {
    const unsub = unsubscribeUrl(s.token)
    return {
      to: [s.email],
      subject,
      ...render(unsub),
      headers: {
        'List-Unsubscribe': `<${unsub}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }
  })
  const sent = await sendBatch(emails)
  await query(`insert into announcements (subject, body, recipients, sent) values ($1, $2, $3, $4)`, [
    subject,
    logBody,
    subs.length,
    sent,
  ])
  if (sent === 0) throw new BadRequest('The emails didn’t go through. Nothing was sent.')
  return { sent, total: subs.length }
}

/** Pictures in sent emails load from the live site (or this preview deployment). */
function assetBase(req: VercelReq) {
  const host = str(req.headers['x-forwarded-host'] ?? req.headers.host)
  return !host || /^(localhost|127\.)/.test(host) ? SITE_URL : `https://${host}`
}

function announcementPreview(b: Body) {
  const subject = opt(b.subject, 200) ?? 'Your subject here'
  const body = opt(b.body, 20000) ?? ''
  return { html: announcementHtml(subject, body, { assets: '', unsubscribeUrl: '#' }) }
}

async function sendAnnouncement(b: Body, req: VercelReq) {
  const subject = need(opt(b.subject, 200), 'Subject')
  const body = need(opt(b.body, 20000), 'Message')
  const assets = assetBase(req)
  return sendToList(
    b,
    subject,
    (unsub) => ({
      text: announcementText(body, unsub),
      html: announcementHtml(subject, body, { assets, unsubscribeUrl: unsub }),
    }),
    noteText(body),
  )
}

const isoDate = (v: unknown) => {
  const s = str(v)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null
}
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The week's issue from the calendar: shows on the website from `start` for 7 days, plus the next few after. */
/** An issue from the calendar: `days` long (7 for a manual issue, 14 for the automatic one), starting `start`. */
export async function buildIssue(b: Body): Promise<Issue> {
  const start = isoDate(b.start) ?? todayISO()
  const days = Number(b.days) === VOICE_DAYS ? VOICE_DAYS : 7
  const end = addDays(start, days - 1)
  const events = upcoming((await loadContent()).events)
  return {
    start,
    end,
    note: opt(b.note, 20000) ?? undefined,
    events: events.filter((e) => e.date >= start && e.date <= end),
    later: events.filter((e) => e.date > end).slice(0, 5),
  }
}

async function voicePreview(b: Body) {
  const issue = await buildIssue(b)
  return {
    start: issue.start,
    end: issue.end,
    shows: issue.events.length,
    defaultSubject: defaultSubject(issue.start, issue.end),
    html: issueHtml(issue, { assets: '', unsubscribeUrl: '#' }),
  }
}

async function sendVoice(b: Body, req: VercelReq) {
  return sendIssue(await buildIssue(b), assetBase(req), b)
}

/** Send an issue to every subscriber (or, with b.test, to one address). Also used by the automatic send. */
export async function sendIssue(issue: Issue, assets: string, b: Body = {}) {
  const subject = opt(b.subject, 200) ?? defaultSubject(issue.start, issue.end)
  return sendToList(
    b,
    subject,
    (unsub) => ({ text: issueText(issue, unsub), html: issueHtml(issue, { assets, unsubscribeUrl: unsub }) }),
    issueText(issue, '').split('\n\n--\n')[0],
  )
}

/** The automatic Village Voice: on/off, skip the next issue, its note. */
async function saveVoiceSchedule(b: Body) {
  const state = await voiceState()
  if (typeof b.auto === 'boolean') await setSetting('voice_auto', b.auto ? 'on' : 'off')
  if (typeof b.skip === 'boolean') await setSetting('voice_skip', b.skip ? state.next : null)
  if (typeof b.note === 'string') await setSetting('voice_note', opt(b.note, 20000))
  return voiceState()
}

// ── Router ─────────────────────────────────────────────────────────────

export default async function handler(req: VercelReq, res: VercelRes) {
  res.setHeader('Cache-Control', 'no-store')
  if (!process.env.ADMIN_PASSWORD || !hasDb()) {
    return res.status(503).json({ error: 'The admin isn’t set up yet (missing ADMIN_PASSWORD or database).' })
  }

  const action = str(req.query?.action)
  const b: Body = req.body ?? {}
  const post = req.method === 'POST'

  try {
    if (action === 'login' && post) return await login(req, res, b)
    if (action === 'forgot' && post) return await forgotPassword(req, res, b)
    if (action === 'reset' && post) return await resetPassword(req, res, b)
    if (action === 'logout' && post) {
      clearSession(res)
      return res.status(200).json({ ok: true })
    }
    const me = await currentAdmin(req)
    if (!me) return res.status(401).json({ error: 'Signed out' })

    const ok = (data: unknown) => res.status(200).json(data)
    if (post && b.id !== undefined && /^(booking|order|subscriber|admin)-/.test(action) && !Number.isInteger(Number(b.id))) {
      throw new BadRequest('Missing id')
    }

    if (action === 'me') {
      const [{ hall, leasing }] = await query<{ hall: number; leasing: number }>(
        `select count(*) filter (where kind = 'hall')::int as hall, count(*) filter (where kind = 'leasing')::int as leasing
         from bookings where status = 'new' and archived_at is null`,
      )
      return ok({
        admin: me,
        email: hasEmail(),
        notifications: hasEmail() && (await hasAlertRecipient()),
        uploads: hasBlob(),
        calendar: hasCalendar(),
        payments: hasStripe(),
        backups: Boolean(process.env.CRON_SECRET) && hasEmail() && (await hasAlertRecipient('backup')),
        newBookings: hall,
        newLeasing: leasing,
        artistInfo: (
          await query<{ n: number }>(`select count(*)::int as n from artist_links where status = 'submitted'`).catch(() => [{ n: 0 }])
        )[0].n,
        // Still signing in with the shared setup password: nudge them to pick their own.
        usingSetupPassword: checkPassword(
          process.env.ADMIN_PASSWORD!,
          (await query<{ password_hash: string | null }>(`select password_hash from admins where id = $1`, [me.id]))[0]
            ?.password_hash ?? null,
        ),
      })
    }

    if (!post) {
      switch (action) {
        case 'events':
          return ok((await query(`select * from events order by date desc`)).map(eventFromRow))
        case 'tenants':
          return ok((await query(`select * from tenants order by sort, name`)).map(tenantFromRow))
        case 'bookings':
          return ok(await query(`select * from bookings where kind = 'hall' and archived_at is null order by created_at desc`))
        case 'leasing':
          return ok(await query(`select * from bookings where kind = 'leasing' and archived_at is null order by created_at desc`))
        case 'subscribers':
          return ok(await query(`select id, email, created_at, unsubscribed_at from subscribers order by created_at desc`))
        case 'announcements':
          return ok(await query(`select * from announcements order by created_at desc limit 50`))
        case 'overview':
          return ok(await overview())
        case 'analytics':
          return ok(await analytics(req.query?.days))
        case 'settings':
          return ok(await getSettings())
        case 'orders':
          return ok(
            await query(
              `select o.*, e.title as event_title, e.date as event_date from orders o
               left join events e on e.id = o.event_id order by e.date desc nulls last, o.created_at`,
            ),
          )
        case 'artist-links':
          return ok(await artistLinks())
        case 'voice-schedule':
          return ok(await voiceState())
        case 'admins':
          return ok(
            await query(
              `select a.id, a.email, a.name, a.role, a.alerts, a.created_at, a.last_login_at, c.name as created_by_name
               from admins a left join admins c on c.id = a.created_by order by a.created_at`,
            ),
          )
      }
    } else {
      switch (action) {
        case 'artist-link-send':
          return ok(await sendArtistLink(b, me))
        case 'artist-link-approve':
          return ok(await approveArtistLink(b, me))
        case 'artist-link-discard':
          return ok(await closeArtistLink(b, me, 'discarded'))
        case 'artist-link-revoke':
          return ok(await closeArtistLink(b, me, 'revoked'))
        case 'event-save':
          return ok(await saveEvent(b, me))
        case 'event-delete': {
          await query(`delete from events where id = $1`, [str(b.id)])
          const calendar = hasCalendar() ? ((await deleteCalendarEvent(str(b.id))) ? 'synced' : 'failed') : 'off'
          return ok({ ok: true, calendar })
        }
        case 'calendar-sync':
          return ok(await syncCalendar())
        case 'tenant-save':
          return ok(await saveTenant(b))
        case 'tenant-delete':
          await query(`delete from tenants where id = $1`, [str(b.id)])
          return ok({ ok: true })
        case 'tenant-order': {
          const ids: string[] = Array.isArray(b.ids) ? b.ids.map(str) : []
          await query(`update tenants set sort = array_position($1::text[], id) where id = any($1::text[])`, [ids])
          return ok({ ok: true })
        }
        case 'booking-update': {
          const [row] = await query<{ kind: RequestKind }>(`select kind from bookings where id = $1`, [Number(b.id)])
          if (!row) throw new BadRequest('That request no longer exists')
          if (!isStatusFor(row.kind, b.status)) throw new BadRequest('Unknown status')
          const status = b.status
          await query(`update bookings set status = $2, notes = $3 where id = $1`, [
            Number(b.id),
            status,
            opt(b.notes, 5000),
          ])
          return ok({ ok: true })
        }
        case 'booking-delete':
          // Archived, never erased: still in the database and the weekly backup.
          await query(`update bookings set archived_at = now() where id = $1`, [Number(b.id)])
          return ok({ ok: true })
        case 'subscriber-add': {
          const email = str(b.email).trim().toLowerCase()
          if (!isEmail(email)) throw new BadRequest('That doesn’t look like an email address')
          // Someone who unsubscribed stays unsubscribed; only they can rejoin,
          // by signing up on the site again.
          await query(`insert into subscribers (email) values ($1) on conflict (email) do nothing`, [email])
          return ok({ ok: true })
        }
        case 'subscriber-delete':
          // Kept on record as unsubscribed so they're never emailed again.
          await query(`update subscribers set unsubscribed_at = coalesce(unsubscribed_at, now()) where id = $1`, [Number(b.id)])
          return ok({ ok: true })
        case 'upload':
          return ok(await upload(b))
        case 'announce':
          return ok(await sendAnnouncement(b, req))
        case 'announce-preview':
          return ok(announcementPreview(b))
        case 'voice-preview':
          return ok(await voicePreview(b))
        case 'voice-send':
          return ok(await sendVoice(b, req))
        case 'voice-schedule':
          return ok(await saveVoiceSchedule(b))
        case 'booking-form': {
          // Blank = the site's own form (requests land under Hall requests).
          const url = opt(b.url, 500)
          if (url && !/^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/)/.test(url)) {
            throw new BadRequest('Paste the Google Form’s share link (it starts with https://docs.google.com/forms/ or https://forms.gle/)')
          }
          await query(
            `insert into settings (key, value) values ('booking_form_url', $1)
             on conflict (key) do update set value = excluded.value, updated_at = now()`,
            [url],
          )
          return ok({ ok: true })
        }
        case 'order-update':
          await query(
            `update orders set checked_in = $2,
               refunded_at = case when $3 then coalesce(refunded_at, now()) else null end where id = $1`,
            [Number(b.id), Boolean(b.checkedIn), Boolean(b.refunded)],
          )
          return ok({ ok: true })
        case 'admin-add':
          return ok(await addAdmin(me, b))
        case 'admin-remove': {
          requireAdmin(me)
          const id = Number(b.id)
          if (id === me.id) throw new BadRequest('You can’t remove yourself. Ask another admin to.')
          await query(`delete from admins where id = $1`, [id])
          return ok({ ok: true })
        }
        case 'admin-role': {
          requireAdmin(me)
          const id = Number(b.id)
          if (id === me.id) throw new BadRequest('You can’t change your own role. Ask another admin to.')
          if (b.role !== 'admin' && b.role !== 'member') throw new BadRequest('Unknown role')
          const rows = await query(`update admins set role = $2 where id = $1 returning id`, [id, b.role])
          if (!rows.length) throw new BadRequest('That person is no longer on the team')
          return ok({ ok: true })
        }
        case 'admin-alerts': {
          const id = Number(b.id)
          if (id !== me.id) requireAdmin(me)
          const alerts = [...new Set((Array.isArray(b.alerts) ? b.alerts : []).filter(isAlertKind))]
          const rows = await query(`update admins set alerts = $2 where id = $1 returning id`, [id, alerts])
          if (!rows.length) throw new BadRequest('That person is no longer on the team')
          return ok({ ok: true })
        }
        case 'admin-reset': {
          requireAdmin(me)
          // A new temporary password for someone who forgot theirs.
          const password = tempPassword()
          const rows = await query(`update admins set password_hash = $2 where id = $1 returning id`, [
            Number(b.id),
            hashPassword(password),
          ])
          if (!rows.length) throw new BadRequest('That person is no longer on the team')
          return ok({ password })
        }
        case 'password':
          await changePassword(me, b)
          await setSession(res, me.id) // keep this device signed in; others are signed out
          return ok({ ok: true })
      }
    }
    return res.status(404).json({ error: 'Unknown action' })
  } catch (e) {
    if (e instanceof BadRequest || e instanceof InvalidArtist) return res.status(400).json({ error: e.message })
    if (e instanceof Conflict) return res.status(409).json({ error: e.message, ...e.data })
    if (e instanceof Forbidden) return res.status(403).json({ error: e.message })
    console.error(`admin ${action} failed`, e)
    return res.status(500).json({ error: 'Something went wrong. Try again.' })
  }
}

