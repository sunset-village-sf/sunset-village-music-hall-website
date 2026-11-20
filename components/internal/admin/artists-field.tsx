'use client'

// The lineup editor in the event form: any number of artists, each with a
// name, Instagram, Facebook and website, one optionally marked as headliner.
//
// Made for fast entry: type a name, press Enter for the next row. Names used
// at earlier events are suggested, and picking one fills in their socials.
// Pasted links are tidied to a username / page link / full URL when you leave
// the field, with a "Check" link to make sure it's the right account.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, ChevronUp, ExternalLink, Plus, Star, X } from 'lucide-react'
import { MAX_ARTISTS, facebookUrl, instagramHandle, instagramUrl, websiteUrl, type Artist } from '@/lib/artists'
import { EmptyState, FormField } from '@/components/internal/internal-ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'

/** An artist row being edited. `key` is for React only and isn't saved. */
export type ArtistDraft = Artist & { key: string }

let nextKey = 0
const newKey = () => `artist-${++nextKey}`
export const toArtistDrafts = (artists: Artist[] = []): ArtistDraft[] => artists.map((a) => ({ ...a, key: newKey() }))
const blank = (): ArtistDraft => ({ key: newKey(), name: '' })

type Social = 'instagram' | 'facebook' | 'website'
const SOCIALS = ['instagram', 'facebook', 'website'] as const
const parse: Record<Social, (s: string) => string | null> = {
  instagram: instagramHandle,
  facebook: facebookUrl,
  website: websiteUrl,
}
const problem: Record<Social, string> = {
  instagram: 'Use their username, like @lowtidechoir, or paste their profile link.',
  facebook: 'Paste their Facebook page link, like facebook.com/lowtidechoir.',
  website: 'Paste their website’s address, like lowtidechoir.com. Instagram and Facebook go in their own fields.',
}

/** The first social field that won't save, so the form can point at it. */
export function firstBadSocial(artists: ArtistDraft[]): string | null {
  for (const a of artists)
    for (const f of SOCIALS) if (a[f] && !parse[f](a[f])) return `${a.key}-${f}`
  return null
}

/** Tidy every social link before saving (the API checks them too). */
export const tidyArtists = (artists: ArtistDraft[]): Artist[] =>
  artists
    .filter((a) => a.name.trim() || a.instagram || a.facebook || a.website)
    .map(({ key: _key, ...a }) => ({
      ...a,
      name: a.name.trim(),
      instagram: a.instagram ? (instagramHandle(a.instagram) ?? a.instagram) : undefined,
      facebook: a.facebook ? (facebookUrl(a.facebook) ?? a.facebook) : undefined,
      website: a.website ? (websiteUrl(a.website) ?? a.website) : undefined,
    }))

