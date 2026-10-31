import { app } from 'electron'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cleanSettings, DEFAULT_SETTINGS, type Settings } from '../shared/ipc'

// App preferences only (theme, Guide me). Never anything from the job-search folder.
// Moves to the app's SQLite store when that lands.
const file = (): string => path.join(app.getPath('userData'), 'settings.json')

let cached: Settings | undefined

export function loadSettings(): Settings {
  if (cached) return cached
  try {
    cached = cleanSettings(JSON.parse(readFileSync(file(), 'utf8')))
  } catch {
    cached = { ...DEFAULT_SETTINGS }
  }
  return cached
}

export function saveSettings(patch: unknown): Settings {
  const next = cleanSettings(patch, loadSettings())
  const tmp = `${file()}.tmp`
  writeFileSync(tmp, JSON.stringify(next, null, 2))
  renameSync(tmp, file())
  cached = next
  return next
}
