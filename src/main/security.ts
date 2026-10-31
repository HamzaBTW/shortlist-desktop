import { app, type Session } from 'electron'

/** The packaged screens load from this private scheme, never from file:// or a web server. */
export const APP_SCHEME = 'app'
export const APP_HOST = 'shortlist'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`

/** Set by electron-vite only while developing (`npm run dev`). */
export const DEV_SERVER_URL: string | undefined = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']

/** Strict policy for the packaged app: only the app's own files, no network. */
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'"
].join('; ')

/** Development only: the dev server injects inline styles and a hot-reload socket. */
const DEV_CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' ws://localhost:*",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'"
].join('; ')

export function isAppUrl(url: string): boolean {
  if (DEV_SERVER_URL) return url === DEV_SERVER_URL || url.startsWith(DEV_SERVER_URL.replace(/\/?$/, '/'))
  return url.startsWith(`${APP_ORIGIN}/`)
}

/** Locks down the session the window uses. */
export function hardenSession(session: Session): void {
  // No camera, microphone, notifications, geolocation, clipboard reads, etc.
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.setPermissionCheckHandler(() => false)

  // The screens never talk to the internet. AI work runs in the engine process, not here.
  session.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (details, callback) => {
      const allowed = DEV_SERVER_URL !== undefined && new URL(details.url).hostname === 'localhost'
      callback({ cancel: !allowed })
    }
  )

  if (DEV_SERVER_URL) {
    session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [DEV_CSP] }
      })
    })
  }
}

/** Every window and frame: no pop-ups, no navigating away, no <webview>. */
export function guardWebContents(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event, url) => {
      if (!isAppUrl(url)) event.preventDefault()
    })
    contents.on('will-redirect', (event, url) => {
      if (!isAppUrl(url)) event.preventDefault()
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
  })
}
