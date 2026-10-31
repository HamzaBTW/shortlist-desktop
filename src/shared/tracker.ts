// The workspace's job_search_tracker.csv as the board sees it. Read-only:
// the job-search commands (/apply, /outcome, /gmail-sync) are its only writers.

export const BOARD_COLUMNS = ['shortlisted', 'applied', 'interviewing', 'offer', 'closed'] as const
export type BoardColumn = (typeof BOARD_COLUMNS)[number]

export interface TrackerRow {
  /** Stable within one read: the row's line in the file. */
  id: string
  /** company|role, lower-cased: how /apply and /outcome match rows. */
  matchKey: string
  date: string
  company: string
  sector: string
  role: string
  roleType: string
  channel: string
  /** Canonical spelling (underscores, lower case). */
  status: string
  contactPerson: string
  fitRating: number | null
  notes: string
  cvFile: string
  coverLetterFile: string
  source: string
  deadline: string
}

export interface TrackerData {
  /** False when the workspace has no tracker yet (normal before the first /apply). */
  found: boolean
  rows: TrackerRow[]
  error?: 'unreadable' | 'tooLarge' | 'noHeader'
}

export function matchKey(company: string, role: string): string {
  return `${company.trim().toLowerCase()}|${role.trim().toLowerCase()}`
}

/** "No response" -> "no_response". Old trackers use spaces; /outcome accepts both. */
export function normalizeStatus(status: string): string {
  return status.trim().toLowerCase().replace(/\s+/g, '_')
}

const COLUMN_OF: Record<string, BoardColumn> = {
  ranked: 'shortlisted',
  drafted: 'shortlisted',
  applied: 'applied',
  interview: 'interviewing',
  offer: 'offer',
  hired: 'offer',
  rejected: 'closed',
  no_response: 'closed',
  offer_declined: 'closed',
  withdrawn: 'closed',
  expired: 'closed'
}

/** The board column for a status (design system Decisions page). Unknown statuses stay in Shortlisted. */
export function columnFor(status: string): BoardColumn {
  return COLUMN_OF[normalizeStatus(status)] ?? 'shortlisted'
}

export const KNOWN_STATUSES = Object.keys(COLUMN_OF)
