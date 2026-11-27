'use client'
// A flyer inside the 4:3 poster frame. Flyers already edited to roughly 4:3
// fill the frame as before. Taller (e.g. Instagram 4:5) or otherwise
// differently shaped flyers are shown whole, centred over a blurred, dimmed
// copy of themselves, so names and dates are never cropped off.
import Image from 'next/image'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const FRAME = 4 / 3
// How far from 4:3 a flyer can be and still fill the frame (a sliver of crop
// is better than thin blurred bars).
const TOLERANCE = 0.08

export function FlyerImage({ src, alt, sizes }: { src: string; alt: string; sizes: string }) {
  // Start in "whole" mode: if the flyer is 4:3 the two modes look the same,
  // so nothing jumps when the real shape is known.
  const [fill, setFill] = useState(false)

  return (
    <>
      {!fill && (
        <Image
          src={src}
          alt=""
          aria-hidden="true"
          fill
          sizes="96px"
          className="scale-110 object-cover blur-xl brightness-75"
        />
      )}
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        className={cn(fill ? 'object-cover' : 'object-contain')}
        onLoad={(e) => {
          const { naturalWidth: w, naturalHeight: h } = e.currentTarget
          if (w && h) setFill(Math.abs(w / h - FRAME) / FRAME <= TOLERANCE)
        }}
      />
    </>
  )
}
