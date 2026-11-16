import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import readline from 'node:readline'
import { APP_NAME } from '../../shared/app-info'
import type { KeyInfo } from '../../shared/api-key'
import type { EngineSet, EngineStatus, PermissionAsk, Question, RunEvent } from '../../shared/engine'
import { apiKeyEnv, childEnv } from './env'
import { findClaude, parseVersion, versionAtLeast, type ClaudeBinary } from './find'
import { indeedTool, judge } from './policy'

// Engine 1, "Your Claude Code": the person's own installed and signed-in CLI,
// run in the background. The app never reads, stores or handles the login.

/** First release that rejects the compromised eMudhra certificate chains. */
export const MIN_VERSION = '2.1.310'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

/** Both engines need the Claude Code program: installed and recent enough. */
async function probeProgram(): Promise<{ bin: ClaudeBinary | null; status: EngineStatus }> {
  const base: EngineStatus = { engine: 'claude-code', state: 'notFound', minVersion: MIN_VERSION }
  const bin = findClaude()
  if (!bin) return { bin: null, status: base }
  let version: string | null
  try {
    version = parseVersion(await run(bin, ['--version']))
  } catch {
    return { bin, status: { ...base, state: 'error' } }
  }
  if (!version) return { bin, status: { ...base, state: 'error' } }
  if (!versionAtLeast(version, MIN_VERSION)) return { bin, status: { ...base, state: 'outdated', version } }
  return { bin, status: { ...base, state: 'ready', version } }
}

/**
 * Both engines at once. "Your Claude Code" also needs the sign-in; "Anthropic API key" needs a
 * saved key instead (the program runs with the key, signed in or not).
 */
export async function detectAll(active: EngineSet['active'], key: KeyInfo): Promise<EngineSet> {
  const { bin, status } = await probeProgram()
  const apiKey: EngineStatus = { ...status, engine: 'api-key', key }
  if (status.state === 'ready' && !key.saved) apiKey.state = 'noKey'
  const claudeCode = bin && status.state === 'ready' ? await signedIn(bin, status) : status
  return { active, claudeCode, apiKey }
}

async function signedIn(bin: ClaudeBinary, base: EngineStatus): Promise<EngineStatus> {
  const version = base.version
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
  const indeed = indeedTool(tool)
  if (indeed) {
    // Plain words: which Indeed lookup, and for what.
    const about = Object.values(input).filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length < 200).join(', ')
    return { kind: 'other', detail: about ? `Indeed ${indeed}: ${about}` : `Indeed ${indeed}` }
  }
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
    /**
     * acceptEdits: Claude Code's "accept edits" mode (file changes inside the folder go ahead).
     * allowWeb: web pages and searches go ahead without a card.
     */
    /** apiKey: run on the "Anthropic API key" engine with this key (main process only). */
    private readonly options: { acceptEdits: boolean; allowWeb: boolean; autoApprove?: boolean; command?: string; settingsFile?: string; apiKey?: string },
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
      '--permission-mode', this.options.acceptEdits ? 'acceptEdits' : 'default',
      // Only the workspace's own settings, never the person's global ones.
      '--setting-sources', 'project'
    ]
    // The app's own settings on top (hooks off). A file path, not inline JSON, so cmd.exe can't mangle it.
    if (this.options.settingsFile) args.push('--settings', this.options.settingsFile)
    if (resumeSessionId) args.push('--resume', resumeSessionId)

    const c = command(bin, args)
    const env = this.options.apiKey ? apiKeyEnv(this.options.apiKey) : childEnv()
    const child = spawn(c.file, c.args, { cwd: this.workspace, env, windowsHide: true, stdio: 'pipe' })
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
        isError: m['is_error'] === true,
        // What this turn cost, as Claude Code reports it; counted only for the API-key engine.
        ...(typeof m['total_cost_usd'] === 'number' ? { costUsd: m['total_cost_usd'] } : {})
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

    const verdict = judge(tool, input, this.workspace, { allowWeb: this.options.allowWeb, autoApprove: this.options.autoApprove, command: this.options.command })
    const { detail, kind } = describe(tool, input, this.workspace)

    if (verdict.decision === 'allow') {
      this.respond(requestId, { behavior: 'allow', updatedInput: input })
      return
    }

    if (verdict.decision === 'deny') {
      this.respond(requestId, { behavior: 'deny', message: verdict.reason === 'indeedResume' ? `The ${APP_NAME} app never lets a command read the person's Indeed resume. Do not retry it; continue without it.` : verdict.reason === 'indeedCompany' ? `The ${APP_NAME} app only allows Indeed company details while drafting an application. Continue without them.` : `The ${APP_NAME} app never allows this (${verdict.reason}).` })
      this.emit({ type: 'denied', runId: this.runId, detail, reason: verdict.reason })
      return
    }

    this.pending.set(requestId, { input, kind: 'permission' })
    this.emit({ type: 'permission', runId: this.runId, ask: { requestId, tool, detail, kind } })
  }
}
