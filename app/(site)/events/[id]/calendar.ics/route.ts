// /events/<id>/calendar.ics: the event as a calendar file, for "Add to calendar"
// in Apple Calendar, Outlook and anything else that opens .ics files.
import { loadContent } from '@/lib/server/content'
import { icsFile } from '@/lib/event-calendar'
import { site } from '@/lib/data/site'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id)
  const event = (await loadContent()).events.find((e) => e.id === id)
  if (!event) return new Response('Event not found', { status: 404 })
  const filename = `${id.replace(/[^\w.-]+/g, '-').slice(0, 80) || 'event'}.ics`
  return new Response(icsFile(event, site.url), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'public, max-age=0, s-maxage=60',
    },
  })
}
