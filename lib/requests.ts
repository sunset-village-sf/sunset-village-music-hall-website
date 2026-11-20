// Requests from the public forms. Hall booking requests and leasing
// inquiries share one table (`bookings`, told apart by `kind`) but move
// through different stages. Used by the admin UI and the API.

export type RequestKind = 'hall' | 'leasing'

export const REQUEST_STATUSES = {
  hall: [
    { value: 'new', label: 'New' },
    { value: 'replied', label: 'Replied' },
    { value: 'booked', label: 'Booked' },
    { value: 'declined', label: 'Declined' },
  ],
  leasing: [
    { value: 'new', label: 'New' },
    { value: 'replied', label: 'Replied' },
    { value: 'toured', label: 'Toured' },
    { value: 'applied', label: 'Applied' },
    { value: 'signed', label: 'Lease signed' },
    { value: 'passed', label: 'Passed' },
  ],
} as const

export type RequestStatus = (typeof REQUEST_STATUSES)[RequestKind][number]['value']

const CLOSED: readonly string[] = ['booked', 'declined', 'signed', 'passed']

/** Still in progress, i.e. shown under "Needs attention". */
export const isOpen = (status: string) => !CLOSED.includes(status)

export const isStatusFor = (kind: RequestKind, status: unknown): status is RequestStatus =>
  REQUEST_STATUSES[kind].some((s) => s.value === status)

export const statusLabel = (kind: RequestKind, status: string) =>
  REQUEST_STATUSES[kind].find((s) => s.value === status)?.label ?? status
