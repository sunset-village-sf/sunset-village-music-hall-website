'use client'

// Upload a photo (event flyer, shop storefront). Shrinks it in the browser,
// sends it to the `upload` action and hands back the public URL.

import { useId, useState } from 'react'
import { postJson } from '@/lib/admin/api'
import { prepareImage } from '@/lib/admin/image'
import { Button, buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ErrorNote } from '@/components/internal/internal-ui'
import { cn } from '@/lib/utils'

export function ImagePicker({
  label,
  noun,
  value,
  onChange,
  enabled,
  name,
  hint,
  poster,
  thumb,
  folder,
  choices = [],
}: {
  label: string
  /** "flyer", "photo" — used in the button labels. */
  noun: string
  value?: string
  onChange: (url: string | undefined) => void
  enabled: boolean
  /** Used for the stored file name. */
  name: string
  hint?: string
  /** Preview in the 4:5 poster frame the site shows flyers in. */
  poster?: boolean
  /** Small square preview (artist photos). */
  thumb?: boolean
  /** Storage folder; flyers by default. */
  folder?: 'artists' | 'newsletter'
  /** Images already in the asset library to pick from instead of uploading (best first). */
  choices?: { url: string; label: string }[]
}) {
  const id = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const img = await prepareImage(file)
      const { url } = await postJson<{ url: string }>('upload', { ...img, name: name || noun, folder })
      onChange(url)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={enabled ? id : undefined}>{label}</Label>
      {value && (
        // eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL, any host
        <img
          src={value}
          alt=""
          className={cn(
            'rounded-md border border-border',
            poster
              ? 'aspect-[4/5] w-48 bg-muted object-contain'
              : thumb
                ? 'size-24 object-cover'
                : 'max-h-64 w-fit max-w-full',
          )}
        />
      )}
      {enabled ? (
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor={id}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), busy && 'pointer-events-none opacity-50')}
          >
            {busy ? 'Uploading…' : value ? `Replace ${noun}` : `Upload a ${noun}`}
          </label>
          <input
            id={id}
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={busy}
            onChange={(e) => pick(e.target.files?.[0])}
          />
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>
              Remove {noun}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-meta text-ink-2">Image uploads aren’t set up yet.</p>
      )}
      {choices.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-meta font-semibold">Or choose from this show’s files ({choices.length})</summary>
          <ul className="mt-2 flex flex-wrap gap-2">
            {choices.map((c) => (
              <li key={c.url}>
                <button
                  type="button"
                  onClick={() => onChange(c.url)}
                  aria-pressed={value === c.url}
                  title={c.label}
                  className={cn(
                    'block rounded-sm border-2 p-0.5',
                    value === c.url ? 'border-ink' : 'border-transparent hover:border-border',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- library file */}
                  <img src={c.url} alt={c.label} className="aspect-[4/5] w-24 rounded-xs bg-muted object-cover" />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <ErrorNote>{error}</ErrorNote>
      {hint && <p className="text-meta text-ink-2">{hint}</p>}
    </div>
  )
}
