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
  chooseEmptyFolder: () => ipcRenderer.invoke(Channels.folderChooseEmpty),
  setupNewFolder: (region: string) => ipcRenderer.invoke(Channels.folderSetup, region),
  detectEngine: () => ipcRenderer.invoke(Channels.engineDetect),
  checkComputer: () => ipcRenderer.invoke(Channels.healthCheck),
  signInEngine: () => ipcRenderer.invoke(Channels.engineSignIn),
  startRun: (request) => ipcRenderer.invoke(Channels.runStart, request),
  continueRun: (request) => ipcRenderer.invoke(Channels.runContinue, request),
  answerPermission: (requestId, allow) => ipcRenderer.invoke(Channels.runAnswer, { requestId, allow }),
  answerQuestion: (requestId, answers) => ipcRenderer.invoke(Channels.runAnswerQuestion, { requestId, answers }),
  cancelRun: () => ipcRenderer.invoke(Channels.runCancel),
  listJobs: () => ipcRenderer.invoke(Channels.jobsList),
  saveJob: (job) => ipcRenderer.invoke(Channels.jobsSave, job),
  deleteJob: (id) => ipcRenderer.invoke(Channels.jobsDelete, id),
  readTracker: () => ipcRenderer.invoke(Channels.trackerRead),
  readSearch: () => ipcRenderer.invoke(Channels.searchRead),
  listPicks: () => ipcRenderer.invoke(Channels.picksList),
  setPick: (key, pick) => ipcRenderer.invoke(Channels.picksSet, { key, pick }),
  openLink: (url) => ipcRenderer.invoke(Channels.openLink, url),
  documentsFor: (request) => ipcRenderer.invoke(Channels.documentsFor, request),
  openDocument: (path, reveal) => ipcRenderer.invoke(Channels.documentsOpen, { path, reveal }),
  recordOutcome: (request) => ipcRenderer.invoke(Channels.outcomeRecord, request),
  onRunEvent: (listener) => {
    const wrapped = (_event: IpcRendererEvent, payload: RunEvent): void => listener(payload)
    ipcRenderer.on(Channels.runEvent, wrapped)
    return () => {
      ipcRenderer.removeListener(Channels.runEvent, wrapped)
    }
  }
}

contextBridge.exposeInMainWorld('shortlist', api)
