import handler from '@/lib/server/handlers/calendar-sync'
import { route } from '@/lib/server/adapter'

export const dynamic = 'force-dynamic'

const h = route(handler)
export { h as GET }
