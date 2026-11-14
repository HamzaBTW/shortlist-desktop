import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { checkComputer, type HealthDeps, type RunResult } from '../src/main/health.ts'
import { findAllPrograms, findProgram } from '../src/main/engine/find.ts'
import { howToLink, needsAttention, TOOLS, type ToolCheck } from '../src/shared/health.ts'

type Answers = Record<string, RunResult | ((args: string[]) => RunResult)>

/** A pretend computer: which programs exist (by file name) and what each one prints. */
function fake(programs: Record<string, string[]>, answers: Answers, platform: NodeJS.Platform = 'win32'): HealthDeps & { calls: [string, string[]][] } {
  const calls: [string, string[]][] = []
  return {
    calls,
    platform,
    find: (names) => names.flatMap((n) => programs[n] ?? []),
    isFile: (p) => Object.values(programs).some((list) => list.includes(p)),
    run: async (file, args) => {
      calls.push([file, args])
      const a = answers[`${file} ${args.join(' ')}`] ?? answers[file]
      if (!a) return { code: null, out: '' }
      return typeof a === 'function' ? a(args) : a
    }
  }
}

const ok = (out: string): RunResult => ({ code: 0, out })
const byTool = (checks: ToolCheck[]): Record<string, ToolCheck> => Object.fromEntries(checks.map((c) => [c.tool, c]))

const PY = 'C:\\Python\\bin\\python.exe'
const STORE = 'C:\\Users\\sam\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe'
const POP = 'C:\\Tools\\poppler\\bin\\pdftotext.exe'
const GITPDF = 'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe'

function healthyComputer(): HealthDeps & { calls: [string, string[]][] } {
  return fake(
    {
      'python.exe': [PY],
      'bun.exe': ['C:\\bun\\bun.exe'],
      'git.exe': ['C:\\Git\\cmd\\git.exe'],
      'lualatex.exe': ['C:\\MiKTeX\\lualatex.exe'],
      'xelatex.exe': ['C:\\MiKTeX\\xelatex.exe'],
      'pdftotext.exe': [POP],
      'pdftoppm.exe': ['C:\\Tools\\poppler\\bin\\pdftoppm.exe']
    },
    {
      [`${PY} --version`]: ok('Python 3.15.1'),
      [`${PY} -I -c import pypdf,sys;sys.stdout.write(pypdf.__version__)`]: ok('6.1.3'),
      'C:\\bun\\bun.exe --version': ok('1.4.4'),
      'C:\\Git\\cmd\\git.exe --version': ok('git version 2.51.0.windows.1'),
      [`${POP} -v`]: ok('pdftotext version 26.09.0\nCopyright 2005-2026 The Poppler Developers'),
      [`${POP} -h`]: ok('Usage: pdftotext [options] <PDF-file> [<text-file>]\n  -bbox  : output bounding box for each word')
    }
  )
}

test('a healthy computer: every row ready, with versions', async () => {
  const checks = await checkComputer(healthyComputer())
  assert.deepEqual(
    checks.map((c) => c.tool),
    [...TOOLS]
  )
  const t = byTool(checks)
  for (const tool of TOOLS) assert.equal(t[tool]?.state, 'ok', tool)
  assert.equal(t.python?.version, '3.15.1')
  assert.equal(t.git?.version, '2.51.0')
  assert.equal(t.poppler?.version, '26.09.0')
  assert.equal(t.pypdf?.version, '6.1.3')
  assert.equal(needsAttention(checks), false)
})

test('nothing installed: every row missing, pypdf waits for Python, nothing is started', async () => {
  const deps = fake({}, {})
  const t = byTool(await checkComputer(deps))
  for (const tool of ['python', 'bun', 'git', 'lualatex', 'xelatex', 'poppler']) assert.equal(t[tool]?.state, 'missing', tool)
  assert.equal(t.pypdf?.state, 'needsPython')
  assert.equal(deps.calls.length, 0)
})

test('the Windows Store python.exe stand-in is skipped for the real Python behind it', async () => {
  const deps = fake(
    { 'python.exe': [STORE, PY] },
    {
      [`${STORE} --version`]: { code: 9009, out: 'Python was not found; run without arguments to install from the Microsoft Store' },
      [`${PY} --version`]: ok('Python 3.12.4')
    }
  )
  const t = byTool(await checkComputer(deps))
  assert.equal(t.python?.state, 'ok')
  assert.equal(t.python?.version, '3.12.4')
})

test('the py launcher is used with -3 when there is no python.exe', async () => {
  const py = 'C:\\Windows\\py.exe'
  const deps = fake({ 'py.exe': [py] }, { [`${py} -3 --version`]: ok('Python 3.11.9'), [`${py} -3 -I -c import pypdf,sys;sys.stdout.write(pypdf.__version__)`]: ok('5.0.1') })
  const t = byTool(await checkComputer(deps))
  assert.equal(t.python?.state, 'ok')
  assert.equal(t.pypdf?.state, 'ok')
})

test('old Python and old Git are flagged with their versions', async () => {
  const deps = fake(
    { 'python.exe': [PY], 'git.exe': ['C:\\Git\\git.exe'] },
    { [`${PY} --version`]: ok('Python 3.9.13'), 'C:\\Git\\git.exe --version': ok('git version 2.49.0.windows.1') }
  )
  const t = byTool(await checkComputer(deps))
  assert.deepEqual(t.python, { tool: 'python', state: 'old', version: '3.9.13' })
  assert.deepEqual(t.git, { tool: 'git', state: 'old', version: '2.49.0' })
  // pypdf is still checked with the old Python.
  assert.equal(t.pypdf?.state, 'missing')
})

