// The only bridge between the screens (renderer) and the main process.
// Everything the screens can ask for is listed here; nothing else is exposed.

import type { ContinueRun, EngineStatus, RunEvent, StartRun } from './engine'

export const THEME_CHOICES = ['system', 'midnight', 'light-relax'] as const
export type ThemeChoice = (typeof THEME_CHOICES)[number]

export interface Settings {
  theme: ThemeChoice
  guide: boolean
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system', guide: true }

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
  runCancel: 'run:cancel',
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
  cancelRun(): Promise<void>
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
  return out
}
