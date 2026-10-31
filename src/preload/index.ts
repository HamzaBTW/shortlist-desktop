import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { RunEvent } from '../shared/engine'
import { Channels, type ShortlistApi } from '../shared/ipc'

// The screens get exactly these functions as `window.shortlist`, nothing more.
// No raw ipcRenderer, no Node, no file access.
const api: ShortlistApi = {
  appInfo: () => ipcRenderer.invoke(Channels.appInfo),
  getSettings: () => ipcRenderer.invoke(Channels.settingsGet),
  setSettings: (patch) => ipcRenderer.invoke(Channels.settingsSet, patch),
  getWorkspace: () => ipcRenderer.invoke(Channels.workspaceGet),
  chooseWorkspace: () => ipcRenderer.invoke(Channels.workspaceChoose),
  openWorkspace: () => ipcRenderer.invoke(Channels.workspaceOpen),
  detectEngine: () => ipcRenderer.invoke(Channels.engineDetect),
  signInEngine: () => ipcRenderer.invoke(Channels.engineSignIn),
  startRun: (request) => ipcRenderer.invoke(Channels.runStart, request),
  continueRun: (request) => ipcRenderer.invoke(Channels.runContinue, request),
  answerPermission: (requestId, allow) => ipcRenderer.invoke(Channels.runAnswer, { requestId, allow }),
  cancelRun: () => ipcRenderer.invoke(Channels.runCancel),
  onRunEvent: (listener) => {
    const wrapped = (_event: IpcRendererEvent, payload: RunEvent): void => listener(payload)
    ipcRenderer.on(Channels.runEvent, wrapped)
    return () => {
      ipcRenderer.removeListener(Channels.runEvent, wrapped)
    }
  }
}

contextBridge.exposeInMainWorld('shortlist', api)
