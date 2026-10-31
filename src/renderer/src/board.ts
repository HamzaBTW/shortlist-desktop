import { columnFor, type BoardColumn, type TrackerRow } from '../../shared/tracker.ts'
import type { Job } from './jobs'

// What goes on the board: tracker rows in their columns, plus jobs added in the
// app that have no tracker row yet. A job linked to a row shows once, as that row.

export type Card =
  | { kind: 'row'; key: string; column: BoardColumn; row: TrackerRow; job: Job | null }
  | { kind: 'job'; key: string; column: BoardColumn; job: Job }

export function buildBoard(rows: TrackerRow[], jobs: Job[]): Card[] {
  const byKey = new Map<string, Job>()
  jobs = jobs.filter((j) => j.kind !== 'outcome')
  for (const j of jobs) {
    if (!j.trackerKey) continue
    const prev = byKey.get(j.trackerKey)
    if (!prev || j.createdAt > prev.createdAt) byKey.set(j.trackerKey, j)
  }
  const rowKeys = new Set(rows.map((r) => r.matchKey))

  const cards: Card[] = rows.map((row) => ({
    kind: 'row',
    key: row.id,
    column: columnFor(row.status),
    row,
    job: byKey.get(row.matchKey) ?? null
  }))
  for (const job of jobs) {
    if (job.trackerKey && rowKeys.has(job.trackerKey)) continue
    cards.push({ kind: 'job', key: job.id, column: 'shortlisted', job })
  }
  // Newest first inside each column: in-app jobs by when added, rows by tracker order (latest at the end).
  return cards.sort((a, b) => order(b) - order(a))
}

function order(c: Card): number {
  if (c.kind === 'job') return c.job.createdAt
  const t = Date.parse(c.row.date)
  return Number.isFinite(t) ? t : 0
}
