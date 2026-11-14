import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { findProgram, parseVersion, versionAtLeast } from '../src/main/engine/find.ts'
import { judge } from '../src/main/engine/policy.ts'

const ws = path.resolve('/work/ai-job-search')
const inside = path.join(ws, 'cv', 'main_acme.tex')
const outside = path.resolve('/work/other/notes.txt')

test('writes inside the folder go to the person', () => {
  assert.deepEqual(judge('Write', { file_path: inside, content: 'x' }, ws), { decision: 'ask' })
  assert.deepEqual(judge('Edit', { file_path: 'cv/main_acme.tex' }, ws), { decision: 'ask' })
})

test('writes outside the folder are refused', () => {
  for (const tool of ['Write', 'Edit', 'MultiEdit']) {
    assert.equal(judge(tool, { file_path: outside }, ws).decision, 'deny', tool)
    assert.equal(judge(tool, { file_path: '../escape.txt' }, ws).decision, 'deny', tool)
    assert.equal(judge(tool, {}, ws).decision, 'deny', `${tool} without a path`)
  }
  assert.equal(judge('NotebookEdit', { notebook_path: outside }, ws).decision, 'deny')
  // A sibling folder whose name starts the same is still outside.
  assert.equal(judge('Write', { file_path: `${ws}-backup/x.txt` }, ws).decision, 'deny')
})

test('dangerous shell commands are refused', () => {
  const cases: [string, string][] = [
    ['git push origin master', 'gitPush'],
    ['cd x && git -c a=b push', 'gitPush'],
    ['rm -rf build', 'deleteFolder'],
    ['rm -r cv/old', 'deleteFolder'],
    ['rm --recursive tmp', 'deleteFolder'],
    ['rmdir /s /q build', 'deleteFolder'],
    ['rd /S build', 'deleteFolder'],
    ['Remove-Item build -Recurse -Force', 'deleteFolder'],
    ['ri build -recurse', 'deleteFolder'],
    ['sudo apt install texlive', 'admin'],
    ['Start-Process pwsh -Verb RunAs', 'admin']
  ]
  for (const [command, reason] of cases) {
    for (const tool of ['Bash', 'PowerShell']) {
      assert.deepEqual(judge(tool, { command }, ws), { decision: 'deny', reason }, `${tool}: ${command}`)
    }
  }
})

test('ordinary commands go to the person', () => {
  for (const command of ['lualatex cv/main_acme.tex', 'python tools/verify_pdf.py cv/main_acme.pdf', 'git status', 'rm cv/main_acme.aux', 'ls -la']) {
    assert.deepEqual(judge('Bash', { command }, ws), { decision: 'ask' }, command)
  }
  assert.deepEqual(judge('WebFetch', { url: 'https://example.com' }, ws), { decision: 'ask' })
})

test('version parsing and minimum', () => {
  assert.equal(parseVersion('2.1.316 (Claude Code)'), '2.1.316')
  assert.equal(parseVersion('nonsense'), null)
  assert.equal(versionAtLeast('2.1.316', '2.1.310'), true)
  assert.equal(versionAtLeast('2.1.310', '2.1.310'), true)
  assert.equal(versionAtLeast('2.1.309', '2.1.310'), false)
  assert.equal(versionAtLeast('2.2.0', '2.1.310'), true)
  assert.equal(versionAtLeast('1.9.999', '2.1.310'), false)
})

test('auto-approve turns questions into yes, but refusals stay refusals', () => {
  const on = { autoApprove: true }
  assert.deepEqual(judge('Write', { file_path: inside, content: 'x' }, ws, on), { decision: 'allow' })
  assert.deepEqual(judge('Bash', { command: 'python tools/verify_pdf.py cv/a.pdf' }, ws, on), { decision: 'allow' })
  assert.deepEqual(judge('WebFetch', { url: 'https://example.com' }, ws, on), { decision: 'allow' })
  assert.equal(judge('Write', { file_path: outside, content: 'x' }, ws, on).decision, 'deny')
  assert.equal(judge('Bash', { command: 'git push origin main' }, ws, on).decision, 'deny')
  assert.equal(judge('Bash', { command: 'rm -rf cv' }, ws, on).decision, 'deny')
  assert.equal(judge('Bash', { command: 'sudo make me a sandwich' }, ws, on).decision, 'deny')
  assert.equal(judge('mcp__claude_ai_Indeed__get_resume', {}, ws, on).decision, 'deny')
  // Without it, nothing changes.
  assert.deepEqual(judge('Write', { file_path: inside, content: 'x' }, ws), { decision: 'ask' })
})

test('a program is found by its full path, never inside the job-search folder', () => {
  const files = new Set(['C:\\work\\jobs\\python.exe', 'C:\\work\\jobs\\tools\\python.exe', 'C:\\Python\\python.exe'])
  const isFile = (p: string): boolean => files.has(p)
  const env = { PATH: 'C:\\work\\jobs;C:\\work\\jobs\\tools;.;C:\\Python' }
  assert.equal(findProgram(['python.exe'], 'C:\\work\\jobs', env, 'win32', isFile), 'C:\\Python\\python.exe')
  assert.equal(findProgram(['py.exe'], 'C:\\work\\jobs', env, 'win32', isFile), null)
  const unix = (p: string): boolean => p === '/usr/bin/python3' || p === '/home/sam/jobs/bin/python3'
  assert.equal(findProgram(['python3'], '/home/sam/jobs', { PATH: '/home/sam/jobs/bin:/usr/bin' }, 'linux', unix), '/usr/bin/python3')
})
