// "Set up a new folder": which copy of the job-search framework to make, pinned to a commit
// tested with this Shortlist release. Re-pin both right before tagging a release.
// The addresses are fixed here; the screens only ever pass a region.

export const REGIONS = ['uae', 'elsewhere'] as const
export type Region = (typeof REGIONS)[number]

export interface FrameworkPin {
  url: string
  /** Full commit hash the new folder is set to. */
  commit: string
}

export const FRAMEWORKS: Record<Region, FrameworkPin> = {
  // The UAE edition (fork), master as of 2026-11-16 (adds tools/outcome_state.py for Update status).
  uae: { url: 'https://github.com/HamzaBTW/ai-job-search.git', commit: '128ab5c2b5f7045573732e61252305879622be9d' },
  // The original, v1.7.x master as of 2026-11-14 (kept for v0.1.0; v2.0.0 moved the portal skills out).
  elsewhere: { url: 'https://github.com/ai-job-search-dev/ai-job-search.git', commit: '0d0d1a907a21454affa1b694acc4e2c5008a0d21' }
}

export function isRegion(value: unknown): value is Region {
  return typeof value === 'string' && (REGIONS as readonly string[]).includes(value)
}

/** Why setting up a new folder stopped. 'partial' means files were copied before it stopped. */
export type SetupProblem = 'noFolder' | 'notEmpty' | 'noGit' | 'oldGit' | 'cloneFailed' | 'pinFailed' | 'checkFailed' | 'busy'

export type NewFolderResult =
  | { ok: true; path: string }
  | { ok: false; problem: SetupProblem; partial: boolean }
