// An event's 4:5 poster, the shape flyers are made in for Instagram. With
// artwork, the whole flyer is shown (see FlyerImage) and nothing sits on top of
// it, since flyers carry their own names and dates. Without, it's the category
// fill with the big date, a sparkle and the wave lines.
import { cn } from '@/lib/utils'
import { Sparkle } from '@/components/brand/sparkle'
import { categoryFill, type EventCategory } from '@/components/brand/categories'
import { FlyerImage } from './flyer-image'

const WAVE = 'q25 -14 50 0 ' + 't50 0 '.repeat(7)

export function PosterArt({
  category,
  dow,
  day,
  month,
  flyer,
  title,
  sizes = '(max-width: 640px) 100vw, 320px',
  className,
}: {
  category: EventCategory
  dow: string
  day: number
  month: string
  flyer?: string
  title: string
  sizes?: string
  className?: string
}) {
  return (
    <div className={cn('relative aspect-[4/5] overflow-hidden text-ink', categoryFill[category], className)}>
      {flyer ? (
        <FlyerImage src={flyer} alt={`Flyer for ${title}`} sizes={sizes} />
      ) : (
        <>
          <svg viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="absolute inset-0 size-full">
            <circle cx="300" cy="390" r="150" fill="currentColor" opacity="0.12" />
            <path d={`M0 420 ${WAVE}`} stroke="currentColor" strokeWidth="4" fill="none" opacity="0.35" />
            <path d={`M0 448 ${WAVE}`} stroke="currentColor" strokeWidth="4" fill="none" opacity="0.35" />
          </svg>
          <Sparkle size={40} className="absolute top-6 right-7" />
          <div className="absolute top-3.5 left-4.5 leading-[.85]">
            <span className="label-sm text-xs">{dow}</span>
            <b className="block text-8xl font-extrabold tracking-[-0.05em]">{day}</b>
            <span className="label-sm block text-xs">{month}</span>
          </div>
        </>
      )}
    </div>
  )
}
