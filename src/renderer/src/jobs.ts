import type { PermissionAsk, QuestionAsk, RunEvent } from '../../shared/engine'

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

export function newJob(id: string, input: string, runId: string): Job {
  return {
    id,
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
    asksToProceed: false
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
      const score = parseScore(event.result)
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
        verdict: parseVerdict(event.result) ?? job.verdict,
        asksToProceed: asksToProceed(event.result)
      }
    }
    case 'failed':
      return { ...job, runId: null, phase: 'failed', error: event.message, asks: [], questions: [] }
  }
}
