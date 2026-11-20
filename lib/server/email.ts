// Resend REST API (no SDK). This site only ever uses the plain email
// endpoints, never Resend Audiences/Segments: the subscriber list lives in
// this site's own database. Use a *sending-only* API key restricted to the
// sunsetvillagesf.com domain so the key cannot reach any other site's lists.

import { SITE_URL } from './newsletter-email'

export { SITE_URL, emailFont } from './newsletter-email'

export const hasEmail = () => Boolean(process.env.RESEND_API_KEY && process.env.INQUIRY_FROM)

/** Team inbox(es) for alerts and backups: INQUIRY_TO, one address or several separated by commas. */
export const inquiryTo = () =>
  (process.env.INQUIRY_TO ?? '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)

/** INQUIRY_FROM with another mailbox on the same domain, e.g. bookings@ → leasing@. Keeps the display name. */
export const fromMailbox = (mailbox: string) => (process.env.INQUIRY_FROM ?? '').replace(/[^\s<@]+@/, `${mailbox}@`)

export interface Email {
  /** Defaults to INQUIRY_FROM. */
  from?: string
  to: string[]
  subject: string
  text: string
  html?: string
  reply_to?: string
  headers?: Record<string, string>
}

const resend = (path: string, body: unknown) =>
  fetch(`https://api.resend.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

export async function sendEmail(e: Email): Promise<boolean> {
  if (!hasEmail()) return false
  const r = await resend('/emails', { from: process.env.INQUIRY_FROM, ...e }).catch(() => null)
  return Boolean(r?.ok)
}

/** Up to 100 emails per call (Resend batch limit). Returns how many were accepted. */
export async function sendBatch(emails: Email[]): Promise<number> {
  if (!hasEmail()) return 0
  let sent = 0
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100).map((e) => ({ from: process.env.INQUIRY_FROM, ...e }))
    const r = await resend('/emails/batch', chunk).catch(() => null)
    if (r?.ok) sent += chunk.length
  }
  return sent
}

export const unsubscribeUrl = (token: string) => `${SITE_URL}/api/newsletter?unsubscribe=${token}`
