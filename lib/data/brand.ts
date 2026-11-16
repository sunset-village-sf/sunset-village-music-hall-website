// What the admin Brand page (/admin/brand) shows. Hex values come from
// lib/tokens.json so the page always matches the site; the download files are
// built by scripts/brand-assets.mjs.

import tokens from '@/lib/tokens.json'

type ColorKey = keyof typeof tokens.color
const D = '/brand/downloads'

export interface LogoVersion {
  name: string
  use: string
  /** Token classes for the preview tile's ground. */
  ground: string
  preview: string
  files: { label: string; href: string }[]
}

export const LOGOS: LogoVersion[] = [
  {
    name: 'On light',
    use: 'The everyday version. Use it on white, cream and other light backgrounds.',
    ground: 'bg-fog',
    preview: `${D}/wordmark-on-light.svg`,
    files: [
      { label: 'PNG', href: `${D}/wordmark-on-light.png` },
      { label: 'SVG', href: `${D}/wordmark-on-light.svg` },
    ],
  },
  {
    name: 'On dark',
    use: 'For ink (the dark green), black, and dark photos.',
    ground: 'bg-ink',
    preview: `${D}/wordmark-on-dark.svg`,
    files: [
      { label: 'PNG', href: `${D}/wordmark-on-dark.png` },
      { label: 'SVG', href: `${D}/wordmark-on-dark.svg` },
    ],
  },
  {
    name: 'One color, ink',
    use: 'When the full-color version would clash, such as on a busy flyer, a bright color or merch.',
    ground: 'bg-yellow',
    preview: `${D}/wordmark-mono-ink.svg`,
    files: [
      { label: 'PNG', href: `${D}/wordmark-mono-ink.png` },
      { label: 'SVG', href: `${D}/wordmark-mono-ink.svg` },
    ],
  },
  {
    name: 'One color, white',
    use: 'For photos and dark backgrounds where the full-color version gets lost.',
    ground: 'bg-sea',
    preview: `${D}/wordmark-mono-white.svg`,
    files: [
      { label: 'PNG', href: `${D}/wordmark-mono-white.png` },
      { label: 'SVG', href: `${D}/wordmark-mono-white.svg` },
    ],
  },
  {
    name: 'One color, black',
    use: 'For printing in black and white: stamps, receipts, photocopied flyers.',
    ground: 'bg-paper',
    preview: `${D}/wordmark-mono-black.svg`,
    files: [
      { label: 'PNG', href: `${D}/wordmark-mono-black.png` },
      { label: 'SVG', href: `${D}/wordmark-mono-black.svg` },
    ],
  },
]

export const MARKS: LogoVersion[] = [
  {
    name: 'App icon',
    use: 'Square profile pictures and browser tabs. The wordmark is too detailed to read that small.',
    ground: 'bg-paper',
    preview: `${D}/icon.svg`,
    files: [
      { label: 'PNG', href: `${D}/icon.png` },
      { label: 'SVG', href: `${D}/icon.svg` },
    ],
  },
  {
    name: 'Sparkle, sun',
    use: 'The star from the wordmark. One small one beside a heading or in a corner, never scattered around.',
    ground: 'bg-ink',
    preview: `${D}/sparkle-sun.svg`,
    files: [
      { label: 'PNG', href: `${D}/sparkle-sun.png` },
      { label: 'SVG', href: `${D}/sparkle-sun.svg` },
    ],
  },
  {
    name: 'Sparkle, yellow',
    use: 'On dark backgrounds.',
    ground: 'bg-ink',
    preview: `${D}/sparkle-yellow.svg`,
    files: [
      { label: 'PNG', href: `${D}/sparkle-yellow.png` },
      { label: 'SVG', href: `${D}/sparkle-yellow.svg` },
    ],
  },
  {
    name: 'Sparkle, ink',
    use: 'On light and bright backgrounds.',
    ground: 'bg-fog',
    preview: `${D}/sparkle-ink.svg`,
    files: [
      { label: 'PNG', href: `${D}/sparkle-ink.png` },
      { label: 'SVG', href: `${D}/sparkle-ink.svg` },
    ],
  },
]

export interface Swatch {
  key: ColorKey
  name: string
  use: string
  /** Token classes for the swatch: its fill, and a readable text color on it. */
  swatch: string
}

