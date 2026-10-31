import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import readline from 'node:readline'
import { APP_NAME } from '../../shared/app-info'
import type { EngineStatus, PermissionAsk, Question, RunEvent } from '../../shared/engine'
import { findClaude, parseVersion, versionAtLeast, type ClaudeBinary } from './find'
import { judge } from './policy'

// Engine 1, "Your Claude Code": the person's own installed and signed-in CLI,
// run in the background. The app never reads, stores or handles the login.

/** First release that rejects the compromised eMudhra certificate chains. */
export const MIN_VERSION = '2.1.310'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Environment for the CLI: the person's own, minus markers that would confuse a nested run. */
function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL']) {
    delete env[key]
  }
  return env
}

function command(bin: ClaudeBinary, args: string[]): { file: string; args: string[] } {
  // Only fixed flags and validated session ids ever reach the command line;
  // the person's text goes through stdin.
  return bin.viaCmd ? { file: process.env['ComSpec'] ?? 'cmd.exe', args: ['/d', '/c', bin.path, ...args] } : { file: bin.path, args }
}

function run(bin: ClaudeBinary, args: string[], cwd?: string): Promise<string> {
  const c = command(bin, args)
  return new Promise((resolve, reject) => {
    execFile(c.file, c.args, { cwd, env: childEnv(), timeout: 20_000, windowsHide: true }, (err, stdout) =>
      err ? reject(err) : resolve(stdout)
    )
  })
}

export async function detect(): Promise<EngineStatus> {
  const base: EngineStatus = { engine: 'claude-code', state: 'notFound', minVersion: MIN_VERSION }
  const bin = findClaude()
  if (!bin) return base

  let version: string | null
  try {
    version = parseVersion(await run(bin, ['--version']))
  } catch {
    return { ...base, state: 'error' }
  }
  if (!version) return { ...base, state: 'error' }
  if (!versionAtLeast(version, MIN_VERSION)) return { ...base, state: 'outdated', version }

  try {
    // Only the yes/no is kept. The output also names the account; it is dropped here.
    const status = JSON.parse(await run(bin, ['auth', 'status', '--json'])) as { loggedIn?: unknown }
    return { ...base, version, state: status.loggedIn === true ? 'ready' : 'signedOut' }
  } catch {
    // `auth status` exits non-zero when signed out.
    return { ...base, version, state: 'signedOut' }
  }
}