test('Git 2.50.1 is the minimum', async () => {
  const deps = fake({ 'git.exe': ['C:\\Git\\git.exe'] }, { 'C:\\Git\\git.exe --version': ok('git version 2.50.1') })
  assert.equal(byTool(await checkComputer(deps)).git?.state, 'ok')
})

test("Poppler: Git for Windows' pdftotext without -bbox is passed over for a real Poppler", async () => {
  const deps = healthyComputer()
  const programs = { 'pdftotext.exe': [GITPDF, POP], 'pdftoppm.exe': ['C:\\Tools\\poppler\\bin\\pdftoppm.exe'] }
  deps.find = (names) => names.flatMap((n) => (programs as Record<string, string[]>)[n] ?? [])
  const run = deps.run
  deps.run = async (file, args) => {
    if (file === GITPDF) return args[0] === '-v' ? ok('pdftotext version 4.04 [www.xpdfreader.com]') : { code: 99, out: 'Usage: pdftotext [options]\n  -layout' }
    return run(file, args)
  }
  const t = byTool(await checkComputer(deps))
  assert.deepEqual(t.poppler, { tool: 'poppler', state: 'ok', version: '26.09.0' })
})

test('Poppler: only a build without -bbox, a 26.0x build before 26.05, or no pdftoppm are "limited"', async () => {
  const noBbox = fake({ 'pdftotext.exe': [GITPDF] }, { [`${GITPDF} -v`]: ok('pdftotext version 4.04'), [`${GITPDF} -h`]: ok('-layout') })
  assert.deepEqual(byTool(await checkComputer(noBbox)).poppler, { tool: 'poppler', state: 'limited', reason: 'noBbox', version: '4.04' })

  const broken = fake(
    { 'pdftotext.exe': [POP], 'pdftoppm.exe': ['C:\\Tools\\poppler\\bin\\pdftoppm.exe'] },
    { [`${POP} -v`]: ok('pdftotext version 26.03.0'), [`${POP} -h`]: ok('-bbox') }
  )
  assert.equal(byTool(await checkComputer(broken)).poppler?.reason, 'brokenBbox')

  const noPpm = fake({ 'pdftotext.exe': [POP] }, { [`${POP} -v`]: ok('pdftotext version 26.09.0'), [`${POP} -h`]: ok('-bbox') })
  assert.equal(byTool(await checkComputer(noPpm)).poppler?.reason, 'noPdftoppm')
})

test('programs get fixed arguments only, and pypdf is checked in isolated mode', async () => {
  const deps = healthyComputer()
  await checkComputer(deps)
  const allowed = [['--version'], ['-v'], ['-h'], ['-I', '-c', 'import pypdf,sys;sys.stdout.write(pypdf.__version__)']]
  for (const [, args] of deps.calls) assert.ok(allowed.some((a) => JSON.stringify(a) === JSON.stringify(args)), JSON.stringify(args))
  // LaTeX is only looked for, never started (it can wake MiKTeX's update prompts).
  assert.ok(!deps.calls.some(([file]) => /latex/i.test(file)))
})

test('Linux names: python3, bun, git, pdftotext without .exe', async () => {
  const deps = fake(
    { python3: ['/usr/bin/python3'], bun: ['/home/sam/.bun/bin/bun'], git: ['/usr/bin/git'], lualatex: ['/usr/bin/lualatex'] },
    { '/usr/bin/python3 --version': ok('Python 3.12.3'), '/home/sam/.bun/bin/bun --version': ok('1.4.4'), '/usr/bin/git --version': ok('git version 2.53.0') },
    'linux'
  )
  const t = byTool(await checkComputer(deps))
  assert.equal(t.python?.state, 'ok')
  assert.equal(t.bun?.state, 'ok')
  assert.equal(t.git?.state, 'ok')
  assert.equal(t.lualatex?.state, 'ok')
  assert.equal(t.xelatex?.state, 'missing')
})

test('findAllPrograms lists every match in order and skips the job-search folder', () => {
  const ws = 'C:\\work\\jobs'
  const env = { PATH: `C:\\work\\jobs\\bin;C:\\Git\\mingw64\\bin;C:\\poppler\\bin;relative\\bin` }
  const files = new Set(['C:\\work\\jobs\\bin\\pdftotext.exe', 'C:\\Git\\mingw64\\bin\\pdftotext.exe', 'C:\\poppler\\bin\\pdftotext.exe'])
  assert.deepEqual(findAllPrograms(['pdftotext.exe'], ws, env, 'win32', (p) => files.has(p)), [
    'C:\\Git\\mingw64\\bin\\pdftotext.exe',
    'C:\\poppler\\bin\\pdftotext.exe'
  ])
  assert.equal(findProgram(['pdftotext.exe'], ws, env, 'win32', (p) => files.has(p)), 'C:\\Git\\mingw64\\bin\\pdftotext.exe')
  // With no folder chosen nothing is skipped (relative PATH entries still are).
  assert.equal(findAllPrograms(['pdftotext.exe'], null, env, 'win32', (p) => files.has(p)).length, 3)
})

test('"Show me how" links are official https pages, per platform for LaTeX and Poppler', () => {
  for (const tool of TOOLS) {
    for (const p of ['win32', 'darwin', 'linux', 'other'] as const) assert.match(howToLink(tool, p), /^https:\/\//)
  }
  assert.equal(howToLink('lualatex', 'win32'), 'https://miktex.org/download')
  assert.equal(howToLink('xelatex', 'darwin'), 'https://tug.org/mactex/')
  assert.equal(howToLink('poppler', 'linux'), 'https://poppler.freedesktop.org/')
  void path
})
