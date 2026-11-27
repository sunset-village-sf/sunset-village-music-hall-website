'use client'

// Assets: every file artists (and the team) have added for shows: photos,
// flyers and documents. Browse by show or by artist, search, filter by kind,
// download one or all.

import { useMemo, useState } from 'react'
import { getJson } from '@/lib/admin/api'
import { useLoad } from '@/lib/admin/use-load'
import { ASSET_KINDS, type Asset, type AssetKind } from '@/lib/assets'
import { useAdmin } from '@/components/internal/admin-shell'
import { EmptyState, ErrorNote, Mono, PageHeader, Panel } from '@/components/internal/internal-ui'
import { AssetGrid, DownloadAll } from '@/components/internal/admin/asset-grid'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const day = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

export default function AssetsPage() {
  const { signedOut } = useAdmin()
  const { data, error, reload } = useLoad(() => getJson<Asset[]>('assets'), signedOut)
  const [by, setBy] = useState<'show' | 'artist'>('show')
  const [kind, setKind] = useState<'all' | AssetKind>('all')
  const [q, setQ] = useState('')

  const groups = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    const shown = (data ?? []).filter(
      (a) =>
        (kind === 'all' || a.kind === kind) &&
        words.every((w) => [a.artist_name, a.event_title, a.filename].some((f) => f?.toLowerCase().includes(w))),
    )
    const map = new Map<string, { title: string; sub?: string; sort: string; assets: Asset[] }>()
    for (const a of shown) {
      const key = by === 'show' ? (a.event_id ?? 'none') : String(a.artist_id ?? 'show')
      const g = map.get(key) ?? {
        title: by === 'show' ? (a.event_title ?? 'Deleted event') : (a.artist_name ?? 'Venue files (no artist)'),
        sub: by === 'show' && a.event_date ? day(a.event_date) : undefined,
        sort: by === 'show' ? (a.event_date ?? '') : (a.artist_name ?? '').toLowerCase(),
        assets: [],
      }
      g.assets.push(a)
      map.set(key, g)
    }
    return [...map.values()].sort((x, y) => (by === 'show' ? y.sort.localeCompare(x.sort) : x.sort.localeCompare(y.sort)))
  }, [data, by, kind, q])

  return (
    <>
      <PageHeader
        title="Assets"
        description="Photos, flyers and documents for shows, from artists’ links and the team. Add files from an event’s edit page."
      />
      <ErrorNote>{error}</ErrorNote>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Input
          density="compact"
          type="search"
          aria-label="Search artists, shows and file names"
          placeholder="Search artists, shows, file names"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-80"
        />
        <ToggleGroup type="single" size="sm" spacing={2} value={kind} onValueChange={(v) => v && setKind(v as typeof kind)} aria-label="Kind of file">
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          {ASSET_KINDS.map((k) => (
            <ToggleGroupItem key={k.value} value={k.value}>
              {k.plural}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup type="single" size="sm" spacing={2} value={by} onValueChange={(v) => v && setBy(v as typeof by)} aria-label="Group by">
          <ToggleGroupItem value="show">By show</ToggleGroupItem>
          <ToggleGroupItem value="artist">By artist</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {data &&
        (groups.length === 0 ? (
          <EmptyState>
            {data.length ? 'Nothing matches. Try another search.' : 'No files yet. They show up here when artists upload through their links.'}
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((g) => (
              <Panel
                key={g.title + (g.sub ?? '')}
                title={`${g.title} (${g.assets.length})`}
                action={<DownloadAll assets={g.assets} name={[g.title, g.sub].filter(Boolean).join(' ')} />}
              >
                {g.sub && <Mono className="-mt-2 mb-3 block text-ink-2">{g.sub}</Mono>}
                <AssetGrid assets={g.assets} onDeleted={reload} showArtist={by === 'show'} showEvent={by === 'artist'} />
              </Panel>
            ))}
          </div>
        ))}
    </>
  )
}
