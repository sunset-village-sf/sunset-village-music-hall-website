// The event page's lineup: who's playing, headliner first, with their photo
// and bio when we have them, and links to each artist's Instagram, Facebook
// and website. Renders nothing without artists.
import Image from 'next/image'
import type { Artist } from '@/lib/artists'
import { instagramUrl, websiteLabel } from '@/lib/artists'
import { Badge } from '@/components/ui/badge'

/** Headliner first, everyone else in billing order. */
export const billing = (artists: Artist[] = []) => [
  ...artists.filter((a) => a.headliner),
  ...artists.filter((a) => !a.headliner),
]

export function Lineup({ artists }: { artists?: Artist[] }) {
  const list = billing(artists)
  if (!list.length) return null
  return (
    <section aria-labelledby="lineup" className="rounded-2xl border-2 border-ink bg-card p-7">
      <h2 id="lineup" className="text-heading-panel">
        Lineup
      </h2>
      <ul className="mt-4 divide-y divide-border">
        {list.map((a) => (
          <li key={a.name} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-3.5 first:pt-0 last:pb-0">
            <div className="flex min-w-0 flex-[999_1_280px] items-start gap-4">
              {a.photo && (
                <Image
                  src={a.photo}
                  alt={a.name}
                  width={72}
                  height={72}
                  sizes="72px"
                  className="size-18 shrink-0 rounded-sm border-2 border-ink object-cover"
                />
              )}
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2.5">
                  <span className="text-lg leading-snug font-bold">{a.name}</span>
                  {a.headliner && list.length > 1 && (
                    <Badge tone="yellow" size="sm">
                      Headliner
                    </Badge>
                  )}
                </span>
                {a.bio && <p className="text-base whitespace-pre-line text-ink-2">{a.bio}</p>}
              </div>
            </div>
            {(a.instagram || a.facebook || a.website) && (
              <span className="flex flex-wrap gap-x-5 gap-y-1">
                {a.instagram && (
                  <a href={instagramUrl(a.instagram)} target="_blank" rel="noopener" className="font-bold">
                    <span className="sr-only">{a.name} on Instagram: </span>@{a.instagram} ↗
                  </a>
                )}
                {a.facebook && (
                  <a href={a.facebook} target="_blank" rel="noopener" className="font-bold">
                    <span className="sr-only">{a.name} on </span>Facebook ↗
                  </a>
                )}
                {a.website && (
                  <a href={a.website} target="_blank" rel="noopener" className="font-bold">
                    <span className="sr-only">{a.name}’s website: </span>
                    {websiteLabel(a.website)} ↗
                  </a>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
