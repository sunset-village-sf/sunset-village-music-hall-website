// The artist asset library on the server. Files go straight from the browser
// to storage (no size limit from our API): /api/upload hands out a one-time
// upload permit for a specific folder, then the page registers the finished
// file here, which checks with storage that it really is in that folder.

import 'server-only'
import { head } from '@vercel/blob'
import { query } from './db'
import { ALLOWED_TYPES, MAX_FILE_BYTES, assetFolder, type Asset, type AssetKind } from '@/lib/assets'

export class InvalidAsset extends Error {}

export interface UploadTarget {
  artistId: number | null
  eventId: string
  linkId: number | null
  kind: AssetKind
  by: string
}

/** Record an uploaded file in the library, after checking it with storage. */
export async function registerAsset(url: string, filename: string, t: UploadTarget): Promise<Asset> {
  let blob
  try {
    blob = await head(url)
  } catch {
    throw new InvalidAsset('That upload didn’t finish. Try again.')
  }
  if (!blob.pathname.startsWith(assetFolder(t.artistId, t.eventId))) throw new InvalidAsset('That file is in the wrong place.')
  if (blob.size > MAX_FILE_BYTES) throw new InvalidAsset('That file is too large.')
  if (!ALLOWED_TYPES[t.kind].includes(blob.contentType)) throw new InvalidAsset('That type of file isn’t allowed here.')
  const [row] = await query<Asset>(
    `insert into artist_assets (artist_id, event_id, link_id, kind, url, pathname, filename, content_type, size, uploaded_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning id, artist_id, event_id, kind, url, filename, content_type, size, uploaded_by, created_at`,
    [
      t.artistId,
      t.eventId,
      t.linkId,
      t.kind,
      blob.url,
      blob.pathname,
      filename.slice(0, 200) || blob.pathname.split('/').pop(),
      blob.contentType,
      blob.size,
      t.by,
    ],
  )
  return row
}

const SELECT = `select a.id, a.artist_id, a.event_id, a.kind, a.url, a.filename, a.content_type, a.size, a.uploaded_by, a.created_at,
    r.name as artist_name, e.title as event_title, e.date as event_date
  from artist_assets a left join artists r on r.id = a.artist_id left join events e on e.id = a.event_id
  where a.deleted_at is null`

/** The whole library, newest first. */
export const listAssets = () => query<Asset>(`${SELECT} order by a.created_at desc limit 5000`)

/** One show's files. */
export const eventAssets = (eventId: string) =>
  query<Asset>(`${SELECT} and a.event_id = $1 order by a.kind, a.created_at`, [eventId])

/** Files uploaded through one artist link. */
export const linkAssets = (linkId: number) =>
  query<Asset>(`${SELECT} and a.link_id = $1 order by a.kind, a.created_at`, [linkId])

/** Hide a file from the library (it stays in storage). `linkId` limits it to that link's own uploads. */
export async function hideAsset(id: number, linkId?: number) {
  const rows = await query(
    `update artist_assets set deleted_at = now() where id = $1 and deleted_at is null ${linkId ? 'and link_id = $2' : ''} returning id`,
    linkId ? [id, linkId] : [id],
  )
  if (!rows.length) throw new InvalidAsset('That file is already gone.')
}

export const countLinkAssets = async (linkId: number) =>
  (await query<{ n: number }>(`select count(*)::int as n from artist_assets where link_id = $1 and deleted_at is null`, [linkId]))[0].n
