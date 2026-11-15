import { app, BrowserWindow, dialog, session, shell, type Session } from 'electron'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

// "Export my report": saves the page the Reports screen built (src/shared/report-export.ts) where
// the person chooses, as PDF or HTML. Nothing is written into the job-search folder. The PDF is
// printed by Chromium in a hidden window with scripts off and a session that loads nothing from
// anywhere (the page carries its fonts and logo inline).

export type ExportResult = { ok: true; path: string } | { ok: false; reason: 'cancelled' | 'badInput' | 'failed' }

const MAX_HTML = 8 * 1024 * 1024
let lastSaved: string | null = null
let exportSession: Session | null = null

function lockedSession(): Session {
  if (exportSession) return exportSession
  const s = session.fromPartition('shortlist-export', { cache: false })
  s.setPermissionRequestHandler((_c, _p, cb) => cb(false))
  s.setPermissionCheckHandler(() => false)
  s.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, cb) => cb({ cancel: !details.url.startsWith('data:') }))
  exportSession = s
  return s
}

async function printPdf(html: string): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    width: 1000,
    height: 1400,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false, spellcheck: false, session: lockedSession() }
  })
  try {
    await win.loadURL(`data:text/html;charset=utf-8;base64,${Buffer.from(html, 'utf8').toString('base64')}`)
    return await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true })
  } finally {
    win.destroy()
  }
}

export async function exportReport(parent: BrowserWindow | null, html: unknown): Promise<ExportResult> {
  if (typeof html !== 'string' || html.length > MAX_HTML || !html.startsWith('<!doctype html>')) return { ok: false, reason: 'badInput' }
  const today = new Date().toISOString().slice(0, 10)
  const options: Electron.SaveDialogOptions = {
    title: 'Save your report',
    defaultPath: path.join(app.getPath('documents'), `Shortlist report ${today}.pdf`),
    filters: [
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'Web page', extensions: ['html'] }
    ],
    properties: ['showOverwriteConfirmation', 'dontAddToRecent']
  }
  const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { ok: false, reason: 'cancelled' }
  const target = path.resolve(result.filePath)
  try {
    if (/\.html?$/i.test(target)) writeFileSync(target, html, 'utf8')
    else writeFileSync(/\.pdf$/i.test(target) ? target : `${target}.pdf`, await printPdf(html))
    lastSaved = /\.(html?|pdf)$/i.test(target) ? target : `${target}.pdf`
    return { ok: true, path: lastSaved }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/** Opens the report saved last in this session (the screens never pass a path). */
export async function openLastReport(): Promise<boolean> {
  return lastSaved ? (await shell.openPath(lastSaved)) === '' : false
}
