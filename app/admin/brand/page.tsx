'use client'

// Brand: logos, marks, colors, fonts, photos and usage rules for anyone on the
// team making a flyer or post. Content lives in lib/data/brand.ts.

import { useState } from 'react'
import { Check, Copy, Download, ExternalLink } from 'lucide-react'
import { PageHeader, Panel } from '@/components/internal/internal-ui'
import { Button } from '@/components/ui/button'
import {
  COLOR_GROUPS,
  DONTS,
  DOS,
  EVENT_COLORS,
  FONTS,
  LOGOS,
  MARKS,
  PHOTOS,
  hexOf,
  rgbOf,
  type LogoVersion,
  type Swatch,
} from '@/lib/data/brand'
import { site, fullAddress } from '@/lib/data/site'
import { cn } from '@/lib/utils'

const SECTIONS = [
  ['logo', 'Logo'],
  ['marks', 'Icon & sparkle'],
  ['colors', 'Colors'],
  ['type', 'Fonts'],
  ['photos', 'Photos'],
  ['names', 'Names & details'],
  ['rules', 'Do’s & don’ts'],
] as const

const fileName = (href: string) => href.split('/').pop()!

function DownloadLink({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={href} download={fileName(href)}>
        <Download aria-hidden="true" />
        {label}
      </a>
    </Button>
  )
}

function AssetCard({ item, wide }: { item: LogoVersion; wide?: boolean }) {
  return (
    <li className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className={cn('flex items-center justify-center border-b border-border p-6', item.ground, wide ? 'h-40' : 'h-32')}>
        {/* eslint-disable-next-line @next/next/no-img-element -- plain SVG preview */}
        <img src={item.preview} alt={`${item.name} preview`} className="max-h-full max-w-full" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-bold">{item.name}</h3>
          <p className="text-ink-2">{item.use}</p>
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
          {item.files.map((f) => (
            <DownloadLink key={f.href} href={f.href} label={f.label} />
          ))}
        </div>
      </div>
    </li>
  )
}

