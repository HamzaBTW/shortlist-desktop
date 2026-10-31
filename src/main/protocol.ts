import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { APP_HOST, APP_SCHEME, CSP } from './security'
import { resolveInside } from './safe-path'

/** Must run before the app is ready. */
export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

const notFound = (): Response => new Response('Not found', { status: 404 })

/** Serves the built screens from `rendererDir` only, with the strict policy attached. */
export function serveRenderer(rendererDir: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.host !== APP_HOST || request.method !== 'GET') return notFound()

    const file = resolveInside(rendererDir, url.pathname === '/' ? '/index.html' : url.pathname)
    if (!file) return notFound()

    try {
      const response = await net.fetch(pathToFileURL(file).toString())
      if (!response.ok) return notFound()
      const headers = new Headers(response.headers)
      headers.set('Content-Security-Policy', CSP)
      headers.set('X-Content-Type-Options', 'nosniff')
      return new Response(response.body, { status: 200, headers })
    } catch {
      return notFound()
    }
  })
}
