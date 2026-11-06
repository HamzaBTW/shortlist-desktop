import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { DETAILS, type Detail, type IncompleteJob, type RankedJob, type SearchData } from '../shared/search.ts'
import { sourceOf, type SourceLabel } from '../shared/slots.ts'
import { matchKey } from '../shared/tracker.ts'

// Reads job_scraper/seen_jobs.json (written by /scrape and /rank). Never writes it.
// tools/rank_state.py keeps it at the folder root; older layouts kept it inside the skill folder.

const CANDIDATES = [
  ['job_scraper', 'seen_jobs.json'],
  ['.claude', 'skills', 'job-scraper', 'job_scraper', 'seen_jobs.json']
]
const noCounts = (): Record<SourceLabel, number> => ({ linkedin: 0, freehire: 0, indeed: 0, careers: 0, other: 0 })
const empty = (found: boolean, error?: SearchData['error']): SearchData => ({
  found,
  ranked: [],
  waiting: 0,
  lastRanked: null,
  perSource: noCounts(),
  searchedOn: null,
  incomplete: [],
  ...(error ? { error } : {})
})
export const emptySearch = (): SearchData => empty(false)
const MAX_BYTES = 30 * 1024 * 1024
const TEXT_CAP = 400

const str = (v: unknown, cap = TEXT_CAP): string => (typeof v === 'string' ? v.slice(0, cap) : '')
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 5).map((s) => s.slice(0, TEXT_CAP)) : [])

export function findSeenFile(workspace: string): string | null {
  for (const parts of CANDIDATES) {
    const p = path.join(workspace, ...parts)
    try {
      if (statSync(p).isFile()) return p
    } catch {
      // Try the next place.
    }
  }
  return null
}

/** Ranked jobs, best first. Jobs already in the tracker (company + role) are left out: they are on the board. */
export function readSeen(workspace: string, trackerKeys: Set<string>): SearchData {
  const file = findSeenFile(workspace)
  if (!file) return empty(false)
  try {
    if (statSync(file).size > MAX_BYTES) return empty(true, 'tooLarge')
    return parseSeen(readFileSync(file, 'utf8'), trackerKeys)
  } catch {
    return empty(true, 'unreadable')
  }
}

export function parseSeen(text: string, trackerKeys: Set<string>): SearchData {
  const data = JSON.parse(text) as { seen?: unknown }
  const seen = typeof data.seen === 'object' && data.seen !== null ? (data.seen as Record<string, unknown>) : {}
  const ranked: RankedJob[] = []
  let waiting = 0
  let lastRanked: string | null = null
  const incomplete: IncompleteJob[] = []
  const stamped: { source: SourceLabel; firstSeen: string }[] = []

  for (const [key, raw] of Object.entries(seen)) {
    if (typeof raw !== 'object' || raw === null) continue
    const e = raw as Record<string, unknown>
    const status = str(e['status'])
    if (status !== 'skipped' && status !== 'expired' && e['dropped'] !== true) {
      stamped.push({ source: sourceOf(str(e['portal'], 80)), firstSeen: str(e['first_seen'], 10) })
    }
    if (status === 'new' || status === 'unreachable') {
      waiting++
      const missing = Array.isArray(e['missing_details'])
        ? DETAILS.filter((d): d is Detail => (e['missing_details'] as unknown[]).includes(d))
        : []
      if (status === 'new' && e['dropped'] !== true && missing.length > 0) {
        const portal = str(e['portal'], 80)
        incomplete.push({ key: key.slice(0, 300), title: str(e['title'], 200), company: str(e['company'], 200), portal, sourceLabel: sourceOf(portal), missing })
      }
      continue
    }
    if (status !== 'ranked') continue
    const company = str(e['company'], 200)
    const title = str(e['title'], 200)
    if (trackerKeys.has(matchKey(company, title))) continue
    const score = Number(e['rank_score'])
    const rankedOn = str(e['rank_date'], 10)
    if (rankedOn && (!lastRanked || rankedOn > lastRanked)) lastRanked = rankedOn
    ranked.push({
      key: key.slice(0, 300),
      title,
      company,
      url: str(e['url'], 2000),
      location: str(e['location'], 200),
      deadline: str(e['deadline'], 20),
      firstSeen: str(e['first_seen'], 20),
      score: Number.isFinite(score) && score >= 0 && score <= 100 ? Math.round(score) : null,
      verdict: str(e['rank_verdict'], 40),
      rankedOn,
      strengths: list(e['strengths']),
      gaps: list(e['gaps']),
      locationVerdict: str(e['location_verdict'], 10),
      languageGate: str(e['language_gate'], 10),
      guard: str(e['guard'], 200),
      source: str(e['source'], 20),
      portal: str(e['portal'], 80),
      sourceLabel: sourceOf(str(e['portal'], 80))
    })
  }
  ranked.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  const searchedOn = stamped.reduce<string | null>((max, x) => (x.firstSeen && (!max || x.firstSeen > max) ? x.firstSeen : max), null)
  const perSource = noCounts()
  for (const x of stamped) if (searchedOn && x.firstSeen === searchedOn) perSource[x.source]++
  const order = (j: IncompleteJob): number => ['linkedin', 'freehire', 'indeed', 'careers', 'other'].indexOf(j.sourceLabel)
  incomplete.sort((a, b) => b.missing.length - a.missing.length || order(a) - order(b) || a.title.localeCompare(b.title))
  return { found: true, ranked, waiting, lastRanked, perSource, searchedOn, incomplete }
}
