'use client'

// The form an artist fills in from their private link: exact name, short bio,
// one photo, Instagram, Facebook, website. They can come back and change it
// until it's approved or the link expires.

import { useState, type FormEvent } from 'react'
import { MAX_BIO, type Artist } from '@/lib/artists'
import { prepareImage } from '@/lib/admin/image'
import { Sparkle } from '@/components/brand/sparkle'
import { Field, fieldGrid } from '@/components/site/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const until = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

async function call<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const r = await fetch(`/api/artist?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null)
  if (!r) throw new Error('Can’t reach the site. Check your connection and try again.')
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error ?? 'Something went wrong. Try again.')
  return data as T
}

export function ArtistForm({
  token,
  initial,
  submitted,
  expiresAt,
  uploads,
}: {
  token: string
  initial: Artist
  submitted: boolean
  expiresAt: string
  uploads: boolean
}) {
  const [a, setA] = useState<Artist>(initial)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const set = (k: keyof Artist) => (e: { target: { value: string } }) => setA({ ...a, [k]: e.target.value })

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const img = await prepareImage(file)
      const { url } = await call<{ url: string }>('upload', { token, ...img })
      setA((x) => ({ ...x, photo: url }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await call('submit', { token, ...a })
      setDone(true)
      window.scrollTo(0, 0)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div role="status" className="flex max-w-160 flex-col items-start gap-4 py-6">
        <Sparkle size={72} className="text-sun" />
        <h2 className="text-heading-2xl">Got it. Thanks!</h2>
        <p className="text-lede">
          We’ll take a look and put your details on the site. Need to change something? Come back to this same link until{' '}
          {until(expiresAt)}.
        </p>
        <Button variant="outline" onClick={() => setDone(false)}>
          Make a change
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex max-w-200 flex-col gap-5 rounded-xl border-2 border-ink bg-card p-7" noValidate>
      {submitted && (
        <p className="rounded-md bg-fog px-4 py-3 text-ui">
          We have what you sent before. Change anything below and send it again. This link works until {until(expiresAt)}.
        </p>
      )}
      <Field id="a-name" label="Your name, exactly as it should appear *">
        <Input id="a-name" required value={a.name} onChange={set('name')} autoComplete="organization" />
      </Field>
      <Field id="a-bio" label={`A short bio (${(a.bio ?? '').length}/${MAX_BIO})`}>
        <Textarea
          id="a-bio"
          rows={5}
          maxLength={MAX_BIO}
          value={a.bio ?? ''}
          onChange={set('bio')}
          placeholder="Who you are, what you play, where people might know you from. A few sentences is perfect."
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-ui font-semibold" id="a-photo-label">
          A photo
        </span>
        <div className="flex flex-wrap items-center gap-4">
          {a.photo && (
            // eslint-disable-next-line @next/next/no-img-element -- just uploaded, any size
            <img src={a.photo} alt="Your photo" className="size-28 rounded-sm border-2 border-ink object-cover" />
          )}
          {uploads ? (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="a-photo" className="cursor-pointer">
                <span className="sr-only">Photo: </span>
                <Button asChild variant="outline" size="sm" disabled={uploading}>
                  <span>{uploading ? 'Uploading…' : a.photo ? 'Use a different photo' : 'Upload a photo'}</span>
                </Button>
              </label>
              <input
                id="a-photo"
                type="file"
                accept="image/*"
                className="sr-only"
                aria-labelledby="a-photo-label"
                disabled={uploading}
                onChange={(e) => pickPhoto(e.target.files?.[0])}
              />
              {a.photo && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setA({ ...a, photo: undefined })}>
                  Remove
                </Button>
              )}
            </div>
          ) : (
            <p className="text-ink-2">Photo uploads aren’t available right now. Reply to our email with one instead.</p>
          )}
        </div>
        <p className="text-meta text-ink-2">It’s shown as a square, so keep the faces near the middle.</p>
      </div>

      <div className={fieldGrid}>
        <Field id="a-instagram" label="Instagram">
          <Input
            id="a-instagram"
            value={a.instagram ?? ''}
            onChange={set('instagram')}
            autoCapitalize="none"
            spellCheck={false}
            placeholder="@yourname"
          />
        </Field>
        <Field id="a-facebook" label="Facebook">
          <Input
            id="a-facebook"
            value={a.facebook ?? ''}
            onChange={set('facebook')}
            autoCapitalize="none"
            spellCheck={false}
            placeholder="facebook.com/yourpage"
          />
        </Field>
        <Field id="a-website" label="Website">
          <Input
            id="a-website"
            inputMode="url"
            value={a.website ?? ''}
            onChange={set('website')}
            autoCapitalize="none"
            spellCheck={false}
            placeholder="yourband.com"
          />
        </Field>
      </div>

      {error && (
        <p role="alert" className="text-ui font-semibold text-danger-text">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" variant="sun" size="lg" disabled={busy || uploading}>
          {busy ? 'Sending…' : submitted ? 'Send my changes' : 'Send my details'}
        </Button>
      </div>
    </form>
  )
}
