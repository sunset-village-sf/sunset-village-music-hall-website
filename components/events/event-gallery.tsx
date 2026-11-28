'use client'

// The event page's photos: a grid of square thumbnails; tapping one opens it
// full screen, with arrows (and the keyboard's ← →, or a swipe) to the
// next. Renders nothing without photos.

import Image from 'next/image'
import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { GalleryPhoto } from '@/lib/data/events'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function EventGallery({ photos, title }: { photos?: GalleryPhoto[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null)
  const touchX = useRef<number | null>(null)
  const thumbs = useRef<(HTMLButtonElement | null)[]>([])
  const last = useRef(0) // the photo showing when it closed, to put focus back on its thumbnail
  if (!photos?.length) return null
  const n = photos.length
  const go = (by: number) =>
    setOpen((i) => {
      if (i === null) return i
      last.current = (i + by + n) % n
      return last.current
    })
  const alt = (p: GalleryPhoto, i: number) => p.caption ?? `${title}, photo ${i + 1} of ${n}`
  const current = open === null ? null : photos[open]

  return (
    <section aria-labelledby="photos" className="flex flex-col gap-4">
      <h2 id="photos" className="text-heading-panel">
        Photos
      </h2>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(140px,45%),1fr))] gap-3">
        {photos.map((p, i) => (
          <li key={p.url}>
            <button
              type="button"
              ref={(el) => {
                thumbs.current[i] = el
              }}
              onClick={() => {
                last.current = i
                setOpen(i)
              }}
              className="group block w-full overflow-hidden rounded-md border-2 border-ink focus-visible:outline-offset-2"
              aria-label={`Open ${alt(p, i)}`}
            >
              <span className="relative block aspect-square">
                <Image
                  src={p.url}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 45vw, 200px"
                  className="object-cover transition-transform duration-200 group-hover:scale-105"
                />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent
          className="theme-ink max-w-[min(96vw,1100px)] gap-3 border-2 border-ink bg-ink p-3 sm:p-4"
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            thumbs.current[last.current]?.focus()
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') go(1)
            if (e.key === 'ArrowLeft') go(-1)
          }}
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX.current === null) return
            const dx = e.changedTouches[0].clientX - touchX.current
            if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
            touchX.current = null
          }}
        >
          <DialogTitle className="sr-only">
            {title}: photo {(open ?? 0) + 1} of {n}
          </DialogTitle>
          {current && (
            <>
              <div className="relative h-[min(78vh,900px)] w-full">
                <Image src={current.url} alt={alt(current, open!)} fill sizes="96vw" className="object-contain" priority />
              </div>
              <div className="flex items-center justify-between gap-3">
                <DialogDescription className="min-w-0 text-fog">
                  {current.caption ?? ''}
                  <span className="ml-2 font-mono text-sm whitespace-nowrap text-mist">
                    {open! + 1} / {n}
                  </span>
                </DialogDescription>
                {n > 1 && (
                  <span className="flex shrink-0 gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => go(-1)} aria-label="Previous photo">
                      <ChevronLeft />
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => go(1)} aria-label="Next photo">
                      <ChevronRight />
                    </Button>
                  </span>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
