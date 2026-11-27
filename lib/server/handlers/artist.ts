// Vercel serverless function: /api/artist — the artist's side of an artist link
// (the page itself, app/(site)/artist/[token], loads the details on the server).
//   POST ?action=upload  {token, data, contentType}   their photo (resized in the browser first)
//   POST ?action=submit  {token, name, bio, photo, instagram, facebook, website}
// Every call needs a link that is still open (not expired, approved or replaced).

import { put } from '@vercel/blob'
import { query, hasDb } from '../db'
import { str, type VercelReq, type VercelRes } from '../http'
import { InvalidArtist, alertSubmitted, cleanArtist, openLink } from '../artist-links'

const GONE = 'This link has expired or has already been used. Ask us for a new one.'
const hasBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)

export default async function handler(req: VercelReq, res: VercelRes) {
  res.setHeader('Cache-Control', 'no-store')
  if (!hasDb()) return res.status(503).json({ error: 'Not available right now. Try again later.' })
  const b: Record<string, unknown> = req.body ?? {}
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })
  const link = await openLink(str(b.token))
  if (!link) return res.status(410).json({ error: GONE })

  try {
    const action = str(req.query?.action)
    if (action === 'upload') {
      if (!hasBlob()) throw new InvalidArtist('Photo uploads aren’t available right now. Send the rest and email us the photo.')
      const type = str(b.contentType)
      if (!['image/webp', 'image/jpeg', 'image/png'].includes(type)) throw new InvalidArtist('Use a JPG, PNG or WebP image.')
      const data = Buffer.from(str(b.data), 'base64')
      if (data.length === 0 || data.length > 3_500_000) throw new InvalidArtist('That image is too large.')
      const slug = link.artist_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'artist'
      const blob = await put(`artists/${slug}.${type.split('/')[1].replace('jpeg', 'jpg')}`, data, {
        access: 'public',
        contentType: type,
        addRandomSuffix: true,
      })
      return res.status(200).json({ url: blob.url })
    }

    if (action === 'submit') {
      const artist = cleanArtist(b)
      const first = link.status === 'sent'
      await query(`update artist_links set submission = $2, status = 'submitted', submitted_at = now() where id = $1`, [
        link.id,
        JSON.stringify(artist),
      ])
      if (first) await alertSubmitted(artist.name, { title: link.title }).catch((e) => console.error('artist alert failed', e))
      return res.status(200).json({ ok: true })
    }

    return res.status(404).json({ error: 'Unknown action' })
  } catch (e) {
    if (e instanceof InvalidArtist) return res.status(400).json({ error: e.message })
    console.error('artist link failed', e)
    return res.status(500).json({ error: 'Something went wrong. Try again.' })
  }
}
