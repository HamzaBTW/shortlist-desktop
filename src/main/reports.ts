import { closeSync, openSync, readdirSync, readSync } from 'node:fs'
import path from 'node:path'
import { latestReport, parseGaps, parseOutcome, type OutcomeStages, type SkillReport } from '../shared/reports.ts'
import { realInside } from './profile.ts'

// What the Reports screen reads besides the tracker: the interview stages ticked in each
// documents/applications/*/outcome.md and the newest upskill report's gap table.
// Read-only, size-capped, real paths inside the folder only.

const MAX_BYTES = 256 * 1024
const MAX_FOLDERS = 500

function readCapped(file: string): string {
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.alloc(MAX_BYTES)
    const n = readSync(fd, buf, 0, MAX_BYTES, 0)
    return buf.subarray(0, n).toString('utf8')
  } finally {
    closeSync(fd)
  }
}

function list(workspace: string, rel: string): string[] {
  try {
    return readdirSync(path.join(workspace, rel))
  } catch {
    return []
  }
}

export interface ReportExtras {
  outcomes: Record<string, OutcomeStages>
  skills: SkillReport | null
}

export function readReportExtras(workspace: string): ReportExtras {
  const outcomes: Record<string, OutcomeStages> = {}
  for (const name of list(workspace, 'documents/applications').slice(0, MAX_FOLDERS)) {
    const real = realInside(workspace, `documents/applications/${name}/outcome.md`)
    if (!real) continue
    try {
      const parsed = parseOutcome(readCapped(real))
      if (parsed) outcomes[parsed.key] = parsed.stages
    } catch {
      // An unreadable outcome file just adds nothing.
    }
  }

  let skills: SkillReport | null = null
  const latest = latestReport(list(workspace, 'upskill'))
  if (latest) {
    const real = realInside(workspace, `upskill/${latest}`)
    if (real) {
      try {
        skills = { date: latest.slice(7, 17), file: `upskill/${latest}`, gaps: parseGaps(readCapped(real)) }
      } catch {
        skills = null
      }
    }
  }
  return { outcomes, skills }
}
