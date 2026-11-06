import type { WebContents } from 'electron'
import { NO_INPUT_COMMANDS, RUNNABLE_COMMANDS, type RunnableCommand, type ContinueRun, type RunEvent, type StartRun } from '../shared/engine'
import { Channels, type RunStartResult } from '../shared/ipc'
import { ClaudeCodeRun } from './engine/claude-code'
import { isScrapeInput } from '../shared/slots'
import { loadSettings } from './settings'
import { currentWorkspace } from './workspace'

// One run at a time: the commands share LaTeX build files in the workspace.

const MAX_INPUT = 60_000
let current: ClaudeCodeRun | null = null

function emitTo(target: WebContents): (event: RunEvent) => void {
  return (event) => {
    if (!target.isDestroyed()) target.send(Channels.runEvent, event)
  }
}

function begin(target: WebContents, prompt: string, resume?: string): RunStartResult {
  if (current?.running) return { ok: false, reason: 'busy' }
  const ws = currentWorkspace()
  if (!ws?.ok) return { ok: false, reason: 'noWorkspace' }
  const s = loadSettings()
  const run = new ClaudeCodeRun(ws.path, { acceptEdits: !s.askEveryChange, allowWeb: !s.askWeb }, emitTo(target))
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
  return begin(target, input ? `/${req.command} ${input}` : `/${req.command}`)
}

export function continueRun(target: WebContents, raw: unknown): RunStartResult {
  const req = raw as Partial<ContinueRun> | null
  if (!req || typeof req.sessionId !== 'string' || typeof req.reply !== 'string') return { ok: false, reason: 'badInput' }
  const reply = req.reply.trim()
  if (!reply || reply.length > MAX_INPUT) return { ok: false, reason: 'badInput' }
  return begin(target, reply, req.sessionId)
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
