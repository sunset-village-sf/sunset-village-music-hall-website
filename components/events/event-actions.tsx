import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { VillageEvent } from '@/lib/data/events'
import { eventHref, primaryAction, raised } from '@/lib/events'

/** The event's main button (ink), styled as a link. */
export function PrimaryEventButton({ event, size }: { event: VillageEvent; size?: 'md' | 'default' }) {
  const a = primaryAction(event)
  if (!a) return null
  return (
    <Button asChild size={size} className={raised}>
      {a.external ? (
        <a href={a.href} target="_blank" rel="noopener">
          {a.label} ↗
        </a>
      ) : (
        <Link href={a.href}>{a.label}</Link>
      )}
    </Button>
  )
}

/**
 * One button per event: its main action (tickets, RSVP…) if it has one,
 * otherwise "Details". The whole card already opens the event, so a Details
 * button next to a ticket button would only repeat it.
 */
export function EventButton({ event, size }: { event: VillageEvent; size?: 'md' | 'default' }) {
  if (primaryAction(event)) return <PrimaryEventButton event={event} size={size} />
  return (
    <Button asChild size={size} className={raised}>
      <Link href={eventHref(event)}>Details</Link>
    </Button>
  )
}

/** The card's button, pinned to the bottom. */
export function EventActions({ event }: { event: VillageEvent }) {
  return (
    <div className="mt-auto flex flex-wrap gap-2 pt-3">
      <EventButton event={event} size="md" />
    </div>
  )
}
