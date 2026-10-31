import { app, ipcMain, nativeTheme, type IpcMainInvokeEvent } from 'electron'
import { APP_NAME } from '../shared/app-info'
import { Channels, type AppInfo, type Settings } from '../shared/ipc'
import { isAppUrl } from './security'
import { loadSettings, saveSettings } from './settings'

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
}
