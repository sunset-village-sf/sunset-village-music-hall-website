import Link from 'next/link'
import type { VillageEvent } from '@/lib/data/events'
import { TicketStub } from '@/components/brand/ticket-stub'
import { Sparkle } from '@/components/brand/sparkle'
import { categoryFill } from '@/components/brand/categories'
import { FlyerImage } from './flyer-image'
import { cn } from '@/lib/utils'
import { cardLink, categoryOf, dateParts, eventHref, priceLine } from '@/lib/events'
import { EventButton } from './event-actions'

/** Home "Coming up" row: flyer thumbnail, ticket stub, title block, time/price, one button. The whole row opens the event. */
export function EventRow({ event }: { event: VillageEvent }) {
  const price = priceLine(event)
  return (
    <article className="group relative flex flex-wrap items-center gap-x-7 gap-y-4 rounded-row border-2 border-ink bg-card py-4 pr-5 pl-4 transition-transform duration-200 hover:-translate-y-0.5">
      {/* Small 4:5 flyer; events without one get their category color and a sparkle. */}
      <div
        className={cn(
          'relative flex aspect-[4/5] w-20 shrink-0 items-center justify-center overflow-hidden rounded-sm border-2 border-ink text-ink',
          categoryFill[categoryOf(event)],
        )}
      >
        {event.flyer ? (
          <FlyerImage src={event.flyer} alt={`Flyer for ${event.title}`} sizes="80px" />
        ) : (
          <Sparkle size={24} />
        )}
      </div>
      <TicketStub {...dateParts(event.date)} category={categoryOf(event)} />
      <div className="flex min-w-0 flex-[999_1_280px] flex-col gap-1.5">
        {event.kind && <span className="kind">{event.kind}</span>}
        <h3 className="text-heading-lg">
          <Link href={eventHref(event)} className={cardLink}>
            {event.title}
          </Link>
        </h3>
        {event.subtitle && <span className="text-base text-ink-2">{event.subtitle}</span>}
      </div>
      <div className="flex-[1_1_160px] font-mono text-sm leading-[1.6]">
        {event.time && <div>{event.time}</div>}
        {price && <div className="font-medium">{price}</div>}
      </div>
      <EventButton event={event} />
    </article>
  )
}
