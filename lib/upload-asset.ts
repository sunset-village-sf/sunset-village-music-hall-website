'use client'

// Send one file straight from the browser to storage, into the folder the
// server allowed, and report progress. The caller registers it afterwards.

import { upload } from '@vercel/blob/client'
import { ALLOWED_TYPES, MAX_FILE_BYTES, assetFolder, formatSize, storageName, type AssetKind } from '@/lib/assets'

export async function uploadAsset(
  file: File,
  o: {
    kind: AssetKind
    artistId: number | null
    eventId: string
    /** The artist link's secret (artist uploads); admins are recognized by their sign-in. */
    token?: string
    onProgress?: (percent: number) => void
  },
) {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is ${formatSize(file.size)}. Files can be up to ${formatSize(MAX_FILE_BYTES)}.`)
  if (!ALLOWED_TYPES[o.kind].includes(file.type)) throw new Error(`${file.name} isn’t a type of file we can take here.`)
  const blob = await upload(`${assetFolder(o.artistId, o.eventId)}${storageName(file.name)}`, file, {
    access: 'public',
    handleUploadUrl: '/api/upload',
    clientPayload: JSON.stringify({ token: o.token, kind: o.kind, artistId: o.artistId, eventId: o.eventId }),
    multipart: file.size > 8 * 1024 * 1024,
    onUploadProgress: (p) => o.onProgress?.(Math.round(p.percentage)),
  })
  return blob.url
}
