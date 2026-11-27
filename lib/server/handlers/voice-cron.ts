// Vercel cron: GET /api/voice-cron (13:00 UTC) and /api/voice-cron/retry (14:00 UTC), Sundays and Mondays
// (see vercel.json). Two runs because 6am Pacific is 13:00 UTC in summer and
// 14:00 in winter; each run checks the Pacific time itself, and each step
// happens at most once per issue, so the extra run does nothing.
//   Sunday:  email the team a preview of tomorrow's issue (if one is due).
//   Monday:  send the issue to subscribers, unless it's off, skipped or has no shows.
// Vercel signs cron calls with CRON_SECRET; anything else is refused.
//
// For checking without sending: ?dry=1 (and optionally &now=<ISO time>) says
// what it would do and changes nothing.

import { hasDb, getSettings } from '../db'
import { hasEmail, sendEmail, SITE_URL } from '../email'
import { alertRecipients } from '../alerts'
import { header, str, type VercelReq, type VercelRes } from '../http'
import { defaultSubject, issueHtml } from '../newsletter-email'
import { buildIssue, sendIssue } from './admin'
import { SEND_HOUR, VOICE_DAYS, addDays, claimSend, isIssueDay, pacificNow, setSetting } from '../voice-schedule'

const nice = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })

async function tellTeam(subject: string, text: string, html?: string) {
  const to = await alertRecipients('voice')
  if (to.length) await sendEmail({ to, subject, text, ...(html && { html }) })
}

export default async function handler(req: VercelReq, res: VercelRes) {
  const secret = process.env.CRON_SECRET
  if (!secret || header(req, 'authorization') !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!hasDb() || !hasEmail()) return res.status(200).json({ ok: true, skipped: 'Not configured' })

  const dry = str(req.query?.dry) === '1'
  const now = dry && req.query?.now ? new Date(str(req.query.now)) : new Date()
  const { date, dow, hour } = pacificNow(now)
  const done = (what: string, extra: Record<string, unknown> = {}) =>
    res.status(200).json({ ok: true, dry, pacific: { date, dow, hour }, what, ...extra })

  // Before 6am the other run (an hour later) handles it; long after, don't send a stale issue.
  if (hour < SEND_HOUR || hour > SEND_HOUR + 2) return done('Outside the send window')
  const s = await getSettings()
  if (s.voice_auto === 'off') return done('Automatic Village Voice is off')

  // ── Sunday: preview tomorrow's issue to the team ──
  if (dow === 0) {
    const issue = addDays(date, 1)
    if (!isIssueDay(issue)) return done('No issue tomorrow')
    if (s.voice_skip === issue) return done('Tomorrow’s issue is skipped')
    if (s.voice_preview_for === issue) return done('Preview already sent')
    const i = await buildIssue({ start: issue, days: VOICE_DAYS, note: s.voice_note })
    const subject = defaultSubject(i.start, i.end)
    if (dry) return done('Would send the preview', { issue, shows: i.events.length, subject })
    await setSetting('voice_preview_for', issue)
    const manage = `${SITE_URL}/admin/newsletter`
    if (!i.events.length) {
      await tellTeam(
        `No Village Voice tomorrow: no shows ${nice(issue)} – ${nice(i.end)}`,
        `Tomorrow’s Village Voice would cover ${nice(issue)} to ${nice(i.end)}, but there are no shows on the calendar then, so it won’t go out. Add a show before 6am tomorrow and it will.\n\n${manage}`,
      )
      return done('Told the team there are no shows', { issue })
    }
    const intro = `Tomorrow (${nice(issue)}) at 6am, this Village Voice goes to everyone on the list. To change the note or skip it, open ${manage} before then. Shows and details come from the calendar, so edit the events themselves to fix anything.`
    await tellTeam(
      `Preview: Village Voice going out tomorrow at 6am (${i.events.length} ${i.events.length === 1 ? 'show' : 'shows'})`,
      `${intro}\n\nSubject: ${subject}`,
      `<p style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;max-width:600px">${intro.replace(manage, `<a href="${manage}">the Newsletter tab</a>`)}</p><p style="font-family:system-ui,sans-serif;font-size:13px">Subject: ${subject}</p><hr>${issueHtml(i, { assets: SITE_URL, unsubscribeUrl: '#' })}`,
    )
    return done('Sent the preview', { issue, shows: i.events.length })
  }

  // ── Monday: send ──
  if (dow === 1) {
    if (!isIssueDay(date)) return done('Not an issue day')
    if (s.voice_skip === date) return done('This issue was skipped')
    if (s.voice_sent_for === date) return done('Already sent')
    const i = await buildIssue({ start: date, days: VOICE_DAYS, note: s.voice_note })
    if (dry) return done(i.events.length ? 'Would send the issue' : 'Would skip: no shows', { issue: date, shows: i.events.length })
    if (!(await claimSend(date))) return done('Already sent')
    if (!i.events.length) {
      await tellTeam(
        `Village Voice skipped: no shows ${nice(date)} – ${nice(i.end)}`,
        `Today’s Village Voice didn’t go out because there are no shows on the calendar from ${nice(date)} to ${nice(i.end)}. The next one is ${nice(addDays(date, VOICE_DAYS))}.`,
      )
      return done('Skipped: no shows', { issue: date })
    }
    try {
      const r = await sendIssue(i, SITE_URL)
      await setSetting('voice_note', null)
      await tellTeam(
        `Village Voice sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}`,
        `Today’s Village Voice (${i.events.length} ${i.events.length === 1 ? 'show' : 'shows'}) went to ${r.sent} of ${r.total} subscribers. The next one is ${nice(addDays(date, VOICE_DAYS))}.`,
      )
      return done('Sent', { issue: date, ...r })
    } catch (e) {
      // Let the next run (an hour later) try again.
      await setSetting('voice_sent_for', s.voice_sent_for ?? null)
      console.error('voice-cron: send failed', e)
      await tellTeam('Village Voice didn’t go out', `Sending today’s Village Voice failed: ${(e as Error).message}. It will try once more within the hour; otherwise send it by hand from ${SITE_URL}/admin/newsletter.`).catch(() => {})
      return res.status(502).json({ ok: false, error: (e as Error).message })
    }
  }

  return done('Nothing to do today')
}