/** Opens Claude Code's own sign-in in a terminal window. */
export function openSignIn(): boolean {
  const bin = findClaude()
  if (!bin) return false
  const opts = { detached: true, stdio: 'ignore' as const, env: childEnv() }
  if (process.platform === 'win32') {
    // `start "" cmd /k ""<path>" auth login"`: a new console window that stays open.
    // The path comes from findClaude(), never from the screens.
    spawn(process.env['ComSpec'] ?? 'cmd.exe', ['/d', '/c', `start "" cmd.exe /k ""${bin.path}" auth login"`], {
      ...opts,
      windowsVerbatimArguments: true
    }).unref()
  } else if (process.platform === 'darwin') {
    const quoted = bin.path.replace(/(["\\])/g, '\\$1')
    spawn('osascript', ['-e', `tell application "Terminal" to do script "\\"${quoted}\\" auth login"`], opts).unref()
  } else {
    spawn('x-terminal-emulator', ['-e', bin.path, 'auth', 'login'], opts).unref()
  }
  return true
}

type Emit = (event: RunEvent) => void

interface PendingAsk {
  input: Record<string, unknown>
  kind: 'permission' | 'question'
}

function readQuestions(input: Record<string, unknown>): Question[] {
  const raw = Array.isArray(input['questions']) ? (input['questions'] as Record<string, unknown>[]) : []
  return raw.map((q) => ({
    question: String(q['question'] ?? ''),
    header: String(q['header'] ?? ''),
    multiSelect: q['multiSelect'] === true,
    options: (Array.isArray(q['options']) ? (q['options'] as Record<string, unknown>[]) : []).map((o) => ({
      label: String(o['label'] ?? ''),
      description: String(o['description'] ?? '')
    }))
  }))
}

/** A file inside the workspace is shown relative to it ("cv/main_acme.tex"); others in full. */
function shortPath(p: string, workspace: string): string {
  if (!p) return p
  const rel = path.relative(workspace, path.resolve(workspace, p))
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : p
}

function describe(tool: string, input: Record<string, unknown>, workspace: string): Pick<PermissionAsk, 'detail' | 'kind'> {
  const str = (k: string): string => (typeof input[k] === 'string' ? (input[k] as string) : '')
  if (tool === 'Bash' || tool === 'PowerShell') return { kind: 'command', detail: str('command') }
  if (tool in { Write: 1, Edit: 1, MultiEdit: 1 }) return { kind: 'write', detail: shortPath(str('file_path'), workspace) }
  if (tool === 'NotebookEdit') return { kind: 'write', detail: shortPath(str('notebook_path'), workspace) }
  if (tool === 'WebFetch') return { kind: 'web', detail: str('url') }
  if (tool === 'WebSearch') return { kind: 'web', detail: str('query') }
  return { kind: 'other', detail: tool }
}

/**
 * One turn of a command: start (or continue) a session, stream what happens,
 * pass permission questions to the person, stop at the command's own pause.
 */
export class ClaudeCodeRun {
  readonly runId = randomUUID()
  private child: ChildProcessWithoutNullStreams | null = null
  private pending = new Map<string, PendingAsk>()
  private sessionId: string | null = null
  private ended = false

  constructor(
    private readonly workspace: string,
    /** true: Claude Code's "accept edits" mode (file changes inside the folder go ahead). */
    private readonly acceptEdits: boolean,
    private readonly emit: Emit
  ) {}

  start(prompt: string, resumeSessionId?: string): void {
    const bin = findClaude()
    if (!bin) {
      this.fail('Claude Code was not found on this computer.')
      return
    }
    if (resumeSessionId !== undefined && !UUID.test(resumeSessionId)) {
      this.fail('That session can no longer be continued.')
      return
    }

    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--verbose',
      '--permission-prompt-tool=stdio',
      // Never bypassPermissions. acceptEdits only covers file changes inside this folder;
      // the folder's own "ask" rules still ask, and anything outside comes to judge().
      '--permission-mode', this.acceptEdits ? 'acceptEdits' : 'default',
      // Only the workspace's own settings, never the person's global ones.
      '--setting-sources', 'project'
    ]
    if (resumeSessionId) args.push('--resume', resumeSessionId)

    const c = command(bin, args)
    const child = spawn(c.file, c.args, { cwd: this.workspace, env: childEnv(), windowsHide: true, stdio: 'pipe' })
    this.child = child
    this.emit({ type: 'started', runId: this.runId })

    readline.createInterface({ input: child.stdout }).on('line', (line) => this.onLine(line))
    let stderr = ''
    child.stderr.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-2000)
    })
    child.on('error', () => this.fail('Claude Code could not be started.'))
    child.on('exit', (code) => {
      if (!this.ended) this.fail(code === 0 ? 'The run ended without a result.' : `Claude Code stopped (exit ${code}). ${stderr.trim().split('\n').pop() ?? ''}`.trim())
      this.child = null
    })

    this.send({ type: 'control_request', request_id: randomUUID(), request: { subtype: 'initialize' } })
    this.send({ type: 'user', message: { role: 'user', content: prompt }, parent_tool_use_id: null, session_id: '' })
  }

  /** The person's answer to a permission card. */
  answer(requestId: string, allow: boolean): boolean {
    const ask = this.pending.get(requestId)
    if (!ask || ask.kind !== 'permission') return false
    this.pending.delete(requestId)
    this.respond(requestId, allow ? { behavior: 'allow', updatedInput: ask.input } : { behavior: 'deny', message: 'The person chose Deny.' })
    this.emit({ type: 'permissionClosed', runId: this.runId, requestId })
    return true
  }

  /** The person's answers to a question form. */
  answerQuestion(requestId: string, answers: Record<string, string>): boolean {
    const ask = this.pending.get(requestId)
    if (!ask || ask.kind !== 'question') return false
    this.pending.delete(requestId)
    this.respond(requestId, { behavior: 'allow', updatedInput: { ...ask.input, answers } })
    this.emit({ type: 'permissionClosed', runId: this.runId, requestId })
    return true
  }

  cancel(): void {
    if (!this.child) return
    this.send({ type: 'control_request', request_id: randomUUID(), request: { subtype: 'interrupt' } })
    const child = this.child
    setTimeout(() => {
      if (!child.killed && child.exitCode === null) child.kill()
    }, 3000)
  }

  get running(): boolean {
    return this.child !== null && !this.ended
  }

  private send(message: unknown): void {
    if (this.child && this.child.stdin.writable) this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private respond(requestId: string, response: Record<string, unknown>): void {
    this.send({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } })
  }

  private fail(message: string): void {
    if (this.ended) return
    this.ended = true
    this.emit({ type: 'failed', runId: this.runId, message })
  }

  private onLine(line: string): void {
    let m: Record<string, unknown>
    try {
      m = JSON.parse(line) as Record<string, unknown>
    } catch {
      return
    }

    if (m['type'] === 'system' && m['subtype'] === 'init' && typeof m['session_id'] === 'string') {
      this.sessionId = m['session_id']
      this.emit({ type: 'session', runId: this.runId, sessionId: this.sessionId })
      return
    }

    if (m['type'] === 'control_request') this.onControl(m)
    else if (m['type'] === 'control_cancel_request' && typeof m['request_id'] === 'string') {
      if (this.pending.delete(m['request_id'])) {
        this.emit({ type: 'permissionClosed', runId: this.runId, requestId: m['request_id'] })
      }
    } else if (m['type'] === 'assistant') this.onAssistant(m)
    else if (m['type'] === 'result') {
      this.ended = true
      this.emit({
        type: 'finished',
        runId: this.runId,
        sessionId: typeof m['session_id'] === 'string' ? m['session_id'] : this.sessionId,
        result: typeof m['result'] === 'string' ? m['result'] : '',
        isError: m['is_error'] === true
      })
      // One turn per process; the next turn resumes the same session.
      this.child?.stdin.end()
    }
  }

  private onAssistant(m: Record<string, unknown>): void {
    const content = (m['message'] as { content?: unknown } | undefined)?.content
    if (!Array.isArray(content)) return
    for (const block of content as Record<string, unknown>[]) {
      if (block['type'] === 'tool_use' && typeof block['name'] === 'string') {
        this.emit({ type: 'tool', runId: this.runId, tool: block['name'] })
      } else if (block['type'] === 'text' && typeof block['text'] === 'string') {
        this.emit({ type: 'text', runId: this.runId, text: block['text'] })
      }
    }
  }

  private onControl(m: Record<string, unknown>): void {
    const requestId = m['request_id']
    const request = m['request'] as Record<string, unknown> | undefined
    if (typeof requestId !== 'string' || !request) return

    if (request['subtype'] !== 'can_use_tool') {
      // Nothing else is supported; say so instead of leaving the CLI waiting.
      this.send({ type: 'control_response', response: { subtype: 'error', request_id: requestId, error: 'Not supported by this app.' } })
      return
    }

    const tool = typeof request['tool_name'] === 'string' ? request['tool_name'] : 'unknown'
    const input = (typeof request['input'] === 'object' && request['input'] !== null ? request['input'] : {}) as Record<string, unknown>
    if (tool === 'AskUserQuestion') {
      this.pending.set(requestId, { input, kind: 'question' })
      this.emit({ type: 'question', runId: this.runId, ask: { requestId, questions: readQuestions(input) } })
      return
    }

    const verdict = judge(tool, input, this.workspace)
    const { detail, kind } = describe(tool, input, this.workspace)

    if (verdict.decision === 'deny') {
      this.respond(requestId, { behavior: 'deny', message: `The ${APP_NAME} app never allows this (${verdict.reason}).` })
      this.emit({ type: 'denied', runId: this.runId, detail, reason: verdict.reason })
      return
    }

    this.pending.set(requestId, { input, kind: 'permission' })
    this.emit({ type: 'permission', runId: this.runId, ask: { requestId, tool, detail, kind } })
  }
}
