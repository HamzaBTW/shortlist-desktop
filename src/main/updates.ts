import { app, session, type Session } from 'electron'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { checkDue, compareVersions, pickUpdate, RELEASES_API, REPO, type UpdateInfo, type UpdateStatus } from '../shared/updates'
import { loadSettings } from './settings'

// The update notice. The window's own session blocks all web requests, so the check uses a
// separate in-memory session that can reach exactly one address: GitHub's release list for
// Shortlist. It sends a generic client name and nothing about the person. Certificates are
// checked by Chromium (Windows store on Windows) like any Electron request.

interface State {
  lastChecked: number | null
  found: UpdateInfo | null
  /** The version whose banner the person closed ("hide until the next version"). */
  dismissed: string | null
}

const file = (): string => path.join(app.getPath('userData'), 'update-check.json')

function load(): State {
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<State>
    const found =
      raw.found && typeof raw.found.version === 'string' && typeof raw.found.url === 'string' ? { version: raw.found.version, url: raw.found.url } : null
    return {
      lastChecked: typeof raw.lastChecked === 'number' ? raw.lastChecked : null,
      found,
      dismissed: typeof raw.dismissed === 'string' ? raw.dismissed : null
    }
  } catch {
    return { lastChecked: null, found: null, dismissed: null }
  }
}

function save(state: State): void {
  const tmp = `${file()}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2))
  renameSync(tmp, file())
}

let checkSession: Session | null = null

/** A session for the release list only: no cache on disk, no permissions, one address. */
function updateSession(): Session {
  if (checkSession) return checkSession
  const s = session.fromPartition('shortlist-update-check', { cache: false })
  s.setPermissionRequestHandler((_c, _p, cb) => cb(false))
  s.setPermissionCheckHandler(() => false)
  const allowed = `https://api.github.com/repos/${REPO}/releases`
  s.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, cb) => {
    cb({ cancel: !(details.url === allowed || details.url.startsWith(`${allowed}?`)) })
  })
  checkSession = s
  return s
}

const MAX_BYTES = 2 * 1024 * 1024

async function fetchReleases(): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await updateSession().fetch(RELEASES_API, {
      signal: controller.signal,
      redirect: 'error',
      credentials: 'omit',
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Shortlist-update-check', 'X-GitHub-Api-Version': '2022-11-28' }
    })
    // Development only: shows GitHub's answer (a private repo answers 404).
    if (!app.isPackaged) console.log(`[update check] GitHub answered ${res.status}`)
    if (!res.ok) return null
    const text = await res.text()
    return text.length > MAX_BYTES ? null : (JSON.parse(text) as unknown)
  } catch (err) {
    if (!app.isPackaged) console.log(`[update check] failed: ${(err as Error).message}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

let inFlight: Promise<void> | null = null

/** The banner's data. Asks GitHub only when the check is on and a day has passed. */
export async function updateStatus(now = Date.now()): Promise<UpdateStatus> {
  const enabled = loadSettings().updateCheck
  if (enabled && checkDue(load().lastChecked, now)) {
    inFlight ??= (async () => {
      const releases = await fetchReleases()
      const state = load()
      // Recorded even when GitHub can't be reached, so it never asks more than once a day.
      save({ ...state, lastChecked: now, found: releases === null ? state.found : pickUpdate(releases, app.getVersion()) })
    })().finally(() => {
      inFlight = null
    })
    await inFlight
  }
  const state = load()
  const latest = enabled && state.found && compareVersions(state.found.version, app.getVersion()) > 0 ? state.found : null
  const available = latest && latest.version !== state.dismissed ? latest : null
  return { enabled, lastChecked: state.lastChecked, available, latest }
}

/** "Hide until the next version". */
export function dismissUpdate(version: unknown): boolean {
  if (typeof version !== 'string') return false
  const state = load()
  if (!state.found || state.found.version !== version) return false
  save({ ...state, dismissed: version })
  return true
}
