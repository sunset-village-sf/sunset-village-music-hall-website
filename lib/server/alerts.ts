// Who gets each kind of email alert: the team members who ticked it under
// Team. If nobody has, it falls back to INQUIRY_TO so alerts are never lost
// (also used when the database is unreachable).

import { query, hasDb } from './db'
import { inquiryTo } from './email'
import { ALERT_KINDS, type AlertKind } from '@/lib/team'

export async function alertRecipients(kind: AlertKind): Promise<string[]> {
  if (hasDb()) {
    const rows = await query<{ email: string }>(`select email from admins where $1 = any(alerts) order by id`, [kind]).catch(
      (e) => {
        console.error('alerts: recipient lookup failed', e)
        return []
      },
    )
    if (rows.length) return rows.map((r) => r.email)
  }
  return inquiryTo()
}

/** Whether alerts of this kind (or, with no kind, of any kind) reach at least one address. */
export async function hasAlertRecipient(kind?: AlertKind): Promise<boolean> {
  const kinds = kind ? [kind] : ALERT_KINDS.map((k) => k.value)
  for (const k of kinds) if ((await alertRecipients(k)).length) return true
  return false
}
