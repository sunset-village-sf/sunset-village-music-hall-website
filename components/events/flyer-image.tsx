'use client'
// A flyer inside a poster frame (4:5 by default, the Instagram shape flyers are
// made in). A flyer close to the frame's shape fills it. Any other shape
// (square, 9:16 story, an old 4:3) is shown whole, centred over a blurred,
// dimmed copy of itself, so names and dates are never cropped off.
import Image from 'next/image'
import { useState } from 'react'
import { cn } from '@/lib/utils'

// How far from the frame's shape a flyer can be and still fill it (a sliver of
// crop is better than thin blurred bars).
const TOLERANCE = 0.08

export function FlyerImage({
  src,
  alt,
  sizes,
  frame = 4 / 5,
}: {
  src: string
  alt: string
  sizes: string
  /** Width ÷ height of the box the flyer sits in. */
  frame?: number
}) {
  // Start in "whole" mode: if the flyer matches the frame the two modes look
  // the same, so nothing jumps when the real shape is known.
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
          if (w && h) setFill(Math.abs(w / h - frame) / frame <= TOLERANCE)
        }}
      />
    </>
  )
}
