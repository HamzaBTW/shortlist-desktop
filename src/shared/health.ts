// The "This computer" checklist: the free tools the job-search commands use.
// The app only checks; it never installs anything. Every row is a warning, never a block:
// the blocking checks (Claude Code and the folder) have their own panels.

export const TOOLS = ['python', 'bun', 'git', 'lualatex', 'xelatex', 'pypdf', 'poppler'] as const
export type Tool = (typeof TOOLS)[number]

/**
 * ok: found and good enough. missing: not found. old: below the minimum version.
 * limited: found, but part of what the commands need is missing (Poppler without -bbox
 * or pdftoppm, or a Poppler release that breaks -bbox). needsPython: pypdf can't be checked.
 */
export type ToolState = 'ok' | 'missing' | 'old' | 'limited' | 'needsPython'

export interface ToolCheck {
  tool: Tool
  state: ToolState
  version?: string
  /** For 'limited': which part is missing. */
  reason?: 'noBbox' | 'brokenBbox' | 'noPdftoppm'
}

/** Python 3.10+: the framework's own requirement (SETUP.md). */
export const MIN_PYTHON = '3.10.0'
/** Git 2.50.1 fixes every Git flaw with a fix (July 2025 clone flaws included). Chosen 2026-11-14. */
export const MIN_GIT = '2.50.1'

type Platform = 'win32' | 'darwin' | 'linux' | 'other'

/** Official install pages for "Show me how". Checked 2026-11-14. */
export function howToLink(tool: Tool, platform: Platform): string {
  switch (tool) {
    case 'python':
      return 'https://www.python.org/downloads/'
    case 'bun':
      return 'https://bun.sh/docs/installation'
    case 'git':
      return 'https://git-scm.com/install/'
    case 'lualatex':
    case 'xelatex':
      return platform === 'win32' ? 'https://miktex.org/download' : platform === 'darwin' ? 'https://tug.org/mactex/' : 'https://tug.org/texlive/'
    case 'pypdf':
      return 'https://pypdf.readthedocs.io/en/stable/user/installation.html'
    case 'poppler':
      return platform === 'win32' ? 'https://github.com/oschwartz10612/poppler-windows/releases' : 'https://poppler.freedesktop.org/'
  }
}

/** Claude Code's own install page, for the engine panel's "Show me how". */
export const CLAUDE_CODE_SETUP = 'https://code.claude.com/docs/en/setup'

export function needsAttention(checks: ToolCheck[] | null): boolean {
  return checks !== null && checks.some((c) => c.state !== 'ok')
}
