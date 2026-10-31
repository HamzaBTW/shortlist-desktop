import { statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Finds the person's own Claude Code. Desktop apps on macOS don't get the
// shell's PATH, so the usual install folders are checked as well.

function exists(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

export function candidateDirs(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string[] {
  const sep = platform === 'win32' ? ';' : ':'
  const fromPath = (env['PATH'] ?? env['Path'] ?? '').split(sep).filter(Boolean)
  const home = os.homedir()
  const extra =
    platform === 'win32'
      ? [path.join(home, '.local', 'bin'), env['APPDATA'] ? path.join(env['APPDATA'], 'npm') : '']
      : [path.join(home, '.local', 'bin'), path.join(home, '.claude', 'local'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']
  return [...new Set([...fromPath, ...extra].filter(Boolean))]
}

export interface ClaudeBinary {
  path: string
  /** A Windows .cmd shim has to be started through cmd.exe. */
  viaCmd: boolean
}

export function findClaude(env: NodeJS.ProcessEnv = process.env, platform = process.platform): ClaudeBinary | null {
  const names = platform === 'win32' ? ['claude.exe', 'claude.cmd'] : ['claude']
  for (const dir of candidateDirs(env, platform)) {
    for (const name of names) {
      const p = path.join(dir, name)
      if (exists(p)) return { path: p, viaCmd: name.endsWith('.cmd') }
    }
  }
  return null
}

/** "2.1.316 (Claude Code)" -> "2.1.316" */
export function parseVersion(text: string): string | null {
  return /(\d+)\.(\d+)\.(\d+)/.exec(text)?.[0] ?? null
}

export function versionAtLeast(version: string, min: string): boolean {
  const a = version.split('.').map(Number)
  const b = min.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }
  return true
}
