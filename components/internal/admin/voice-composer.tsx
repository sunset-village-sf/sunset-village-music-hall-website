'use client'

// The weekly Village Voice: pick the week, add an optional note, look at the
// real email (built on the server from the calendar), send a test, send it.

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { postJson } from '@/lib/admin/api'
import { todayISO } from '@/lib/events'
import { ErrorNote, FormField, Mono, Panel } from '@/components/internal/internal-ui'
import { ConfirmDialog } from '@/components/internal/admin/confirm-dialog'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface Preview {
  start: string
  end: string
  shows: number
  defaultSubject: string
  html: string
}

const NOTE_KEY = 'sv-admin-voice-note'
const remembered = () => {
  try {
    return localStorage.getItem(NOTE_KEY) ?? ''
  } catch {
    return ''
  }
}

/** The coming Monday, or today when it's Monday (the issue goes out Sunday or Monday). */
function nextMonday() {
  const today = todayISO()
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7))
  return d.toISOString().slice(0, 10)
}

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`
const shows = (n: number) => (n === 0 ? 'No shows' : `${n} ${n === 1 ? 'show' : 'shows'}`)

export function VoiceComposer({ active, onSent }: { active: number; onSent: () => void }) {
  const [start, setStart] = useState(nextMonday)
  const [note, setNoteState] = useState(remembered)
  const [subject, setSubject] = useState('')
  const [testTo, setTestTo] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState<'' | 'test' | 'send'>('')
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [confirming, setConfirming] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)

  const setNote = (v: string) => {
    setNoteState(v)
    try {
      localStorage.setItem(NOTE_KEY, v)
    } catch {
      /* not remembered */
    }
  }

  // Rebuild the preview shortly after the week or note changes.
  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      postJson<Preview>('voice-preview', { start, note })
        .then((p) => live && (setPreview(p), setError('')))
        .catch((e) => live && setError((e as Error).message))
    }, 350)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [start, note])

  const fit = () => {
    const doc = frame.current?.contentDocument
    if (doc && frame.current) frame.current.style.height = `${doc.documentElement.scrollHeight}px`
  }

  async function send(test: boolean) {
    setError('')
    setDone('')
    setBusy(test ? 'test' : 'send')
    try {
      const r = await postJson<{ sent: number; total?: number }>('voice-send', { start, note, subject, test, testTo })
      if (test) setDone('Test sent. Check your inbox to see how it looks.')
      else {
        setDone(
          r.total && r.sent < r.total ? `Sent to ${r.sent} of ${r.total}. Some didn’t go through.` : `Sent to ${people(r.sent)}.`,
        )
        setNote('')
        setSubject('')
        onSent()
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  const finalSubject = subject.trim() || preview?.defaultSubject || ''

  return (
    <Panel title="This week’s Village Voice">
      <p className="mb-4 text-ink-2">
        Built from the calendar: every show on the website that week, then the next few after it. Edit events to change
        what’s in it.
      </p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            setDone('')
            setConfirming(true)
          }}
          className="flex flex-col gap-4"
        >
          <FormField
            label="Week starting"
            htmlFor="voice-start"
            hint={preview ? `${shows(preview.shows)} from ${preview.start} to ${preview.end}.` : undefined}
          >
            <Input
              density="compact"
              id="voice-start"
              type="date"
              required
              value={start}
              onChange={(e) => e.target.value && setStart(e.target.value)}
            />
          </FormField>
          <FormField label="Subject" htmlFor="voice-subject" hint="Leave blank to use the one shown.">
            <Input
              density="compact"
              id="voice-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={preview?.defaultSubject}
            />
          </FormField>
          <FormField
            label="Note at the top (optional)"
            htmlFor="voice-note"
            hint="A welcome, a heads-up, a shout-out. Leave a blank line between paragraphs. Blank uses the standard line."
          >
            <Textarea
              density="compact"
              id="voice-note"
              rows={5}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </FormField>
          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
            <FormField label="Send a test to yourself first" htmlFor="voice-test" className="min-w-48 flex-1">
              <Input
                density="compact"
                id="voice-test"
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="your@email.com"
              />
            </FormField>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mb-0.5"
              disabled={!!busy || !preview}
              onClick={() => send(true)}
            >
              {busy === 'test' ? 'Sending test…' : 'Send test'}
            </Button>
          </div>
          <ErrorNote>{error}</ErrorNote>
          {done && (
            <Alert variant="info" className="font-normal">
              {done}
            </Alert>
          )}
          <div>
            <Button type="submit" variant="sun" size="sm" disabled={!!busy || !preview || active === 0}>
              {busy === 'send' ? 'Sending…' : `Send to ${active} ${active === 1 ? 'subscriber' : 'subscribers'}`}
            </Button>
          </div>
        </form>

        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <span className="label-sm text-ink-2">Preview</span>
            {finalSubject && <Mono className="truncate text-ink-2">{finalSubject}</Mono>}
          </div>
          {preview ? (
            <iframe
              ref={frame}
              title="Village Voice preview"
              srcDoc={preview.html.replace('<head>', '<head><base target="_blank">')}
              onLoad={fit}
              sandbox="allow-same-origin allow-popups"
              className="block h-[60rem] w-full rounded-lg border border-border bg-fog"
            />
          ) : (
            <div className="h-96 rounded-lg border border-border bg-fog" aria-busy="true" />
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Send this week’s Village Voice?"
        description={`“${finalSubject}” goes to ${people(active)} now. This can’t be undone.`}
        confirmLabel="Send now"
        variant="sun"
        onConfirm={() => send(false)}
      />
    </Panel>
  )
}
