'use client'

// Add / edit one event. The form edits the online price in dollars; the API
// stores cents.

import { useState, type FormEvent } from 'react'
import { ConflictError, postJson, type Setup } from '@/lib/admin/api'
import { ALL_PLACES, DISPLAY_PLACES, type DisplayPlace, type EventCategory, type VillageEvent } from '@/lib/data/events'
import { CATEGORIES, categoryLabel } from '@/components/brand/categories'
import { ErrorNote, FormField, Panel } from '@/components/internal/internal-ui'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ImagePicker } from './image-picker'
import { ArtistsField, firstBadSocial, tidyArtists, toArtistDrafts, type ArtistDraft } from './artists-field'
import type { Artist } from '@/lib/artists'
import { EditConflict, type EventConflict, type Pick } from './edit-conflict'
import { ArtistLinksPanel } from './artist-links-panel'
import { ShowFilesPanel } from './show-files-panel'
import { GalleryPanel } from './gallery-panel'
import { getJson } from '@/lib/admin/api'
import { useLoad } from '@/lib/admin/use-load'
import { isPreviewable, type Asset } from '@/lib/assets'

export type EventDraft = Omit<Partial<VillageEvent>, 'ticketPrice' | 'capacity' | 'artists'> & {
  ticketPrice?: string
  capacity?: string
  artists?: ArtistDraft[]
}

export const toDraft = (e: Partial<VillageEvent>): EventDraft => ({
  ...e,
  ticketPrice: e.ticketPrice ? String(e.ticketPrice / 100) : '',
  capacity: e.capacity ? String(e.capacity) : '',
  artists: toArtistDrafts(e.artists),
})

