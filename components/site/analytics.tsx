'use client'

// Counts page views and ticket-link clicks for the admin's Analytics tab
// (see lib/server/handlers/collect.ts). No cookies or storage. Skipped when the
// browser asks not to be tracked (Global Privacy Control or Do Not Track).
//
// To count clicks on a link, give it data-track="ticket" (and
// data-track-event="<event id>" if it isn't on that event's page).

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

const optedOut = () =>
  (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true ||
  navigator.doNotTrack === '1'

function send(data: Record<string, string | undefined>) {
  if (optedOut()) return
  fetch('/api/collect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    keepalive: true, // still sent when the click leaves the page
    credentials: 'same-origin',
  }).catch(() => {})
}

export function Analytics() {
  const path = usePathname()
  const last = useRef<string | null>(null)

  useEffect(() => {
    if (path === last.current) return // same page again (e.g. React re-running the effect)
    // Only the first page of a visit has an outside referrer; later pages were reached from this site.
    const referrer = last.current === null ? document.referrer || undefined : undefined
    last.current = path
    send({ kind: 'view', path, referrer })
  }, [path])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = (e.target as Element | null)?.closest<HTMLElement>('[data-track]')
      if (!el) return
      send({ kind: el.dataset.track, path: location.pathname, eventId: el.dataset.trackEvent })
    }
    document.addEventListener('click', onClick, { capture: true })
    return () => document.removeEventListener('click', onClick, { capture: true })
  }, [])

  return null
}
