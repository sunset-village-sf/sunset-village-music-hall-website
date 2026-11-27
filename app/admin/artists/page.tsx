'use client'

// Artist info: details artists sent through their links, waiting for review,
// plus links still out with artists and recent history. Approving puts the
// details into the event's lineup; nothing an artist types goes on the site
// before that.

import { useState } from 'react'
import { getJson, postJson, type ArtistLink } from '@/lib/admin/api'
import { useLoad } from '@/lib/admin/use-load'
import { instagramUrl, websiteLabel, type Artist } from '@/lib/artists'
import { useAdmin } from '@/components/internal/admin-shell'
import { EmptyState, ErrorNote, Mono, PageHeader, Panel } from '@/components/internal/internal-ui'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const day = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

const FIELDS: { key: keyof Artist; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'bio', label: 'Bio' },
  { key: 'photo', label: 'Photo' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'website', label: 'Website' },
]

function Value({ field, v }: { field: keyof Artist; v: unknown }) {
  if (!v) return <span className="text-ink-2">(none)</span>
  const s = String(v)
  if (field === 'photo')
    // eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL
    return <img src={s} alt="" className="size-28 rounded-sm border border-border object-cover" />
  if (field === 'instagram')
    return (
      <a href={instagramUrl(s)} target="_blank" rel="noreferrer">
        @{s} ↗
      </a>
    )
  if (field === 'facebook' || field === 'website')
    return (
      <a href={s} target="_blank" rel="noreferrer">
        {field === 'website' ? websiteLabel(s) : s.replace(/^https:\/\/www\./, '')} ↗
      </a>
    )
  return <span className="whitespace-pre-line">{s}</span>
}

