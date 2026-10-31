import { app, BrowserWindow, ipcMain, nativeTheme, shell, type IpcMainInvokeEvent } from 'electron'
import { safeWebLink } from './links'
import { APP_NAME } from '../shared/app-info'
import { Channels, type AppInfo, type Settings } from '../shared/ipc'
import { isAppUrl } from './security'
import { loadSettings, saveSettings } from './settings'
import { chooseWorkspace, currentWorkspace, openWorkspace } from './workspace'
import { detect, openSignIn } from './engine/claude-code'
import { answerPermission, answerQuestion, cancelRun, continueRun, startRun } from './runs'
import { Store } from './store'
import { readTracker } from './tracker'
import { readSeen } from './seen'
import path from 'node:path'

/** Only the app's own screens may call in; anything else is refused. */
function handle<T>(channel: string, fn: (event: IpcMainInvokeEvent, ...args: unknown[]) => T): void {
  ipcMain.handle(channel, (event, ...args) => {
    const url = event.senderFrame?.url ?? ''
    if (!isAppUrl(url)) throw new Error('Refused: unknown sender')
    return fn(event, ...args)
  })
}

export function applyNativeTheme(settings: Settings): void {
  nativeTheme.themeSource =
    settings.theme === 'system' ? 'system' : settings.theme === 'midnight' ? 'dark' : 'light'
}

let store: Store | null = null
function jobs(): Store {
  store ??= new Store(path.join(app.getPath('userData'), 'shortlist.db'))
  return store
}

export function closeStore(): void {
  store?.close()
  store = null
}

/** The saved folder, only when it still passes the check. */
function workspacePath(): string | null {
  const ws = currentWorkspace()
  return ws?.ok ? ws.path : null
}

export function registerIpc(): void {
  handle(Channels.appInfo, (): AppInfo => {
    const p = process.platform
    return {
      name: APP_NAME,
      version: app.getVersion(),
      platform: p === 'win32' || p === 'darwin' || p === 'linux' ? p : 'other'
    }
  })

  handle(Channels.settingsGet, () => loadSettings())

  handle(Channels.settingsSet, (_event, patch) => {
    const next = saveSettings(patch)
    applyNativeTheme(next)
    return next
  })

  handle(Channels.workspaceGet, () => currentWorkspace())
  handle(Channels.workspaceChoose, (event) => chooseWorkspace(BrowserWindow.fromWebContents(event.sender)))
  handle(Channels.workspaceOpen, () => openWorkspace())

  handle(Channels.engineDetect, () => detect())
  handle(Channels.engineSignIn, () => openSignIn())
  handle(Channels.runStart, (event, request) => startRun(event.sender, request))
  handle(Channels.runContinue, (event, request) => continueRun(event.sender, request))
  handle(Channels.runAnswer, (_event, answer) => answerPermission(answer))
  handle(Channels.runAnswerQuestion, (_event, answer) => answerQuestion(answer))
  handle(Channels.runCancel, () => cancelRun())

  handle(Channels.jobsList, () => {
    const ws = workspacePath()
    return ws ? jobs().listJobs(ws) : []
  })
  handle(Channels.jobsSave, (_event, job) => {
    const ws = workspacePath()
    return ws ? jobs().saveJob(ws, job) : false
  })
  handle(Channels.jobsDelete, (_event, id) => {
    const ws = workspacePath()
    return ws ? jobs().deleteJob(ws, id) : false
  })
  handle(Channels.trackerRead, () => {
    const ws = workspacePath()
    return ws ? readTracker(ws) : { found: false, rows: [] }
  })
  handle(Channels.searchRead, () => {
    const ws = workspacePath()
    if (!ws) return { found: false, ranked: [], waiting: 0, lastRanked: null }
    return readSeen(ws, new Set(readTracker(ws).rows.map((r) => r.matchKey)))
  })
  handle(Channels.openLink, async (_event, raw) => {
    const url = safeWebLink(raw)
    if (!url) return false
    await shell.openExternal(url)
    return true
  })
  handle(Channels.picksList, () => {
    const ws = workspacePath()
    return ws ? jobs().listPicks(ws) : {}
  })
  handle(Channels.picksSet, (_event, raw) => {
    const ws = workspacePath()
    const req = raw as { key?: unknown; pick?: unknown } | null
    return ws && req ? jobs().setPick(ws, req.key, req.pick ?? null) : false
  })
}
