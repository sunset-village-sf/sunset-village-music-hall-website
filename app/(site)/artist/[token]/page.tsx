import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHero } from '@/components/brand/page-hero'
import { Section } from '@/components/layout/section'
import { Button } from '@/components/ui/button'
import { ArtistForm } from '@/components/artist/artist-form'
import { openLink } from '@/lib/server/artist-links'
import { lineupIndex } from '@/lib/server/artists'
import { linkAssets } from '@/lib/server/assets'
import { longDate } from '@/lib/events'
import { site } from '@/lib/data/site'

// A private page: only reachable through the link we email an artist.
export const metadata: Metadata = { title: 'Your details', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function ArtistPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const link = await openLink(token).catch(() => null)

  if (!link) {
    return (
      <>
        <PageHero eyebrow="Artist details" title="This link has expired" lede="Or a newer one has replaced it. No problem." />
        <Section className="flex flex-col items-start gap-5 pt-12 pb-22">
          <p className="max-w-160 text-lede">
            Reply to the email we sent you and we’ll send a fresh link, or message us on Instagram at{' '}
            {site.instagramHandle}.
          </p>
          <Button asChild variant="outline">
            <Link href="/events">See what’s coming up</Link>
          </Button>
        </Section>
      </>
    )
  }

  const current = link.artists?.[lineupIndex(link.artists, link)]
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { headliner: _h, id: _id, ...start } = link.submission ?? current ?? { name: link.artist_name }
  const files = await linkAssets(link.id)

  return (
    <>
      <PageHero
        eyebrow={`Artist details · ${longDate(link.date)}`}
        title={link.title}
        lede="Check how your name is spelled and add a short bio, photos and your links. Send your flyer, rider or stage plot here too."
      />
      <Section className="pt-12 pb-22">
        <ArtistForm
          token={token}
          initial={start}
          status={link.status as 'sent' | 'submitted' | 'approved'}
          expiresAt={link.expires_at}
          files={files}
          upload={
            link.artist_id && Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
              ? { artistId: link.artist_id, eventId: link.event_id }
              : null
          }
        />
      </Section>
    </>
  )
}
