import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

const reduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** True once `active` has stayed true for `ms`. Used to show a skeleton only when data is slow. */
export function useDelayed(active: boolean, ms: number): boolean {
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (!active) {
      setLate(false)
      return
    }
    const timer = window.setTimeout(() => setLate(true), ms)
    return () => window.clearTimeout(timer)
  }, [active, ms])
  return late
}

/**
 * Board cards that change place: lift 150 ms, travel 250 ms, settle 150 ms (design: Motion 03).
 * Cards are found by `data-flip`. The first render and reduced motion do nothing.
 */
export function useBoardFlip(board: RefObject<HTMLElement | null>): void {
  const last = useRef(new Map<string, { x: number; y: number }>())

  useLayoutEffect(() => {
    const root = board.current
    if (!root) return
    const base = root.getBoundingClientRect()
    const next = new Map<string, { x: number; y: number }>()
    const skip = reduced()
    root.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
      const key = el.dataset.flip as string
      const r = el.getBoundingClientRect()
      const at = { x: r.left - base.left + root.scrollLeft, y: r.top - base.top }
      next.set(key, at)
      const from = last.current.get(key)
      if (skip || !from) return
      const dx = from.x - at.x
      const dy = from.y - at.y
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
      const lift = 'var(--shadow-pop)'
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(1)`, boxShadow: 'none', offset: 0 },
          { transform: `translate(${dx}px, ${dy - 6}px) scale(1.03)`, boxShadow: lift, offset: 0.27 },
          { transform: 'translate(0, -6px) scale(1.03)', boxShadow: lift, offset: 0.73 },
          { transform: 'translate(0, 0) scale(1)', boxShadow: 'none', offset: 1 }
        ],
        { duration: 550, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' }
      )
    })
    last.current = next
  })
}
