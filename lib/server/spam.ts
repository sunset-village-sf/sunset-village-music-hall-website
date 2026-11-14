// Spam checks for the public forms (booking, leasing, newsletter).
//
// 1. Trap field: a hidden input ("hp") people never see. Bots fill it in.
// 2. Too fast: forms posted less than MIN_MS after the page loaded (opt-in per form).
// 3. Cloudflare Turnstile: verified only when TURNSTILE_SECRET_KEY is set
//    (the widget shows when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set at build time).
//
// 'drop'   → pretend it worked, save and send nothing (don't teach bots what tripped).
// 'reject' → tell the visitor to try again (a real person can retry the check).

import { str, clientIp, type VercelReq } from './http'

const MIN_MS = 2000

export const hasTurnstile = () => Boolean(process.env.TURNSTILE_SECRET_KEY)

export async function spamCheck(
  req: VercelReq,
  { checkSpeed = false }: { checkSpeed?: boolean } = {},
): Promise<'ok' | 'drop' | 'reject'> {
  const b = req.body ?? {}
  if (str(b.hp).trim()) return 'drop'
  const elapsed = Number(b.elapsed)
  if (checkSpeed && Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_MS) return 'drop'

  if (!hasTurnstile()) return 'ok'
  const token = str(b.turnstile)
  if (!token) return 'reject'
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY!,
        response: token,
        remoteip: clientIp(req),
      }),
    })
    const data: { success?: boolean } = await res.json()
    return data.success ? 'ok' : 'reject'
  } catch (e) {
    // Cloudflare unreachable: let the message through rather than lose it.
    console.error('spam: turnstile verify failed', e)
    return 'ok'
  }
}
