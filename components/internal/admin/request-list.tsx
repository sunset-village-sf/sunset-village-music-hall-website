'use client'

// The list on the Hall requests and Leasing pages: a "Needs attention / All"
// toggle and one card per request.

import { useState } from 'react'
import { getJson, type Booking } from '@/lib/admin/api'
import { useLoad } from '@/lib/admin/use-load'
import { isOpen, type RequestKind } from '@/lib/requests'
import { useAdmin } from '@/components/internal/admin-shell'
import { EmptyState, ErrorNote } from '@/components/internal/internal-ui'
import { BookingCard } from '@/components/internal/admin/booking-card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export function RequestList({ kind }: { kind: RequestKind }) {
  const { refresh, signedOut } = useAdmin()
  const { data, error, reload } = useLoad(() => getJson<Booking[]>(kind === 'hall' ? 'bookings' : 'leasing'), signedOut)
  const [filter, setFilter] = useState<'open' | 'all'>('open')

  const shown = (data ?? []).filter((b) => filter === 'all' || isOpen(b.status))
  const changed = () => {
    reload()
    refresh() // update the "new" badge on the tab
  }

  return (
    <>
      <ToggleGroup
        type="single"
        size="sm"
        spacing={2}
        value={filter}
        onValueChange={(v) => v && setFilter(v as 'open' | 'all')}
        aria-label="Show"
        className="mb-5"
      >
        <ToggleGroupItem value="open">Needs attention</ToggleGroupItem>
        <ToggleGroupItem value="all">All ({data?.length ?? 0})</ToggleGroupItem>
      </ToggleGroup>
      <ErrorNote>{error}</ErrorNote>
      {data && shown.length === 0 && (
        <EmptyState>
          {filter === 'all'
            ? kind === 'hall'
              ? 'No requests yet.'
              : 'No leasing inquiries yet.'
            : 'You’re all caught up. Nothing new or in progress.'}
        </EmptyState>
      )}
      <div className="flex flex-col gap-4">
        {shown.map((b) => (
          <BookingCard key={b.id} b={b} onChange={changed} />
        ))}
      </div>
    </>
  )
}
