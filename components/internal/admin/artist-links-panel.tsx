'use client'

// On the event edit page: send each artist in the saved lineup a link where
// they fill in their own name, bio, photo and links. Sending is always a
// person's decision (nothing goes out automatically). What they send waits
// under Admin → Artist info until someone approves it.

import Link from 'next/link'
import { useState } from 'react'
import { getJson, postJson, type ArtistLink } from '@/lib/admin/api'
import type { Artist } from '@/lib/artists'
import { useAdmin } from '@/components/internal/admin-shell'
import { ErrorNote, Panel } from '@/components/internal/internal-ui'
import { useLoad } from '@/lib/admin/use-load'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

function status(l: ArtistLink | undefined) {
  if (!l) return 'No link sent yet.'
  if (l.status === 'submitted') return null // shown with a link to review
  if (l.status === 'sent')
    return l.expired
      ? `Link sent to ${l.email} on ${when(l.created_at)} expired without a reply.`
      : `Link sent to ${l.email} on ${when(l.created_at)}. Waiting for them (works until ${when(l.expires_at)}).`
  if (l.status === 'approved')
    return l.expired
      ? `Their details were approved on ${when(l.reviewed_at!)}.`
      : `Their details were approved on ${when(l.reviewed_at!)}. Their link stays open for files until ${when(l.expires_at)}.`
  if (l.status === 'discarded') return `What they sent was discarded on ${when(l.reviewed_at!)}.`
  return `The link sent on ${when(l.created_at)} was cancelled.`
}

function ArtistRow({
  eventId,
  artist,
  latest,
  knownEmail,
  onSent,
}: {
  eventId: string
  artist: Artist
  latest?: ArtistLink
  knownEmail?: string
  onSent: () => void
}) {
  const { me } = useAdmin()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(latest?.email ?? knownEmail ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<{ url: string; emailed: boolean; email: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const id = `link-${artist.name.replace(/\W+/g, '-')}`

  async function send() {
    setBusy(true)
    setError('')
    try {
      const r = await postJson<{ url: string; emailed: boolean }>('artist-link-send', {
        eventId,
        artistName: artist.name,
        email,
      })
      setSent({ ...r, email })
      setOpen(false)
      onSent()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const line = status(latest)
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <span className="font-semibold">{artist.name}</span>
          <div className="text-meta text-ink-2">
            {line ?? (
              <>
                They sent their details on {when(latest!.submitted_at!)}.{' '}
                <Link href="/admin/artists" className="font-semibold">
                  Review them →
                </Link>
              </>
            )}
          </div>
        </div>
        {!open && (
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
            {latest && latest.status !== 'revoked' ? 'Send a new link' : 'Send link'}
          </Button>
        )}
      </div>
      {open && (
        // Not a <form>: this sits inside the event's own form.
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-60 flex-1 flex-col gap-1.5">
            <Label htmlFor={id}>{artist.name}’s email</Label>
            <Input
              density="compact"
              id={id}
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault() // don't submit the event form around this
                send()
              }}
            />
          </div>
          <Button type="button" size="sm" disabled={busy || !email.trim()} onClick={send}>
            {busy ? 'Sending…' : me.email ? 'Email the link' : 'Make the link'}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {latest && ['sent', 'submitted'].includes(latest.status) && !latest.expired && (
            <p className="basis-full text-meta text-ink-2">The link sent earlier will stop working.</p>
          )}
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>
      {sent && (
        <div className="flex flex-col gap-1.5 rounded-md bg-fog p-3 text-meta">
          <span>
            {sent.emailed
              ? `Emailed the link to ${sent.email}. Replies come to you. You can also copy it to send another way:`
              : `Email isn’t set up, so nothing was sent. Copy the link and send it to ${sent.email} yourself:`}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-xs">{sent.url}</code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(sent.url).then(() => setCopied(true))}
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </span>
        </div>
      )}
    </li>
  )
}

export function ArtistLinksPanel({ eventId, saved, unsaved }: { eventId: string; saved: Artist[]; unsaved: boolean }) {
  const { signedOut, refresh } = useAdmin()
  const { data, reload } = useLoad(() => getJson<ArtistLink[]>('artist-links'), signedOut)
  const links = data ?? []

  return (
    <Panel title="Artist links">
      <div className="flex flex-col gap-3">
        <p className="text-meta text-ink-2">
          Email an artist a private link to send their exact name, a short bio, a photo and their links. Nothing changes on
          the site until someone approves it under Artist info. Links work for 14 days.
        </p>
        {unsaved && (
          <p className="text-meta font-semibold">Save the event first to send links to artists you’ve added or renamed.</p>
        )}
        {saved.length === 0 ? (
          <p className="text-ink-2">Add artists above and save the event to send them links.</p>
        ) : (
          <ul className="divide-y divide-border">
            {saved.map((a) => {
              // Their links: by artist record (survives renames), or by name for older links.
              const mine = links.filter((l) => (a.id && l.artist_id === a.id) || same(l.artist_name, a.name))
              return (
                <ArtistRow
                  key={a.name}
                  eventId={eventId}
                  artist={a}
                  latest={mine.find((l) => l.event_id === eventId)}
                  knownEmail={mine[0]?.email}
                  onSent={() => {
                    reload()
                    refresh()
                  }}
                />
              )
            })}
          </ul>
        )}
      </div>
    </Panel>
  )
}
