// The artist asset library: files for a show (photos, flyers, documents such
// as riders and stage plots), filed by artist and show. Shared by the admin,
// the artist's link page and the API.

export type AssetKind = 'photo' | 'flyer' | 'document'

export const ASSET_KINDS: { value: AssetKind; label: string; plural: string; hint: string }[] = [
  { value: 'photo', label: 'Photo', plural: 'Photos', hint: 'Press and promo shots, full size.' },
  { value: 'flyer', label: 'Flyer', plural: 'Flyers', hint: 'If you made a flyer for the show.' },
  { value: 'document', label: 'Document', plural: 'Documents', hint: 'Rider, stage plot, input list…' },
]

export interface Asset {
  id: number
  artist_id: number | null
  event_id: string | null
  kind: AssetKind
  url: string
  filename: string
  content_type: string | null
  size: number | null
  uploaded_by: string
  created_at: string
  artist_name?: string | null
  event_title?: string | null
  event_date?: string | null
}

export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const MAX_FILES_PER_LINK = 30

const IMAGES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
const DOCS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]

/** File types each kind accepts. */
export const ALLOWED_TYPES: Record<AssetKind, string[]> = {
  photo: IMAGES,
  flyer: [...IMAGES, 'application/pdf'],
  document: [...DOCS, ...IMAGES],
}

/** For a file input's `accept`. */
export const acceptFor = (kind: AssetKind) => ALLOWED_TYPES[kind].join(',')

export const isAssetKind = (v: unknown): v is AssetKind => v === 'photo' || v === 'flyer' || v === 'document'

/** Images a browser can show as a thumbnail (not HEIC). */
export const isPreviewable = (type: string | null | undefined) =>
  Boolean(type && /^image\/(jpeg|png|webp|gif)$/.test(type))

/**
 * Where a show's files live in storage: assets/<artist id or "show">/<event id>/.
 * Uploads must land under the folder they were authorized for.
 */
export const assetFolder = (artistId: number | null, eventId: string) =>
  `assets/${artistId ?? 'show'}/${encodeURIComponent(eventId)}/`

/** A tidy file name for storage (keeps the extension). */
export function storageName(name: string) {
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) : ''
  const base =
    (dot > 0 ? name.slice(0, dot) : name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'file'
  return ext ? `${base}.${ext}` : base
}

export const formatSize = (bytes: number | null | undefined) =>
  !bytes ? '' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
