import { app, BrowserWindow, Menu, nativeTheme, session } from 'electron'
import path from 'node:path'
import { APP_NAME } from '../shared/app-info'
import icon from '../../build/icon.png?asset'
import { applyNativeTheme, closeStore, registerIpc } from './ipc'
import { registerSchemePrivileges, serveRenderer } from './protocol'
import { APP_ORIGIN, DEV_SERVER_URL, guardWebContents, hardenSession } from './security'
import { loadSettings } from './settings'

app.setName(APP_NAME)
app.enableSandbox()
registerSchemePrivileges()
guardWebContents()

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: APP_NAME,
    icon,
    // Matches the theme's `bg` token so there is no white flash on start.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f0e0d' : '#f5efe6',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  void mainWindow.loadURL(DEV_SERVER_URL ?? `${APP_ORIGIN}/index.html`)
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.whenReady().then(() => {
  if (app.isPackaged) Menu.setApplicationMenu(null)
  hardenSession(session.defaultSession)
  serveRenderer(path.join(__dirname, '../renderer'))
  applyNativeTheme(loadSettings())
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => closeStore())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
