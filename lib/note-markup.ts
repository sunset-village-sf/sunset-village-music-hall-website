// The small markup the newsletter editor writes: enough for a human note
// with a photo or two, and nothing an email app can't show.
//
//   **bold**   *italic*   [link text](https://…)   bare https://… links
//   - bulleted lines   1. numbered lines
//   ![caption](https://…image)   on its own line: a full-width image
//
// Blank lines separate paragraphs; a single line break stays a line break.

export type Inline =
  | { t: 'text'; text: string }
  | { t: 'bold'; children: Inline[] }
  | { t: 'italic'; children: Inline[] }
  | { t: 'link'; href: string; children: Inline[] }

export type Block =
  | { t: 'p'; lines: Inline[][] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; items: Inline[][] }
  | { t: 'img'; src: string; caption: string }

const IMAGE = /^!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)$/
const BULLET = /^[-*•]\s+/
const NUMBER = /^\d+[.)]\s+/

// Earliest match wins; at the same spot, the order here decides.
const INLINE =
  /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)|(https?:\/\/[^\s<]*[^\s<.,;:!?)'"’”])|\*\*(.+?)\*\*|(?<![\w*])\*([^*\s](?:[^*]*[^*\s])?)\*(?![\w*])/

export function parseInline(text: string, links = true): Inline[] {
  const out: Inline[] = []
  let rest = text
  while (rest) {
    const m = INLINE.exec(rest)
    if (!m) break
    if (m.index) out.push({ t: 'text', text: rest.slice(0, m.index) })
    if (m[1] !== undefined) {
      out.push(links ? { t: 'link', href: m[2], children: parseInline(m[1], false) } : { t: 'text', text: m[1] })
    } else if (m[3] !== undefined) {
      out.push(links ? { t: 'link', href: m[3], children: [{ t: 'text', text: m[3] }] } : { t: 'text', text: m[3] })
    } else if (m[4] !== undefined) {
      out.push({ t: 'bold', children: parseInline(m[4], links) })
    } else {
      out.push({ t: 'italic', children: parseInline(m[5], links) })
    }
    rest = rest.slice(m.index + m[0].length)
  }
  if (rest) out.push({ t: 'text', text: rest })
  return out
}

export function parseNote(src: string): Block[] {
  const blocks: Block[] = []
  for (const chunk of src.replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/)) {
    // Runs of bullet lines, numbered lines and other lines become lists and paragraphs.
    let lines: string[] = []
    let kind: 'p' | 'ul' | 'ol' = 'p'
    const flush = () => {
      if (!lines.length) return
      if (kind === 'p') blocks.push({ t: 'p', lines: lines.map((l) => parseInline(l)) })
      else blocks.push({ t: kind, items: lines.map((l) => parseInline(l.replace(kind === 'ul' ? BULLET : NUMBER, ''))) })
      lines = []
    }
    for (const raw of chunk.split('\n')) {
      const line = raw.trim()
      if (!line) continue
      const img = IMAGE.exec(line)
      if (img) {
        flush()
        blocks.push({ t: 'img', caption: img[1].trim(), src: img[2] })
        continue
      }
      const k = BULLET.test(line) ? 'ul' : NUMBER.test(line) ? 'ol' : 'p'
      if (k !== kind) flush()
      kind = k
      lines.push(line)
    }
    flush()
  }
  return blocks
}

const inlineText = (runs: Inline[]): string =>
  runs
    .map((r) =>
      r.t === 'text'
        ? r.text
        : r.t === 'link'
          ? (() => {
              const label = inlineText(r.children)
              return label === r.href ? label : `${label} (${r.href.replace(/^mailto:/, '')})`
            })()
          : inlineText(r.children),
    )
    .join('')

/** The note as plain text, for the text part of the email and the Sent log. */
export function noteText(src: string) {
  return parseNote(src)
    .map((b) =>
      b.t === 'p'
        ? b.lines.map(inlineText).join('\n')
        : b.t === 'ul'
          ? b.items.map((i) => `- ${inlineText(i)}`).join('\n')
          : b.t === 'ol'
            ? b.items.map((i, n) => `${n + 1}. ${inlineText(i)}`).join('\n')
            : b.caption
              ? `[Photo: ${b.caption}]`
              : '[Photo]',
    )
    .join('\n\n')
}
