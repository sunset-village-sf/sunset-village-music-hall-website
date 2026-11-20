// Vercel serverless function: POST /api/inquiry
// Saves a hall booking request or leasing inquiry to the database (shown in /admin under
// Hall requests or Leasing) and emails the team members who get that alert (see
// lib/server/alerts.ts) via Resend when email is set up.
// Succeeds if either the save or the email went through; if both fail the
// visitor sees an error (their form stays filled in) and can try again.

import { query, hasDb } from '../db'
import { sendEmail, hasEmail, inquiryTo, fromMailbox, SITE_URL } from '../email'
import { alertRecipients } from '../alerts'
import { str, isEmail, type VercelReq, type VercelRes } from '../http'
import { spamCheck } from '../spam'

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Without a database the alert is the only copy, and it can only go to INQUIRY_TO.
  if (!hasDb() && !(hasEmail() && inquiryTo().length > 0)) {
    return res.status(500).json({ error: 'Inquiry endpoint not configured' })
  }

  const body = req.body ?? {}
  const leasing = body.kind === 'leasing'
  const type = str(body.type).slice(0, 100)
  const space = leasing ? (str(body.space) || type.replace(/^Leasing · /, '')).slice(0, 60) : ''
  const name = str(body.name).slice(0, 200)
  const org = str(body.org).slice(0, 200)
  const email = str(body.email).slice(0, 200)
  const phone = str(body.phone).slice(0, 60)
  const date = str(body.date).slice(0, 40)
  const backupDate = str(body.backupDate).slice(0, 40)
  const headcount = str(body.headcount).slice(0, 40)
  const needs = (Array.isArray(body.needs) ? body.needs : [])
    .map((n) => str(n).slice(0, 60))
    .filter(Boolean)
    .slice(0, 12)
    .join(', ')
  const message = str(body.message).slice(0, 5000)
  if (!name || !isEmail(email) || !message) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const spam = await spamCheck(req, { checkSpeed: true })
  if (spam === 'drop') return res.status(200).json({ ok: true })
  if (spam === 'reject') return res.status(400).json({ error: 'Spam check failed, please try again' })

  let saved = false
  if (hasDb()) {
    saved = await query(
      `insert into bookings (kind, space, type, name, org, email, phone, date, backup_date, headcount, needs, message)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [leasing ? 'leasing' : 'hall', space || null, type, name, org || null, email, phone || null, date || null, backupDate || null, headcount || null, needs || null, message],
    )
      .then(() => true)
      .catch((e) => {
        console.error('inquiry: database save failed', e)
        return false
      })
  }

  let emailed = false
  const to = hasEmail() ? await alertRecipients(leasing ? 'leasing' : 'hall') : []
  if (to.length) {
    const lines = [
      leasing ? `Space: ${space || '(not given)'}` : `Type: ${type || '(not given)'}`,
      `Name: ${name}`,
      `${leasing ? 'Business' : 'Band / org / company'}: ${org || '(none)'}`,
      `Email: ${email}`,
      `Phone: ${phone || '(none)'}`,
      ...(leasing
        ? []
        : [
            `Preferred date: ${date || '(none)'}`,
            `Backup date: ${backupDate || '(none)'}`,
            `Expected guests: ${headcount || '(none)'}`,
            `Needs: ${needs || '(none)'}`,
          ]),
      '',
      'Message:',
      message,
      '',
      saved ? `Also saved in the admin: ${SITE_URL}/admin/${leasing ? 'leasing' : 'requests'}` : '',
    ]
    emailed = await sendEmail({
      ...(leasing ? { from: fromMailbox('leasing') } : {}),
      to,
      reply_to: email,
      subject: leasing
        ? `Sunset Village leasing inquiry — ${space || 'space'} — ${name}`
        : `Sunset Village hall request — ${type || 'general'} — ${name}`,
      text: lines.join('\n'),
    })
  }

  if (!saved && !emailed) return res.status(502).json({ error: 'Could not save inquiry' })
  return res.status(200).json({ ok: true })
}
