// Builds the files offered on /admin/brand (public/brand/downloads/) from the
// source SVGs, so every download matches the site. Re-run after changing a
// logo or a brand color: node scripts/brand-assets.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const tokens = JSON.parse(await readFile('lib/tokens.json', 'utf8'))
const hex = (k) => tokens.color[k].value
const out = 'public/brand/downloads'
await mkdir(out, { recursive: true })

const src = {
  'on-dark': await readFile('public/brand/wordmark-on-dark.svg', 'utf8'),
  'on-light': await readFile('public/brand/wordmark-on-light.svg', 'utf8'),
  mono: await readFile('public/brand/wordmark-mono.svg', 'utf8'),
  sparkle: await readFile('handoff/assets/ornaments/sparkle.svg', 'utf8'),
  icon: await readFile('app/icon.svg', 'utf8'),
}
const tint = (svg, color) => svg.replaceAll('currentColor', color)
const files = [
  ['wordmark-on-dark', src['on-dark'], 2400],
  ['wordmark-on-light', src['on-light'], 2400],
  ['wordmark-mono-ink', tint(src.mono, hex('ink')), 2400],
  ['wordmark-mono-white', tint(src.mono, '#FFFFFF'), 2400],
  ['wordmark-mono-black', tint(src.mono, '#000000'), 2400],
  ['sparkle-sun', tint(src.sparkle, hex('sun')), 1024],
  ['sparkle-yellow', tint(src.sparkle, hex('yellow')), 1024],
  ['sparkle-ink', tint(src.sparkle, hex('ink')), 1024],
  ['icon', src.icon, 1024],
]
for (const [name, svg, width] of files) {
  await writeFile(`${out}/${name}.svg`, svg)
  await sharp(Buffer.from(svg), { density: 600 }).resize({ width }).png().toFile(`${out}/${name}.png`)
}
console.log(`Wrote ${files.length * 2} files to ${out}`)
