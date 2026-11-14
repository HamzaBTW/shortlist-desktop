import type { CSSProperties } from 'react'
import { useEffect, useLayoutEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { APP_NAME } from '../../../shared/app-info'
import mark from '../assets/shortlist-mark.svg'

// Launch A from the design ("Tiles assemble, then become Home"): about 1.2 s, plays once,
// any key or click skips it, and it stays only as long as startup takes.
// Reduced motion: no overlay at all, the app simply appears.

const PLAY_MS = 2400
const OUT_MS = 250
const STAGE = { w: 1440, h: 900 }

interface Tile {
  from: [number, number, number, number]
  to: [number, number, number, number]
  color: string
  delay: number
}

// Start and end rectangles in the 1440 x 900 design frame.
const TILES: Tile[] = [
  { from: [731, 248, 325, 207], to: [280, 96, 222, 150], color: 'var(--accent)', delay: 0 },
  { from: [1067, 248, 157, 207], to: [510, 96, 222, 150], color: 'var(--ink)', delay: 40 },
  { from: [1235, 248, 182, 207], to: [741, 96, 222, 150], color: 'var(--success)', delay: 80 },
  { from: [899, 467, 157, 90], to: [971, 96, 222, 150], color: 'var(--danger)', delay: 120 },
  { from: [1067, 568, 157, 90], to: [1202, 96, 222, 150], color: 'var(--accent)', delay: 160 }
]
const GHOSTS: [number, number, number, number][] = [
  [731, 467, 157, 90],
  [1067, 467, 350, 90],
  [731, 568, 325, 90],
  [1235, 568, 182, 90]
]

const rect = ([x, y, w, h]: number[], suffix: string): Record<string, string> => ({
  [`--x${suffix}`]: `${x}px`,
  [`--y${suffix}`]: `${y}px`,
  [`--w${suffix}`]: `${w}px`,
  [`--h${suffix}`]: `${h}px`
})

interface Measured {
  /** The real board columns on Home, in window pixels. */
  cols: [number, number, number, number][]
  /** Where the sidebar's app name sits: its text box and size, in window pixels. */
  brand: { x: number; y: number; size: number } | null
}

/** Reads where Home really puts things, so the tiles land on them instead of on a drawing. */
function measure(): Measured {
  const cols = [...document.querySelectorAll<HTMLElement>('.board__col')].map((el) => {
    const r = el.getBoundingClientRect()
    return [r.left, r.top, r.width, r.height] as [number, number, number, number]
  })
  const el = document.querySelector<HTMLElement>('.sl-brand')
  if (!el) return { cols, brand: null }
  const r = el.getBoundingClientRect()
  const css = getComputedStyle(el)
  const size = parseFloat(css.fontSize)
  const line = parseFloat(css.lineHeight) || size
  return {
    cols,
    brand: { x: r.left + parseFloat(css.paddingLeft), y: r.top + parseFloat(css.paddingTop) + (line - size) / 2, size }
  }
}

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function useStageScale(): number {
  const [scale, setScale] = useState(() => Math.min(window.innerWidth / STAGE.w, window.innerHeight / STAGE.h))
  useEffect(() => {
    const on = (): void => setScale(Math.min(window.innerWidth / STAGE.w, window.innerHeight / STAGE.h))
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return scale
}

export function Launch({ ready }: { ready: boolean }) {
  const { t } = useTranslation()
  const [skip] = useState(reducedMotion)
  const [played, setPlayed] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [gone, setGone] = useState(false)
  const scale = useStageScale()
  const [seen, setSeen] = useState<Measured>({ cols: [], brand: null })
  useLayoutEffect(() => setSeen(measure()), [])
  const leaving = ready && (played || skipped)

  useEffect(() => {
    if (skip) return
    const timer = window.setTimeout(() => setPlayed(true), PLAY_MS)
    const on = (): void => setSkipped(true)
    window.addEventListener('keydown', on)
    window.addEventListener('pointerdown', on)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', on)
      window.removeEventListener('pointerdown', on)
    }
  }, [skip])

  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(() => setGone(true), OUT_MS)
    return () => window.clearTimeout(timer)
  }, [leaving])

  if (skip || gone) return null

  // Window pixels -> design-frame pixels (the stage is centred and scaled to fit).
  const ox = (window.innerWidth - STAGE.w * scale) / 2
  const oy = (window.innerHeight - STAGE.h * scale) / 2
  const toX = (px: number): number => (px - ox) / scale
  const toY = (px: number): number => (px - oy) / scale
  const stage = { transform: `translate(-50%, -50%) scale(${scale})` } as Record<string, string>
  if (seen.brand) {
    stage['--wx1'] = `${toX(seen.brand.x)}px`
    stage['--wy1'] = `${toY(seen.brand.y)}px`
    stage['--wf1'] = `${seen.brand.size / scale}px`
  }
  stage['--r1'] = `${20 / scale}px`
  // Tile i settles onto board column i when Home has them; otherwise onto the drawn strip.
  const end = (i: number, fallback: Tile['to']): Tile['to'] => {
    const c = seen.cols[i]
    return c ? [toX(c[0]), toY(c[1]), c[2] / scale, c[3] / scale] : fallback
  }

  return (
    <div className={`launch${leaving ? ' launch--out' : ''}`} aria-hidden="true">
      <div className="launch__stage" style={stage as CSSProperties}>
        {GHOSTS.map((g, i) => (
          <div key={i} className="launch__ghost" style={rect(g, '0') as CSSProperties} />
        ))}
        {TILES.map((tile, i) => (
          <div
            key={i}
            className="launch__tile"
            style={{ ...rect(tile.from, '0'), ...rect(end(i, tile.to), '1'), '--c': tile.color, animationDelay: `${tile.delay}ms` } as CSSProperties}
          >
            {i === 0 && (
              <svg className="launch__ring" width="90" height="90" viewBox="0 0 90 90">
                <circle cx="45" cy="45" r="39" fill="none" stroke="var(--on-accent)" strokeOpacity=".25" strokeWidth="11" />
                <circle className="launch__arc" cx="45" cy="45" r="39" fill="none" stroke="var(--on-accent)" strokeWidth="11" strokeLinecap="round" strokeDasharray="184 245" />
              </svg>
            )}
          </div>
        ))}
        <div className="launch__bar">
          <i />
        </div>
        <div className="launch__word">
          <img src={mark} alt="" />
          {APP_NAME}
        </div>
        <div className="launch__tag">{t('launch.tagline')}</div>
      </div>
    </div>
  )
}
