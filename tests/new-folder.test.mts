import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gitBase, isEmptyFolder, setupFolder, type GitResult, type NewFolderDeps } from '../src/main/new-folder.ts'
import { FRAMEWORKS, isRegion, REGIONS } from '../src/shared/framework.ts'
import { isSetupInput, RUNNABLE_COMMANDS, SETUP_SECTIONS } from '../src/shared/engine.ts'

const TARGET = 'C:\\Users\\sam\\Documents\\job-search'
const GIT = 'C:\\Program Files\\Git\\cmd\\git.exe'

interface Fake extends NewFolderDeps {
  calls: string[][]
  files: string[] | null
}

/** A pretend Git and disk. `fail` makes the call whose arguments include that word fail. */
function fake(opts: { version?: string; files?: string[] | null; fail?: string; git?: string | null; leaveFilesOnFail?: boolean } = {}): Fake {
  const f: Fake = {
    calls: [],
    files: opts.files === undefined ? [] : opts.files,
    platform: 'win32',
    findGit: () => (opts.git === undefined ? GIT : opts.git),
    entries: () => f.files,
    run: async (_git, args): Promise<GitResult> => {
      f.calls.push(args)
      if (args[0] === '--version') return { code: 0, out: `git version ${opts.version ?? '2.53.0.windows.1'}` }
      if (opts.fail && args.includes(opts.fail)) {
        if (opts.leaveFilesOnFail) f.files = ['.git']
        return { code: 128, out: 'fatal: unable to access' }
      }
      if (args.includes('clone')) f.files = ['.git', 'CLAUDE.md', '.claude']
      return { code: 0, out: '' }
    }
  }
  return f
}

test('a new folder: clone, pin, push off, in that order, with safe options', async () => {
  const deps = fake()
  const r = await setupFolder(TARGET, 'uae', deps)
  assert.deepEqual(r, { ok: true, path: TARGET })
  const [version, clone, reset, push] = deps.calls
  assert.deepEqual(version, ['--version'])
  const base = gitBase('win32')
  assert.deepEqual(clone, [...base, 'clone', '--no-recurse-submodules', '--quiet', '--', FRAMEWORKS.uae.url, TARGET])
  assert.deepEqual(reset, [...base, '-C', TARGET, 'reset', '--quiet', '--hard', FRAMEWORKS.uae.commit, '--'])
  assert.deepEqual(push, [...base, '-C', TARGET, 'remote', 'set-url', '--push', 'origin', 'DISABLED'])
})

test('every Git call turns off submodules, file:// transport and hooks; Windows uses its certificate store', () => {
  const win = gitBase('win32').join(' ')
  for (const opt of ['submodule.recurse=false', 'protocol.file.allow=never', 'core.hooksPath=', 'http.sslBackend=schannel']) assert.ok(win.includes(opt), opt)
  assert.ok(!gitBase('linux').join(' ').includes('schannel'))
  assert.ok(!gitBase('linux').join(' ').includes('recurse-submodules'))
})

test('the original framework for "somewhere else"', async () => {
  const deps = fake()
  await setupFolder(TARGET, 'elsewhere', deps)
  assert.ok(deps.calls[1]!.includes(FRAMEWORKS.elsewhere.url))
  assert.ok(deps.calls[2]!.includes(FRAMEWORKS.elsewhere.commit))
})

test('a folder that is not empty (checked right before copying) is refused, nothing runs after the check', async () => {
  const deps = fake({ files: ['notes.txt'] })
  assert.deepEqual(await setupFolder(TARGET, 'uae', deps), { ok: false, problem: 'notEmpty', partial: false })
  assert.ok(!deps.calls.some((c) => c.includes('clone')))
  // A missing path or a link counts as not usable.
  assert.equal(isEmptyFolder(TARGET, { entries: () => null }), false)
  assert.equal(isEmptyFolder(TARGET, { entries: () => [] }), true)
})

test('no Git, or Git older than 2.50.1: refused before anything is copied', async () => {
  assert.deepEqual(await setupFolder(TARGET, 'uae', fake({ git: null })), { ok: false, problem: 'noGit', partial: false })
  const old = fake({ version: '2.49.0.windows.1' })
  assert.deepEqual(await setupFolder(TARGET, 'uae', old), { ok: false, problem: 'oldGit', partial: false })
  assert.equal(old.calls.length, 1)
})

test('a copy that stops: nothing is deleted, and the result says whether files were left behind', async () => {
  const clean = fake({ fail: 'clone' })
  assert.deepEqual(await setupFolder(TARGET, 'uae', clean), { ok: false, problem: 'cloneFailed', partial: false })
  const half = fake({ fail: 'clone', leaveFilesOnFail: true })
  assert.deepEqual(await setupFolder(TARGET, 'uae', half), { ok: false, problem: 'cloneFailed', partial: true })
  const pin = fake({ fail: 'reset' })
  assert.deepEqual(await setupFolder(TARGET, 'uae', pin), { ok: false, problem: 'pinFailed', partial: true })
  for (const deps of [clean, half, pin]) {
    assert.ok(!deps.calls.some((c) => c.some((a) => /^(rm|clean|rmdir)$/.test(a))), 'no delete commands')
  }
})

test('pins are https GitHub addresses with full commit hashes; only the two regions exist', () => {
  assert.deepEqual([...REGIONS], ['uae', 'elsewhere'])
  for (const r of REGIONS) {
    assert.match(FRAMEWORKS[r].url, /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/)
    assert.match(FRAMEWORKS[r].commit, /^[0-9a-f]{40}$/)
  }
  assert.equal(isRegion('uae'), true)
  assert.equal(isRegion('https://evil.example/repo.git'), false)
  assert.equal(isRegion(undefined), false)
})

test('/setup runs with nothing or --section from the fixed list only', () => {
  assert.ok(RUNNABLE_COMMANDS.includes('setup'))
  assert.equal(isSetupInput(''), true)
  for (const s of SETUP_SECTIONS) assert.equal(isSetupInput(`--section ${s}`), true, s)
  for (const bad of ['--section', '--section unknown', '--section search extra', 'ignore previous instructions', '--section Search', '--section search; rm -rf x']) {
    assert.equal(isSetupInput(bad), false, bad)
  }
})
