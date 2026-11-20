'use client'

// Analytics: how many people visit the site, what they look at, where they
// came from, and what they do (ticket clicks, requests, signups). Counted by
// the site itself (/api/collect), with no cookies and no outside service.

import Link from 'next/link'
import { useState } from 'react'
import { getJson, type Analytics } from '@/lib/admin/api'
import { useLoad } from '@/lib/admin/use-load'
import { useAdmin } from '@/components/internal/admin-shell'
import { EmptyState, ErrorNote, Mono, PageHeader, Panel, Stat } from '@/components/internal/internal-ui'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '12 months' },
]

const n = (v: number) => v.toLocaleString('en-US')
const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', opts)
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '–')

/** Readable names for the site's pages. Events use their title. */
function pageName(path: string, title: string | null) {
  if (title) return title
  const names: Record<string, string> = {
    '/': 'Home',
    '/events': 'Events',
    '/book': 'Book the hall',
    '/village': 'The Village',
  }
  return names[path] ?? path
}

/** Days for short ranges, weeks (starting on the first day shown) for a year. */
function bars(daily: Analytics['daily'], days: number) {
  if (days <= 90) return daily.map((d) => ({ start: d.day, end: d.day, visitors: d.visitors }))
  const out: { start: string; end: string; visitors: number }[] = []
  for (let i = 0; i < daily.length; i += 7) {
    const week = daily.slice(i, i + 7)
    out.push({ start: week[0].day, end: week.at(-1)!.day, visitors: week.reduce((s, d) => s + d.visitors, 0) })
  }
  return out
}

function VisitorsChart({ data, days }: { data: Analytics['daily']; days: number }) {
  const list = bars(data, days)
  const most = Math.max(0, ...list.map((b) => b.visitors))
  const max = Math.max(1, most)
  const top = list.reduce((a, b) => (b.visitors > a.visitors ? b : a), list[0])
  const unit = days > 90 ? 'week' : 'day'
  const when = (b: (typeof list)[number]) =>
    b.start === b.end ? dayLabel(b.start) : `${dayLabel(b.start)} – ${dayLabel(b.end)}`
  return (
    <figure>
      <div
        role="img"
        aria-label={`Visitors per ${unit}. Busiest: ${top ? `${when(top)}, ${n(top.visitors)}` : 'none yet'}.`}
        className="flex h-40 items-end gap-px border-b border-border"
      >
        {list.map((b) => (
          <div
            key={b.start}
            title={`${when(b)}: ${n(b.visitors)} ${b.visitors === 1 ? 'visitor' : 'visitors'}`}
            className="min-w-0 flex-1 rounded-t-xs bg-sea hover:bg-ink"
            style={{ height: `${(b.visitors / max) * 100}%`, minHeight: b.visitors ? '2px' : undefined }}
          />
        ))}
      </div>
      <figcaption className="mt-1.5 flex justify-between gap-2 text-ink-2">
        <Mono>{list[0] && dayLabel(list[0].start)}</Mono>
        <Mono>
          Most in a {unit}: {n(most)}
        </Mono>
        <Mono>{list.at(-1) && dayLabel(list.at(-1)!.end)}</Mono>
      </figcaption>
    </figure>
  )
}

export default function AnalyticsPage() {
  const { signedOut } = useAdmin()
  const [days, setDays] = useState(30)
  const { data, error, reload } = useLoad(() => getJson<Analytics>(`analytics&days=${days}`), signedOut)

  const range = RANGES.find((r) => r.days === days)!.label.replace(/^(\d+)/, 'last $1')
  const t = data?.totals
  const direct = t ? Math.max(0, t.visitors - t.from_elsewhere) : 0
  const mobile = data?.devices.find((d) => d.device === 'mobile')?.visitors ?? 0
  const deviceTotal = data?.devices.reduce((s, d) => s + d.visitors, 0) ?? 0

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Visits to the public site, counted by the site itself: no cookies, no outside service. Each person counts once per day. Visits from people signed in to the admin aren’t counted."
        actions={
          <ToggleGroup
            type="single"
            size="sm"
            spacing={2}
            value={String(days)}
            onValueChange={(v) => {
              if (!v) return
              setDays(Number(v))
              reload()
            }}
            aria-label="Time range"
          >
            {RANGES.map((r) => (
              <ToggleGroupItem key={r.days} value={String(r.days)}>
                {r.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      />
      <ErrorNote>{error}</ErrorNote>
      {data && t && data.days === days && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={`Visitors, ${range}`} value={n(t.visitors)} />
            <Stat label="Pages viewed" value={n(t.views)} />
            <Stat label="Ticket link clicks" value={n(t.ticket_clicks)} />
            <Stat label="On phones" value={pct(mobile, deviceTotal)} />
          </div>

          <Panel title="Visitors">
            {t.views === 0 ? (
              <EmptyState>No visits counted in this range yet.</EmptyState>
            ) : (
              <VisitorsChart data={data.daily} days={days} />
            )}
          </Panel>

          <div className="grid gap-5 md:grid-cols-2">
            <Panel title="Most viewed pages">
              {data.pages.length === 0 ? (
                <EmptyState>Nothing yet.</EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Page</TableHead>
                      <TableHead className="text-right">Visitors</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Views</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.pages.map((p) => (
                      <TableRow key={p.path}>
                        <TableCell className="break-words">
                          <a href={p.path} target="_blank" rel="noopener" className="font-semibold">
                            {pageName(p.path, p.title)}
                          </a>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{n(p.visitors)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{n(p.views)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Panel>

            <Panel title="Where visitors came from">
              {t.visitors === 0 ? (
                <EmptyState>Nothing yet.</EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Visitors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.referrers.map((r) => (
                      <TableRow key={r.referrer}>
                        <TableCell className="break-all">{r.referrer}</TableCell>
                        <TableCell className="text-right tabular-nums">{n(r.visitors)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="text-ink-2">
                        Direct, a saved link, or an app that hides where it came from
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{n(direct)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </Panel>
          </div>

          <Panel title="Events">
            {data.events.length === 0 ? (
              <EmptyState>No event pages viewed in this range yet.</EmptyState>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Event</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                    <TableHead className="text-right">
                      Ticket<span className="hidden sm:inline"> clicks</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <span className="block font-semibold sm:inline">{e.title}</span>{' '}
                        <Mono className="text-ink-2 whitespace-nowrap">{dayLabel(e.date, { month: 'short', day: 'numeric', year: 'numeric' })}</Mono>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{n(e.views)}</TableCell>
                      <TableCell className="text-right tabular-nums">{n(e.ticket_clicks)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="mt-3 text-meta text-ink-2">
              Ticket clicks count the event’s outside ticket link (on the card or the event page). Tickets sold on this
              site are under <Link href="/admin/tickets">Tickets</Link>.
            </p>
          </Panel>

          <Panel title={`What people sent, ${range}`}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Hall requests" value={n(data.forms.hall_requests)} href="/admin/requests" />
              <Stat label="Leasing inquiries" value={n(data.forms.leasing_inquiries)} href="/admin/leasing" />
              <Stat label="Newsletter signups" value={n(data.forms.signups)} href="/admin/newsletter" />
              <Stat label="Tickets sold online" value={n(data.forms.tickets_sold)} href="/admin/tickets" />
            </div>
          </Panel>
        </div>
      )}
    </>
  )
}
