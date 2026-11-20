// Team roles and email alerts, shared by the admin UI and the API.
// Admins manage the team (add, remove, roles, anyone's alerts); members use
// every other part of the admin and choose their own alerts.

export type Role = 'admin' | 'member'

export const ROLES: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
]

export type AlertKind = 'hall' | 'leasing' | 'tickets' | 'backup'

export const ALERT_KINDS: { value: AlertKind; label: string }[] = [
  { value: 'hall', label: 'Hall requests' },
  { value: 'leasing', label: 'Leasing inquiries' },
  { value: 'tickets', label: 'Ticket sales' },
  { value: 'backup', label: 'Weekly backup' },
]

export const isAlertKind = (v: unknown): v is AlertKind => ALERT_KINDS.some((k) => k.value === v)
