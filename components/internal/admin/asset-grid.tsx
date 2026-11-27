'use client'

// Files from the artist asset library as a grid of cards (thumbnail or file
// name, who sent it, download, delete), plus "Download all" as one zip built
// in the browser.

import { useState } from 'react'
import { zip, type Zippable } from 'fflate'
import { postJson } from '@/lib/admin/api'
import { ASSET_KINDS, formatSize, isPreviewable, type Asset } from '@/lib/assets'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const kindLabel = (k: string) => ASSET_KINDS.find((x) => x.value === k)?.label ?? k
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'file'

/** Zip these files (in folders by artist and kind) and download it as `name`.zip. */
export function DownloadAll({ assets, name }: { assets: Asset[]; name: string }) {
  const [state, setState] = useState<'' | 'busy' | 'error'>('')
  const [done, setDone] = useState(0)

  async function go() {
    setState('busy')
    setDone(0)
    try {
      const files: Zippable = {}
      const used = new Set<string>()
      for (const a of assets) {
        const data = new Uint8Array(await (await fetch(a.url)).arrayBuffer())
        let path = `${safe(a.artist_name ?? 'The show')}/${kindLabel(a.kind)}s/${safe(a.filename)}`
        for (let n = 2; used.has(path); n++) path = path.replace(/(\.[^./]+)?$/, ` (${n})$1`)
        used.add(path)
        files[path] = [data, { level: 0 }] // photos and PDFs are already compressed
        setDone((d) => d + 1)
      }
      const zipped = await new Promise<Uint8Array>((ok, fail) => zip(files, (err, out) => (err ? fail(err) : ok(out))))
      const href = URL.createObjectURL(new Blob([zipped as BlobPart], { type: 'application/zip' }))
      const link = Object.assign(document.createElement('a'), { href, download: `${safe(name)}.zip` })
      link.click()
      setTimeout(() => URL.revokeObjectURL(href), 10_000)
      setState('')
    } catch {
      setState('error')
    }
  }

  if (!assets.length) return null
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="outline" onClick={go} disabled={state === 'busy'}>
        {state === 'busy' ? `Zipping ${done} of ${assets.length}…` : `Download all (${assets.length})`}
      </Button>
      {state === 'error' && <span className="text-meta text-danger-text">Couldn’t make the zip. Try again.</span>}
    </span>
  )
}

export function AssetGrid({
  assets,
  onDeleted,
  showEvent,
  showArtist = true,
}: {
  assets: Asset[]
  onDeleted: () => void
  showEvent?: boolean
  showArtist?: boolean
}) {
  const [error, setError] = useState('')

  async function remove(a: Asset) {
    if (!confirm(`Delete ${a.filename} from the library?`)) return
    try {
      await postJson('asset-delete', { id: a.id })
      onDeleted()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      {error && <p className="text-meta text-danger-text">{error}</p>}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
        {assets.map((a) => (
          <li key={a.id} className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-card p-2">
            <a href={a.url} target="_blank" rel="noreferrer" className="block" aria-label={`Open ${a.filename}`}>
              {isPreviewable(a.content_type) ? (
                // eslint-disable-next-line @next/next/no-img-element -- library file, any size
                <img src={a.url} alt="" loading="lazy" className="aspect-square w-full rounded-sm bg-fog object-cover" />
              ) : (
                <span className="flex aspect-square w-full items-center justify-center rounded-sm bg-fog px-2 text-center text-meta break-all">
                  {a.filename}
                </span>
              )}
            </a>
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge tone={a.kind === 'flyer' ? 'sun' : a.kind === 'photo' ? 'teal' : 'paper'} size="sm">
                {kindLabel(a.kind)}
              </Badge>
              <span className="truncate text-meta" title={a.filename}>
                {a.filename}
              </span>
            </span>
            <span className="text-meta text-ink-2">
              {[
                showArtist && (a.artist_name ?? 'The show'),
                showEvent && a.event_title,
                formatSize(a.size),
                `${a.uploaded_by === 'artist' ? 'from the artist' : a.uploaded_by}, ${when(a.created_at)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <span className="mt-auto flex flex-wrap gap-1">
              <Button asChild size="sm" variant="outline">
                <a href={`${a.url}?download=1`} download={a.filename}>
                  Download
                </a>
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => remove(a)} aria-label={`Delete ${a.filename}`}>
                Delete
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
