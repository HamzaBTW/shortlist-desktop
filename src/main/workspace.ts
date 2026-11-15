import { app, BrowserWindow, dialog, shell } from 'electron'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { NewFolderResult } from '../shared/framework'
import { isRegion } from '../shared/framework'
import type { WorkspaceStatus } from '../shared/ipc'
import { isEmptyFolder, setupFolder } from './new-folder'
import { checkWorkspace } from './workspace-check'

// Remembers which ai-job-search folder the person chose. Stored in the app's own
// data folder; nothing is ever written inside the workspace itself.
const file = (): string => path.join(app.getPath('userData'), 'workspace.json')

function loadPath(): string | null {
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as unknown
    if (typeof raw === 'object' && raw !== null && typeof (raw as { path?: unknown }).path === 'string') {
      const p = (raw as { path: string }).path
      return path.isAbsolute(p) ? p : null
    }
  } catch {
    // No folder chosen yet.
  }
  return null
}

function savePath(folder: string): void {
  const tmp = `${file()}.tmp`
  writeFileSync(tmp, JSON.stringify({ path: folder }, null, 2))
  renameSync(tmp, file())
}

export function currentWorkspace(): WorkspaceStatus | null {
  const p = loadPath()
  return p ? checkWorkspace(p) : null
}

export async function chooseWorkspace(win: BrowserWindow | null): Promise<WorkspaceStatus | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Choose your ai-job-search folder',
    properties: ['openDirectory', 'dontAddToRecent']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  const picked = result.filePaths[0]
  if (result.canceled || !picked) return null

  const status = checkWorkspace(path.resolve(picked))
  if (status.ok) savePath(status.path)
  return status
}

/** The empty folder picked for "Set up a new folder", kept here so the screens never pass a path. */
let pendingFolder: string | null = null
let settingUp = false

export async function chooseEmptyFolder(win: BrowserWindow | null): Promise<{ path: string; empty: boolean } | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Choose an empty folder for your job search',
    properties: ['openDirectory', 'createDirectory', 'promptToCreate', 'dontAddToRecent']
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  const picked = result.filePaths[0]
  if (result.canceled || !picked) return null
  const folder = path.resolve(picked)
  const empty = isEmptyFolder(folder)
  pendingFolder = empty ? folder : null
  return { path: folder, empty }
}

export async function setupNewFolder(region: unknown): Promise<NewFolderResult> {
  if (!isRegion(region) || !pendingFolder) return { ok: false, problem: 'noFolder', partial: false }
  if (settingUp) return { ok: false, problem: 'busy', partial: false }
  settingUp = true
  try {
    const result = await setupFolder(pendingFolder, region)
    if (!result.ok) return result
    const status = checkWorkspace(result.path)
    if (!status.ok) return { ok: false, problem: 'checkFailed', partial: true }
    savePath(status.path)
    pendingFolder = null
    return result
  } finally {
    settingUp = false
  }
}

export async function openWorkspace(): Promise<void> {
  const status = currentWorkspace()
  if (status?.ok) await shell.openPath(status.path)
}
