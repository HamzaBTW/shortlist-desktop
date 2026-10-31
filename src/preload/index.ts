import { contextBridge, ipcRenderer } from 'electron'
import { Channels, type ShortlistApi } from '../shared/ipc'

// The screens get exactly these functions as `window.shortlist`, nothing more.
// No raw ipcRenderer, no Node, no file access.
const api: ShortlistApi = {
  appInfo: () => ipcRenderer.invoke(Channels.appInfo),
  getSettings: () => ipcRenderer.invoke(Channels.settingsGet),
  setSettings: (patch) => ipcRenderer.invoke(Channels.settingsSet, patch)
}

contextBridge.exposeInMainWorld('shortlist', api)
