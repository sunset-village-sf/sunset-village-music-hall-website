'use client'

// The form an artist fills in from their private link. Two parts:
//  - About you: exact name, short bio, socials, and which photo goes on the
//    website. Sent with the button; someone approves it before it's public.
//  - Files for the show: full-size photos, a flyer if they made one, and
//    documents (rider, stage plot…). Saved as soon as they're uploaded, into
//    the venue's asset library (not public).
// The link keeps working until it expires, so they can come back.

import { useState, type FormEvent } from 'react'
import { MAX_BIO, type Artist } from '@/lib/artists'
import { ASSET_KINDS, acceptFor, formatSize, isPreviewable, type Asset, type AssetKind } from '@/lib/assets'
import { uploadAsset } from '@/lib/upload-asset'
import { Sparkle } from '@/components/brand/sparkle'
import { Field, fieldGrid } from '@/components/site/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

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

type Uploading = { name: string; percent: number }

function FileSection({
  kind,
  files,
  uploading,
  onPick,
  onRemove,
  photo,
  onChoosePhoto,
  disabled,
}: {
  kind: (typeof ASSET_KINDS)[number]
  files: Asset[]
  uploading: Uploading[]
  onPick: (kind: AssetKind, files: FileList) => void
  onRemove: (a: Asset) => void
  photo?: string
  onChoosePhoto?: (url: string) => void
  disabled: boolean
}) {
  const id = `files-${kind.value}`
  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`${id}-h`} className="text-heading-md">
          {kind.plural}
        </h3>
        <span className="text-meta text-ink-2">{kind.hint}</span>
      </div>
      {files.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {files.map((f) => {
            const chosen = kind.value === 'photo' && photo === f.url
            return (
              <li
                key={f.id}
                className={cn(
                  'flex flex-col gap-2 rounded-md border-2 bg-paper p-2',
                  chosen ? 'border-sun' : 'border-border',
                )}
              >
                {isPreviewable(f.content_type) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- their own upload, any size
                  <img src={f.url} alt="" className="aspect-square w-full rounded-sm object-cover" />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-sm bg-fog px-2 text-center text-meta break-all">
                    {f.filename}
                  </div>
                )}
                <span className="truncate text-meta" title={f.filename}>
                  {f.filename} · {formatSize(f.size)}
                </span>
                <span className="flex flex-wrap gap-1">
                  {onChoosePhoto &&
                    (chosen ? (
                      <span className="inline-flex items-center rounded-full border-2 border-ink bg-sun px-2.5 py-1 text-xs font-bold">
                        ★ On the website
                      </span>
                    ) : (
                      <Button type="button" size="sm" variant="outline" onClick={() => onChoosePhoto(f.url)}>
                        Use on the website
                      </Button>
                    ))}
                  <Button type="button" size="sm" variant="ghost" onClick={() => onRemove(f)} aria-label={`Remove ${f.filename}`}>
                    Remove
                  </Button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {uploading.map((u) => (
        <p key={u.name} className="text-meta" role="status">
          Uploading {u.name}… {u.percent}%
        </p>
      ))}
      <div>
        <label htmlFor={id} className={cn('inline-block', disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer')}>
          <Button asChild variant="outline" size="sm">
            <span>{files.length ? `Add more ${kind.plural.toLowerCase()}` : `Add ${kind.plural.toLowerCase()}`}</span>
          </Button>
        </label>
        <input
          id={id}
          type="file"
          multiple
          accept={acceptFor(kind.value)}
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files?.length) onPick(kind.value, e.target.files)
            e.target.value = ''
          }}
        />
      </div>
    </section>
  )
}

export function ArtistForm({
  token,
  initial,
  status,
  expiresAt,
  files: initialFiles,
  upload,
}: {
  token: string
  initial: Artist
  status: 'sent' | 'submitted' | 'approved'
  expiresAt: string
  files: Asset[]
  /** Where their files go; null when uploads aren't available. */
  upload: { artistId: number; eventId: string } | null
}) {
  const [a, setA] = useState<Artist>(initial)
  const [files, setFiles] = useState<Asset[]>(initialFiles)
  const [uploading, setUploading] = useState<Record<string, Uploading[]>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fileError, setFileError] = useState('')
  const [done, setDone] = useState(false)
  const set = (k: keyof Artist) => (e: { target: { value: string } }) => setA({ ...a, [k]: e.target.value })
  const anyUploading = Object.values(uploading).some((u) => u.length)

  async function pick(kind: AssetKind, list: FileList) {
    if (!upload) return
    setFileError('')
    for (const file of Array.from(list)) {
      const entry = { name: file.name, percent: 0 }
      setUploading((u) => ({ ...u, [kind]: [...(u[kind] ?? []), entry] }))
      const progress = (percent: number) =>
        setUploading((u) => ({ ...u, [kind]: (u[kind] ?? []).map((x) => (x.name === file.name ? { ...x, percent } : x)) }))
      try {
        const url = await uploadAsset(file, { kind, ...upload, token, onProgress: progress })
        const asset = await call<Asset>('file', { token, url, filename: file.name, kind })
        setFiles((f) => [...f, asset])
        // Their first photo goes on the website unless they choose another.
        if (kind === 'photo') setA((x) => (x.photo ? x : { ...x, photo: asset.url }))
      } catch (e) {
        setFileError((e as Error).message)
      } finally {
        setUploading((u) => ({ ...u, [kind]: (u[kind] ?? []).filter((x) => x.name !== file.name) }))
      }
    }
  }

  async function remove(f: Asset) {
    if (!confirm(`Remove ${f.filename}?`)) return
    try {
      await call('file-delete', { token, id: f.id })
      setFiles((all) => all.filter((x) => x.id !== f.id))
      if (a.photo === f.url) setA((x) => ({ ...x, photo: undefined }))
    } catch (e) {
      setFileError((e as Error).message)
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
          We’ll take a look and put your details on the site. Need to change something or add files? Come back to this same
          link until {until(expiresAt)}.
        </p>
        <Button variant="outline" onClick={() => setDone(false)}>
          Back to the form
        </Button>
      </div>
    )
  }

  // The photo on the website: one of their uploads, or the one we already had.
  const photos = files.filter((f) => f.kind === 'photo')
  const keptPhoto = a.photo && !photos.some((p) => p.url === a.photo) ? a.photo : null

  return (
    <form onSubmit={submit} className="flex max-w-200 flex-col gap-8 rounded-xl border-2 border-ink bg-card p-7" noValidate>
      {status !== 'sent' && (
        <p className="rounded-md bg-fog px-4 py-3 text-ui">
          {status === 'approved'
            ? 'Your details are on the site. You can still add files, or change something below and send it again for us to check.'
            : 'We have what you sent before. Change anything below and send it again.'}{' '}
          This link works until {until(expiresAt)}.
        </p>
      )}

      <section aria-labelledby="about-h" className="flex flex-col gap-5">
        <h2 id="about-h" className="text-heading-form">
          About you
        </h2>
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
        <div className={fieldGrid}>
          <Field id="a-instagram" label="Instagram">
            <Input id="a-instagram" value={a.instagram ?? ''} onChange={set('instagram')} autoCapitalize="none" spellCheck={false} placeholder="@yourname" />
          </Field>
          <Field id="a-facebook" label="Facebook">
            <Input id="a-facebook" value={a.facebook ?? ''} onChange={set('facebook')} autoCapitalize="none" spellCheck={false} placeholder="facebook.com/yourpage" />
          </Field>
          <Field id="a-website" label="Website">
            <Input id="a-website" inputMode="url" value={a.website ?? ''} onChange={set('website')} autoCapitalize="none" spellCheck={false} placeholder="yourband.com" />
          </Field>
        </div>
        {keptPhoto && (
          <div className="flex flex-wrap items-center gap-3 text-ui">
            {/* eslint-disable-next-line @next/next/no-img-element -- already on the site */}
            <img src={keptPhoto} alt="Your photo on the website now" className="size-20 rounded-sm border-2 border-ink object-cover" />
            <span>The photo on the website now. Upload new photos below and pick one to replace it.</span>
          </div>
        )}
      </section>

      <section aria-labelledby="files-h" className="flex flex-col gap-6 border-t-2 border-dashed border-ink pt-6">
        <div>
          <h2 id="files-h" className="text-heading-form">
            Files for the show
          </h2>
          <p className="text-ink-2">
            These save as soon as they upload and go straight to us (they aren’t public). Full-size photos are best. Up to 25 MB
            each.
          </p>
        </div>
        {upload ? (
          ASSET_KINDS.map((k) => (
            <FileSection
              key={k.value}
              kind={k}
              files={files.filter((f) => f.kind === k.value)}
              uploading={uploading[k.value] ?? []}
              onPick={pick}
              onRemove={remove}
              disabled={false}
              {...(k.value === 'photo' && { photo: a.photo, onChoosePhoto: (url: string) => setA({ ...a, photo: url }) })}
            />
          ))
        ) : (
          <p className="text-ink-2">Uploads aren’t available right now. Reply to our email with your files instead.</p>
        )}
        {fileError && (
          <p role="alert" className="text-ui font-semibold text-danger-text">
            {fileError}
          </p>
        )}
      </section>

      {error && (
        <p role="alert" className="text-ui font-semibold text-danger-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="sun" size="lg" disabled={busy || anyUploading}>
          {busy ? 'Sending…' : status === 'sent' ? 'Send my details' : 'Send my changes'}
        </Button>
        {anyUploading && <span className="text-meta text-ink-2">Waiting for uploads to finish…</span>}
      </div>
    </form>
  )
}
