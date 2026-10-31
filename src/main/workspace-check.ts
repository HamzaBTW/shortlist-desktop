import { openSync, readSync, closeSync, statSync } from 'node:fs'
import path from 'node:path'
import type { WorkspaceProblem, WorkspaceStatus } from '../shared/ipc.ts'

// Read-only look at a folder: is it a copy of ai-job-search?
// Never writes, never runs anything inside it.

const REQUIRED: { file: string[]; problem: WorkspaceProblem }[] = [
  { file: ['CLAUDE.md'], problem: 'noClaudeMd' },
  { file: ['.claude', 'commands', 'apply.md'], problem: 'noCommands' }
]

/** The framework template's placeholder; it disappears once /setup fills in the profile. */
const PLACEHOLDER = '[YOUR_NAME]'

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

function readHead(p: string, bytes = 64 * 1024): string {
  const fd = openSync(p, 'r')
  try {
    const buf = Buffer.alloc(bytes)
    const n = readSync(fd, buf, 0, bytes, 0)
    return buf.subarray(0, n).toString('utf8')
  } finally {
    closeSync(fd)
  }
}

export function checkWorkspace(folder: string): WorkspaceStatus {
  const status: WorkspaceStatus = {
    path: folder,
    ok: false,
    problems: [],
    profileFilled: false,
    hasTracker: false
  }

  let isDir = false
  try {
    isDir = statSync(folder).isDirectory()
  } catch {
    status.problems.push('missing')
    return status
  }
  if (!isDir) {
    status.problems.push('notFolder')
    return status
  }

  for (const { file, problem } of REQUIRED) {
    if (!isFile(path.join(folder, ...file))) status.problems.push(problem)
  }

  const claudeMd = path.join(folder, 'CLAUDE.md')
  if (isFile(claudeMd)) {
    try {
      status.profileFilled = !readHead(claudeMd).includes(PLACEHOLDER)
    } catch {
      status.profileFilled = false
    }
  }
  status.hasTracker = isFile(path.join(folder, 'job_search_tracker.csv'))
  status.ok = status.problems.length === 0
  return status
}
