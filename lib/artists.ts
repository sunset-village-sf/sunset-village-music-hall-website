// The lineup of an event: who's playing and where to find them online.
// Shared by the admin form (to tidy what people paste) and the API (to check it).

export interface Artist {
  name: string
  /** Instagram username, lowercase, no @. Used to invite the artist to collaborate on posts. */
  instagram?: string
  /** Full Facebook page or profile URL. */
  facebook?: string
  /** Their own website, as a full https:// (or http://) URL. */
  website?: string
  /** At most one per event. */
  headliner?: boolean
  /** A few sentences about them, shown in the event page's lineup. */
  bio?: string
  /** One photo, uploaded to the site's image storage. */
  photo?: string
}

export const MAX_ARTISTS = 20
export const MAX_BIO = 600

/** An image uploaded through this site (Vercel Blob), not a link to anywhere else. */
export const isUploadedImage = (url: string) => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname.endsWith('.public.blob.vercel-storage.com')
  } catch {
    return false
  }
}

const stripHost = (s: string) => s.trim().replace(/^https?:\/\//i, '').replace(/^(www|m|web)\./i, '')

/**
 * "@lowtide", "lowtide", "instagram.com/lowtide" or "https://www.instagram.com/lowtide/?hl=en"
 * → "lowtide". Null if it isn't a username.
 */
export function instagramHandle(input: string): string | null {
  let s = stripHost(input)
  if (/^(instagram\.com|instagr\.am)(\/|$)/i.test(s)) s = s.split('/')[1] ?? ''
  else if (/^[^/]+\.[^/]+\//.test(s)) return null // a link to some other site
  s = s.replace(/^@/, '').split(/[/?#]/)[0]
  return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s.toLowerCase() : null
}

/**
 * "lowtidechoir", "facebook.com/lowtidechoir" or a profile.php?id=… link
 * → "https://www.facebook.com/…". Null if it isn't a Facebook page.
 */
export function facebookUrl(input: string): string | null {
  const s = stripHost(input)
  let path: string
  if (/^(facebook\.com|fb\.com)(\/|$)/i.test(s)) path = s.includes('/') ? s.slice(s.indexOf('/') + 1) : ''
  else if (/^[^/]+\.[^/]+\//.test(s)) return null // a link to some other site
  else path = s.replace(/^@/, '')
  const id = path.match(/^profile\.php\?(?:.*&)?id=(\d+)/i)
  if (id) return `https://www.facebook.com/profile.php?id=${id[1]}`
  path = path.split(/[?#]/)[0].replace(/\/+$/, '')
  if (!path || path.length > 200 || !/^[\w.-]+(\/[\w.%-]+)*$/.test(path)) return null
  return `https://www.facebook.com/${path}`
}

export const instagramUrl = (handle: string) => `https://www.instagram.com/${handle}/`

/**
 * "lowtidechoir.com", "www.lowtidechoir.com/" or "https://lowtidechoir.bandcamp.com"
 * → a full URL. Null if it isn't a web address, or if it's Instagram or Facebook
 * (those have their own fields).
 */
export function websiteUrl(input: string): string | null {
  const s = input.trim()
  if (!s || /\s/.test(s) || s.length > 300) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password || !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(url.hostname)) return null
  if (/(^|\.)(instagram\.com|instagr\.am|facebook\.com|fb\.com)$/i.test(url.hostname)) return null
  const href = url.toString()
  return url.pathname === '/' && !url.search && !url.hash ? href.slice(0, -1) : href
}

/** "https://www.lowtidechoir.com/music" → "lowtidechoir.com", for link text. */
export const websiteLabel = (url: string) => new URL(url).hostname.replace(/^www\./i, '')
