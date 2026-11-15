import { execFile } from 'node:child_process'
import { lstatSync, readdirSync } from 'node:fs'
import os from 'node:os'
import { FRAMEWORKS, type NewFolderResult, type Region } from '../shared/framework.ts'
import { MIN_GIT } from '../shared/health.ts'
import { childEnv } from './engine/env.ts'
import { findProgram, parseVersion, versionAtLeast } from './engine/find.ts'

// "Set up a new folder": copies the job-search framework into an empty folder the person picked,
// at a pinned commit. The one time the app writes files itself. Git safety rules:
// - git is found by full path (never inside the target folder) and started without a shell;
// - only fixed arguments; the address and commit come from FRAMEWORKS, the path from the dialog;
// - `--` before every path; no submodules, whatever the person's own Git config says
//   (Git advisory GHSA-vp2w-7xxj-jvxr, 2026-11-10: recursive clones can run code);
// - on Windows, the Windows certificate store (schannel), which rejects the compromised
//   eMudhra chains; no password prompts;
// - the folder must be empty, checked again right before copying;
// - afterwards uploads to GitHub are turned off for the folder (push address DISABLED).
// If the copy stops halfway, nothing is deleted: the person is told and decides.

export interface GitResult {
  code: number | null
  out: string
}

export interface NewFolderDeps {
  findGit: (notInside: string) => string | null
  run: (git: string, args: string[], timeoutMs: number) => Promise<GitResult>
  /** null: the path is missing, not a folder, or a link. */
  entries: (folder: string) => string[] | null
  platform: NodeJS.Platform
}

function realRun(git: string, args: string[], timeoutMs: number): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      git,
      args,
      {
        cwd: os.tmpdir(),
        env: { ...childEnv(), GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        shell: false
      },
      (err, stdout, stderr) => {
        const out = `${stdout ?? ''}\n${stderr ?? ''}`.trim().slice(-2000)
        if (err && typeof (err as NodeJS.ErrnoException).code === 'string') return resolve({ code: null, out })
        resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, out })
      }
    )
  })
}

function realEntries(folder: string): string[] | null {
  try {
    const st = lstatSync(folder)
    if (!st.isDirectory() || st.isSymbolicLink()) return null
    return readdirSync(folder)
  } catch {
    return null
  }
}

export const defaultNewFolderDeps: NewFolderDeps = {
  findGit: (notInside) => findProgram([process.platform === 'win32' ? 'git.exe' : 'git'], notInside),
  run: realRun,
  entries: realEntries,
  platform: process.platform
}

/** True when the folder exists, is a real folder (not a link) and holds nothing at all. */
export function isEmptyFolder(folder: string, deps: Pick<NewFolderDeps, 'entries'> = defaultNewFolderDeps): boolean {
  const list = deps.entries(folder)
  return list !== null && list.length === 0
}

/** Options every Git call gets. */
export function gitBase(platform: NodeJS.Platform): string[] {
  const base = ['-c', 'submodule.recurse=false', '-c', 'protocol.file.allow=never', '-c', 'core.hooksPath=']
  if (platform === 'win32') base.push('-c', 'http.sslBackend=schannel')
  return base
}

const CLONE_TIMEOUT = 10 * 60_000
const STEP_TIMEOUT = 60_000

export async function setupFolder(target: string, region: Region, deps: NewFolderDeps = defaultNewFolderDeps): Promise<NewFolderResult> {
  const pin = FRAMEWORKS[region]
  const git = deps.findGit(target)
  if (!git) return { ok: false, problem: 'noGit', partial: false }
  const version = parseVersion((await deps.run(git, ['--version'], STEP_TIMEOUT)).out)
  if (!version) return { ok: false, problem: 'noGit', partial: false }
  if (!versionAtLeast(version, MIN_GIT)) return { ok: false, problem: 'oldGit', partial: false }

  // Checked again right before copying: the folder may have changed since it was picked.
  if (!isEmptyFolder(target, deps)) return { ok: false, problem: 'notEmpty', partial: false }

  const base = gitBase(deps.platform)
  const partial = (): boolean => (deps.entries(target)?.length ?? 0) > 0

  const clone = await deps.run(git, [...base, 'clone', '--no-recurse-submodules', '--quiet', '--', pin.url, target], CLONE_TIMEOUT)
  if (clone.code !== 0) return { ok: false, problem: 'cloneFailed', partial: partial() }

  const reset = await deps.run(git, [...base, '-C', target, 'reset', '--quiet', '--hard', pin.commit, '--'], STEP_TIMEOUT)
  if (reset.code !== 0) return { ok: false, problem: 'pinFailed', partial: true }

  const push = await deps.run(git, [...base, '-C', target, 'remote', 'set-url', '--push', 'origin', 'DISABLED'], STEP_TIMEOUT)
  if (push.code !== 0) return { ok: false, problem: 'pinFailed', partial: true }

  return { ok: true, path: target }
}
