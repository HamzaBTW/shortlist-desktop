import path from 'node:path'

/**
 * Resolves a URL path to a file inside `root`, or returns null.
 * Rejects anything that would land outside `root` (`..`, absolute paths,
 * other drives, encoded tricks), null bytes, and the root folder itself.
 * A backslash is refused on every system: it separates folders on Windows only, so the same
 * address would otherwise be refused there and accepted on Linux and macOS. No app file has one.
 */
export function resolveInside(root: string, urlPath: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null

  const base = path.resolve(root)
  const full = path.resolve(base, decoded.replace(/^[/\\]+/, ''))
  const rel = path.relative(base, full)
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return null
  return full
}
