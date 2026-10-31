// The only bridge between the screens (renderer) and the main process.
// Everything the screens can ask for is listed here; nothing else is exposed.

export const THEME_CHOICES = ['system', 'midnight', 'light-relax'] as const
export type ThemeChoice = (typeof THEME_CHOICES)[number]

export interface Settings {
  theme: ThemeChoice
  guide: boolean
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system', guide: true }

export interface AppInfo {
  name: string
  version: string
  platform: 'win32' | 'darwin' | 'linux' | 'other'
}

export const Channels = {
  appInfo: 'app:info',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set'
} as const

export interface ShortlistApi {
  appInfo(): Promise<AppInfo>
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
}

/** Keeps only known keys with valid values; anything else is dropped. */
export function cleanSettings(input: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const out: Settings = { ...base }
  if (typeof input !== 'object' || input === null) return out
  const raw = input as Record<string, unknown>
  if (typeof raw.theme === 'string' && (THEME_CHOICES as readonly string[]).includes(raw.theme)) {
    out.theme = raw.theme as ThemeChoice
  }
  if (typeof raw.guide === 'boolean') out.guide = raw.guide
  return out
}
