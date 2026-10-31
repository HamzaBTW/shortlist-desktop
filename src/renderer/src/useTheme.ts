import { useEffect } from 'react'
import type { ThemeChoice } from '../../shared/ipc'

const DARK = '(prefers-color-scheme: dark)'

/** Sets data-theme on <html>: Midnight, Light-relax, or whichever matches the system. */
export function useTheme(choice: ThemeChoice | undefined): void {
  useEffect(() => {
    const media = window.matchMedia(DARK)
    const apply = (): void => {
      const theme = choice === 'system' || !choice ? (media.matches ? 'midnight' : 'light-relax') : choice
      document.documentElement.dataset['theme'] = theme
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [choice])
}
