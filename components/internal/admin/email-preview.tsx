'use client'

// The real email (rendered on the server) in a sandboxed frame that grows to
// fit, with the subject line above it.

import { useRef } from 'react'
import { Mono } from '@/components/internal/internal-ui'

export function EmailPreview({ html, subject, title }: { html?: string; subject?: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const fit = () => {
    const doc = frame.current?.contentDocument
    if (doc && frame.current) frame.current.style.height = `${doc.documentElement.scrollHeight}px`
  }
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="label-sm text-ink-2">Preview</span>
        {subject && <Mono className="truncate text-ink-2">{subject}</Mono>}
      </div>
      {html ? (
        <iframe
          ref={frame}
          title={title}
          srcDoc={html.replace('<head>', '<head><base target="_blank">')}
          onLoad={fit}
          sandbox="allow-same-origin allow-popups"
          className="block h-[60rem] w-full rounded-lg border border-border bg-fog"
        />
      ) : (
        <div className="h-96 rounded-lg border border-border bg-fog" aria-busy="true" />
      )}
    </div>
  )
}
