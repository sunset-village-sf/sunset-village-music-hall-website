// Calls to /api/admin. Errors carry the server's plain-language message so
// screens can show it as is.

import type { RequestKind, RequestStatus } from '@/lib/requests'
import type { AlertKind, Role } from '@/lib/team'
import type { Artist } from '@/lib/artists'

export class SignedOut extends Error {}

/** A save clashed with someone else's: the server's details (both versions) ride along. */
export class ConflictError<T = Record<string, unknown>> extends Error {
  constructor(
    message: string,
    public data: T,
  ) {
    super(message)
  }
}

async function call<T>(action: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/admin?action=${action}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  }).catch(() => null)
  if (!res) throw new Error('Can’t reach the server. Check your internet connection.')
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && action !== 'login') throw new SignedOut()
  if (res.status === 409) throw new ConflictError(data.error, data)
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Try again.')
  return data as T
}

export const getJson = <T,>(action: string) => call<T>(action)
export const postJson = <T = { ok: true },>(action: string, body: unknown) => call<T>(action, body)

export interface Booking {
  id: number
  created_at: string
  type: string | null
  name: string
  email: string
  date: string | null
  headcount: string | null
  message: string
  kind: RequestKind
  status: RequestStatus
  notes: string | null
  org?: string | null
  phone?: string | null
  backup_date?: string | null
  /** Comma-separated, e.g. "Sound tech, Bar". */
  needs?: string | null
  /** Leasing: the kind of space, e.g. "Retail". */
  space?: string | null
}

export interface Subscriber {
  id: number
  email: string
  created_at: string
  unsubscribed_at: string | null
}

export interface Announcement {
  id: number
  created_at: string
  subject: string
  body: string
  recipients: number
  sent: number
}

export interface Setup {
  email: boolean
  notifications: boolean
  uploads: boolean
  payments: boolean
  backups: boolean
  calendar: boolean
}

export interface Me extends Setup {
  admin: { id: number; email: string; name: string; role: Role }
  newBookings: number
  newLeasing: number
  /** Artist submissions waiting for review. */
  artistInfo: number
  usingSetupPassword: boolean
}

export type ArtistLinkStatus = 'sent' | 'submitted' | 'approved' | 'discarded' | 'revoked'

export interface ArtistLink {
  id: number
  event_id: string
  artist_id: number | null
  artist_name: string
  email: string
  status: ArtistLinkStatus
  created_at: string
  created_by: string | null
  expires_at: string
  expired: boolean
  submitted_at: string | null
  submission: Artist | null
  reviewed_at: string | null
  reviewed_by: string | null
  event_title: string
  event_date: string
  event_artists: Artist[] | null
}

export interface AdminUser {
  id: number
  email: string
  name: string
  role: Role
  alerts: AlertKind[]
  created_at: string
  last_login_at: string | null
  created_by_name: string | null
}

export interface Order {
  id: number
  created_at: string
  event_id: string
  event_title: string | null
  event_date: string | null
  name: string | null
  email: string
  quantity: number
  amount_cents: number
  payment_intent: string | null
  checked_in: boolean
  refunded_at: string | null
}

export interface Analytics {
  days: number
  totals: { visitors: number; views: number; ticket_clicks: number; from_elsewhere: number }
  daily: { day: string; visitors: number; views: number }[]
  pages: { path: string; title: string | null; views: number; visitors: number }[]
  referrers: { referrer: string; visitors: number }[]
  devices: { device: 'mobile' | 'desktop'; visitors: number }[]
  events: { id: string; title: string; date: string; views: number; ticket_clicks: number }[]
  forms: { hall_requests: number; leasing_inquiries: number; signups: number; tickets_sold: number }
}
