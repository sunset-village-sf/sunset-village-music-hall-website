// Artist records: one per artist, shared by every event they play. Each entry
// in an event's lineup keeps its own copy of the artist's details (so pages,
// the calendar and emails read the event alone) plus the record's id, which
// is what ties their files, artist links and details together across shows
// and through renames.

import 'server-only'
import { query } from './db'
import type { Artist } from '@/lib/artists'

const FIELDS = ['name', 'instagram', 'facebook', 'website', 'bio', 'photo'] as const
type Field = (typeof FIELDS)[number]

export interface ArtistRecord extends Omit<Artist, 'headliner'> {
  id: number
}

/** Every artist, most recently updated first (for name suggestions in the admin). */
export const listArtists = () =>
  query<ArtistRecord>(
    `select id, name, instagram, facebook, website, bio, photo from artists order by updated_at desc limit 2000`,
  ).then((rows) =>
    rows.map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null)) as ArtistRecord),
  )

const blank = (v: unknown) => v === undefined || v === null || v === ''

/** Set some of a record's fields (only those given). */
export async function updateArtist(id: number, fields: Partial<Record<Field, string | null>>, by: string) {
  const keys = FIELDS.filter((f) => f in fields)
  if (!keys.length) return
  await query(
    `update artists set ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now(), updated_by = $${keys.length + 2}
     where id = $1`,
    [id, ...keys.map((k) => (blank(fields[k]) ? (k === 'name' ? undefined : null) : fields[k])), by],
  )
}

/**
 * Give each lineup entry an artist record, and keep records up to date with
 * what was changed in this save.
 *
 * - An entry with a record id: fields that differ from `before` (the lineup
 *   the form started from) are copied to the record. Comparing with `before`
 *   matters: an old event saved for some other reason mustn't overwrite the
 *   artist's newer details with its stale copy. With no `before` (a new or
 *   duplicated event), records aren't changed.
 * - An entry without one: matched to an existing record by name (filling in
 *   any of its empty fields), or a new record is made.
 */
export async function linkArtists(lineup: Artist[], before: Artist[] | null, by: string): Promise<Artist[]> {
  const ids = lineup.map((a) => a.id).filter((id): id is number => Number.isInteger(id))
  const known = new Set(
    ids.length ? (await query<{ id: number }>(`select id from artists where id = any($1::int[])`, [ids])).map((r) => r.id) : [],
  )
  const out: Artist[] = []
  for (const a of lineup) {
    if (a.id && known.has(a.id)) {
      const was = before?.find((x) => x.id === a.id)
      if (was) {
        const changed = Object.fromEntries(
          FIELDS.filter((f) => (a[f] ?? '') !== (was[f] ?? '')).map((f) => [f, a[f] ?? null]),
        )
        await updateArtist(a.id, changed, by)
      }
      out.push(a)
      continue
    }
    const { id: _stale, ...entry } = a
    const [match] = await query<ArtistRecord>(
      `select * from artists where lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) = lower(regexp_replace(trim($1), '\\s+', ' ', 'g'))
       order by updated_at desc limit 1`,
      [entry.name],
    )
    if (match) {
      const fill = Object.fromEntries(
        FIELDS.filter((f) => f !== 'name' && blank(match[f]) && !blank(entry[f])).map((f) => [f, entry[f]!]),
      )
      await updateArtist(match.id, fill, by)
      out.push({ ...entry, id: match.id })
    } else {
      const [row] = await query<{ id: number }>(
        `insert into artists (name, instagram, facebook, website, bio, photo, updated_by) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [entry.name, entry.instagram ?? null, entry.facebook ?? null, entry.website ?? null, entry.bio ?? null, entry.photo ?? null, by],
      )
      out.push({ ...entry, id: row.id })
    }
  }
  return out
}

/** The lineup entry an artist link is for: by record id, else by name (links sent before records existed). */
export function lineupIndex(lineup: Artist[] = [], link: { artist_id?: number | null; artist_name: string }) {
  if (link.artist_id) {
    const i = lineup.findIndex((a) => a.id === link.artist_id)
    if (i >= 0) return i
  }
  const name = link.artist_name.trim().toLowerCase()
  return lineup.findIndex((a) => a.name.trim().toLowerCase() === name)
}
