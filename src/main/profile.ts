import { closeSync, openSync, readSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { missingFile, PROFILE_CARDS, summarize, type CardSummary, type FileSummary } from '../shared/profile.ts'

// Reads the profile files for the Profile screen. Read-only, size-capped, and only files whose
// real path (links followed) stays inside the job-search folder.

const MAX_BYTES = 1024 * 1024

/** The real path of a file inside the folder, or null (missing, a folder, or outside via a link). */
export function realInside(workspace: string, rel: string): string | null {
  try {
    const root = realpathSync(workspace)
    const real = realpathSync(path.join(workspace, ...rel.split('/')))
    const inside = path.relative(root, real)
    if (inside === '' || inside.startsWith('..') || path.isAbsolute(inside)) return null
    return statSync(real).isFile() ? real : null
  } catch {
    return null
  }
}

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

function readOne(workspace: string, rel: string): FileSummary {
  const real = realInside(workspace, rel)
  if (!real) return missingFile(rel)
  try {
    return summarize(readCapped(real), rel)
  } catch {
    return missingFile(rel)
  }
}

export function readProfile(workspace: string): CardSummary[] {
  return PROFILE_CARDS.map((card) => ({ id: card.id, files: card.files.map((f) => readOne(workspace, f)) }))
}
