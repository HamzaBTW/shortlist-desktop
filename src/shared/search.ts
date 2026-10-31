// Jobs that /scrape found and /rank scored, as the Search & rank screen sees them.
// Read from the folder's job_scraper/seen_jobs.json; the app never writes that file.

export interface RankedJob {
  /** The framework's own key for the posting (tools/job_key.py). */
  key: string
  title: string
  company: string
  url: string
  location: string
  deadline: string
  firstSeen: string
  score: number | null
  /** The band /rank gave, e.g. "strong" / "moderate" / "weak". */
  verdict: string
  rankedOn: string
  strengths: string[]
  gaps: string[]
  /** PASS / FAIL / FLAG from /rank's location and language gates. */
  locationVerdict: string
  languageGate: string
  /** posting_guard verdict line, when /rank stored one. */
  guard: string
  /** cli / websearch / connector (Indeed connector entries are never fetched). */
  source: string
  portal: string
}

export interface SearchData {
  /** False when /scrape has never run in this folder. */
  found: boolean
  ranked: RankedJob[]
  /** Found but not ranked yet (status new or unreachable). */
  waiting: number
  /** The most recent rank date, YYYY-MM-DD. */
  lastRanked: string | null
  error?: 'unreadable' | 'tooLarge'
}

/** What the person decided about a ranked job, kept by the app (not in the folder). */
export type Pick = 'board' | 'hidden'
