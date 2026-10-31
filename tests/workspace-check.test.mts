import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { checkWorkspace } from '../src/main/workspace-check.ts'

const base = mkdtempSync(path.join(tmpdir(), 'shortlist-ws-'))
after(() => rmSync(base, { recursive: true, force: true }))

function makeRepo(name: string, opts: { claudeMd?: string; apply?: boolean; tracker?: boolean } = {}): string {
  const dir = path.join(base, name)
  mkdirSync(dir, { recursive: true })
  if (opts.claudeMd !== undefined) writeFileSync(path.join(dir, 'CLAUDE.md'), opts.claudeMd)
  if (opts.apply) {
    mkdirSync(path.join(dir, '.claude', 'commands'), { recursive: true })
    writeFileSync(path.join(dir, '.claude', 'commands', 'apply.md'), '# /apply')
  }
  if (opts.tracker) writeFileSync(path.join(dir, 'job_search_tracker.csv'), 'company,role,status\n')
  return dir
}

test('a fresh template copy is usable but has no profile yet', () => {
  const s = checkWorkspace(makeRepo('template', { claudeMd: '# Job Application Assistant for [YOUR_NAME]', apply: true }))
  assert.equal(s.ok, true)
  assert.deepEqual(s.problems, [])
  assert.equal(s.profileFilled, false)
  assert.equal(s.hasTracker, false)
})

test('a filled-in copy with a tracker', () => {
  const s = checkWorkspace(makeRepo('filled', { claudeMd: '# Job Application Assistant for Sam Lee', apply: true, tracker: true }))
  assert.equal(s.ok, true)
  assert.equal(s.profileFilled, true)
  assert.equal(s.hasTracker, true)
})

test('an unrelated folder is refused with both reasons', () => {
  const s = checkWorkspace(makeRepo('photos'))
  assert.equal(s.ok, false)
  assert.deepEqual(s.problems.sort(), ['noClaudeMd', 'noCommands'])
})

test('a folder with CLAUDE.md but no commands is refused', () => {
  const s = checkWorkspace(makeRepo('other-project', { claudeMd: '# Some other project' }))
  assert.deepEqual(s.problems, ['noCommands'])
})

test('a missing folder and a file are refused', () => {
  assert.deepEqual(checkWorkspace(path.join(base, 'nope')).problems, ['missing'])
  const file = path.join(base, 'a-file.txt')
  writeFileSync(file, 'x')
  assert.deepEqual(checkWorkspace(file).problems, ['notFolder'])
})

test('the check only reads', () => {
  const dir = makeRepo('readonly', { claudeMd: '[YOUR_NAME]', apply: true })
  const before = JSON.stringify(listAll(dir))
  checkWorkspace(dir)
  assert.equal(JSON.stringify(listAll(dir)), before)
})

function listAll(dir: string): string[] {
  return readdirSync(dir, { recursive: true }).map(String).sort()
}
