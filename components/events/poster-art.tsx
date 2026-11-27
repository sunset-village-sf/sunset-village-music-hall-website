// The event card's 4:3 poster. With artwork, the flyer fills it (or, if it isn't
// 4:3, is shown whole over a blurred copy — see FlyerImage) and the date sits on
// a small stub; without, it's the category fill with the big date,
// a sparkle and the wave lines. Both show the month, so past events read clearly.
import { cn } from '@/lib/utils'
import { FlyerImage } from './flyer-image'
import { Sparkle } from '@/components/brand/sparkle'
import { categoryFill, type EventCategory } from '@/components/brand/categories'

const WAVE = 'q25 -14 50 0 ' + 't50 0 '.repeat(7)

export function PosterArt({
  category,
  dow,
  day,
  month,
  flyer,
  title,
  sizes = '(max-width: 640px) 100vw, 400px',
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
    <div className={cn('relative aspect-[4/3] overflow-hidden text-ink', categoryFill[category], className)}>
      {flyer ? (
        <>
          <FlyerImage src={flyer} alt={`Flyer for ${title}`} sizes={sizes} />
          <div className="absolute top-3 left-3 rounded-sm border-2 border-ink bg-paper px-2.5 py-1.5 text-center leading-none">
            <span className="label-sm block">{dow}</span>
            <b className="my-0.5 block text-heading-lg">{day}</b>
            <span className="label-sm block">{month}</span>
          </div>
        </>
      ) : (
        <>
          <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="absolute inset-0 size-full">
            <circle cx="300" cy="230" r="120" fill="currentColor" opacity="0.12" />
            <path d={`M0 250 ${WAVE}`} stroke="currentColor" strokeWidth="4" fill="none" opacity="0.35" />
            <path d={`M0 275 ${WAVE}`} stroke="currentColor" strokeWidth="4" fill="none" opacity="0.35" />
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
