// Artist links: an admin emails an artist a private link where they send
// their own name, bio, photo and links for an event's lineup. Submissions wait
// for an admin to approve them before anything changes on the site.
//
// The link's secret is only in the email (and shown once to the admin who
// sent it); the database keeps a hash of it.

import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { query } from './db'
import { sendEmail, SITE_URL } from './email'
import { alertRecipients } from './alerts'
import { opt } from './http'
import { esc } from './newsletter-email'
import tokens from '@/lib/tokens.json'
import {
  MAX_BIO,
  facebookUrl,
  instagramHandle,
  isUploadedImage,
  websiteUrl,
  type Artist,
} from '@/lib/artists'

export const LINK_DAYS = 14

export type LinkStatus = 'sent' | 'submitted' | 'approved' | 'discarded' | 'replaced' | 'revoked'

export interface ArtistLinkRow {
  id: number
  event_id: string
  artist_name: string
  email: string
  status: LinkStatus
  created_at: string
  created_by: string | null
  expires_at: string
  submitted_at: string | null
  submission: Artist | null
  reviewed_at: string | null
  reviewed_by: string | null
}

/** A problem with what the artist (or an admin) typed, in words they can act on. */
export class InvalidArtist extends Error {}

export const hashToken = (token: string) => createHash('sha256').update(`sv-artist:${token}`).digest('hex')
export const linkUrl = (token: string) => `${SITE_URL}/artist/${token}`

/** The link if it can still be used: not expired, not approved, discarded, replaced or revoked. */
export async function openLink(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null
  const [row] = await query<ArtistLinkRow & { title: string; date: string; artists: Artist[] }>(
    `select l.*, e.title, e.date, e.artists from artist_links l join events e on e.id = l.event_id
     where l.token_hash = $1 and l.status in ('sent', 'submitted') and l.expires_at > now()`,
    [hashToken(token)],
  )
  return row ?? null
}

/** Find an artist in a lineup by name, ignoring case and extra spaces. */
export const findArtist = (artists: Artist[] = [], name: string) =>
  artists.findIndex((a) => a.name.trim().toLowerCase() === name.trim().toLowerCase())

/** Check and tidy one artist's details. Throws InvalidArtist with a message for the person who typed them. */
export function cleanArtist(b: Record<string, unknown>): Artist {
  const name = opt(b.name, 100)
  if (!name) throw new InvalidArtist('Add your name as it should appear')
  const ig = opt(b.instagram, 200)
  const instagram = ig ? instagramHandle(ig) : null
  if (ig && !instagram) throw new InvalidArtist('Your Instagram doesn’t look like a username. Try @yourname.')
  const fb = opt(b.facebook, 300)
  const facebook = fb ? facebookUrl(fb) : null
  if (fb && !facebook) throw new InvalidArtist('Your Facebook doesn’t look like a Facebook page link.')
  const web = opt(b.website, 300)
  const website = web ? websiteUrl(web) : null
  if (web && !website) throw new InvalidArtist('Your website doesn’t look like a web address.')
  const bio = opt(b.bio, MAX_BIO + 50)
  if (bio && bio.length > MAX_BIO) throw new InvalidArtist(`Keep the bio under ${MAX_BIO} characters.`)
  const photo = opt(b.photo, 500)
  if (photo && !isUploadedImage(photo)) throw new InvalidArtist('Upload the photo with the button on this page.')
  return {
    name,
    ...(instagram && { instagram }),
    ...(facebook && { facebook }),
    ...(website && { website }),
    ...(bio && { bio }),
    ...(photo && { photo }),
  }
}

/** Make a new link for one artist on an event. Any earlier open link for them is replaced. */
export async function createLink(eventId: string, artistName: string, email: string, by: string) {
  const token = randomBytes(24).toString('base64url')
  await query(
    `update artist_links set status = 'replaced' where event_id = $1 and lower(artist_name) = lower($2) and status in ('sent', 'submitted')`,
    [eventId, artistName],
  )
  const [row] = await query<ArtistLinkRow>(
    `insert into artist_links (token_hash, event_id, artist_name, email, created_by, expires_at)
     values ($1, $2, $3, $4, $5, now() + interval '${LINK_DAYS} days') returning *`,
    [hashToken(token), eventId, artistName, email, by],
  )
  return { row, token, url: linkUrl(token) }
}

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' })
const c = (k: keyof typeof tokens.color) => tokens.color[k].value

/** Email the link to the artist. Replies go to the admin who sent it. False if email isn't set up or failed. */
export function emailLink(o: {
  to: string
  artist: string
  event: { title: string; date: string }
  url: string
  expires: string
  replyTo: string
}) {
  const lines = [
    `Hi ${o.artist},`,
    '',
    `You’re on the lineup for ${o.event.title} at Sunset Village Music Hall on ${longDate(o.event.date)}.`,
    '',
    'So we get the details right on our website and posts, please check how your name is spelled and add a short bio, a photo and your links here:',
    '',
    o.url,
    '',
    `The link works until ${shortDate(o.expires)}. You can come back and change things until we’ve put them up.`,
    '',
    'Thanks!',
    'Sunset Village Music Hall',
  ]
  const text = lines.join('\n')
  const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:${c('ink')};max-width:560px">
${lines
  .filter((l) => l !== o.url)
  .map((l) => (l === '' ? '' : `<p style="margin:0 0 12px">${esc(l)}</p>`))
  .join('\n')
  .replace(
    `<p style="margin:0 0 12px">${esc(lines[4])}</p>`,
    `<p style="margin:0 0 12px">${esc(lines[4])}</p>\n<p style="margin:0 0 20px"><a href="${esc(o.url)}" style="display:inline-block;background:${c('ink')};color:${c('paper')};padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">Add your details</a></p>`,
  )}
</div>`
  return sendEmail({
    to: [o.to],
    subject: `Your details for ${o.event.title} at Sunset Village Music Hall`,
    text,
    html,
    reply_to: o.replyTo,
  })
}

/** Tell the team an artist sent their details. */
export async function alertSubmitted(artist: string, event: { title: string }) {
  const to = await alertRecipients('artists')
  if (!to.length) return
  await sendEmail({
    to,
    subject: `${artist} sent their details for ${event.title}`,
    text: `${artist} filled in their details for ${event.title}. Review and approve them in the admin:\n\n${SITE_URL}/admin/artists`,
  })
}
