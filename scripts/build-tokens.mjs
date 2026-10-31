// Turns design/tokens.json (copied from the Shortlist design system) into
// CSS variables. Run with `npm run tokens`; the build runs it too.
// Never edit src/renderer/src/styles/tokens.css by hand.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tokens = JSON.parse(readFileSync(join(root, 'design', 'tokens.json'), 'utf8'))
const out = join(root, 'src', 'renderer', 'src', 'styles', 'tokens.css')

const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/
const SAFE_VALUE = /^[A-Za-z0-9 #%(),./+_"'-]+$/

function cssValue(value) {
  const alias = /^\{([A-Za-z0-9_.-]+)\}$/.exec(value)
  if (alias) return `var(--${alias[1]})`
  if (!SAFE_VALUE.test(value)) throw new Error(`Unsafe token value: ${value}`)
  return value
}

function check(name) {
  if (!NAME.test(name)) throw new Error(`Bad token name: ${name}`)
  return name
}

const themes = tokens.color.themes.map((t) => t.id)
const themed = [...tokens.color.tokens, ...(tokens.shadow?.tokens ?? [])]

function valueFor(token, theme) {
  if (typeof token.value === 'string') return token.value
  return token.value[theme] ?? token.value[themes[0]]
}

const lines = [
  '/* Generated from design/tokens.json by scripts/build-tokens.mjs. Do not edit. */',
  ''
]

themes.forEach((theme, i) => {
  const selector = i === 0 ? `:root, [data-theme="${theme}"]` : `[data-theme="${theme}"]`
  lines.push(`${selector} {`)
  lines.push(`  color-scheme: ${theme === 'midnight' ? 'dark' : 'light'};`)
  for (const t of themed) lines.push(`  --${check(t.name)}: ${cssValue(valueFor(t, theme))};`)
  lines.push('}', '')
})

lines.push(':root {')
for (const family of ['spacing', 'radius']) {
  for (const t of tokens[family]?.tokens ?? []) lines.push(`  --${check(t.name)}: ${cssValue(String(t.value))};`)
}
for (const [key, stack] of Object.entries(tokens.type.families)) {
  lines.push(`  --font-${check(key)}: ${cssValue(stack)};`)
}
lines.push('}', '')

for (const group of tokens.type.groups) {
  for (const s of group.styles) {
    const family = s.family ?? group.family
    lines.push(`.t-${check(s.name)} {`)
    lines.push(`  font-family: var(--font-${family});`)
    lines.push(`  font-size: ${cssValue(String(s.fontSize))};`)
    if (s.lineHeight) lines.push(`  line-height: ${cssValue(String(s.lineHeight))};`)
    if (s.fontWeight) lines.push(`  font-weight: ${cssValue(String(s.fontWeight))};`)
    if (s.letterSpacing) lines.push(`  letter-spacing: ${cssValue(String(s.letterSpacing))};`)
    if (s.name === 'label') lines.push('  text-transform: uppercase;')
    lines.push('}', '')
  }
}

writeFileSync(out, lines.join('\n'))
console.log(`tokens.css written (${themes.length} themes, ${themed.length} colour and shadow tokens)`)
