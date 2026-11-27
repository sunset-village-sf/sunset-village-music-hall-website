'use client'

// Shown when you and someone else changed the same fields of an event: both
// versions side by side, pick one per field, then save again.

import { DISPLAY_PLACES, type DisplayPlace, type EventCategory } from '@/lib/data/events'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { categoryLabel } from '@/components/brand/categories'

export interface EventConflict {
  conflicts: { key: string; label: string }[]
  /** Fields only they changed: kept as they are. */
  kept: string[]
  /** The event as saved now, in the form's shape. */
  current: Record<string, unknown>
  version: string
  updatedBy: string | null
  updatedAt: string
}

export type Pick = 'mine' | 'theirs'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function show(key: string, v: unknown): React.ReactNode {
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
    return key === 'display' ? 'Nowhere (draft)' : <span className="text-ink-2">(blank)</span>
  }
  if (key === 'artists') {
    return (v as { name?: string; headliner?: boolean }[])
      .filter((a) => a.name)
      .map((a) => (a.headliner ? `${a.name} (headliner)` : a.name))
      .join(', ')
  }
  if (key === 'display') {
    return DISPLAY_PLACES.filter((p) => (v as DisplayPlace[]).includes(p.id))
      .map((p) => p.label)
      .join(', ')
  }
  if (key === 'category') return categoryLabel[v as EventCategory] ?? String(v)
  if (key === 'ticketPrice') return `$${v}`
  if (key === 'flyer') {
    // eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL
    return <img src={String(v)} alt="" className="aspect-[4/5] w-24 rounded-sm border border-border bg-muted object-contain" />
  }
  return <span className="whitespace-pre-line">{String(v)}</span>
}

export function EditConflict({
  conflict,
  mine,
  picks,
  onPick,
  onSave,
  busy,
}: {
  conflict: EventConflict
  mine: Record<string, unknown>
  picks: Record<string, Pick>
  onPick: (key: string, pick: Pick) => void
  onSave: () => void
  busy: boolean
}) {
  const who = conflict.updatedBy ?? 'Someone else'
  const ready = conflict.conflicts.every((c) => picks[c.key])
  return (
    <Alert variant="warning" className="flex flex-col gap-4 font-normal" role="alert">
      <div>
        <p className="font-semibold">
          {who} saved changes to this event ({when(conflict.updatedAt)}) while you were editing it.
        </p>
        <p>
          You both changed {conflict.conflicts.length === 1 ? 'this field' : 'these fields'}. Choose which version to keep,
          then save again. Nothing has been saved yet.
        </p>
      </div>
      {conflict.conflicts.map((c) => (
        <fieldset key={c.key} className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">{c.label}</legend>
          <ToggleGroup
            type="single"
            value={picks[c.key] ?? ''}
            onValueChange={(v) => v && onPick(c.key, v as Pick)}
            aria-label={`Which ${c.label} to keep`}
            spacing={2}
            className="flex-wrap items-stretch"
          >
            <ToggleGroupItem value="theirs" className="h-auto min-w-48 flex-1 flex-col items-start gap-1 px-3 py-2 text-left">
              <span className="label-sm">{who}’s</span>
              <span className="font-normal">{show(c.key, conflict.current[c.key])}</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="mine" className="h-auto min-w-48 flex-1 flex-col items-start gap-1 px-3 py-2 text-left">
              <span className="label-sm">Yours</span>
              <span className="font-normal">{show(c.key, mine[c.key])}</span>
            </ToggleGroupItem>
          </ToggleGroup>
        </fieldset>
      ))}
      {conflict.kept.length > 0 && (
        <p className="text-meta">
          {who}’s other changes ({conflict.kept.join(', ')}) will be kept. You didn’t change those.
        </p>
      )}
      <div>
        <Button type="button" size="sm" onClick={onSave} disabled={!ready || busy}>
          {busy ? 'Saving…' : 'Save with these choices'}
        </Button>
      </div>
    </Alert>
  )
}
