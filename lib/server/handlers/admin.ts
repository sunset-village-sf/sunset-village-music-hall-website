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
  announcementHtml,
  announcementText,
  unsubscribeUrl,
  SITE_URL,
  type Email,
} from '../email'
import { str, opt, clientIp, isEmail, type VercelReq, type VercelRes } from '../http'
import { ALL_PLACES, showsOn, type DisplayPlace, type VillageEvent } from '@/lib/data/events'
import { MAX_ARTISTS, facebookUrl, instagramHandle, type Artist } from '@/lib/artists'

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

/** The lineup: drops empty rows, tidies social links, keeps at most one headliner. */
function cleanArtists(v: unknown): Artist[] {
  const rows = (Array.isArray(v) ? v : []) as Body[]
  const out: Artist[] = []
  for (const r of rows) {
    const name = opt(r?.name, 100)
    const ig = opt(r?.instagram, 200)
    const fb = opt(r?.facebook, 300)
    if (!name && !ig && !fb) continue
    if (!name) throw new BadRequest('Give each artist a name')
    const instagram = ig ? instagramHandle(ig) : null
    if (ig && !instagram) throw new BadRequest(`${name}’s Instagram doesn’t look like a username`)
    const facebook = fb ? facebookUrl(fb) : null
    if (fb && !facebook) throw new BadRequest(`${name}’s Facebook doesn’t look like a Facebook page`)
    const headliner = r.headliner === true && !out.some((a) => a.headliner)
    out.push({ name, ...(instagram && { instagram }), ...(facebook && { facebook }), ...(headliner && { headliner }) })
  }
  if (out.length > MAX_ARTISTS) throw new BadRequest(`Up to ${MAX_ARTISTS} artists per event`)
  return out
}

async function saveEvent(b: Body) {
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
  const fields = [
    title,
    date,
    opt(b.time, 100),
    opt(b.venue, 100) ?? 'Music Hall',
    need(opt(b.summary, 500), 'Short description'),
    opt(b.details, 5000),
    opt(b.price, 50),
    ticketUrl,
    opt(b.flyer, 500),
    ticketPrice,
    capacity,
    CATEGORIES.includes(b.category) ? b.category : 'music',
    opt(b.kind, 100),
    opt(b.subtitle, 200),
    opt(b.cta, 40),
    startTime,
    endTime,
    cleanDisplay(b.display),
    JSON.stringify(cleanArtists(b.artists)),
  ]
  // Existing events keep their id so their /events/<id> link never breaks.
  if (b.id) {
    const rows = await query(
      `update events set title=$2, date=$3, time=$4, venue=$5, summary=$6, details=$7, price=$8,
         ticket_url=$9, flyer=$10, ticket_price_cents=$11, capacity=$12, category=$13, kind=$14, subtitle=$15,
         cta=$16, start_time=$17, end_time=$18, display=$19, artists=$20, sample=false, updated_at=now() where id=$1 returning *`,
      [str(b.id), ...fields],
    )
    if (!rows.length) throw new BadRequest('That event no longer exists')
    return withCalendar(rows[0])
  }
  const id = await uniqueId('events', slugify(`${title} ${date.slice(5)}`))
  const rows = await query(
    `insert into events (id, title, date, time, venue, summary, details, price, ticket_url, flyer, ticket_price_cents, capacity,
       category, kind, subtitle, cta, start_time, end_time, display, artists)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) returning *`,
    [id, ...fields],
  )
  return withCalendar(rows[0])
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
  const blob = await put(`flyers/${slugify(str(b.name)) || 'flyer'}.${ext}`, data, {
    access: 'public',
    contentType: type,
    addRandomSuffix: true,
  })
  return { url: blob.url }
}

// ── Announcements ──────────────────────────────────────────────────────

async function sendAnnouncement(b: Body) {
  if (!hasEmail()) throw new BadRequest('Email sending isn’t set up yet')
  const subject = need(opt(b.subject, 200), 'Subject')
  const body = need(opt(b.body, 20000), 'Message')

  if (b.test) {
    const to = opt(b.testTo, 200) ?? inquiryTo()[0] ?? ''
    if (!isEmail(to)) throw new BadRequest('Enter an email address to send the test to')
    const unsub = unsubscribeUrl('test-preview')
    const ok = await sendEmail({
      to: [to],
      subject: `[Test] ${subject}`,
      text: announcementText(body, unsub),
      html: announcementHtml(body, unsub),
    })
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
      text: announcementText(body, unsub),
      html: announcementHtml(body, unsub),
      headers: {
        'List-Unsubscribe': `<${unsub}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }
  })
  const sent = await sendBatch(emails)
  await query(`insert into announcements (subject, body, recipients, sent) values ($1, $2, $3, $4)`, [
    subject,
    body,
    subs.length,
    sent,
  ])
  if (sent === 0) throw new BadRequest('The emails didn’t go through. Nothing was sent.')
  return { sent, total: subs.length }
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
        case 'event-save':
          return ok(await saveEvent(b))
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
          return ok(await sendAnnouncement(b))
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
    if (e instanceof BadRequest) return res.status(400).json({ error: e.message })
    if (e instanceof Forbidden) return res.status(403).json({ error: e.message })
    console.error(`admin ${action} failed`, e)
    return res.status(500).json({ error: 'Something went wrong. Try again.' })
  }
}