export function EventForm({
  initial,
  setup,
  knownArtists = [],
  onDone,
}: {
  initial: EventDraft
  setup: Setup
  /** Artists from other events, for name suggestions. */
  knownArtists?: Artist[]
  onDone: (saved?: VillageEvent) => void
}) {
  const [d, setD] = useState<EventDraft>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showArtistErrors, setShowArtistErrors] = useState(false)
  // What the form started from. The server merges against it, so fields you
  // didn't touch keep anyone else's newer changes.
  const [base] = useState(() => (initial.id ? { ...initial, artists: tidyArtists(initial.artists ?? []) } : undefined))
  const [conflict, setConflict] = useState<EventConflict | null>(null)
  // The show's files in the asset library (saved events only).
  const files = useLoad<Asset[]>(
    () => (base ? getJson<Asset[]>(`assets&event=${encodeURIComponent(base.id!)}`) : Promise.resolve([])),
    () => {},
  )
  const flyerChoices = (files.data ?? [])
    .filter((f) => (f.kind === 'flyer' || f.kind === 'photo') && isPreviewable(f.content_type))
    .sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'flyer' ? -1 : 1))
    .map((f) => ({ url: f.url, label: `${f.kind === 'flyer' ? 'Flyer' : 'Photo'} from ${f.artist_name ?? 'the show'}: ${f.filename}` }))
  const [picks, setPicks] = useState<Record<string, Pick>>({})
  const set = (k: keyof EventDraft) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value })
  const display = d.display ?? ALL_PLACES
  const toggle = (place: DisplayPlace, on: boolean) =>
    setD({ ...d, display: ALL_PLACES.filter((p) => (p === place ? on : display.includes(p))) })

  async function save(e?: FormEvent) {
    e?.preventDefault()
    const bad = firstBadSocial(d.artists ?? [])
    if (bad) {
      setShowArtistErrors(true)
      setError('One of the artist links needs fixing. It’s marked below.')
      document.getElementById(bad)?.focus()
      return
    }
    setBusy(true)
    setError('')
    try {
      const resolve = conflict ? { ...picks, version: conflict.version } : undefined
      onDone(await postJson<VillageEvent>('event-save', { ...d, artists: tidyArtists(d.artists ?? []), base, resolve }))
    } catch (err) {
      if (err instanceof ConflictError) {
        const next = err.data as EventConflict
        // Keep choices for fields that still clash; anything new needs a fresh pick.
        setPicks((p) => Object.fromEntries(next.conflicts.filter((c) => p[c.key]).map((c) => [c.key, p[c.key]])))
        setConflict(next)
        window.scrollTo(0, 0)
      } else {
        setError((err as Error).message)
      }
      setBusy(false)
    }
  }

  async function remove() {
    if (!d.id || !confirm(`Delete “${d.title}”? This removes it from the site.`)) return
    setBusy(true)
    try {
      await postJson('event-delete', { id: d.id })
      onDone()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      {conflict && (
        <EditConflict
          conflict={conflict}
          mine={d}
          picks={picks}
          onPick={(key, pick) => setPicks({ ...picks, [key]: pick })}
          onSave={() => save()}
          busy={busy}
        />
      )}
      <Panel title="The event">
        <div className="flex flex-col gap-4">
          <FormField label="Event name" htmlFor="ev-title">
            <Input density="compact" id="ev-title" required value={d.title ?? ''} onChange={set('title')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Category" htmlFor="ev-category" hint="Sets the color and the filter on the Events page.">
              <Select value={d.category ?? 'music'} onValueChange={(v) => setD({ ...d, category: v as EventCategory })}>
                <SelectTrigger id="ev-category" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {categoryLabel[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Kind line (optional)" htmlFor="ev-kind" hint="Small line above the title, e.g. “Live music · Indie rock”.">
              <Input density="compact" id="ev-kind" value={d.kind ?? ''} onChange={set('kind')} />
            </FormField>
          </div>
          <FormField label="Subtitle (optional)" htmlFor="ev-subtitle" hint="One line under the title, e.g. “with Low Tide Choir”.">
            <Input density="compact" id="ev-subtitle" value={d.subtitle ?? ''} onChange={set('subtitle')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Date" htmlFor="ev-date">
              <Input density="compact" id="ev-date" required type="date" value={d.date ?? ''} onChange={set('date')} />
            </FormField>
            <FormField label="Time" htmlFor="ev-time" hint="Written however you like, e.g. “Doors 7pm” or “6 to 9pm”.">
              <Input density="compact" id="ev-time" value={d.time ?? ''} onChange={set('time')} />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Start time (optional)"
              htmlFor="ev-startTime"
              hint="For Google Calendar. Leave blank for an all-day entry."
            >
              <Input density="compact" id="ev-startTime" type="time" value={d.startTime ?? ''} onChange={set('startTime')} />
            </FormField>
            <FormField
              label="End time (optional)"
              htmlFor="ev-endTime"
              hint="Blank means three hours after the start. Past midnight is fine."
            >
              <Input density="compact" id="ev-endTime" type="time" value={d.endTime ?? ''} onChange={set('endTime')} />
            </FormField>
          </div>
          <FormField
            label="Where"
            htmlFor="ev-venue"
            hint="Usually the Music Hall."
          >
            <Input density="compact" id="ev-venue" list="venues" value={d.venue ?? ''} onChange={set('venue')} />
            <datalist id="venues">
              <option value="Music Hall" />
            </datalist>
          </FormField>
          <FormField label="Short description" htmlFor="ev-summary" hint="One or two sentences. Shown in the calendar lists.">
            <Textarea density="compact" id="ev-summary" required rows={2} value={d.summary ?? ''} onChange={set('summary')} />
          </FormField>
          <FormField
            label="Full description (optional)"
            htmlFor="ev-details"
            hint="Shown on the event’s own page. Leave blank to reuse the short description."
          >
            <Textarea density="compact" id="ev-details" rows={5} value={d.details ?? ''} onChange={set('details')} />
          </FormField>
        </div>
      </Panel>

      <Panel title="Artists">
        <ArtistsField
          value={d.artists ?? []}
          onChange={(artists) => setD({ ...d, artists })}
          known={knownArtists}
          showErrors={showArtistErrors}
          uploads={setup.uploads}
        />
      </Panel>

      {base && (
        <ShowFilesPanel
          eventId={base.id!}
          title={base.title ?? 'show'}
          lineup={base.artists ?? []}
          assets={files.data ?? []}
          reload={files.reload}
          uploads={setup.uploads}
        />
      )}

      {base && (
        <ArtistLinksPanel
          eventId={base.id!}
          saved={base.artists ?? []}
          unsaved={
            tidyArtists(d.artists ?? [])
              .map((a) => a.name.toLowerCase())
              .join('\n') !== (base.artists ?? []).map((a) => a.name.toLowerCase()).join('\n')
          }
        />
      )}

      <Panel title="Where it shows">
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Where it shows</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {DISPLAY_PLACES.map((p) => (
              <span key={p.id} className="flex items-center gap-2">
                <Checkbox
                  id={`ev-display-${p.id}`}
                  checked={display.includes(p.id)}
                  onCheckedChange={(v) => toggle(p.id, v === true)}
                />
                <Label htmlFor={`ev-display-${p.id}`} className="font-normal">
                  {p.label}
                </Label>
              </span>
            ))}
          </div>
          <p className="text-meta text-ink-2">
            {display.length === 0
              ? 'Not shown anywhere. Handy for a draft or a hold.'
              : !display.includes('website')
                ? 'Hidden from the website, e.g. a private rental.'
                : 'Untick a place to keep the event off it.'}
          </p>
        </fieldset>
      </Panel>

      <Panel title="Tickets">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Sell tickets on this site: price ($)"
              htmlFor="ev-ticketPrice"
              hint={
                setup.payments
                  ? 'e.g. 15. Shows a Buy tickets button; buyers pay by card through Stripe. Leave blank for none.'
                  : 'Works once Stripe is connected. Until then this event uses the link or door price below.'
              }
            >
              <Input
                density="compact"
                id="ev-ticketPrice"
                inputMode="decimal"
                value={d.ticketPrice ?? ''}
                onChange={set('ticketPrice')}
                placeholder="15"
              />
            </FormField>
            <FormField
              label="Tickets available online"
              htmlFor="ev-capacity"
              hint="Stops sales at this number. Leave blank for no limit."
            >
              <Input
                density="compact"
                id="ev-capacity"
                inputMode="numeric"
                value={d.capacity ?? ''}
                onChange={set('capacity')}
                placeholder="70"
              />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Price shown (optional)"
              htmlFor="ev-price"
              hint="e.g. “$10” or “$10 / $15 at the door”. Leave blank for free."
            >
              <Input density="compact" id="ev-price" value={d.price ?? ''} onChange={set('price')} />
            </FormField>
            <FormField
              label="Outside ticket link (optional)"
              htmlFor="ev-ticketUrl"
              hint="Only if selling somewhere else (Ticket Tailor, Eventbrite)."
            >
              <Input
                density="compact"
                id="ev-ticketUrl"
                type="url"
                value={d.ticketUrl ?? ''}
                onChange={set('ticketUrl')}
                placeholder="https://"
              />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Button label (optional)"
              htmlFor="ev-cta"
              hint="e.g. “Get tickets” or “RSVP”. Leave blank for “Get tickets”."
            >
              <Input density="compact" id="ev-cta" value={d.cta ?? ''} onChange={set('cta')} />
            </FormField>
          </div>
        </div>
      </Panel>

      <Panel>
        <ImagePicker
          label="Flyer"
          noun="flyer"
          value={d.flyer}
          onChange={(flyer) => setD({ ...d, flyer })}
          enabled={setup.uploads}
          name={d.title ?? ''}
          hint="Use the same 4:5 image you post on Instagram (1080×1350 is ideal). It’s shown whole on the event card, the event’s page and the home page."
          poster
          choices={flyerChoices}
        />
      </Panel>

      <GalleryPanel
        value={d.gallery ?? []}
        onChange={(gallery) => setD({ ...d, gallery })}
        eventId={base?.id}
        files={files.data ?? []}
        onUploaded={files.reload}
        uploads={setup.uploads}
      />

      <ErrorNote>{error}</ErrorNote>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Saving…' : d.id ? 'Save changes' : 'Add to calendar'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onDone()} disabled={busy}>
          Cancel
        </Button>
        {d.id && (
          <Button type="button" variant="destructive" size="sm" onClick={remove} disabled={busy} className="ml-auto">
            Delete event
          </Button>
        )}
      </div>
    </form>
  )
}
