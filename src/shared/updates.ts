// The update notice (v0.1): at most once a day the app asks GitHub for Shortlist's release list
// and, if a newer version exists, shows a quiet banner linking its release page. Nothing is
// downloaded or installed. Settings › Updates turns the check off. Automatic updates come once
// releases are signed.

export const REPO = 'HamzaBTW/shortlist-desktop'
/** The full release list (pre-releases included: v0.x releases are pre-releases). */
export const RELEASES_API = `https://api.github.com/repos/${REPO}/releases?per_page=30`
export const RELEASES_PAGE = `https://github.com/${REPO}/releases`
const RELEASE_LINK = new RegExp(`^https://github\\.com/${REPO.replace('/', '\\/')}/releases/tag/[A-Za-z0-9._-]+$`)

export const DAY_MS = 24 * 60 * 60 * 1000

export interface UpdateInfo {
  version: string
  /** The release's own page on GitHub (checked to be one). */
  url: string
}

export interface UpdateStatus {
  enabled: boolean
  /** When the release list was last asked for (ms since 1970), or null if never. */
  lastChecked: number | null
  /** A newer version the person hasn't hidden (the Home banner), or null. */
  available: UpdateInfo | null
  /** The newest newer version found, hidden or not (named in Settings). */
  latest: UpdateInfo | null
}

interface Version {
  core: [number, number, number]
  pre: string[]
}

/** "v1.2.3", "1.2.3-beta.2" -> parts; anything else -> null. */
export function parseSemver(raw: string): Version | null {
  const m = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:-([0-9A-Za-z.-]{1,64}))?$/.exec(raw.trim())
  if (!m) return null
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : [] }
}

/** Semantic-version order: > 0 when a is newer than b. A pre-release comes before its release. */
export function compareVersions(a: string, b: string): number {
  const x = parseSemver(a)
  const y = parseSemver(b)
  if (!x || !y) return 0
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i]! - y.core[i]!
  if (x.pre.length === 0 || y.pre.length === 0) return y.pre.length - x.pre.length
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i]
    const q = y.pre[i]
    if (p === undefined) return -1
    if (q === undefined) return 1
    const pn = /^\d+$/.test(p)
    const qn = /^\d+$/.test(q)
    if (pn && qn && Number(p) !== Number(q)) return Number(p) - Number(q)
    if (pn !== qn) return pn ? -1 : 1
    if (p !== q) return p < q ? -1 : 1
  }
  return 0
}

/**
 * The newest release newer than `current` from GitHub's release list, or null.
 * Drafts, unknown tag shapes and links that aren't this repo's release pages are ignored.
 */
export function pickUpdate(releases: unknown, current: string): UpdateInfo | null {
  if (!Array.isArray(releases)) return null
  let best: UpdateInfo | null = null
  for (const r of releases.slice(0, 100)) {
    if (typeof r !== 'object' || r === null) continue
    const rel = r as { tag_name?: unknown; html_url?: unknown; draft?: unknown }
    if (rel.draft === true || typeof rel.tag_name !== 'string' || typeof rel.html_url !== 'string') continue
    const v = parseSemver(rel.tag_name)
    if (!v || !RELEASE_LINK.test(rel.html_url)) continue
    const version = rel.tag_name.replace(/^v/, '')
    if (compareVersions(version, current) <= 0) continue
    if (!best || compareVersions(version, best.version) > 0) best = { version, url: rel.html_url }
  }
  return best
}

/** Due when never checked, a day has passed, or the clock went backwards. */
export function checkDue(lastChecked: number | null, now: number): boolean {
  return lastChecked === null || now - lastChecked >= DAY_MS || now < lastChecked
}
