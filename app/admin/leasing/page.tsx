'use client'

// Leasing: inquiries from the form on the Village page, with their own
// stages (New → Replied → Toured → Applied → Lease signed / Passed).

import { PageHeader } from '@/components/internal/internal-ui'
import { RequestList } from '@/components/internal/admin/request-list'

export default function LeasingPage() {
  return (
    <>
      <PageHeader title="Leasing" description="Inquiries about renting a space, sent through the form on the Village page." />
      <RequestList kind="leasing" />
    </>
  )
}
