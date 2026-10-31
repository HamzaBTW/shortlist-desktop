/**
 * A link the app may hand to the person's browser: http or https only, no
 * user:password part, sane length. Returns the normalised URL or null.
 * (file:, javascript:, custom app schemes and the like are refused.)
 */
export function safeWebLink(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2000) return null
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password || !url.hostname) return null
  return url.toString()
}
