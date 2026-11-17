// Vercel cron: GET /api/calendar-sync, nightly (see vercel.json "crons").
// Saving an event already updates Google Calendar; this re-sends every upcoming
// event so a change Google missed (it was unreachable at save time) catches up
// within a day, without anyone pressing "Sync Google Calendar". Vercel signs
// cron calls with CRON_SECRET; anything else is refused.

import { hasDb } from '../db'
import { hasCalendar } from '../gcal'
import { header, type VercelReq, type VercelRes } from '../http'
import { syncCalendar } from './admin'

export default async function handler(req: VercelReq, res: VercelRes) {
  const secret = process.env.CRON_SECRET
  if (!secret || header(req, 'authorization') !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  // Not set up yet is a normal state, not a failure.
  if (!hasDb() || !hasCalendar()) return res.status(200).json({ ok: true, skipped: 'Not configured' })

  const result = await syncCalendar()
  if (result.synced < result.total) {
    console.error('calendar-sync: some events failed', result)
    return res.status(502).json({ ok: false, ...result })
  }
  return res.status(200).json({ ok: true, ...result })
}
