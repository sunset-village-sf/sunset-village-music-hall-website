'use client'

// A text box with a small toolbar for newsletter notes. The buttons write the
// markup from lib/note-markup.ts (**bold**, *italic*, [link](url), - lists,
// ![caption](image)); the live email preview beside it shows the result.
// Edits go through execCommand('insertText') so Cmd/Ctrl+Z still works.

import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { Bold, ImagePlus, Italic, Link, List } from 'lucide-react'
import { postJson } from '@/lib/admin/api'
import { prepareImage } from '@/lib/admin/image'
import { ErrorNote } from '@/components/internal/internal-ui'
import { Button, buttonVariants } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type Edit = {
  from: number
  to: number
  text: string
  select: [number, number]
}

export function NoteEditor({
  id,
  value,
  onChange,
  uploads,
  rows = 8,
  required,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  /** Image storage is set up. */
  uploads: boolean
  rows?: number
  required?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileId = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  /** Replace from–to with text, then select a range (offsets relative to `from`). */
  function apply({ from, to, text, select }: Edit) {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(from, to)
    // Keeps the browser's undo history; falls back to a plain value change,
    // where the selection has to wait for React to write the new value.
    if (document.execCommand('insertText', false, text)) {
      el.setSelectionRange(from + select[0], from + select[1])
    } else {
      onChange(el.value.slice(0, from) + text + el.value.slice(to))
      requestAnimationFrame(() => el.setSelectionRange(from + select[0], from + select[1]))
    }
  }

  const selection = () => {
    const el = ref.current!
    return {
      from: el.selectionStart,
      to: el.selectionEnd,
      sel: el.value.slice(el.selectionStart, el.selectionEnd),
    }
  }

  function wrap(mark: string, placeholder: string) {
    const { from, to, sel } = selection()
    const inner = sel || placeholder
    // Already wrapped: unwrap.
    if (
      sel.length > mark.length * 2 &&
      sel.startsWith(mark) &&
      sel.endsWith(mark) &&
      !(mark === '*' && sel.startsWith('**'))
    ) {
      const bare = sel.slice(mark.length, -mark.length)
      return apply({ from, to, text: bare, select: [0, bare.length] })
    }
    apply({
      from,
      to,
      text: `${mark}${inner}${mark}`,
      select: [mark.length, mark.length + inner.length],
    })
  }

  function link() {
    const { from, to, sel } = selection()
    if (/^https?:\/\/\S+$/.test(sel)) {
      return apply({ from, to, text: `[link text](${sel})`, select: [1, 10] })
    }
    const label = sel || 'link text'
    const text = `[${label}](https://)`
    // Selected text becomes the label; put the cursor where the address goes.
    apply({
      from,
      to,
      text,
      select: sel ? [label.length + 3, label.length + 11] : [1, label.length + 1],
    })
  }

  function list() {
    const el = ref.current!
    const from = el.value.lastIndexOf('\n', el.selectionStart - 1) + 1
    const nl = el.value.indexOf('\n', Math.max(el.selectionEnd, from))
    const to = nl === -1 ? el.value.length : nl
    const lines = el.value.slice(from, to).split('\n')
    const on = lines.every((l) => /^-\s/.test(l))
    const text = lines.map((l) => (on ? l.replace(/^-\s+/, '') : `- ${l}`)).join('\n')
    apply({ from, to, text, select: [text.length, text.length] })
  }

  async function addImage(file: File | undefined) {
    const el = ref.current
    if (!file || !el) return
    const at = el.selectionEnd
    setBusy(true)
    setError('')
    try {
      const img = await prepareImage(file, { forEmail: true })
      const { url } = await postJson<{ url: string }>('upload', {
        ...img,
        name: 'newsletter',
        folder: 'newsletter',
      })
      // On its own lines, with blank lines around it.
      const before = el.value.slice(0, at)
      const after = el.value.slice(at)
      const lead = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
      const tail = !after ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
      const text = `${lead}![](${url})${tail}`
      // Cursor between the brackets, ready for a caption.
      apply({
        from: at,
        to: at,
        text,
        select: [lead.length + 2, lead.length + 2],
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
    const k = e.key.toLowerCase()
    if (k === 'b') wrap('**', 'bold text')
    else if (k === 'i') wrap('*', 'italic text')
    else if (k === 'k') link()
    else return
    e.preventDefault()
  }

  const tool = 'h-8 gap-1.5 px-2.5'
  return (
    <div className="flex flex-col gap-1.5">
      <div role="toolbar" aria-label="Formatting" aria-controls={id} className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={tool}
          onClick={() => wrap('**', 'bold text')}
          title="Bold (⌘B)"
        >
          <Bold aria-hidden />
          <span className="sr-only">Bold</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={tool}
          onClick={() => wrap('*', 'italic text')}
          title="Italic (⌘I)"
        >
          <Italic aria-hidden />
          <span className="sr-only">Italic</span>
        </Button>
        <Button type="button" variant="ghost" size="sm" className={tool} onClick={link} title="Link (⌘K)">
          <Link aria-hidden />
          <span className="sr-only">Link</span>
        </Button>
        <Button type="button" variant="ghost" size="sm" className={tool} onClick={list} title="Bulleted list">
          <List aria-hidden />
          <span className="sr-only">Bulleted list</span>
        </Button>
        {uploads && (
          <>
            <label
              htmlFor={fileId}
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                tool,
                busy && 'pointer-events-none opacity-50',
              )}
            >
              <ImagePlus aria-hidden />
              {busy ? 'Uploading…' : 'Image'}
            </label>
            <input
              id={fileId}
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                addImage(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </>
        )}
      </div>
      <Textarea
        ref={ref}
        density="compact"
        id={id}
        rows={rows}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="font-mono"
      />
      <ErrorNote>{error}</ErrorNote>
    </div>
  )
}

export const noteHint =
  'Blank line between paragraphs. **bold**, *italic*, [link text](https://…), - for a list. Images go full width; type a caption between the [ ] if you like.'
