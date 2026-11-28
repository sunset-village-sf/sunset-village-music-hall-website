'use client'

// The event page's photos, in the event form. Pick from the show's files
// (artist photos stay private until someone adds them here) or upload new
// ones (they also land in the show's files), put them in order, add an
// optional caption. Saved with the event.

import { useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { postJson } from '@/lib/admin/api'
import { MAX_GALLERY, type GalleryPhoto } from '@/lib/data/events'
import { isPreviewable, type Asset } from '@/lib/assets'
import { uploadAsset } from '@/lib/upload-asset'
import { ErrorNote, Panel } from '@/components/internal/internal-ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function GalleryPanel({
  value,
  onChange,
  eventId,
  files,
  onUploaded,
  uploads,
}: {
  value: GalleryPhoto[]
  onChange: (next: GalleryPhoto[]) => void
  /** Saved events only: uploads go into the show's files. */
  eventId?: string
  /** The show's files in the asset library. */
  files: Asset[]
  onUploaded: () => void
  uploads: boolean
}) {
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const inGallery = new Set(value.map((p) => p.url))
  const choices = files.filter((f) => isPreviewable(f.content_type) && f.kind !== 'document' && !inGallery.has(f.url))
  const full = value.length >= MAX_GALLERY

  const set = (i: number, patch: Partial<GalleryPhoto>) => onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const move = (i: number, by: -1 | 1) => {
    const next = [...value]
    ;[next[i], next[i + by]] = [next[i + by], next[i]]
    onChange(next)
  }

  async function upload(list: FileList) {
    if (!eventId) return
    setError('')
    const added: GalleryPhoto[] = []
    for (const file of Array.from(list).slice(0, MAX_GALLERY - value.length)) {
      try {
        setProgress(`Uploading ${file.name}…`)
        const url = await uploadAsset(file, {
          kind: 'photo',
          artistId: null,
          eventId,
          onProgress: (p) => setProgress(`Uploading ${file.name}… ${p}%`),
        })
        await postJson('asset-add', { url, filename: file.name, kind: 'photo', artistId: null, eventId })
        added.push({ url })
      } catch (e) {
        setError((e as Error).message)
      }
    }
    setProgress('')
    if (added.length) onChange([...value, ...added])
    onUploaded()
  }

  return (
    <Panel title="Photos on the event page">
      <div className="flex flex-col gap-4">
        <p className="text-meta text-ink-2">
          A gallery under the details: promo shots before the show, photos from the night after. The first two also go in
          the Village Voice. Artists’ photos only appear once you add them here. Remember to save the event.
        </p>

        {value.length > 0 && (
          <ol className="flex flex-col gap-2">
            {value.map((p, i) => (
              <li key={p.url} className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL */}
                <img src={p.url} alt="" className="size-16 shrink-0 rounded-xs object-cover" />
                <Input
                  density="compact"
                  aria-label={`Caption for photo ${i + 1}`}
                  placeholder="Caption (optional), e.g. “Photo: Jane Doe”"
                  maxLength={200}
                  value={p.caption ?? ''}
                  onChange={(e) => set(i, { caption: e.target.value || undefined })}
                  className="min-w-48 flex-1"
                />
                <span className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" aria-label={`Move photo ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ChevronUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Move photo ${i + 1} down`}
                    disabled={i === value.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ChevronDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove photo ${i + 1} from the page`}
                    onClick={() => onChange(value.filter((_, j) => j !== i))}
                  >
                    <X />
                  </Button>
                </span>
              </li>
            ))}
          </ol>
        )}

        {choices.length > 0 && !full && (
          <details>
            <summary className="cursor-pointer text-meta font-semibold">Add from this show’s files ({choices.length})</summary>
            <ul className="mt-2 flex flex-wrap gap-2">
              {choices.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => onChange([...value, { url: f.url }])}
                    title={`Add ${f.filename}${f.artist_name ? ` from ${f.artist_name}` : ''}`}
                    aria-label={`Add ${f.filename}${f.artist_name ? ` from ${f.artist_name}` : ''}`}
                    className="block rounded-sm border-2 border-transparent p-0.5 hover:border-ink"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- library file */}
                    <img src={f.url} alt="" className="size-24 rounded-xs bg-muted object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}

        {eventId ? (
          uploads &&
          !full && (
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="gallery-file" className={progress ? 'pointer-events-none opacity-50' : 'cursor-pointer'}>
                <Button asChild size="sm" variant="outline">
                  <span>Upload photos</span>
                </Button>
              </label>
              <input
                id="gallery-file"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                disabled={Boolean(progress)}
                onChange={(e) => {
                  if (e.target.files?.length) upload(e.target.files)
                  e.target.value = ''
                }}
              />
              {progress && (
                <span role="status" className="text-meta">
                  {progress}
                </span>
              )}
            </div>
          )
        ) : (
          <p className="text-meta">Save the event first, then add photos.</p>
        )}
        {full && <p className="text-meta">That’s the most photos one event can have ({MAX_GALLERY}).</p>}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Panel>
  )
}
