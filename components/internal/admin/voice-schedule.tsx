'use client'

// The automatic Village Voice: every other Monday at 6am Pacific, covering the
// next two weeks. The team gets a preview the Sunday before. Here: turn it
// on or off, skip the next issue, write a note for it, and see it.

import { useEffect, useState } from 'react'
import { getJson, postJson } from '@/lib/admin/api'
import { useLoad } from '@/lib/admin/use-load'
import { useAdmin } from '@/components/internal/admin-shell'
import { ErrorNote, FormField, Panel } from '@/components/internal/internal-ui'
import { EmailPreview } from '@/components/internal/admin/email-preview'
import { NoteEditor, noteHint } from '@/components/internal/admin/note-editor'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

interface VoiceState {
  auto: boolean
  next: string
  end: string
  skipped: boolean
  note: string
  previewSent: boolean
}

const nice = (iso: string, weekday = true) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    ...(weekday && { weekday: 'long' }),
    month: 'long',
    day: 'numeric',
  })

export function VoiceSchedule() {
  const { me, signedOut } = useAdmin()
  const { data, error, reload } = useLoad(() => getJson<VoiceState>('voice-schedule'), signedOut)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState<{ html: string; defaultSubject: string; shows: number } | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const draft = note ?? data?.note ?? ''
  const noteChanged = data && note !== null && note !== data.note

  useEffect(() => {
    if (!showPreview || !data) return
    let live = true
    const t = setTimeout(() => {
      postJson<{ html: string; defaultSubject: string; shows: number }>('voice-preview', {
        start: data.next,
        days: 14,
        note: draft,
      })
        .then((p) => live && setPreview(p))
        .catch((e) => live && setErr((e as Error).message))
    }, 350)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [showPreview, data, draft])

  async function save(patch: Record<string, unknown>, done: string) {
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      await postJson('voice-schedule', patch)
      setMsg(done)
      if ('note' in patch) setNote(null)
      reload()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <ErrorNote>{error}</ErrorNote>
  const when = `${nice(data.next)} at 6am`

  return (
    <Panel title="Automatic Village Voice">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Switch
            id="voice-auto"
            checked={data.auto}
            disabled={busy}
            onCheckedChange={(on) =>
              save({ auto: on }, on ? 'The Village Voice will go out automatically again.' : 'Automatic sending is off.')
            }
          />
          <Label htmlFor="voice-auto" className="font-normal">
            Send it automatically every other Monday at 6am (Pacific), covering the next two weeks
          </Label>
        </div>

        {data.auto ? (
          <p>
            {data.skipped ? (
              <>
                <b>The {nice(data.next, false)} issue is skipped.</b> The next one after that is two weeks later.
              </>
            ) : (
              <>
                <b>Next issue: {when}</b>, covering {nice(data.next, false)} to {nice(data.end, false)}. The team gets a
                preview the day before
                {data.previewSent ? ' (it’s been sent)' : ''}. Issues with no shows are skipped.
              </>
            )}
          </p>
        ) : (
          <p className="text-ink-2">Off. Send issues by hand below.</p>
        )}

        {data.auto && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                save(
                  { skip: !data.skipped },
                  data.skipped ? `The ${nice(data.next, false)} issue will go out.` : `Skipped the ${nice(data.next, false)} issue.`,
                )
              }
            >
              {data.skipped ? 'Don’t skip it' : `Skip the ${nice(data.next, false)} issue`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowPreview(!showPreview)} aria-expanded={showPreview}>
              {showPreview ? 'Hide preview' : 'Preview it'}
            </Button>
          </div>
        )}

        {data.auto && !data.skipped && (
          <FormField
            label={`Note for the ${nice(data.next, false)} issue (optional)`}
            htmlFor="voice-auto-note"
            hint={`Shown in a card above the shows. Cleared after it goes out. ${noteHint}`}
          >
            <NoteEditor id="voice-auto-note" value={draft} onChange={setNote} uploads={me.uploads} rows={5} />
          </FormField>
        )}
        {noteChanged && (
          <div>
            <Button size="sm" disabled={busy} onClick={() => save({ note: draft }, 'Saved the note.')}>
              Save note
            </Button>
          </div>
        )}

        {msg && (
          <Alert variant="info" className="font-normal">
            {msg}
          </Alert>
        )}
        <ErrorNote>{err}</ErrorNote>
        {showPreview && preview && (
          <EmailPreview
            title="Next automatic issue"
            html={preview.html}
            subject={preview.shows ? preview.defaultSubject : 'No shows in these two weeks: this issue will be skipped'}
          />
        )}
      </div>
    </Panel>
  )
}