function Review({ link, onDone }: { link: ArtistLink; onDone: (note: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const now = (link.event_artists ?? []).find((a) => a.name.trim().toLowerCase() === link.artist_name.trim().toLowerCase())
  const sent = link.submission ?? ({ name: '' } as Artist)

  async function act(action: 'artist-link-approve' | 'artist-link-discard') {
    if (action === 'artist-link-discard' && !confirm(`Discard what ${link.artist_name} sent? The lineup stays as it is.`)) return
    setBusy(true)
    setError('')
    try {
      await postJson(action, { id: link.id })
      onDone(
        action === 'artist-link-approve'
          ? `${sent.name}’s details are now on ${link.event_title}.`
          : `Discarded what ${link.artist_name} sent.`,
      )
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-semibold">{link.artist_name}</span> for{' '}
          <a href={`/events/${encodeURIComponent(link.event_id)}`} target="_blank" rel="noreferrer" className="font-semibold">
            {link.event_title}
          </a>{' '}
          <Mono>{day(link.event_date)}</Mono>
        </div>
        <span className="text-meta text-ink-2">
          Sent {link.submitted_at ? when(link.submitted_at) : ''} from {link.email}
        </span>
      </div>
      {!now && (
        <Alert variant="warning" className="font-normal">
          {link.artist_name} isn’t in this event’s lineup anymore. Add them back in the event before approving.
        </Alert>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-ui">
          <thead>
            <tr className="border-b border-border text-meta text-ink-2">
              <th className="w-28 py-1.5 pr-3 font-medium">Field</th>
              <th className="py-1.5 pr-3 font-medium">On the site now</th>
              <th className="py-1.5 font-medium">They sent</th>
            </tr>
          </thead>
          <tbody>
            {FIELDS.map(({ key, label }) => {
              const changed = (now?.[key] ?? '') !== (sent[key] ?? '')
              return (
                <tr key={key} className={cn('border-b border-border align-top last:border-0', changed && 'bg-fog')}>
                  <th scope="row" className="py-2 pr-3 font-medium">
                    {label}
                    {changed && <span className="sr-only"> (changed)</span>}
                  </th>
                  <td className="py-2 pr-3">
                    <Value field={key} v={now?.[key]} />
                  </td>
                  <td className={cn('py-2', changed && 'font-semibold')}>
                    <Value field={key} v={sent[key]} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => act('artist-link-approve')} disabled={busy || !now}>
          Approve and put on the site
        </Button>
        <Button size="sm" variant="outline" onClick={() => act('artist-link-discard')} disabled={busy}>
          Discard
        </Button>
      </div>
    </li>
  )
}

const DONE_LABEL: Record<string, string> = {
  approved: 'Approved',
  discarded: 'Discarded',
  revoked: 'Cancelled',
  expired: 'Expired',
}

export default function ArtistInfoPage() {
  const { signedOut, refresh } = useAdmin()
  const { data, error, reload } = useLoad(() => getJson<ArtistLink[]>('artist-links'), signedOut)
  const [note, setNote] = useState('')
  const [showDone, setShowDone] = useState(false)

  const toReview = (data ?? []).filter((l) => l.status === 'submitted')
  const waiting = (data ?? []).filter((l) => l.status === 'sent' && !l.expired)
  const done = (data ?? []).filter((l) => !toReview.includes(l) && !waiting.includes(l))

  const after = (msg: string) => {
    setNote(msg)
    reload()
    refresh()
    window.scrollTo(0, 0)
  }

  async function cancel(l: ArtistLink) {
    if (!confirm(`Cancel the link sent to ${l.artist_name}? It will stop working.`)) return
    try {
      await postJson('artist-link-revoke', { id: l.id })
      after(`Cancelled the link for ${l.artist_name}.`)
    } catch (e) {
      setNote((e as Error).message)
    }
  }

  return (
    <>
      <PageHeader
        title="Artist info"
        description="Details artists send through their links. Nothing goes on the site until it’s approved here. Send links from an event’s edit page."
      />
      {note && (
        <Alert variant="info" className="mb-5 font-normal">
          {note}
        </Alert>
      )}
      <ErrorNote>{error}</ErrorNote>
      {data && (
        <div className="flex flex-col gap-5">
          <Panel title={`To review (${toReview.length})`}>
            {toReview.length === 0 ? (
              <EmptyState>Nothing to review. When an artist sends their details, they’ll show up here.</EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {toReview.map((l) => (
                  <Review key={l.id} link={l} onDone={after} />
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`Waiting for the artist (${waiting.length})`}>
            {waiting.length === 0 ? (
              <EmptyState>No links out right now.</EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {waiting.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                    <div className="min-w-0 flex-1 basis-64">
                      <span className="font-semibold">{l.artist_name}</span> for {l.event_title}{' '}
                      <Mono>{day(l.event_date)}</Mono>
                      <div className="text-meta text-ink-2">
                        Sent to {l.email} by {l.created_by ?? 'someone'} on {when(l.created_at)} · works until{' '}
                        {when(l.expires_at)}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => cancel(l)}>
                      Cancel link
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {done.length > 0 && (
            <Panel
              title={`History (${done.length})`}
              action={
                <Button variant="ghost" size="sm" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
                  {showDone ? 'Hide' : 'Show'}
                </Button>
              }
            >
              {showDone ? (
                <ul className="divide-y divide-border text-ink-2">
                  {done.map((l) => {
                    const status = l.status === 'sent' ? 'expired' : l.status
                    return (
                      <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                        <Badge tone={status === 'approved' ? 'teal' : 'paper'} size="sm">
                          {DONE_LABEL[status] ?? status}
                        </Badge>
                        <span>
                          <span className="font-semibold text-ink">{l.artist_name}</span> for {l.event_title} ·{' '}
                          {l.reviewed_by ? `${l.reviewed_by}, ${when(l.reviewed_at!)}` : `sent ${when(l.created_at)}`}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-ink-2">Hidden.</p>
              )}
            </Panel>
          )}
        </div>
      )}
    </>
  )
}
