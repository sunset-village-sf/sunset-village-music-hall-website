'use client'

// Under the ticket box on an event's page: Share (the phone's share sheet, or
// copy the link on a computer) and Add to calendar (Google, or an .ics file
// for Apple Calendar and Outlook). Upcoming events only get the calendar links.

import { useState } from 'react'
import { CalendarPlus, Check, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SaveShare({
  title,
  url,
  googleCalendar,
  icsHref,
}: {
  title: string
  url: string
  /** Omit for past events. */
  googleCalendar?: string
  icsHref?: string
}) {
  const [status, setStatus] = useState('')

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
      } catch {
        // Closed the share sheet: nothing to do.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setStatus('Link copied')
    } catch {
      setStatus('Couldn’t copy. The link is in the address bar.')
    }
    setTimeout(() => setStatus(''), 4000)
  }

  return (
    <div className="flex flex-col gap-3 border-t-2 border-ink pt-6">
      <div className="flex flex-wrap gap-2.5">
        <Button type="button" variant="outline" size="md" onClick={share}>
          {status === 'Link copied' ? <Check aria-hidden /> : <Share2 aria-hidden />}
          Share
        </Button>
        {googleCalendar && (
          <Button asChild variant="outline" size="md">
            <a href={googleCalendar} target="_blank" rel="noopener">
              <CalendarPlus aria-hidden />
              Google Calendar
              <span className="sr-only">: add this event (opens in a new tab)</span>
            </a>
          </Button>
        )}
        {icsHref && (
          <Button asChild variant="outline" size="md">
            <a href={icsHref} download>
              <CalendarPlus aria-hidden />
              Apple / Outlook
              <span className="sr-only">: download a calendar file for this event</span>
            </a>
          </Button>
        )}
      </div>
      <p className="text-meta text-ink-2" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  )
}
