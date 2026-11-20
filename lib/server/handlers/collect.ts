// /api/collect: the public site's page views and ticket-link clicks, for the
// admin's Analytics tab. Sent by components/site/analytics.tsx.
//
// Privacy: no cookies, and the IP address is never stored. Each row keeps the
// page, the other site a visitor came from (its name only), phone or computer,
// and a visitor code that is a hash of the day, the IP and the browser, so it
// changes every day. Bots and people signed in to the admin aren't counted.
// Rows older than 25 months are deleted.

import { createHash } from 'node:crypto'
import { query, hasDb } from '../db'
import { currentAdmin } from '../auth'
import { SITE_URL } from '../email'
import { clientIp, header, opt, type VercelReq, type VercelRes } from '../http'

const KINDS = ['view', 'ticket'] as const
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|node-fetch|axios|go-http|java\//i

const siteHost = new URL(SITE_URL).hostname

/** "https://www.instagram.com/p/…" → "instagram.com". Null for no referrer or this site. */
function referrerHost(ref: string | null, host: string) {
  if (!ref) return null
  try {
    const h = new URL(ref).hostname.replace(/^(www|m|l|lm)\./, '')
    return h === siteHost || h === host.replace(/^www\./, '').split(':')[0] || h === 'localhost' ? null : h.slice(0, 100)
  } catch {
    return null
  }
}

/** Changes every day (Pacific), so the same person can't be linked across days. */
function visitorCode(req: VercelReq, ua: string) {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  return createHash('sha256')
    .update(`${process.env.ADMIN_PASSWORD ?? ''}|${day}|${clientIp(req)}|${ua}`)
    .digest('hex')
    .slice(0, 16)
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const done = () => res.status(200).json({ ok: true })
  if (!hasDb()) return done()

  const ua = header(req, 'user-agent')
  if (!ua || BOT.test(ua)) return done()

  const b = req.body ?? {}
  const kind = KINDS.find((k) => k === b.kind)
  const path = opt(b.path, 300)
  if (!kind || !path || !path.startsWith('/') || path.startsWith('/admin') || path.startsWith('/api')) return done()

  try {
    if (await currentAdmin(req)) return done() // the team browsing their own site
    const eventFromPath = path.match(/^\/events\/([^/?#]+)/)?.[1]
    const eventId = opt(b.eventId, 200) ?? (eventFromPath ? decodeURIComponent(eventFromPath) : null)
    await query(
      `insert into analytics (kind, path, event_id, referrer, device, visitor) values ($1, $2, $3, $4, $5, $6)`,
      [
        kind,
        path.split(/[?#]/)[0],
        eventId,
        kind === 'view' ? referrerHost(opt(b.referrer, 500), header(req, 'host')) : null,
        /Mobi|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop',
        visitorCode(req, ua),
      ],
    )
    // Now and then, clear out old rows.
    if (Math.random() < 0.01) await query(`delete from analytics where at < now() - interval '25 months'`)
  } catch (e) {
    console.error('analytics', e)
  }
  return done()
}
