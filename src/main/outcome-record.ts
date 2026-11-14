import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { findProgram } from './engine/find.ts'

// "Update status" without an AI turn: runs the framework's own tools/outcome_state.py (plain
// Python, no model, no network). The app still writes nothing itself; the framework tool is the
// writer. Anything it cannot do (tool or Python missing, no matching row, several rows) comes
// back as not ok, and the screen falls back to the /outcome command.

const STATUSES = new Set(['applied', 'interview', 'offer', 'hired', 'rejected', 'no_response', 'withdrawn', 'offer_declined'])

export interface OutcomeRecordRequest {
  company: string
  role: string
  status: string
  date: string
  note: string
}

export type OutcomeRecordResult = { ok: true; postingMissing: boolean } | { ok: false; reason: 'unavailable' | 'refused' | 'badInput' }

/** Valid, bounded input only; null otherwise. */
export function cleanRequest(raw: unknown): OutcomeRecordRequest | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length <= max ? v : null)
  const company = text(r.company, 200)
  const role = text(r.role, 300)
  const status = text(r.status, 40)
  const date = text(r.date, 10)
  const note = text(r.note, 1000)
  if (company === null || role === null || status === null || date === null || note === null) return null
  if (!company.trim() || !role.trim() || !STATUSES.has(status) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return { company, role, status, date, note }
}

function run(python: string, args: string[], cwd: string): Promise<{ code: number | 'missing'; stdout: string }> {
  return new Promise((resolve) => {
    execFile(python, args, { cwd, timeout: 20_000, windowsHide: true, maxBuffer: 1_000_000 }, (error, stdout) => {
      if (!error) return resolve({ code: 0, stdout })
      const e = error as NodeJS.ErrnoException & { code?: number | string }
      resolve({ code: e.code === 'ENOENT' ? 'missing' : typeof e.code === 'number' ? e.code : 1, stdout: stdout ?? '' })
    })
  })
}

export async function recordOutcome(workspace: string, request: OutcomeRecordRequest): Promise<OutcomeRecordResult> {
  const tool = path.join(workspace, 'tools', 'outcome_state.py')
  if (!existsSync(tool)) return { ok: false, reason: 'unavailable' }
  // Arguments go in as an array: no shell, so names and notes cannot be read as commands.
  const args = [
    '-I',
    tool,
    'record',
    // "--name=value" so a note that starts with "-" is never read as an option.
    `--root=${workspace}`,
    `--company=${request.company}`,
    `--role=${request.role}`,
    `--status=${request.status}`,
    `--date=${request.date}`,
    `--note=${request.note}`
  ]
  // Python is started by its full path, never a bare name: see findProgram.
  for (const name of process.platform === 'win32' ? ['python.exe', 'py.exe'] : ['python3', 'python']) {
    const python = findProgram([name], workspace)
    if (!python) continue
    const r = await run(python, name === 'py.exe' ? ['-3', ...args] : args, workspace)
    if (r.code === 'missing') continue
    try {
      const out = JSON.parse(r.stdout.trim().split('\n').pop() ?? '') as { ok?: boolean; posting_missing?: boolean }
      if (r.code === 0 && out.ok === true) return { ok: true, postingMissing: out.posting_missing === true }
      return { ok: false, reason: 'refused' }
    } catch {
      return { ok: false, reason: 'unavailable' }
    }
  }
  return { ok: false, reason: 'unavailable' }
}
