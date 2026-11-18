// The event page's lineup: who's playing, headliner first, with links to
// each artist's Instagram and Facebook. Renders nothing without artists.
import type { Artist } from '@/lib/artists'
import { instagramUrl } from '@/lib/artists'
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
          <li key={a.name} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3.5 first:pt-0 last:pb-0">
            <span className="flex flex-wrap items-center gap-2.5">
              <span className="text-lg leading-snug font-bold">{a.name}</span>
              {a.headliner && list.length > 1 && (
                <Badge tone="yellow" size="sm">
                  Headliner
                </Badge>
              )}
            </span>
            {(a.instagram || a.facebook) && (
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
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
