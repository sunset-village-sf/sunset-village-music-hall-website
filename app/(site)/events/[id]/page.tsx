import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { PageHero } from '@/components/brand/page-hero'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Facts, Section } from '@/components/layout/section'
import { PosterArt } from '@/components/events/poster-art'
import { TicketBox } from '@/components/events/ticket-box'
import { Lineup, billing } from '@/components/events/lineup'
import { SaveShare } from '@/components/events/save-share'
import { eventPageUrl, googleCalendarLink } from '@/lib/event-calendar'
import { loadContent } from '@/lib/server/content'
import { instagramUrl } from '@/lib/artists'
import { categoryOf, dateParts, longDate, priceLine, sellsOnline } from '@/lib/events'
import { site, fullAddress } from '@/lib/data/site'

type Props = { params: Promise<{ id: string }> }

async function findEvent(id: string) {
  const { events } = await loadContent()
  return events.find((e) => e.id === decodeURIComponent(id))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await findEvent((await params).id)
  if (!event) return { title: 'Event not found' }
  return {
    title: event.title,
    description: event.summary,
    openGraph: event.flyer ? { images: [event.flyer] } : undefined,
  }
}

export default async function EventPage({ params }: Props) {
  const event = await findEvent((await params).id)
  if (!event) notFound()

  const { dow, day, month } = dateParts(event.date)
  const isPast = event.date < new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const price = priceLine(event)
  const lede = event.subtitle ?? event.summary
  const body = event.details ?? event.summary
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    name: event.title,
    startDate: event.date,
    description: event.summary,
    image: event.flyer ? new URL(event.flyer, site.url).toString() : undefined,
    location: { '@type': 'MusicVenue', name: site.name, address: fullAddress },
    performer: event.artists?.length
      ? billing(event.artists).map((a) => ({
          '@type': 'PerformingGroup',
          name: a.name,
          url: a.website,
          sameAs: [a.instagram && instagramUrl(a.instagram), a.facebook].filter(Boolean),
        }))
      : undefined,
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PageHero
        eyebrow={[longDate(event.date), event.kind].filter(Boolean).join(' · ')}
        title={event.title}
        lede={lede}
      />

      {/* Flyer on the left (it stays in view on wide screens while you read),
          tickets then details on the right. On phones: flyer, tickets, details. */}
      <Section className="flex flex-wrap items-start gap-x-10 gap-y-8 pt-12 pb-22">
        {/* On its own row, so the flyer and the tickets card line up at the top. */}
        <Link href="/events" className="-mb-2 basis-full font-bold">
          ← All events
        </Link>
        <div className="flex w-full max-w-110 min-w-0 flex-[0_1_440px] flex-col gap-4 md:sticky md:top-6">
          <PosterArt
            sizes="(max-width: 640px) 100vw, 440px"
            category={categoryOf(event)}
            dow={dow}
            day={day}
            month={month}
            flyer={event.flyer}
            title={event.title}
            className="rounded-2xl border-2 border-ink"
          />
          {event.sample && <Badge tone="yellow" className="self-start">Example listing</Badge>}
        </div>

        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-8">
        <aside className="flex flex-col gap-6 rounded-2xl border-2 border-ink bg-card p-7">
          <h2 className="text-heading-panel">{isPast ? 'This one’s over' : 'Tickets'}</h2>
          <Facts
            className="grid-cols-1 sm:grid-cols-2"
            items={[
              ['Date', longDate(event.date)],
              ...(event.time ? ([['Time', event.time]] as [string, string][]) : []),
              ...(price ? ([['Price', price]] as [string, string][]) : []),
              ['Where', `${event.venue}, ${site.address.street}`],
            ]}
          />
          {isPast ? (
            <Button asChild>
              <Link href="/events">See what’s coming up</Link>
            </Button>
          ) : event.ticketPrice && sellsOnline(event) ? (
            <Suspense>
              <TicketBox event={{ ...event, ticketPrice: event.ticketPrice }} />
            </Suspense>
          ) : event.ticketUrl ? (
            <Button asChild variant="sun" size="lg" className="self-start">
              <a href={event.ticketUrl} target="_blank" rel="noopener" data-track="ticket" data-track-event={event.id}>
                {event.cta || 'Get tickets'} ↗
              </a>
            </Button>
          ) : (
            <p className="text-ink-2">{price ? 'Pay at the door.' : 'Free.'} No advance tickets for this one.</p>
          )}
          <SaveShare
            title={event.title}
            url={eventPageUrl(site.url, event.id)}
            googleCalendar={isPast ? undefined : googleCalendarLink(event, site.url)}
            icsHref={isPast ? undefined : `/events/${encodeURIComponent(event.id)}/calendar.ics`}
          />
        </aside>
        {body && body !== lede && <p className="max-w-160 text-lede whitespace-pre-line">{body}</p>}
        <Lineup artists={event.artists} />
        </div>
      </Section>
    </>
  )
}
