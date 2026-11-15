import { app, type WebContents } from 'electron'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { isSetupInput, NO_INPUT_COMMANDS, RUNNABLE_COMMANDS, type RunnableCommand, type ContinueRun, type RunEvent, type StartRun } from '../shared/engine'
import { Channels, type RunStartResult } from '../shared/ipc'
import { ClaudeCodeRun } from './engine/claude-code'
import { newDocs, snapshotDocs } from './doc-files'
import { isScrapeInput } from '../shared/slots'
import { SessionCommands } from './session-commands'
import { loadSettings } from './settings'
import { currentWorkspace } from './workspace'

// One run at a time: the commands share LaTeX build files in the workspace.

/**
 * Settings passed to every run on top of the folder's own: hooks off. Headless Claude Code runs a
 * folder's hooks without asking (checked 2026-11-14); the framework has none, so nothing breaks,
 * and a hook added later by an update or someone else's folder never runs from the app.
 * Kept in the app's data folder, rewritten before each run.
 */
function runSettingsFile(): string {
  const file = path.join(app.getPath('userData'), 'run-settings.json')
  writeFileSync(file, JSON.stringify({ disableAllHooks: true }, null, 2))
  return file
}

const MAX_INPUT = 60_000
let current: ClaudeCodeRun | null = null
const sessions = new SessionCommands()

function emitTo(target: WebContents, command: string | undefined, drafted: () => string[]): (event: RunEvent) => void {
  return (event) => {
    if (event.type === 'session' && command) sessions.remember(event.sessionId, command)
    // The PDFs this turn wrote, sent just before the turn ends so the job can list them.
    if ((event.type === 'finished' || event.type === 'failed') && !target.isDestroyed()) {
      const files = drafted()
      if (files.length > 0) target.send(Channels.runEvent, { type: 'documents', runId: event.runId, files })
    }
    if (!target.isDestroyed()) target.send(Channels.runEvent, event)
  }
}

function begin(target: WebContents, prompt: string, command: string | undefined, resume?: string): RunStartResult {
  if (current?.running) return { ok: false, reason: 'busy' }
  const ws = currentWorkspace()
  if (!ws?.ok) return { ok: false, reason: 'noWorkspace' }
  const s = loadSettings()
  let before = new Map<string, number>()
  try {
    before = snapshotDocs(ws.path)
  } catch {
    // No document list for this turn; the run itself is unaffected.
  }
  const drafted = (): string[] => {
    try {
      return newDocs(ws.path, before)
    } catch {
      return []
    }
  }
  const run = new ClaudeCodeRun(
    ws.path,
    {
      // Auto-approve implies the two "go ahead" settings; the app's hard refusals stay in judge().
      acceptEdits: s.autoApprove || !s.askEveryChange,
      allowWeb: s.autoApprove || !s.askWeb,
      autoApprove: s.autoApprove,
      command,
      settingsFile: runSettingsFile()
    },
    emitTo(target, command, drafted)
  )
  current = run
  run.start(prompt, resume)
  return { ok: true, runId: run.runId }
}

export function startRun(target: WebContents, raw: unknown): RunStartResult {
  const req = raw as Partial<StartRun> | null
  if (!req || !(RUNNABLE_COMMANDS as readonly unknown[]).includes(req.command) || typeof req.input !== 'string') {
    return { ok: false, reason: 'badInput' }
  }
  const input = req.input.trim()
  if (input.length > MAX_INPUT) return { ok: false, reason: 'badInput' }
  if (!input && !NO_INPUT_COMMANDS.includes(req.command as RunnableCommand)) return { ok: false, reason: 'badInput' }
  if (req.command === 'scrape' && !isScrapeInput(input)) return { ok: false, reason: 'badInput' }
  if (req.command === 'setup' && !isSetupInput(input)) return { ok: false, reason: 'badInput' }
  return begin(target, input ? `/${req.command} ${input}` : `/${req.command}`, req.command)
}

export function continueRun(target: WebContents, raw: unknown): RunStartResult {
  const req = raw as Partial<ContinueRun> | null
  if (!req || typeof req.sessionId !== 'string' || typeof req.reply !== 'string') return { ok: false, reason: 'badInput' }
  const reply = req.reply.trim()
  if (!reply || reply.length > MAX_INPUT) return { ok: false, reason: 'badInput' }
  return begin(target, reply, sessions.commandFor(req.sessionId), req.sessionId)
}

export function answerPermission(raw: unknown): boolean {
  const req = raw as { requestId?: unknown; allow?: unknown } | null
  if (!current || !req || typeof req.requestId !== 'string' || typeof req.allow !== 'boolean') return false
  return current.answer(req.requestId, req.allow)
}

export function answerQuestion(raw: unknown): boolean {
  const req = raw as { requestId?: unknown; answers?: unknown } | null
  if (!current || !req || typeof req.requestId !== 'string' || typeof req.answers !== 'object' || req.answers === null) return false
  const answers: Record<string, string> = {}
  for (const [k, v] of Object.entries(req.answers as Record<string, unknown>)) {
    if (typeof v === 'string' && v.length <= 4000) answers[k] = v
  }
  return current.answerQuestion(req.requestId, answers)
}

export function cancelRun(): void {
  current?.cancel()
}
