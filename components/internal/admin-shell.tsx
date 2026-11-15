'use client'

// The /admin area: sign-in gate, top bar, tab nav, and a context the screens
// use for the signed-in admin and connected services.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useState, type FormEvent } from 'react'
import { getJson, postJson, SignedOut, type Me } from '@/lib/admin/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Alert } from '@/components/ui/alert'
import { Wordmark } from '@/components/brand/wordmark'
import { cn } from '@/lib/utils'
import { FormField, InternalMain, InternalTopBar } from './internal-ui'

interface AdminCtx {
  me: Me
  /** Re-fetch `me` (new-booking count, setup flags). */
  refresh: () => void
  /** Call when an API call comes back 401. */
  signedOut: () => void
}
const Ctx = createContext<AdminCtx | null>(null)

export function useAdmin() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAdmin outside AdminShell')
  return c
}

const TABS = [
  { href: '/admin/overview', label: 'Overview' },
  { href: '/admin/events', label: 'Events' },
  { href: '/admin/bookings', label: 'Bookings', badge: 'newBookings' as const },
  { href: '/admin/tickets', label: 'Tickets' },
  { href: '/admin/newsletter', label: 'Newsletter' },
  { href: '/admin/shops', label: 'Shops' },
  { href: '/admin/team', label: 'Team' },
]

/** Centered card the sign-in and password-reset screens share. */
function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-start justify-center px-4 pt-20">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
        <Wordmark variant="on-light" height={56} />
        <h1 className="mt-5 text-heading-lg">{title}</h1>
        {children}
      </div>
    </main>
  )
}

const linkButton = 'cursor-pointer self-start text-ui font-semibold text-ink-2 underline hover:text-ink'

function SignIn({ onIn }: { onIn: () => void }) {
  const [mode, setMode] = useState<'signin' | 'forgot' | 'sent'>('signin')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const go = (m: typeof mode) => {
    setMode(m)
    setError('')
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const f = new FormData(e.currentTarget)
      if (mode === 'forgot') {
        await postJson('forgot', { email })
        setMode('sent')
        setBusy(false)
      } else {
        await postJson('login', { email, password: f.get('password') })
        onIn()
      }
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  if (mode === 'sent') {
    return (
      <AuthCard title="Check your email">
        <div className="mt-4 flex flex-col gap-4 text-ui" role="status">
          <p>
            If <b>{email}</b> has an admin login, we’ve sent it a link to choose a new password. The link works once, for the
            next hour.
          </p>
          <p className="text-ink-2">Nothing after a few minutes? Check spam, or ask another admin to reset it under Team.</p>
          <button type="button" className={linkButton} onClick={() => go('signin')}>
            ← Back to sign in
          </button>
        </div>
      </AuthCard>
    )
  }

  const forgot = mode === 'forgot'
  return (
    <AuthCard title={forgot ? 'Reset your password' : 'Admin sign in'}>
      {forgot && <p className="mt-2 text-ui text-ink-2">Enter your admin email and we’ll send you a link to choose a new password.</p>}
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <FormField label="Email" htmlFor="email">
          <Input
            density="compact"
            id="email"
            name="email"
            type="email"
            required
            autoFocus
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormField>
        {!forgot && (
          <FormField label="Password" htmlFor="password">
            <PasswordInput density="compact" id="password" name="password" required autoComplete="current-password" />
          </FormField>
        )}
        {error && <Alert variant="destructive">{error}</Alert>}
        <Button type="submit" disabled={busy}>
          {forgot ? (busy ? 'Sending…' : 'Send reset link') : busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <button type="button" className={linkButton} onClick={() => go(forgot ? 'signin' : 'forgot')}>
          {forgot ? '← Back to sign in' : 'Forgot password?'}
        </button>
      </form>
    </AuthCard>
  )
}

/** Opened from the emailed link (/admin?reset=…): choose a new password, then you're signed in. */
function ResetPassword({ token, onDone }: { token: string; onDone: () => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    if (f.get('next') !== f.get('again')) return setError('The new passwords don’t match')
    setBusy(true)
    setError('')
    try {
      await postJson('reset', { token, password: f.get('next') })
      onDone()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <FormField label="New password" htmlFor="pw-next" hint="At least 10 characters.">
          <PasswordInput density="compact" id="pw-next" name="next" required minLength={10} autoFocus autoComplete="new-password" />
        </FormField>
        <FormField label="New password again" htmlFor="pw-again">
          <PasswordInput density="compact" id="pw-again" name="again" required autoComplete="new-password" />
        </FormField>
        {error && <Alert variant="destructive">{error}</Alert>}
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save and sign in'}
        </Button>
      </form>
    </AuthCard>
  )
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const [me, setMe] = useState<Me | null | 'out'>(null)
  const [error, setError] = useState('')
  // A reset link's token: read once, then taken out of the address bar so it
  // isn't left in history or passed on when following links.
  const [resetTok, setResetTok] = useState<string | null>(null)
  useEffect(() => {
    const url = new URL(window.location.href)
    const t = url.searchParams.get('reset')
    if (!t) return
    setResetTok(t)
    url.searchParams.delete('reset')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  }, [])

  const refresh = useCallback(() => {
    getJson<Me>('me')
      .then(setMe)
      .catch((e) => (e instanceof SignedOut ? setMe('out') : setError(e.message)))
  }, [])
  useEffect(refresh, [refresh])
  const signedOut = useCallback(() => setMe('out'), [])

  if (error) {
    return (
      <InternalMain className="max-w-md pt-20">
        <Alert variant="destructive">{error}</Alert>
      </InternalMain>
    )
  }
  if (resetTok) {
    return (
      <ResetPassword
        token={resetTok}
        onDone={() => {
          setResetTok(null)
          refresh()
        }}
      />
    )
  }
  if (me === null) return <div className="min-h-screen" />
  if (me === 'out') return <SignIn onIn={refresh} />

  return (
    <Ctx.Provider value={{ me, refresh, signedOut }}>
      <header className="sticky top-0 z-40">
        <InternalTopBar title="Admin" href="/admin/overview">
          <span className="hidden sm:inline">{me.admin.name}</span>
          <a href="/" target="_blank" rel="noreferrer" className="text-mist hover:text-fog">
            View site ↗
          </a>
          <button
            type="button"
            className="cursor-pointer text-mist underline hover:text-fog"
            onClick={() => postJson('logout', {}).finally(() => setMe('out'))}
          >
            Sign out
          </button>
        </InternalTopBar>
        <nav aria-label="Admin" className="border-b border-border bg-fog">
          <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 py-2 sm:px-5">
            {TABS.map((t) => {
              const current = path.startsWith(t.href)
              const badge = t.badge ? me[t.badge] : 0
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-ui font-semibold whitespace-nowrap text-ink-2 no-underline hover:bg-sand hover:text-ink',
                    current && 'bg-ink text-fog hover:bg-ink hover:text-fog',
                  )}
                >
                  {t.label}
                  {badge ? (
                    <span className="rounded-full bg-sun px-1.5 font-mono text-xs text-ink">{badge}</span>
                  ) : null}
                </Link>
              )
            })}
          </div>
        </nav>
      </header>
      <InternalMain>
        {me.usingSetupPassword && (
          <Alert variant="warning" className="mb-6">
            You’re signed in with the setup password.{' '}
            <Link href="/admin/team" className="text-ink">
              Choose your own password on the Team page
            </Link>{' '}
            so only you know it.
          </Alert>
        )}
        {children}
      </InternalMain>
    </Ctx.Provider>
  )
}
