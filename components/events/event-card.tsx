import type { VillageEvent } from '@/lib/data/events'
import Link from 'next/link'
import { cardLink, categoryOf, dateParts, eventHref, priceLine } from '@/lib/events'
import { PosterArt } from './poster-art'
import { EventActions } from './event-actions'

/** Events page card: the whole 4:5 flyer (or category poster), then date/kind/title/subtitle/meta and actions. The whole card opens the event. */
export function EventCard({ event }: { event: VillageEvent }) {
  const { dow, day, month } = dateParts(event.date)
  const meta = [event.time, priceLine(event)].filter(Boolean).join(' · ')
  return (
    <article className="group lift relative flex flex-col overflow-hidden rounded-xl border-2 border-ink bg-card">
      <PosterArt
        category={categoryOf(event)}
        dow={dow}
        day={day}
        month={month}
        flyer={event.flyer}
        title={event.title}
        className="border-b-2 border-dashed border-ink"
      />
      <div className="flex flex-1 flex-col gap-2 px-5 pt-4.5 pb-5">
        <span className="label-sm">
          {dow} {month} {day}
          {event.kind && <span className="kind ml-2">· {event.kind}</span>}
        </span>
        <h3 className="text-heading-card">
          <Link href={eventHref(event)} className={cardLink}>
            {event.title}
          </Link>
        </h3>
        {event.subtitle && <span className="text-base text-ink-2">{event.subtitle}</span>}
        {meta && <p className="meta mt-1">{meta}</p>}
        <EventActions event={event} />
      </div>
    </article>
  )
}
