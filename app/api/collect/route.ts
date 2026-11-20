import handler from '@/lib/server/handlers/collect'
import { route } from '@/lib/server/adapter'

export const dynamic = 'force-dynamic'

const h = route(handler)
export { h as POST }
