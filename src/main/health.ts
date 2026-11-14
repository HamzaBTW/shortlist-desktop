import { execFile } from 'node:child_process'
import { statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MIN_GIT, MIN_PYTHON, type ToolCheck } from '../shared/health.ts'
import { childEnv } from './engine/env.ts'
import { findAllPrograms, parseVersion, versionAtLeast } from './engine/find.ts'

// "This computer": checks the free tools the job-search commands use. It never installs or
// changes anything. Programs are found by full path (never a bare name, never inside the
// job-search folder), started without a shell, from the temp folder, with fixed arguments only.

export interface RunResult {
  /** null: the program could not be started. */
  code: number | null
  /** stdout and stderr together: some tools print their version to stderr. */
  out: string
}

export interface HealthDeps {
  run: (file: string, args: string[]) => Promise<RunResult>
  find: (names: string[]) => string[]
  isFile: (p: string) => boolean
  platform: NodeJS.Platform
}

function realRun(file: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { cwd: os.tmpdir(), env: childEnv(), timeout: 15_000, windowsHide: true, maxBuffer: 256 * 1024, shell: false },
      (err, stdout, stderr) => {
        const out = `${stdout ?? ''}\n${stderr ?? ''}`
        if (err && typeof (err as NodeJS.ErrnoException).code === 'string') return resolve({ code: null, out })
        resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, out })
      }
    )
  })
}

function realIsFile(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

export function defaultDeps(workspace: string | null): HealthDeps {
  return {
    run: realRun,
    find: (names) => findAllPrograms(names, workspace),
    isFile: realIsFile,
    platform: process.platform
  }
}

const exe = (name: string, platform: NodeJS.Platform): string => (platform === 'win32' ? `${name}.exe` : name)

interface Python {
  file: string
  /** ["-3"] for the Windows py launcher. */
  prefix: string[]
  version: string
}

/**
 * The first Python that answers with a version, preferring one that is new enough.
 * The Windows Store "python.exe" stand-in prints no version and is skipped.
 */
async function findPython(deps: HealthDeps): Promise<{ best: Python | null; anyOld: Python | null }> {
  const candidates: { file: string; prefix: string[] }[] =
    deps.platform === 'win32'
      ? [...deps.find(['python.exe']).map((file) => ({ file, prefix: [] })), ...deps.find(['py.exe']).map((file) => ({ file, prefix: ['-3'] }))]
      : deps.find(['python3', 'python']).map((file) => ({ file, prefix: [] }))
  let anyOld: Python | null = null
  for (const c of candidates) {
    const r = await deps.run(c.file, [...c.prefix, '--version'])
    const m = /Python\s+(\d+\.\d+(?:\.\d+)?)/.exec(r.out)
    if (r.code !== 0 || !m?.[1]) continue
    const version = m[1].split('.').length === 2 ? `${m[1]}.0` : m[1]
    const py = { ...c, version }
    if (versionAtLeast(version, MIN_PYTHON)) return { best: py, anyOld }
    anyOld ??= py
  }
  return { best: null, anyOld }
}

async function versionOf(deps: HealthDeps, names: string[], args: string[]): Promise<{ found: boolean; version: string | null }> {
  const files = deps.find(names)
  for (const file of files) {
    const r = await deps.run(file, args)
    const version = parseVersion(r.out)
    if (r.code === 0 && version) return { found: true, version }
  }
  return { found: files.length > 0, version: null }
}

async function checkPoppler(deps: HealthDeps): Promise<ToolCheck> {
  const candidates = deps.find([exe('pdftotext', deps.platform)])
  if (candidates.length === 0) return { tool: 'poppler', state: 'missing' }
  let firstVersion: string | undefined
  for (const file of candidates) {
    const v = /pdftotext version (\d+\.\d+(?:\.\d+)?)/.exec((await deps.run(file, ['-v'])).out)?.[1]
    firstVersion ??= v
    // Like the framework's verify_layout.py: the first pdftotext whose help lists -bbox.
    const help = await deps.run(file, ['-h'])
    if (!help.out.includes('-bbox')) continue
    const [major, minor] = (v ?? '0.0').split('.').map(Number)
    // Poppler 26.00 to 26.04 abort -bbox on some PDFs (fixed in 26.05).
    if (major === 26 && (minor ?? 0) < 5) return { tool: 'poppler', state: 'limited', reason: 'brokenBbox', version: v }
    const sameDir = path.join(path.dirname(file), exe('pdftoppm', deps.platform))
    const hasPdftoppm = deps.isFile(sameDir) || deps.find([exe('pdftoppm', deps.platform)]).length > 0
    if (!hasPdftoppm) return { tool: 'poppler', state: 'limited', reason: 'noPdftoppm', version: v }
    return { tool: 'poppler', state: 'ok', version: v }
  }
  return { tool: 'poppler', state: 'limited', reason: 'noBbox', version: firstVersion }
}

export async function checkComputer(deps: HealthDeps): Promise<ToolCheck[]> {
  const pythonP = findPython(deps)

  const python = (async (): Promise<ToolCheck> => {
    const { best, anyOld } = await pythonP
    if (best) return { tool: 'python', state: 'ok', version: best.version }
    if (anyOld) return { tool: 'python', state: 'old', version: anyOld.version }
    return { tool: 'python', state: 'missing' }
  })()

  const pypdf = (async (): Promise<ToolCheck> => {
    const { best, anyOld } = await pythonP
    const py = best ?? anyOld
    if (!py) return { tool: 'pypdf', state: 'needsPython' }
    // -I: isolated, so nothing in the current folder can be imported instead of the real package.
    const r = await deps.run(py.file, [...py.prefix, '-I', '-c', 'import pypdf,sys;sys.stdout.write(pypdf.__version__)'])
    const version = /^\s*(\d+(?:\.\d+)*)/.exec(r.out)?.[1]
    return r.code === 0 && version ? { tool: 'pypdf', state: 'ok', version } : { tool: 'pypdf', state: 'missing' }
  })()

  const bun = (async (): Promise<ToolCheck> => {
    const r = await versionOf(deps, [exe('bun', deps.platform)], ['--version'])
    return r.version ? { tool: 'bun', state: 'ok', version: r.version } : { tool: 'bun', state: 'missing' }
  })()

  const git = (async (): Promise<ToolCheck> => {
    const r = await versionOf(deps, [exe('git', deps.platform)], ['--version'])
    if (!r.version) return { tool: 'git', state: 'missing' }
    return { tool: 'git', state: versionAtLeast(r.version, MIN_GIT) ? 'ok' : 'old', version: r.version }
  })()

  // LaTeX: found on PATH is enough. Starting it can wake MiKTeX's update prompts.
  const latex = (name: 'lualatex' | 'xelatex'): ToolCheck => ({
    tool: name,
    state: deps.find([exe(name, deps.platform)]).length > 0 ? 'ok' : 'missing'
  })

  return Promise.all([python, bun, git, Promise.resolve(latex('lualatex')), Promise.resolve(latex('xelatex')), pypdf, checkPoppler(deps)])
}
