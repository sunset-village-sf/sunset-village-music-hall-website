'use client'

// Client half of lib/server/spam.ts. Each public form calls useSpamGuard(),
// renders {guard.fields} just above its submit button, and spreads
// guard.payload() into the JSON it posts. Call guard.reset() after each submit
// (Turnstile tokens are single-use).

import { useCallback, useEffect, useRef, useState } from 'react'

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface Turnstile {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

let loader: Promise<Turnstile> | null = null
function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loader ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT
    s.async = true
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')))
    s.onerror = () => {
      loader = null
      reject(new Error('turnstile failed to load'))
    }
    document.head.appendChild(s)
  })
  return loader
}

interface GuardState {
  startedAt: React.RefObject<number>
  trap: React.RefObject<HTMLInputElement | null>
  widget: React.RefObject<string | null>
  setToken: (t: string) => void
}

/** Trap field + Turnstile box. Its own component so the widget re-renders whenever the form remounts. */
function GuardFields({ startedAt, trap, widget, setToken }: GuardState) {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    startedAt.current = Date.now()
    if (!SITE_KEY) return
    let cancelled = false
    loadTurnstile()
      .then((t) => {
        if (cancelled || !box.current) return
        widget.current = t.render(box.current, {
          sitekey: SITE_KEY,
          appearance: 'interaction-only', // invisible unless Cloudflare needs a click
          'refresh-expired': 'auto',
          callback: setToken,
          'expired-callback': () => setToken(''),
          'error-callback': () => setToken(''),
        })
      })
      .catch(() => {}) // blocked or offline: the server still accepts if it can't verify
    return () => {
      cancelled = true
      if (widget.current) window.turnstile?.remove(widget.current)
      widget.current = null
      setToken('')
    }
  }, [startedAt, widget, setToken])

  return (
    <>
      <div aria-hidden="true" className="sr-only">
        <label>
          Leave this empty
          <input ref={trap} type="text" name="hp" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {SITE_KEY && <div ref={box} />}
    </>
  )
}

export function useSpamGuard() {
  const startedAt = useRef(0)
  const trap = useRef<HTMLInputElement>(null)
  const widget = useRef<string | null>(null)
  const [token, setToken] = useState('')

  const payload = useCallback(
    () => ({ hp: trap.current?.value ?? '', elapsed: Date.now() - startedAt.current, turnstile: token }),
    [token],
  )

  const reset = useCallback(() => {
    setToken('')
    if (widget.current) window.turnstile?.reset(widget.current)
  }, [])

  const fields = <GuardFields startedAt={startedAt} trap={trap} widget={widget} setToken={setToken} />

  return { fields, payload, reset }
}