export function ArtistsField({
  value,
  onChange,
  known,
  showErrors,
}: {
  value: ArtistDraft[]
  onChange: (next: ArtistDraft[]) => void
  /** Artists from other events, newest first, for name suggestions. */
  known: Artist[]
  /** Set after a save attempt, so every bad link shows its message. */
  showErrors: boolean
}) {
  const [left, setLeft] = useState<Set<string>>(new Set()) // fields the user has left at least once
  const [focusId, setFocusId] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  const addRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!focusId) return
    const el = focusId === 'add' ? addRef.current : document.getElementById(focusId)
    el?.focus()
    setFocusId(null)
  }, [focusId, value])

  const byName = useMemo(() => {
    const m = new Map<string, Artist>()
    for (const a of known) if (!m.has(a.name.toLowerCase())) m.set(a.name.toLowerCase(), a)
    return m
  }, [known])

  const update = (key: string, patch: Partial<Artist>) =>
    onChange(value.map((a) => (a.key === key ? { ...a, ...patch } : a)))

  /** A known name fills in socials that are still empty. */
  function fromKnown(a: ArtistDraft, name: string): Partial<Artist> {
    const match = byName.get(name.trim().toLowerCase())
    const fill: Partial<Artist> = {}
    for (const f of SOCIALS) if (match && !a[f] && match[f]) fill[f] = match[f]
    if (Object.keys(fill).length) setAnnounce(`Filled in ${match!.name}’s links from an earlier event.`)
    return fill
  }

  // Fill on picking a suggestion (not while typing, so "Low" doesn't fill in for "Low Tide Choir").
  function setName(a: ArtistDraft, name: string, inputType?: string) {
    const typing = inputType?.startsWith('insert') && inputType !== 'insertReplacementText'
    const deleting = inputType?.startsWith('delete')
    update(a.key, { name, ...(typing || deleting ? {} : fromKnown(a, name)) })
  }

  function leaveName(a: ArtistDraft) {
    const fill = fromKnown(a, a.name)
    if (Object.keys(fill).length) update(a.key, fill)
  }

  function leave(a: ArtistDraft, f: Social) {
    setLeft((s) => new Set(s).add(`${a.key}-${f}`))
    const raw = a[f]?.trim()
    if (!raw) return update(a.key, { [f]: undefined })
    const tidy = parse[f](raw)
    if (tidy && tidy !== a[f]) update(a.key, { [f]: tidy })
  }

  function add(afterIndex = value.length - 1) {
    if (value.length >= MAX_ARTISTS) return
    const row = blank()
    onChange([...value.slice(0, afterIndex + 1), row, ...value.slice(afterIndex + 1)])
    setFocusId(`${row.key}-name`)
  }

  function remove(i: number) {
    const a = value[i]
    onChange(value.filter((_, j) => j !== i))
    setAnnounce(`Removed ${a.name.trim() || 'the artist'}.`)
    const neighbour = value[i + 1] ?? value[i - 1]
    setFocusId(neighbour ? `${neighbour.key}-name` : 'add')
  }

  function move(i: number, by: -1 | 1) {
    const next = [...value]
    ;[next[i], next[i + by]] = [next[i + by], next[i]]
    onChange(next)
    setAnnounce(`Moved ${value[i].name.trim() || 'the artist'} to number ${i + by + 1}.`)
    setFocusId(`${value[i].key}-${by < 0 ? 'up' : 'down'}`)
  }

  const headline = (key: string, on: boolean) =>
    onChange(value.map((a) => ({ ...a, headliner: a.key === key ? on : on ? false : a.headliner })))

  // Enter in a row goes to the next row (adding one at the end) instead of saving the whole event.
  function onEnter(e: KeyboardEvent<HTMLInputElement>, i: number) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    e.preventDefault()
    const next = value[i + 1]
    if (next) setFocusId(`${next.key}-name`)
    else if (value[i].name.trim()) add(i)
  }

  const multiple = value.length > 1

  return (
    <div className="flex flex-col gap-3">
      <datalist id="known-artists">
        {[...byName.values()].map((a) => (
          <option key={a.name} value={a.name} />
        ))}
      </datalist>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      {value.length === 0 ? (
        <EmptyState>No artists yet. Add who’s playing so we can tag and credit them.</EmptyState>
      ) : (
        <ol className="flex flex-col gap-3">
          {value.map((a, i) => {
            const label = a.name.trim() || `Artist ${i + 1}`
            const err = (f: Social) =>
              a[f] && !parse[f](a[f]!) && (showErrors || left.has(`${a.key}-${f}`)) ? problem[f] : undefined
            const ig = a.instagram ? instagramHandle(a.instagram) : null
            const fb = a.facebook ? facebookUrl(a.facebook) : null
            const web = a.website ? websiteUrl(a.website) : null
            return (
              <li
                key={a.key}
                className={cn(
                  'flex flex-col gap-3 rounded-lg border bg-card p-3 sm:p-4',
                  a.headliner && multiple ? 'border-2 border-ink' : 'border-border',
                )}
                aria-label={label}
              >
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex w-8 shrink-0 flex-col items-center">
                    <Button
                      id={`${a.key}-up`}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-1.5"
                      aria-label={`Move ${label} up`}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      id={`${a.key}-down`}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-1.5"
                      aria-label={`Move ${label} down`}
                      disabled={i === value.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ChevronDown />
                    </Button>
                  </div>
                  <FormField label="Name" htmlFor={`${a.key}-name`} className="min-w-40 flex-1">
                    <Input
                      density="compact"
                      id={`${a.key}-name`}
                      list="known-artists"
                      autoComplete="off"
                      value={a.name}
                      onChange={(e) => setName(a, e.target.value, (e.nativeEvent as InputEvent).inputType)}
                      onBlur={() => leaveName(a)}
                      onKeyDown={(e) => onEnter(e, i)}
                      placeholder="Band or artist name"
                    />
                  </FormField>
                  {multiple && (
                    <Toggle
                      size="sm"
                      pressed={Boolean(a.headliner)}
                      onPressedChange={(on) => headline(a.key, on)}
                      aria-label={`${label} is the headliner`}
                      className="h-9"
                    >
                      <Star className={cn(a.headliner && 'fill-current')} />
                      Headliner
                    </Toggle>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 px-2"
                    aria-label={`Remove ${label}`}
                    onClick={() => remove(i)}
                  >
                    <X />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 sm:pl-10 xl:grid-cols-3">
                  <FormField
                    label="Instagram"
                    htmlFor={`${a.key}-instagram`}
                    error={err('instagram')}
                    hint={ig ? <CheckLink href={instagramUrl(ig)} /> : undefined}
                  >
                    <div className="relative">
                      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-2">
                        @
                      </span>
                      <Input
                        density="compact"
                        id={`${a.key}-instagram`}
                        className="pl-7"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={a.instagram ?? ''}
                        onChange={(e) => update(a.key, { instagram: e.target.value })}
                        onBlur={() => leave(a, 'instagram')}
                        onKeyDown={(e) => onEnter(e, i)}
                        placeholder="username or profile link"
                        aria-invalid={Boolean(err('instagram'))}
                      />
                    </div>
                  </FormField>
                  <FormField
                    label="Facebook"
                    htmlFor={`${a.key}-facebook`}
                    error={err('facebook')}
                    hint={fb ? <CheckLink href={fb} /> : undefined}
                  >
                    <Input
                      density="compact"
                      id={`${a.key}-facebook`}
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={a.facebook ?? ''}
                      onChange={(e) => update(a.key, { facebook: e.target.value })}
                      onBlur={() => leave(a, 'facebook')}
                      onKeyDown={(e) => onEnter(e, i)}
                      placeholder="page link"
                      aria-invalid={Boolean(err('facebook'))}
                    />
                  </FormField>
                  <FormField
                    label="Website"
                    htmlFor={`${a.key}-website`}
                    error={err('website')}
                    hint={web ? <CheckLink href={web} label="Check the link" /> : undefined}
                  >
                    <Input
                      density="compact"
                      id={`${a.key}-website`}
                      inputMode="url"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={a.website ?? ''}
                      onChange={(e) => update(a.key, { website: e.target.value })}
                      onBlur={() => leave(a, 'website')}
                      onKeyDown={(e) => onEnter(e, i)}
                      placeholder="their-band.com"
                      aria-invalid={Boolean(err('website'))}
                    />
                  </FormField>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          ref={addRef}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => add()}
          disabled={value.length >= MAX_ARTISTS}
        >
          <Plus />
          {value.length ? 'Add another artist' : 'Add artist'}
        </Button>
        <p className="text-meta text-ink-2">
          {value.length === 0
            ? 'Optional. Socials are used to tag artists when we post; links show on the event’s page.'
            : multiple
              ? 'Listed in billing order. Press Enter in a row to add the next artist.'
              : 'Press Enter to add the next artist.'}
        </p>
      </div>
    </div>
  )
}

function CheckLink({ href, label = 'Check it’s them' }: { href: string; label?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold">
      {label} <ExternalLink className="size-3" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}
