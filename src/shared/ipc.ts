// The only bridge between the screens (renderer) and the main process.
// Everything the screens can ask for is listed here; nothing else is exposed.

import type { ContinueRun, EngineStatus, RunEvent, StartRun } from './engine'
import type { Pick, SearchData } from './search'
import type { TrackerData } from './tracker'

export const THEME_CHOICES = ['system', 'midnight', 'light-relax'] as const
export type ThemeChoice = (typeof THEME_CHOICES)[number]

export interface Settings {
  theme: ThemeChoice
  guide: boolean
  /**
   * Ask before every file change inside the folder. Off: changes inside the
   * folder go ahead (the folder's own "ask" rules and the app's refusals still apply).
   */
  askEveryChange: boolean
  /** Ask before every web page or web search. Off: reading the web goes ahead. */
  askWeb: boolean
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system', guide: true, askEveryChange: false, askWeb: false }

export interface AppInfo {
  name: string
  version: string
  platform: 'win32' | 'darwin' | 'linux' | 'other'
}

/** Why a folder is not usable as the workspace. */
export type WorkspaceProblem = 'missing' | 'notFolder' | 'noClaudeMd' | 'noCommands'

export interface WorkspaceStatus {
  path: string
  ok: boolean
  problems: WorkspaceProblem[]
  /** CLAUDE.md no longer holds the template's placeholders. */
  profileFilled: boolean
  hasTracker: boolean
}

export const Channels = {
  appInfo: 'app:info',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  workspaceGet: 'workspace:get',
  workspaceChoose: 'workspace:choose',
  workspaceOpen: 'workspace:open',
  engineDetect: 'engine:detect',
  engineSignIn: 'engine:signIn',
  runStart: 'run:start',
  runContinue: 'run:continue',
  runAnswer: 'run:answer',
  runAnswerQuestion: 'run:answerQuestion',
  runCancel: 'run:cancel',
  jobsList: 'jobs:list',
  jobsSave: 'jobs:save',
  jobsDelete: 'jobs:delete',
  trackerRead: 'tracker:read',
  searchRead: 'search:read',
  picksList: 'picks:list',
  picksSet: 'picks:set',
  openLink: 'link:open',
  /** Main -> screens: progress of the current run. */
  runEvent: 'run:event'
} as const

export type RunStartResult = { ok: true; runId: string } | { ok: false; reason: 'busy' | 'noWorkspace' | 'badInput' }

export interface ShortlistApi {
  appInfo(): Promise<AppInfo>
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  /** The saved folder, checked again now; null if none chosen yet. */
  getWorkspace(): Promise<WorkspaceStatus | null>
  /**
   * Opens the system folder dialog. The folder is saved only if it passes the check.
   * Returns null if the person cancels. The screens never pass a path in.
   */
  chooseWorkspace(): Promise<WorkspaceStatus | null>
  /** Shows the saved folder in Explorer / Finder. */
  openWorkspace(): Promise<void>
  /** Is "Your Claude Code" installed, recent enough and signed in? */
  detectEngine(): Promise<EngineStatus>
  /** Opens Claude Code's own sign-in in a terminal window. */
  signInEngine(): Promise<boolean>
  startRun(request: StartRun): Promise<RunStartResult>
  continueRun(request: ContinueRun): Promise<RunStartResult>
  answerPermission(requestId: string, allow: boolean): Promise<boolean>
  /** answers: question text -> chosen label(s) or the person's own words. */
  answerQuestion(requestId: string, answers: Record<string, string>): Promise<boolean>
  cancelRun(): Promise<void>
  /** Jobs saved for the current folder (the app's own store, not the folder). */
  listJobs(): Promise<unknown[]>
  saveJob(job: unknown): Promise<boolean>
  deleteJob(id: string): Promise<boolean>
  /** The folder's job_search_tracker.csv, read-only. */
  readTracker(): Promise<TrackerData>
  /** Jobs /scrape found and /rank scored (seen_jobs.json, read-only). */
  readSearch(): Promise<SearchData>
  /** "Add to board" / "Hide" decisions on ranked jobs (the app's own store). */
  listPicks(): Promise<Record<string, Pick>>
  setPick(key: string, pick: Pick | null): Promise<boolean>
  /** Opens a web link (http/https only) in the person's own browser. */
  openLink(url: string): Promise<boolean>
  /** Subscribe to run progress; returns an unsubscribe function. */
  onRunEvent(listener: (event: RunEvent) => void): () => void
}

/** Keeps only known keys with valid values; anything else is dropped. */
export function cleanSettings(input: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const out: Settings = { ...base }
  if (typeof input !== 'object' || input === null) return out
  const raw = input as Record<string, unknown>
  if (typeof raw.theme === 'string' && (THEME_CHOICES as readonly string[]).includes(raw.theme)) {
    out.theme = raw.theme as ThemeChoice
  }
  if (typeof raw.guide === 'boolean') out.guide = raw.guide
  if (typeof raw.askEveryChange === 'boolean') out.askEveryChange = raw.askEveryChange
  if (typeof raw.askWeb === 'boolean') out.askWeb = raw.askWeb
  return out
}
