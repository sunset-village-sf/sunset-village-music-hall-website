// An event as a calendar entry: start/end times, description and location,
// shared by the Google Calendar sync (lib/server/gcal.ts) and the event page's
// "Add to calendar" links (a Google Calendar link and an .ics file).
//
// Times are Pacific. No start time → all day. No end time → 3 hours.
// An end before the start runs past midnight (e.g. "til 2am").

import { fullAddress } from '@/lib/data/site'

export const TZ = 'America/Los_Angeles'
const DEFAULT_LENGTH_MIN = 180

export interface CalendarSource {
  id: string
  title: string
  date: string // yyyy-mm-dd
  startTime?: string | null // HH:MM, 24h, Pacific
  endTime?: string | null
  venue?: string | null
  kind?: string | null
  subtitle?: string | null
  summary?: string | null
  details?: string | null
  price?: string | null
  ticketUrl?: string | null
}

export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** Start and end as plain strings: dates for all-day events, local Pacific date-times otherwise. */
function span(e: Pick<CalendarSource, 'date' | 'startTime' | 'endTime'>) {
  if (!e.startTime) return { allDay: true, start: e.date, end: addDays(e.date, 1) }
  const start = toMin(e.startTime)
  let end = e.endTime ? toMin(e.endTime) : start + DEFAULT_LENGTH_MIN
  if (e.endTime && end <= start) end += 24 * 60
  const endDate = addDays(e.date, Math.floor(end / (24 * 60)))
  return { allDay: false, start: `${e.date}T${e.startTime}:00`, end: `${endDate}T${fromMin(end % (24 * 60))}:00` }
}

/** Start/end in Google Calendar API format (local Pacific times with a time zone, or all-day dates). */
export function calendarTimes(e: Pick<CalendarSource, 'date' | 'startTime' | 'endTime'>) {
  const { allDay, start, end } = span(e)
  return allDay
    ? { start: { date: start }, end: { date: end } }
    : { start: { dateTime: start, timeZone: TZ }, end: { dateTime: end, timeZone: TZ } }
}

export const eventPageUrl = (siteUrl: string, id: string) => `${siteUrl}/events/${encodeURIComponent(id)}`

export const calendarLocation = (e: Pick<CalendarSource, 'venue'>) => `${e.venue ?? 'Music Hall'}, ${fullAddress}`

export function calendarDescription(e: CalendarSource, page: string) {
  return [
    [e.kind, e.subtitle].filter(Boolean).join(' · '),
    e.details ?? e.summary,
    e.price ? `Price: ${e.price}` : '',
    e.ticketUrl ? `Tickets: ${e.ticketUrl}` : '',
    `Event page: ${page}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

const compact = (s: string) => s.replace(/[-:]/g, '') // 2026-12-05T20:00:00 → 20261205T200000

/** A link that opens Google Calendar with the event filled in, ready to save. */
export function googleCalendarLink(e: CalendarSource, siteUrl: string) {
  const { start, end } = span(e)
  const dates = `${compact(start)}/${compact(end)}`
  const page = eventPageUrl(siteUrl, e.id)
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates,
    ctz: TZ,
    details: calendarDescription(e, page),
    location: calendarLocation(e),
  })
  return `https://calendar.google.com/calendar/render?${q}`
}

/** Pacific wall-clock time → UTC, accounting for daylight saving. */
function pacificToUtc(localISO: string): Date {
  const [d, t] = localISO.split('T')
  const [y, m, day] = d.split('-').map(Number)
  const [h, min] = t.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, day, h, min)
  const offset = (at: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: TZ,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
      })
        .formatToParts(at)
        .map((x) => [x.type, Number(x.value)]),
    )
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - at
  }
  let utc = wall - offset(wall)
  utc = wall - offset(utc)
  return new Date(utc)
}

const icsUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Lines longer than 75 bytes continue on the next line after a space (RFC 5545). */
function fold(line: string) {
  const enc = new TextEncoder()
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += n
  }
  out.push(cur)
  return out.join('\r\n ')
}

/** The event as an .ics file, for Apple Calendar, Outlook and others. */
export function icsFile(e: CalendarSource, siteUrl: string, now = new Date()) {
  const { allDay, start, end } = span(e)
  const page = eventPageUrl(siteUrl, e.id)
  const when = allDay
    ? [`DTSTART;VALUE=DATE:${compact(start)}`, `DTEND;VALUE=DATE:${compact(end)}`]
    : [`DTSTART:${icsUtc(pacificToUtc(start))}`, `DTEND:${icsUtc(pacificToUtc(end))}`]
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sunset Village Music Hall//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.id.replace(/[^\w.-]/g, '-')}@${new URL(siteUrl).hostname}`,
    `DTSTAMP:${icsUtc(now)}`,
    ...when,
    `SUMMARY:${icsText(e.title)}`,
    `DESCRIPTION:${icsText(calendarDescription(e, page))}`,
    `LOCATION:${icsText(calendarLocation(e))}`,
    `URL:${page}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}
