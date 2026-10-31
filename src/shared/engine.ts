// What the screens know about AI engines and runs. Engine-neutral on purpose:
// the screens never talk to a specific CLI (design system: Engine interface).

export type EngineId = 'claude-code' | 'api-key' | 'codex'

export type EngineState =
  | 'checking'
  | 'ready'
  | 'notFound'
  | 'signedOut'
  | 'outdated'
  | 'error'

export interface EngineStatus {
  engine: EngineId
  state: EngineState
  version?: string
  minVersion?: string
}

/** Commands the screens may start. Anything else is refused by the main process. */
export const RUNNABLE_COMMANDS = ['apply', 'outcome', 'scrape', 'rank'] as const
/** Commands that run with nothing after them. */
export const NO_INPUT_COMMANDS: readonly RunnableCommand[] = ['scrape', 'rank']
export type RunnableCommand = (typeof RUNNABLE_COMMANDS)[number]

export interface StartRun {
  command: RunnableCommand
  /** For /apply: a job link or the posting text. For /outcome: company, role and what happened. */
  input: string
}

export interface ContinueRun {
  sessionId: string
  /** The person's reply, e.g. "Yes, proceed". */
  reply: string
}

export interface PermissionAsk {
  requestId: string
  tool: string
  /** Plain-words description: the command, the file, or the address. */
  detail: string
  kind: 'command' | 'write' | 'web' | 'other'
}

export interface QuestionOption {
  label: string
  description: string
}

export interface Question {
  question: string
  header: string
  options: QuestionOption[]
  multiSelect: boolean
}

/** A question the command asks mid-run (Claude Code's AskUserQuestion), shown as a form. */
export interface QuestionAsk {
  requestId: string
  questions: Question[]
}

export type RunEvent =
  | { type: 'started'; runId: string }
  | { type: 'session'; runId: string; sessionId: string }
  | { type: 'tool'; runId: string; tool: string }
  | { type: 'text'; runId: string; text: string }
  | { type: 'permission'; runId: string; ask: PermissionAsk }
  | { type: 'question'; runId: string; ask: QuestionAsk }
  | { type: 'permissionClosed'; runId: string; requestId: string }
  | { type: 'denied'; runId: string; detail: string; reason: string }
  | { type: 'finished'; runId: string; sessionId: string | null; result: string; isError: boolean }
  | { type: 'failed'; runId: string; message: string }
