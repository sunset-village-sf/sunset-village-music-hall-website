// The automatic Village Voice: every other Monday at 6am Pacific, covering the
// next 14 days. The Sunday before, the team gets a preview with a link to skip
// it. Issues with no shows are skipped (and the team is told).
//
// State lives in the settings table:
//   voice_auto        'off' turns it off (anything else, or missing, is on)
//   voice_skip        the issue date (yyyy-mm-dd) someone chose to skip
//   voice_note        a note for the next issue, written in the admin; cleared once it's sent
//   voice_preview_for the issue date whose preview went out (so it goes once)
//   voice_sent_for    the issue date that was sent (so it goes once, even if the job runs twice)

import 'server-only'
import { getSettings, query } from './db'

/** The first automatic issue. Every 14 days after it is another. */
export const VOICE_ANCHOR = '2026-11-30'
export const VOICE_DAYS = 14
export const SEND_HOUR = 6
const TZ = 'America/Los_Angeles'
const DAY = 864e5

const toUTC = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
export const addDays = (iso: string, n: number) => new Date(toUTC(iso) + n * DAY).toISOString().slice(0, 10)

/** The date, weekday (0 = Sunday) and hour in Pacific time. */
export function pacificNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  const date = `${parts.year}-${parts.month}-${parts.day}`
  return { date, dow: new Date(toUTC(date)).getUTCDay(), hour: Number(parts.hour) }
}

/** Whether an issue goes out on this date. */
export const isIssueDay = (iso: string) => iso >= VOICE_ANCHOR && ((toUTC(iso) - toUTC(VOICE_ANCHOR)) / DAY) % VOICE_DAYS === 0

/** The first issue date on or after this date. */
export function nextIssueOnOrAfter(iso: string) {
  if (iso <= VOICE_ANCHOR) return VOICE_ANCHOR
  const days = Math.round((toUTC(iso) - toUTC(VOICE_ANCHOR)) / DAY)
  return addDays(VOICE_ANCHOR, Math.ceil(days / VOICE_DAYS) * VOICE_DAYS)
}

export async function setSetting(key: string, value: string | null) {
  await query(
    `insert into settings (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, value],
  )
}

/**
 * Claim the send for an issue date: true for exactly one caller, even if the
 * job runs twice at once. Release it with setSetting('voice_sent_for', previous) on failure.
 */
export async function claimSend(issue: string) {
  const rows = await query(
    `insert into settings (key, value) values ('voice_sent_for', $1)
     on conflict (key) do update set value = excluded.value, updated_at = now()
     where settings.value is distinct from excluded.value returning key`,
    [issue],
  )
  return rows.length > 0
}

export interface VoiceState {
  auto: boolean
  /** The next issue that hasn't gone out yet. */
  next: string
  /** Last day it covers. */
  end: string
  skipped: boolean
  note: string
  previewSent: boolean
  lastSent: string | null
}

export async function voiceState(now = new Date()): Promise<VoiceState> {
  const s = await getSettings()
  const { date, hour } = pacificNow(now)
  let next = nextIssueOnOrAfter(date)
  // Today's issue is done once it's sent (or past send time and skipped/off).
  if (next === date && (s.voice_sent_for === date || hour > SEND_HOUR + 2)) next = addDays(next, VOICE_DAYS)
  return {
    auto: s.voice_auto !== 'off',
    next,
    end: addDays(next, VOICE_DAYS - 1),
    skipped: s.voice_skip === next,
    note: s.voice_note ?? '',
    previewSent: s.voice_preview_for === next,
    lastSent: s.voice_sent_for ?? null,
  }
}