function CopyButton({ value, label, shown = value }: { value: string; label: string; shown?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-left font-mono text-meta whitespace-nowrap hover:bg-sand"
      aria-label={`Copy ${label} ${value}`}
    >
      {shown}
      {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5 text-ink-2" aria-hidden="true" />}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </button>
  )
}

function ColorCard({ c }: { c: Swatch }) {
  const hex = hexOf(c.key)
  return (
    <li className="overflow-hidden rounded-lg border border-border bg-card">
      <div className={cn('flex h-24 items-end p-3', c.swatch)}>
        <span className="text-heading-md">{c.name}</span>
      </div>
      <div className="flex flex-col gap-1 p-3">
        <p className="text-ink-2">{c.use}</p>
        <dl className="-ml-2 flex flex-col items-start">
          {(
            [
              ['Hex', hex, hex],
              ['RGB', `rgb(${rgbOf(c.key)})`, rgbOf(c.key)],
            ] as const
          ).map(([k, value, shown]) => (
            <div key={k} className="flex items-center">
              <dt className="w-10 pl-2 label-sm text-ink-2">{k}</dt>
              <dd>
                <CopyButton value={value} shown={shown} label={`${c.name} ${k}`} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </li>
  )
}

const grid = (min: string) => cn('grid gap-4', min)

export default function BrandPage() {
  return (
    <>
      <PageHeader
        title="Brand"
        description="Logos, colors and fonts for flyers, posts and anything else with our name on it. Download what you need; the rules are at the bottom."
      />
      <nav aria-label="On this page" className="mb-5 flex flex-wrap gap-2">
        {SECTIONS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-full border border-border bg-card px-3.5 py-1.5 text-ui font-semibold text-ink no-underline hover:bg-sand"
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="flex flex-col gap-5">
        <section id="logo" className="scroll-mt-28">
          <Panel title="Logo">
            <p className="mb-4 max-w-170 text-ink-2">
              Pick the version that suits the background. Use PNG for social posts, Canva and documents; SVG for printers and
              designers (it scales to any size). On screens, keep it at least 40 pixels tall.
            </p>
            <ul className={grid('grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))]')}>
              {LOGOS.map((l) => (
                <AssetCard key={l.name} item={l} wide />
              ))}
            </ul>
          </Panel>
        </section>

        <section id="marks" className="scroll-mt-28">
          <Panel title="Icon & sparkle">
            <ul className={grid('grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))]')}>
              {MARKS.map((m) => (
                <AssetCard key={m.name} item={m} />
              ))}
            </ul>
          </Panel>
        </section>

        <section id="colors" className="scroll-mt-28">
          <Panel title="Colors">
            <p className="mb-4 max-w-170 text-ink-2">Click a code to copy it. Hex codes work in Canva, Instagram and most apps.</p>
            <div className="flex flex-col gap-6">
              {COLOR_GROUPS.map((g) => (
                <div key={g.title}>
                  <h3 className="font-bold">{g.title}</h3>
                  <p className="mb-3 text-ink-2">{g.note}</p>
                  <ul className={grid('grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))]')}>
                    {g.colors.map((c) => (
                      <ColorCard key={c.key} c={c} />
                    ))}
                  </ul>
                </div>
              ))}
              <div>
                <h3 className="font-bold">Event types</h3>
                <p className="mb-3 text-ink-2">Each kind of event has its own color on the site. Match it on that event’s flyer.</p>
                <ul className="flex flex-wrap gap-2">
                  {EVENT_COLORS.map((e) => (
                    <li key={e.label} className={cn('rounded-full px-3.5 py-1.5 font-semibold text-ink', e.swatch)}>
                      {e.label} <span className="font-mono text-meta">{hexOf(e.key)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Panel>
        </section>

        <section id="type" className="scroll-mt-28">
          <Panel title="Fonts">
            <p className="mb-4 max-w-170 text-ink-2">All three are free from Google Fonts. Download and install them, or pick them by name in Canva or Google Docs if they’re listed there.</p>
            <ul className="flex flex-col divide-y divide-border">
              {FONTS.map((f) => (
                <li key={f.name} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-[1_1_240px]">
                    <h3 className="font-bold">{f.name}</h3>
                    <p className="text-ink-2">
                      {f.role}. {f.detail}
                    </p>
                  </div>
                  <p className={cn('min-w-0 flex-[2_1_280px] break-words', f.sampleClass)}>{f.sample}</p>
                  <Button asChild variant="outline" size="sm">
                    <a href={f.href} target="_blank" rel="noreferrer">
                      Get it <ExternalLink aria-hidden="true" />
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          </Panel>
        </section>

        <section id="photos" className="scroll-mt-28">
          <Panel title="Photos">
            <p className="mb-4 max-w-170 text-ink-2">Photos used on the website, full size.</p>
            <ul className={grid('grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))]')}>
              {PHOTOS.map((p) => (
                <li key={p.src} className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
                  {/* eslint-disable-next-line @next/next/no-img-element -- full-size original for download */}
                  <img src={p.src} alt={p.name} loading="lazy" className="aspect-video w-full object-cover" />
                  <div className="flex flex-1 flex-wrap items-end justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <h3 className="font-bold">{p.name}</h3>
                      <p className="text-ink-2">{p.note}</p>
                    </div>
                    <DownloadLink href={p.src} label="Download" />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </section>

        <section id="names" className="scroll-mt-28">
          <Panel title="Names & details">
            <p className="mb-4 max-w-170 text-ink-2">Copy these exactly so they read the same everywhere.</p>
            <dl className="grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-x-6 gap-y-4">
              {(
                [
                  ['Venue', site.name],
                  ['Building', site.building],
                  ['Newsletter', `The ${site.newsletter}`],
                  ['Address', fullAddress],
                  ['Website', site.url.replace('https://', '')],
                  ['Instagram', site.instagramHandle],
                  ['Phone', site.phone],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="label-sm">{label}</dt>
                  <dd className="-ml-2 mt-0.5">
                    <CopyButton value={value} label={label} />
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>
        </section>

        <section id="rules" className="scroll-mt-28">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-5">
            <Panel title="Do">
              <ul className="flex flex-col gap-2">
                {DOS.map((d) => (
                  <li key={d} className="flex gap-2">
                    <Check className="mt-0.5 size-4.5 flex-none text-success-text" aria-hidden="true" />
                    {d}
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Don’t">
              <ul className="flex flex-col gap-2">
                {DONTS.map((d) => (
                  <li key={d} className="flex gap-2">
                    <span className="mt-0.5 flex size-4.5 flex-none items-center justify-center font-bold text-danger-text" aria-hidden="true">
                      ✕
                    </span>
                    {d}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </section>
      </div>
    </>
  )
}
