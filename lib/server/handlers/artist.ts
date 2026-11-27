// Vercel serverless function: /api/artist — the artist's side of an artist link
// (the page itself, app/(site)/artist/[token], loads the details on the server).
//   POST ?action=file         {token, url, filename, kind}   register a file they uploaded (see /api/upload)
//   POST ?action=file-delete  {token, id}                    remove one of their own files
//   POST ?action=submit       {token, name, bio, photo, instagram, facebook, website}
// Every call needs a link that is still open (not expired, replaced or
// cancelled). Links stay open after an admin approves the details, so artists
// can keep adding files; changing their details sends them back for review.

import { query, hasDb } from '../db'
import { str, type VercelReq, type VercelRes } from '../http'
import { InvalidArtist, alertSubmitted, cleanArtist, openLink } from '../artist-links'
import { InvalidAsset, hideAsset, registerAsset } from '../assets'
import { isAssetKind } from '@/lib/assets'

const GONE = 'This link has expired or has been replaced. Ask us for a new one.'

export default async function handler(req: VercelReq, res: VercelRes) {
  res.setHeader('Cache-Control', 'no-store')
  if (!hasDb()) return res.status(503).json({ error: 'Not available right now. Try again later.' })
  const b: Record<string, unknown> = req.body ?? {}
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })
  const link = await openLink(str(b.token))
  if (!link) return res.status(410).json({ error: GONE })

  try {
    const action = str(req.query?.action)

    if (action === 'file') {
      if (!isAssetKind(b.kind)) throw new InvalidAsset('Unknown kind of file')
      if (!link.artist_id) throw new InvalidAsset('This link can’t take files. Ask us for a new one.')
      const asset = await registerAsset(str(b.url), str(b.filename), {
        artistId: link.artist_id,
        eventId: link.event_id,
        linkId: link.id,
        kind: b.kind,
        by: 'artist',
      })
      return res.status(200).json(asset)
    }

    if (action === 'file-delete') {
      await hideAsset(Number(b.id), link.id)
      return res.status(200).json({ ok: true })
    }

    if (action === 'submit') {
      const artist = cleanArtist(b)
      // First time, or a change after we approved: tell the team. (Edits while
      // it's still waiting for review just update what they'll see.)
      const notify = link.status !== 'submitted'
      await query(`update artist_links set submission = $2, status = 'submitted', submitted_at = now() where id = $1`, [
        link.id,
        JSON.stringify(artist),
      ])
      if (notify) await alertSubmitted(artist.name, { title: link.title }).catch((e) => console.error('artist alert failed', e))
      return res.status(200).json({ ok: true })
    }

    return res.status(404).json({ error: 'Unknown action' })
  } catch (e) {
    if (e instanceof InvalidArtist || e instanceof InvalidAsset) return res.status(400).json({ error: e.message })
    console.error('artist link failed', e)
    return res.status(500).json({ error: 'Something went wrong. Try again.' })
  }
}
