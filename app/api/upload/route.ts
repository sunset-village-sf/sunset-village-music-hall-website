// Upload permits for the artist asset library. The browser asks for a permit
// to put one file in one folder, then sends the file straight to storage (so
// big files don't go through our functions). Permits go to:
//   - an artist with an open artist link: only their folder for that show
//   - a signed-in admin: any artist's (or the show's) folder for an event
// The page then registers the finished file (/api/artist?action=file or the
// admin's asset-add), which checks the folder again.

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'
import { currentAdmin } from '@/lib/server/auth'
import { openLink } from '@/lib/server/artist-links'
import { countLinkAssets } from '@/lib/server/assets'
import { query } from '@/lib/server/db'
import { ALLOWED_TYPES, MAX_FILE_BYTES, MAX_FILES_PER_LINK, assetFolder, isAssetKind } from '@/lib/assets'

export const dynamic = 'force-dynamic'

type Payload = { token?: string; kind?: string; artistId?: number | null; eventId?: string }

async function folderFor(p: Payload, request: Request): Promise<string> {
  if (p.token) {
    const link = await openLink(p.token)
    if (!link) throw new Error('This link has expired. Ask us for a new one.')
    if (!link.artist_id) throw new Error('This link can’t take files. Ask us for a new one.')
    if ((await countLinkAssets(link.id)) >= MAX_FILES_PER_LINK) throw new Error(`Up to ${MAX_FILES_PER_LINK} files per link.`)
    return assetFolder(link.artist_id, link.event_id)
  }
  const admin = await currentAdmin({ headers: { cookie: request.headers.get('cookie') ?? '' } } as never)
  if (!admin) throw new Error('Signed out')
  const eventId = String(p.eventId ?? '')
  const [ev] = await query(`select id from events where id = $1`, [eventId])
  if (!ev) throw new Error('That event no longer exists')
  return assetFolder(p.artistId ?? null, eventId)
}

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const p: Payload = JSON.parse(clientPayload ?? '{}')
        if (!isAssetKind(p.kind)) throw new Error('Unknown kind of file')
        const folder = await folderFor(p, request)
        if (!pathname.startsWith(folder)) throw new Error('Wrong folder')
        return {
          allowedContentTypes: ALLOWED_TYPES[p.kind],
          maximumSizeInBytes: MAX_FILE_BYTES,
          addRandomSuffix: true,
        }
      },
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
