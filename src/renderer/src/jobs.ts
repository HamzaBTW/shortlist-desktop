import type { PermissionAsk, QuestionAsk, RunEvent } from '../../shared/engine'
import type { TrackerRow } from '../../shared/tracker'

// A job the person added, and how run events change it. Kept in memory for now;
// the app's own SQLite store comes later. The workspace files stay the source of truth.

export type StepKey = 'start' | 'reading' | 'posting' | 'web' | 'checking' | 'writing' | 'thinking'

export type Phase = 'running' | 'waiting' | 'notNow' | 'failed'

export type Verdict = 'strong' | 'moderate' | 'weak'

export interface Job {
  id: string
  input: string
  title: string
  runId: string | null
  sessionId: string | null
  phase: Phase
  steps: StepKey[]
  asks: PermissionAsk[]
  questions: QuestionAsk[]
  denied: { detail: string; reason: string }[]
  /** The text the command ended its last turn with. */
  result: string
  error: string | null
  score: number | null
  verdict: Verdict | null
  /** The last turn stopped at /apply's "Should I proceed with drafting…?" */
  asksToProceed: boolean
  /** The tracker row (company|role) this job's run added or changed, once known. */
  trackerKey: string | null
  createdAt: number
  /**
   * 'apply': a board card. 'outcome': a status update. 'search': Find new jobs
   * (/scrape, then /rank), shown on the Search & rank screen.
   */
  kind: 'apply' | 'outcome' | 'search' | 'setup'
  /** For a search: which of its two commands is (or was last) running. */
  stage?: 'scrape' | 'rank' | 'close'
  /** For an application started from a ranked job: that job's key. */
  rankedKey?: string
  /** For a status update: the row (company|role) being updated. */
  target?: string
  /** PDFs (cv/..., cover_letters/...) this job's runs wrote, as relative paths. */
  documents?: string[]
}

const TOOL_STEPS: Record<string, StepKey> = {
  Read: 'reading',
  Glob: 'reading',
  Grep: 'reading',
  Agent: 'posting',
  Task: 'posting',
  WebFetch: 'web',
  WebSearch: 'web',
  Bash: 'checking',
  PowerShell: 'checking',
  Write: 'writing',
  Edit: 'writing',
  MultiEdit: 'writing'
}

export function stepFor(tool: string): StepKey {
  return TOOL_STEPS[tool] ?? 'thinking'
}

/** A short name for the card: the site for a link, the first line for pasted text. */
export function titleFor(input: string): string {
  const text = input.trim()
  try {
    const url = new URL(text)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.hostname.replace(/^www\./, '')
  } catch {
    // Not a link.
  }
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? text
  return first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first
}

/** The overall fit score as 0-100, from "57/100", "Fit score: 7.5/10" and the like. */
export function parseScore(text: string): number | null {
  const near = /fit score[^\d\n]{0,40}(\d{1,3}(?:\.\d+)?)\s*\/\s*(100|10)\b/i.exec(text)
  const any = near ?? /(\d{1,3}(?:\.\d+)?)\s*\/\s*(100|10)\b/.exec(text)
  if (!any) return null
  const value = Number(any[1])
  const scaled = any[2] === '10' ? value * 10 : value
  if (!Number.isFinite(scaled) || scaled < 0 || scaled > 100) return null
  return Math.round(scaled)
}

export function parseVerdict(text: string): Verdict | null {
  const m = /\b(strong|moderate|weak)\s+fit\b/i.exec(text)
  return m ? (m[1]!.toLowerCase() as Verdict) : null
}

export function asksToProceed(text: string): boolean {
  return /proceed with drafting/i.test(text)
}

export function newJob(
  id: string,
  input: string,
  runId: string,
  createdAt = Date.now(),
  kind: Job['kind'] = 'apply'
): Job {
  return {
    id,
    kind,
    trackerKey: null,
    createdAt,
    input,
    title: titleFor(input),
    runId,
    sessionId: null,
    phase: 'running',
    steps: ['start'],
    asks: [],
    questions: [],
    denied: [],
    result: '',
    error: null,
    score: null,
    verdict: null,
    asksToProceed: false,
    documents: []
  }
}

/** A reply started a new turn of the same job. */
export function continued(job: Job, runId: string): Job {
  return { ...job, runId, phase: 'running', steps: ['start'], asks: [], questions: [], error: null, asksToProceed: false }
}

export function applyEvent(job: Job, event: RunEvent): Job {
  if (job.runId !== event.runId) return job
  switch (event.type) {
    case 'started':
      return job
    case 'session':
      return { ...job, sessionId: event.sessionId }
    case 'tool': {
      const step = stepFor(event.tool)
      return job.steps[job.steps.length - 1] === step ? job : { ...job, steps: [...job.steps, step] }
    }
    case 'text':
      return job.steps[job.steps.length - 1] === 'thinking' ? job : { ...job, steps: [...job.steps, 'thinking'] }
    case 'permission':
      return { ...job, asks: [...job.asks, event.ask] }
    case 'question':
      return { ...job, questions: [...job.questions, event.ask] }
    case 'permissionClosed':
      return {
        ...job,
        asks: job.asks.filter((a) => a.requestId !== event.requestId),
        questions: job.questions.filter((q) => q.requestId !== event.requestId)
      }
    case 'denied':
      return { ...job, denied: [...job.denied, { detail: event.detail, reason: event.reason }] }
    case 'finished': {
      const isApply = (job.kind ?? 'apply') === 'apply'
      const score = isApply ? parseScore(event.result) : null
      return {
        ...job,
        runId: null,
        sessionId: event.sessionId ?? job.sessionId,
        phase: event.isError ? 'failed' : 'waiting',
        result: event.result,
        error: event.isError ? event.result : null,
        asks: [],
        questions: [],
        // Keep the fit-check score once later turns move on to drafting.
        score: score ?? job.score,
        verdict: (isApply ? parseVerdict(event.result) : null) ?? job.verdict,
        asksToProceed: isApply && asksToProceed(event.result)
      }
    }
    case 'documents':
      return { ...job, documents: [...new Set([...(job.documents ?? []), ...event.files])] }
    case 'failed':
      return { ...job, runId: null, phase: 'failed', error: event.message, asks: [], questions: [] }
  }
}

/**
 * A job read back from the app's store. Anything that was mid-run when the app
 * closed is marked stopped; its session can still be continued with a reply.
 */
export function restore(raw: unknown, stoppedMessage: string): Job | null {
  if (typeof raw !== 'object' || raw === null) return null
  const j = raw as Partial<Job>
  if (typeof j.id !== 'string' || typeof j.input !== 'string') return null
  const base = newJob(j.id, j.input, '', typeof j.createdAt === 'number' ? j.createdAt : 0)
  const job: Job = { ...base, ...j, runId: null, asks: [], questions: [] } as Job
  if (job.phase === 'running') return { ...job, phase: 'failed', error: stoppedMessage }
  return job
}

const signature = (r: TrackerRow): string => JSON.stringify({ ...r, id: '' })

/** The tracker row a run added or changed, if any: compares the rows before and after. */
export function changedRow(before: TrackerRow[], after: TrackerRow[]): string | null {
  const seen = new Set(before.map(signature))
  const changed = after.filter((r) => !seen.has(signature(r)))
  return changed.length > 0 ? changed[changed.length - 1]!.matchKey : null
}