export const COLOR_GROUPS: { title: string; note: string; colors: Swatch[] }[] = [
  {
    title: 'Main colors',
    note: 'Most of anything we make is these four.',
    colors: [
      { key: 'ink', name: 'Ink', use: 'Text, dark backgrounds, outlines.', swatch: 'bg-ink text-fog' },
      { key: 'fog', name: 'Fog', use: 'The main light background.', swatch: 'bg-fog text-ink' },
      { key: 'paper', name: 'Paper', use: 'Cards and panels on Fog.', swatch: 'bg-paper text-ink' },
      { key: 'sun', name: 'Sun', use: 'The one thing you most want people to do or see.', swatch: 'bg-sun text-ink' },
    ],
  },
  {
    title: 'Accents',
    note: 'Fills behind ink text. Use one or two per piece, not all of them.',
    colors: [
      { key: 'yellow', name: 'Yellow', use: 'Highlights, and labels on dark backgrounds.', swatch: 'bg-yellow text-ink' },
      { key: 'teal', name: 'Teal', use: 'Community events, leasing.', swatch: 'bg-teal text-ink' },
      { key: 'pink', name: 'Pink', use: 'Workshops.', swatch: 'bg-pink text-ink' },
      { key: 'sea', name: 'Sea', use: 'Links on light backgrounds, photo tints.', swatch: 'bg-sea text-fog' },
    ],
  },
  {
    title: 'Neutrals',
    note: 'Supporting shades for secondary text, borders and quiet fills.',
    colors: [
      { key: 'ink-2', name: 'Ink 2', use: 'Secondary text on light backgrounds.', swatch: 'bg-ink-2 text-fog' },
      { key: 'mist', name: 'Mist', use: 'Secondary text on dark backgrounds.', swatch: 'bg-mist text-ink' },
      { key: 'sand', name: 'Sand', use: 'Quiet fills.', swatch: 'bg-sand text-ink' },
      { key: 'line', name: 'Line', use: 'Thin borders and dividers.', swatch: 'bg-line text-ink' },
    ],
  },
]

export const EVENT_COLORS: { label: string; key: ColorKey; swatch: string }[] = [
  { label: 'Live music', key: 'sun', swatch: 'bg-sun' },
  { label: 'DJ and dance nights', key: 'yellow', swatch: 'bg-yellow' },
  { label: 'Community', key: 'teal', swatch: 'bg-teal' },
  { label: 'Workshops', key: 'pink', swatch: 'bg-pink' },
]

export const hexOf = (key: ColorKey) => tokens.color[key].value
export const rgbOf = (key: ColorKey) => {
  const h = hexOf(key).slice(1)
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ')
}

export const FONTS = [
  {
    name: 'Bricolage Grotesque',
    role: 'Headlines and everything you read',
    detail: 'Extra Bold (800) for headlines, Regular (400) for paragraphs.',
    sample: 'Sick sets. Thick fog.',
    sampleClass: 'font-display text-display-md',
    href: 'https://fonts.google.com/specimen/Bricolage+Grotesque',
  },
  {
    name: 'Montserrat',
    role: 'Small labels, always in capitals',
    detail: 'Bold (700), all caps, with wide letter spacing. Never for headlines or paragraphs.',
    sample: 'Coming up · Live music',
    sampleClass: 'eyebrow mb-0',
    href: 'https://fonts.google.com/specimen/Montserrat',
  },
  {
    name: 'DM Mono',
    role: 'Dates, times and prices',
    detail: 'Regular (400) or Medium (500).',
    sample: 'FRI NOV 21 · 8PM · $15',
    sampleClass: 'font-mono text-heading-md font-medium',
    href: 'https://fonts.google.com/specimen/DM+Mono',
  },
]

export const PHOTOS = [
  { src: '/photos/hero-dancefloor.jpg', name: 'Dance floor in the fog', note: 'Home page hero' },
  { src: '/photos/og-image-1200x630.jpg', name: 'Link preview', note: 'Shown when the site is shared. 1200 × 630' },
  { src: '/photos/building-today.webp', name: 'The building today', note: 'Village page' },
  { src: '/photos/sunset-village-colorized.jpeg', name: 'The corner in the 1950s, colorized', note: 'Village page hero' },
  { src: '/photos/judah-dusk.webp', name: 'Judah at dusk', note: 'Neighborhood' },
  { src: '/photos/ocean-beach-sunset.webp', name: 'Ocean Beach sunset', note: 'Neighborhood' },
]

export const DOS = [
  'Use the logo files from this page as they are.',
  'Put ink (dark green) text on the sun, yellow, teal and pink fills.',
  'Let one thing per piece be sun orange: the date, the ticket link or the headline.',
  'Keep the retro touches small: the logo, the sparkle and the capital-letter labels.',
  'Write dates and times in DM Mono so they’re easy to scan.',
]

export const DONTS = [
  'Don’t use the old gradient version of the logo. It’s retired.',
  'Don’t recolor, stretch, outline or add effects to the logo.',
  'Don’t set text in sun, yellow, teal or pink on a light background. It’s hard to read.',
  'Don’t add retro extras: script fonts, starbursts, halftones, gradients.',
  'Don’t use drop shadows.',
  'Don’t set headlines or paragraphs in Montserrat.',
]
