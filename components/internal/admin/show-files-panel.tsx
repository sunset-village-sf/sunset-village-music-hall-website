'use client'

// On the event edit page: the show's files from the asset library (what
// artists sent through their links, plus anything the team adds here),
// grouped by artist, with "Download all".

import { useState } from 'react'
import { postJson } from '@/lib/admin/api'
import { ASSET_KINDS, acceptFor, type Asset, type AssetKind } from '@/lib/assets'
import type { Artist } from '@/lib/artists'
import { uploadAsset } from '@/lib/upload-asset'
import { ErrorNote, Panel } from '@/components/internal/internal-ui'
import { AssetGrid, DownloadAll } from '@/components/internal/admin/asset-grid'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function ShowFilesPanel({
  eventId,
  title,
  lineup,
  assets,
  reload,
  uploads,
}: {
  eventId: string
  title: string
  /** The saved lineup (entries with artist records). */
  lineup: Artist[]
  assets: Asset[]
  reload: () => void
  uploads: boolean
}) {
  const artists = lineup.filter((a) => a.id)
  const [whose, setWhose] = useState<string>(artists[0]?.id ? String(artists[0].id) : 'show')
  const [kind, setKind] = useState<AssetKind>('photo')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  async function add(list: FileList) {
    setError('')
    const artistId = whose === 'show' ? null : Number(whose)
    for (const file of Array.from(list)) {
      try {
        setProgress(`Uploading ${file.name}…`)
        const url = await uploadAsset(file, {
          kind,
          artistId,
          eventId,
          onProgress: (p) => setProgress(`Uploading ${file.name}… ${p}%`),
        })
        await postJson('asset-add', { url, filename: file.name, kind, artistId, eventId })
      } catch (e) {
        setError((e as Error).message)
      }
    }
    setProgress('')
    reload()
  }

  // Grouped by artist, in lineup order, then the show's own files.
  const groups = [
    ...artists.map((a) => ({ name: a.name, files: assets.filter((x) => x.artist_id === a.id) })),
    {
      name: 'Other files',
      files: assets.filter((x) => !artists.some((a) => a.id === x.artist_id)),
    },
  ].filter((g) => g.files.length)

  return (
    <Panel title="Files for this show" action={<DownloadAll assets={assets} name={title} />}>
      <div className="flex flex-col gap-4">
        <p className="text-meta text-ink-2">
          Photos, flyers and documents from artists’ links land here (and under Assets). Add your own too.
        </p>
        {groups.length === 0 ? (
          <p className="text-ink-2">No files yet.</p>
        ) : (
          groups.map((g) => (
            <section key={g.name} className="flex flex-col gap-2">
              <h3 className="font-semibold">
                {g.name} <span className="font-normal text-ink-2">({g.files.length})</span>
              </h3>
              <AssetGrid assets={g.files} onDeleted={reload} showArtist={g.name === 'Other files'} />
            </section>
          ))
        )}
        {uploads && (
          <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sf-whose">Whose</Label>
              <Select value={whose} onValueChange={setWhose}>
                <SelectTrigger id="sf-whose" size="sm" className="min-w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {artists.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="show">The show (no artist)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sf-kind">Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as AssetKind)}>
                <SelectTrigger id="sf-kind" size="sm" className="min-w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label htmlFor="sf-file" className={progress ? 'pointer-events-none opacity-50' : 'cursor-pointer'}>
              <Button asChild size="sm" variant="outline">
                <span>Add files</span>
              </Button>
            </label>
            <input
              id="sf-file"
              type="file"
              multiple
              accept={acceptFor(kind)}
              className="sr-only"
              disabled={Boolean(progress)}
              onChange={(e) => {
                if (e.target.files?.length) add(e.target.files)
                e.target.value = ''
              }}
            />
            {progress && (
              <span role="status" className="text-meta">
                {progress}
              </span>
            )}
          </div>
        )}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Panel>
  )
}
