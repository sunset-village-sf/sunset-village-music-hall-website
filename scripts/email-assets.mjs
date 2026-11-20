// Small PNGs for the Village Voice email (public/brand/email/). Email apps
// can't show SVG or CSS masks, so the wordmark, sparkles, the wave under the
// header and the ticket-stub notches are pre-drawn at 2× from the same
// sources as the site. Re-run after changing a logo or a brand color:
//   node scripts/email-assets.mjs
import { mkdir, readFile } from 'node:fs/promises'
import sharp from 'sharp'

const tokens = JSON.parse(await readFile('lib/tokens.json', 'utf8'))
const hex = (k) => tokens.color[k].value
const out = 'public/brand/email'
await mkdir(out, { recursive: true })

const sparkle = await readFile('handoff/assets/ornaments/sparkle.svg', 'utf8')
const tint = (svg, color) => svg.replaceAll('currentColor', color)

// Same path as components/brand/wave-divider.tsx, ink wave over fog.
const wavePath = 'M0 0 H1440 V14 q-45 26 -90 0 ' + 't-90 0 '.repeat(15) + 'Z'
const wave = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 40" width="1440" height="40" preserveAspectRatio="none">
<rect width="1440" height="40" fill="${hex('fog')}"/><path d="${wavePath}" fill="${hex('ink')}"/></svg>`

// Ticket-stub notch: the stub's fill with a paper half-circle bitten out,
// matching the 9px radial mask of the .ticket-stub utility (drawn at 2×).
const notch = (fill, side) => `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="36" viewBox="0 0 18 36">
<rect width="18" height="36" fill="${fill}"/><circle cx="${side === 'l' ? 0 : 18}" cy="18" r="18" fill="${hex('paper')}"/></svg>`

const files = [
  ['wordmark-on-dark', await readFile('public/brand/wordmark-on-dark.svg', 'utf8'), { width: 440 }],
  ['sparkle-yellow', tint(sparkle, hex('yellow')), { width: 48 }],
  ['sparkle-sun', tint(sparkle, hex('sun')), { width: 48 }],
  ['sparkle-ink', tint(sparkle, hex('ink')), { width: 48 }],
  ['wave', wave, { width: 1200, height: 34, fit: 'fill' }],
]
for (const [cat, color] of Object.entries(tokens.category)) {
  for (const side of ['l', 'r']) files.push([`notch-${cat}-${side}`, notch(hex(color), side), { width: 18 }])
}

for (const [name, svg, size] of files) {
  await sharp(Buffer.from(svg), { density: 300 }).resize(size).png({ compressionLevel: 9 }).toFile(`${out}/${name}.png`)
}
console.log(`Wrote ${files.length} files to ${out}`)
