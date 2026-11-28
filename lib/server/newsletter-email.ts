// The Village Voice email: a weekly issue built from the calendar, and the
// same branded frame around one-off announcements.
//
// Email apps don't run Tailwind, CSS masks or SVG, so this is table layout
// with inline styles. Colors come from lib/tokens.json (the mirror of the
// site's @theme); the pictures (wordmark, sparkles, wave, ticket-stub
// notches) are PNGs drawn from the site's SVGs by scripts/email-assets.mjs.
// Web fonts load in Apple Mail and iOS; elsewhere the fallbacks are used.

import tokens from '@/lib/tokens.json'
import { site, fullAddress } from '@/lib/data/site'
import type { EventCategory, VillageEvent } from '@/lib/data/events'
import { categoryOf, dateParts, eventHref, primaryAction, priceLine } from '@/lib/events'
import { noteText, parseNote, type Inline } from '@/lib/note-markup'

export const SITE_URL = 'https://sunsetvillagesf.com'

const c = (k: keyof typeof tokens.color) => tokens.color[k].value
const fill = (cat: EventCategory) => c(tokens.category[cat] as keyof typeof tokens.color)

const display = "'Bricolage Grotesque', 'Helvetica Neue', Helvetica, Arial, sans-serif"
const label = "Montserrat, 'Helvetica Neue', Helvetica, Arial, sans-serif"
const mono = "'DM Mono', Menlo, Consolas, 'Courier New', monospace"
export const emailFont = display

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const abs = (href: string) => (/^https?:\/\//.test(href) ? href : `${SITE_URL}${href}`)

/** Width of the inside of a paper card (600 - body and card padding - borders), for images. */
const CARD_INNER = 496

function inlineHtml(runs: Inline[], linkColor: string): string {
  return runs
    .map((r) =>
      r.t === 'text'
        ? esc(r.text)
        : r.t === 'bold'
          ? `<strong style="font-weight:800">${inlineHtml(r.children, linkColor)}</strong>`
          : r.t === 'italic'
            ? `<em>${inlineHtml(r.children, linkColor)}</em>`
            : `<a href="${esc(r.href)}" style="color:${linkColor};text-decoration:underline">${inlineHtml(r.children, linkColor)}</a>`,
    )
    .join('')
}

/** The editor's markup (see lib/note-markup.ts) as email-safe HTML. */
function noteHtml(src: string, color: string, linkColor: string, size = 17) {
  const text = `font-family:${display};font-size:${size}px;line-height:1.5;color:${color}`
  return parseNote(src)
    .map((b) => {
      if (b.t === 'p')
        return `<p style="margin:0 0 14px;${text}">${b.lines.map((l) => inlineHtml(l, linkColor)).join('<br>')}</p>`
      if (b.t === 'img') {
        const caption = b.caption
          ? `<div style="font-family:${mono};font-size:13px;line-height:1.5;color:${c('ink-2')};margin-top:8px">${esc(b.caption)}</div>`
          : ''
        return `<div style="margin:4px 0 18px"><img src="${esc(b.src)}" width="${CARD_INNER}" alt="${esc(b.caption)}" style="display:block;width:100%;max-width:${CARD_INNER}px;height:auto;border:2px solid ${c('ink')};border-radius:16px">${caption}</div>`
      }
      const items = b.items.map((i) => `<li style="margin:0 0 6px;${text}">${inlineHtml(i, linkColor)}</li>`).join('')
      return `<${b.t} style="margin:0 0 14px;padding-left:24px;${text}">${items}</${b.t}>`
    })
    .join('')
}

/** A paper card holding a written note (the Voice's note, an announcement's message). */
const noteCard = (src: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c('paper')};border:2px solid ${c('ink')};border-radius:24px;margin:0 0 24px">
<tr><td style="padding:26px 26px 12px">${noteHtml(src, c('ink'), c('sea'))}</td></tr></table>`

/** First words of a note, for the inbox preview line. */
const firstWords = (src: string) =>
  noteText(src)
    .replace(/\[Photo[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)

// ── Building blocks ────────────────────────────────────────────────────

interface Frame {
  /** Base URL for the pictures: the live site when sending, '' in the admin preview. */
  assets: string
  unsubscribeUrl: string
  /** Hidden line shown next to the subject in the inbox. */
  preheader: string
}

const img = (f: Frame, name: string, w: number, h: number, alt = '', style = '') =>
  `<img src="${f.assets}/brand/email/${name}.png" width="${w}" height="${h}" alt="${esc(alt)}" style="display:block;border:0;outline:none;${style}">`

const eyebrow = (f: Frame, text: string, color: string, star: 'sun' | 'yellow' | 'ink') =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding-right:10px;vertical-align:middle">${img(f, `sparkle-${star}`, 12, 12)}</td>
<td style="vertical-align:middle;font-family:${label};font-size:12px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;color:${color}">${esc(text)}</td>
</tr></table>`

const button = (href: string, text: string, tone: 'ink' | 'outline' = 'ink') =>
  `<a href="${esc(href)}" style="display:inline-block;font-family:${display};font-size:15px;font-weight:700;line-height:1;text-decoration:none;border-radius:9999px;padding:12px 20px;${
    tone === 'ink'
      ? `background:${c('ink')};color:${c('fog')};border:2px solid ${c('ink')}`
      : `background:transparent;color:${c('ink')};border:2px solid ${c('ink')}`
  }">${esc(text)}&nbsp;&rarr;</a>`

/** The site's ticket stub: category fill, notches cut on both sides. */
function stub(f: Frame, e: VillageEvent) {
  const { dow, day, month } = dateParts(e.date)
  const cat = categoryOf(e)
  const cap = `font-family:${label};font-size:10px;font-weight:700;letter-spacing:0.2em;color:${c('ink')};text-align:center`
  return `<table role="presentation" width="72" cellpadding="0" cellspacing="0" border="0" style="width:72px;background:${fill(cat)};border-radius:10px">
<tr><td colspan="3" style="${cap};padding:12px 0 2px">${dow}</td></tr>
<tr><td width="9" style="width:9px;vertical-align:middle">${img(f, `notch-${cat}-l`, 9, 18)}</td>
<td style="font-family:${display};font-size:32px;font-weight:800;letter-spacing:-0.03em;line-height:1.1;color:${c('ink')};text-align:center">${day}</td>
<td width="9" style="width:9px;vertical-align:middle">${img(f, `notch-${cat}-r`, 9, 18)}</td></tr>
<tr><td colspan="3" style="${cap};padding:2px 0 12px">${month}</td></tr>
</table>`
}

function eventCard(f: Frame, e: VillageEvent) {
  const href = abs(eventHref(e))
  const action = primaryAction(e)
  const meta = [e.time, priceLine(e)].filter(Boolean).join(' · ')
  const flyer = e.flyer
    ? `<td class="sv-flyer" width="92" style="width:92px;padding-left:16px;vertical-align:top">
<a href="${esc(href)}">${`<img src="${esc(abs(e.flyer))}" width="92" alt="" style="display:block;width:92px;height:auto;border:2px solid ${c('ink')};border-radius:10px">`}</a></td>`
    : ''
  // Up to two of the event's photos under the card, resized by the site (originals can be several MB).
  const shots = (e.gallery ?? []).slice(0, 2)
  const photos = shots.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px"><tr>
${shots
  .map(
    (p, i) => `<td width="50%" style="width:50%;vertical-align:top;${i ? 'padding-left:6px' : 'padding-right:6px'}">
<a href="${esc(href)}"><img src="${esc(`${SITE_URL}/_next/image?url=${encodeURIComponent(p.url)}&w=640&q=75`)}" width="250" alt="${esc(p.caption ?? '')}" style="display:block;width:100%;max-width:250px;height:auto;border:2px solid ${c('ink')};border-radius:10px"></a></td>`,
  )
  .join('\n')}${shots.length === 1 ? '<td width="50%" style="width:50%"></td>' : ''}
</tr></table>`
    : ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c('paper')};border:2px solid ${c('ink')};border-radius:24px;margin:0 0 14px">
<tr><td style="padding:16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="72" style="width:72px;vertical-align:top">${stub(f, e)}</td>
<td style="padding-left:16px;vertical-align:top">
${e.kind ? `<div style="font-family:${mono};font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${c('ink-2')};margin:2px 0 6px">${esc(e.kind)}</div>` : ''}
<a href="${esc(href)}" style="font-family:${display};font-size:22px;font-weight:800;letter-spacing:-0.01em;line-height:1.15;color:${c('ink')};text-decoration:none">${esc(e.title)}</a>
${e.subtitle ? `<div style="font-family:${display};font-size:15px;line-height:1.45;color:${c('ink-2')};margin-top:4px">${esc(e.subtitle)}</div>` : ''}
${meta ? `<div style="font-family:${mono};font-size:13px;line-height:1.6;color:${c('ink')};margin-top:8px">${esc(meta)}</div>` : ''}
<div style="margin-top:14px">${button(action && !action.external ? abs(action.href) : (action?.href ?? href), action?.label ?? 'Details')}</div>
</td>
${flyer}
</tr></table>
${photos}
</td></tr></table>`
}

function laterRow(e: VillageEvent) {
  const { dow, day, month } = dateParts(e.date)
  return `<tr>
<td style="padding:10px 0;border-top:1px solid ${c('ink')};font-family:${mono};font-size:13px;color:${c('ink')};white-space:nowrap;vertical-align:top;width:96px">${dow} ${day} ${month}</td>
<td style="padding:10px 0;border-top:1px solid ${c('ink')};vertical-align:top">
<a href="${esc(abs(eventHref(e)))}" style="font-family:${display};font-size:17px;font-weight:800;color:${c('ink')};text-decoration:none">${esc(e.title)}</a>
${e.subtitle ? `<span style="font-family:${display};font-size:15px;color:${c('ink')}"> &middot; ${esc(e.subtitle)}</span>` : ''}
</td></tr>`
}

/** The page around everything: yellow ticker, ink masthead + wave, content, ink footer. */
function frame(f: Frame, masthead: string, body: string) {
  const footLink = (href: string, text: string) =>
    `<a href="${SITE_URL}${href}" style="color:${c('fog')};text-decoration:underline;font-weight:600">${text}</a>`
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>${esc(site.newsletter)}</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=DM+Mono:wght@400;500&family=Montserrat:wght@600;700&display=swap" rel="stylesheet">
<style>
body{margin:0;padding:0;background:${c('fog')}}
a{color:${c('sea')}}
@media (max-width:480px){
  .sv-pad{padding-left:20px!important;padding-right:20px!important}
  .sv-h1{font-size:44px!important}
  .sv-flyer{display:none!important}
}
</style>
</head>
<body style="margin:0;padding:0;background:${c('fog')}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${c('fog')}">${esc(f.preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c('fog')}"><tr><td align="center" style="padding:24px 10px 32px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">

<tr><td style="background:${c('yellow')};border-radius:28px 28px 0 0;padding:11px 16px;text-align:center;font-family:${label};font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${c('ink')}">
<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-family:${label};font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${c('ink')}">${esc(site.tagline)}</td>
<td style="padding:0 12px;vertical-align:middle">${img(f, 'sparkle-ink', 10, 10)}</td>
<td style="font-family:${label};font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${c('ink')}">${esc(site.corner)}</td>
</tr></table></td></tr>

<tr><td class="sv-pad" style="background:${c('ink')};padding:28px 36px 30px">
<a href="${SITE_URL}">${img(f, 'wordmark-on-dark', 176, 76, site.name, 'width:176px;height:auto')}</a>
${masthead}
</td></tr>
<tr><td style="line-height:0;font-size:0">${img(f, 'wave', 600, 17, '', 'width:100%;height:17px')}</td></tr>

<tr><td class="sv-pad" style="padding:28px 24px 8px">
${body}
</td></tr>

<tr><td class="sv-pad" style="background:${c('ink')};border-radius:28px;padding:30px 36px">
<a href="${SITE_URL}">${img(f, 'wordmark-on-dark', 132, 57, site.name, 'width:132px;height:auto')}</a>
<p style="margin:14px 0 0;font-family:${display};font-size:15px;line-height:1.5;color:${c('fog')}">${esc(fullAddress)}<br>
${footLink('/events', 'Events')} &nbsp; ${footLink('/book', 'Book the hall')} &nbsp; ${footLink('/village', 'The Village')} &nbsp;
<a href="${site.instagram}" style="color:${c('fog')};text-decoration:underline;font-weight:600">Instagram</a></p>
<p style="margin:20px 0 0;padding-top:16px;border-top:1px solid ${c('rule')};font-family:${mono};font-size:12px;line-height:1.6;color:${c('mist')}">
You signed up for the ${esc(site.newsletter)} at sunsetvillagesf.com.
<a href="${esc(f.unsubscribeUrl)}" style="color:${c('mist')};text-decoration:underline">Unsubscribe</a></p>
</td></tr>

</table>
</td></tr></table>
</body></html>`
}

// ── The weekly issue ───────────────────────────────────────────────────

export interface Issue {
  /** First and last day covered, yyyy-mm-dd. */
  start: string
  end: string
  /** Optional note from the team, shown in a card above the shows. Editor markup (lib/note-markup.ts). */
  note?: string
  /** Shows in the week, in date order. */
  events: VillageEvent[]
  /** A few shows after the week, for "Further out". */
  later: VillageEvent[]
}

const short = (iso: string) => {
  const { day, month } = dateParts(iso)
  return `${day} ${month.charAt(0)}${month.slice(1).toLowerCase()}`
}
/** "23–29 Nov" or "30 Nov – 6 Dec". */
export const weekLabel = (start: string, end: string) =>
  start.slice(0, 7) === end.slice(0, 7) ? `${dateParts(start).day}–${short(end)}` : `${short(start)} – ${short(end)}`

/** Issues longer than a week (the every-other-week automatic ones) say "the next two weeks". */
const twoWeeks = (start: string, end: string) => Date.parse(end) - Date.parse(start) > 7 * 864e5
const span = (start: string, end: string) => (twoWeeks(start, end) ? 'the next two weeks' : 'this week')

export const defaultSubject = (start: string, end: string) =>
  twoWeeks(start, end)
    ? `${site.newsletter}: two weeks in the fog (${weekLabel(start, end)})`
    : `${site.newsletter}: this week in the fog (${weekLabel(start, end)})`

const defaultNote = (n: number, i: Pick<Issue, 'start' | 'end'>) =>
  n === 0
    ? `No shows at the Music Hall ${span(i.start, i.end)}. Here’s what’s coming up next.`
    : `Here’s what’s on at the Music Hall ${span(i.start, i.end)}, out at ${site.corner}.`

export function issueHtml(i: Issue, f: Omit<Frame, 'preheader'>) {
  const note = i.note?.trim() ?? ''
  const fr = {
    ...f,
    preheader: (note && firstWords(note)) || i.events.map((e) => e.title).join(' · ') || defaultNote(0, i),
  }
  const quiet = i.events.length === 0
  const masthead = `<div style="margin-top:30px">${eyebrow(fr, `${site.newsletter} · ${weekLabel(i.start, i.end)}`, c('yellow'), 'yellow')}</div>
<h1 class="sv-h1" style="margin:14px 0 0;font-family:${display};font-size:56px;font-weight:800;line-height:0.95;letter-spacing:-0.04em;color:${c('fog')}">
${quiet ? (twoWeeks(i.start, i.end) ? 'A quiet spell in the' : 'A quiet week in the') : twoWeeks(i.start, i.end) ? 'Two weeks in the' : 'This week in the'} <span style="color:${c('sun')}">fog.</span></h1>
<div style="margin-top:18px">${noteHtml(defaultNote(i.events.length, i), c('mist'), c('yellow'), 18)}</div>`

  const week = quiet
    ? ''
    : `<div style="margin:0 0 6px">${eyebrow(fr, 'On the calendar', c('ink'), 'sun')}</div>
<h2 style="margin:6px 0 20px;font-family:${display};font-size:32px;font-weight:800;line-height:1.05;letter-spacing:-0.02em;color:${c('ink')}">${twoWeeks(i.start, i.end) ? 'The next two weeks' : 'This week'}</h2>
${i.events.map((e) => eventCard(fr, e)).join('\n')}`

  const later = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c('teal')};border:2px solid ${c('ink')};border-radius:32px;margin:${quiet ? 0 : 18}px 0 18px">
<tr><td style="padding:26px 26px 28px">
<h2 style="margin:0 0 14px;font-family:${display};font-size:28px;font-weight:800;line-height:1.05;letter-spacing:-0.02em;color:${c('ink')}">Further out</h2>
${
  i.later.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px">${i.later.map(laterRow).join('')}</table>`
    : `<p style="margin:0 0 20px;font-family:${display};font-size:17px;line-height:1.5;color:${c('ink')}">More shows are on the way. Keep an eye on the calendar.</p>`
}
${button(`${SITE_URL}/events`, 'See the full calendar')}
</td></tr></table>`

  const book = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:2px dashed ${c('ink')};border-radius:24px;margin:0 0 24px">
<tr><td style="padding:22px 24px">
<div style="font-family:${display};font-size:20px;font-weight:800;letter-spacing:-0.01em;color:${c('ink')}">Throwing something?</div>
<p style="margin:6px 0 16px;font-family:${display};font-size:15px;line-height:1.5;color:${c('ink-2')}">Shows, parties, workshops and get-togethers: the hall is for rent.</p>
${button(`${SITE_URL}/book`, 'Book the hall', 'outline')}
</td></tr></table>`

  return frame(fr, masthead, (note ? noteCard(note) : '') + week + later + book)
}

export function issueText(i: Issue, unsubscribeUrl: string) {
  const line = (e: VillageEvent) => {
    const { dow, day, month } = dateParts(e.date)
    return [
      `${dow} ${day} ${month} · ${e.title}${e.subtitle ? ` (${e.subtitle})` : ''}`,
      [e.time, priceLine(e)].filter(Boolean).join(' · '),
      abs(eventHref(e)),
    ]
      .filter(Boolean)
      .join('\n')
  }
  return [
    `${site.newsletter.toUpperCase()} · ${weekLabel(i.start, i.end)}`,
    defaultNote(i.events.length, i),
    ...(i.note?.trim() ? [noteText(i.note)] : []),
    ...(i.events.length ? [twoWeeks(i.start, i.end) ? 'THE NEXT TWO WEEKS' : 'THIS WEEK', ...i.events.map(line)] : []),
    ...(i.later.length ? ['FURTHER OUT', ...i.later.map(line)] : []),
    `Full calendar: ${SITE_URL}/events\nBook the hall: ${SITE_URL}/book`,
    `--\n${site.name} · ${fullAddress}\nUnsubscribe: ${unsubscribeUrl}`,
  ].join('\n\n')
}

// ── One-off announcements, in the same frame ──────────────────────────

export function announcementHtml(subject: string, body: string, f: Omit<Frame, 'preheader'>) {
  const fr = { ...f, preheader: firstWords(body) }
  const masthead = `<div style="margin-top:30px">${eyebrow(fr, site.newsletter, c('yellow'), 'yellow')}</div>
<h1 class="sv-h1" style="margin:14px 0 0;font-family:${display};font-size:44px;font-weight:800;line-height:1;letter-spacing:-0.03em;color:${c('fog')}">${esc(subject)}</h1>`
  return frame(fr, masthead, noteCard(body))
}

export const announcementText = (body: string, unsubscribeUrl: string) =>
  `${noteText(body)}\n\n--\n${site.name} · ${fullAddress}\nUnsubscribe: ${unsubscribeUrl}`
