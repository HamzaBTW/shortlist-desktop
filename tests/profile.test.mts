import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { readProfile, realInside } from '../src/main/profile.ts'
import { SETUP_SECTIONS, RUNNABLE_COMMANDS, NO_INPUT_COMMANDS } from '../src/shared/engine.ts'
import { isOpenablePath, PROFILE_CARDS, summarize } from '../src/shared/profile.ts'

const TEMPLATE = `# Candidate Profile

## Identity & Contact
- **Name:** [YOUR_NAME]
- **Email:** [YOUR_EMAIL]

## Education
- [DEGREE], [UNIVERSITY] ([YEAR])

## Professional Experience
### [ROLE_TYPE_1] (2020 - now)
- Did a thing with [TOOL]

## Languages
| Language | Level |
|---|---|
| English | Native |

\`\`\`latex
## not a heading [YOUR_PHONE]
\`\`\`
`

test('a template: placeholders counted, section names listed, unfilled sections named', () => {
  const s = summarize(TEMPLATE, 'x.md')
  assert.equal(s.found, true)
  assert.equal(s.placeholders, 8)
  assert.deepEqual(s.parts, ['Identity & Contact', 'Education', 'Professional Experience', 'Languages'])
  // The ### heading counts towards its ## section and doesn't become a name of its own;
  // a placeholder in a code block (LaTeX templates) counts towards the section it sits in.
  assert.deepEqual(s.toFill, ['Identity & Contact', 'Education', 'Professional Experience', 'Languages'])
})

test('a filled-in file: no placeholders, nothing to fill in, and none of its own text is returned', () => {
  const filled = TEMPLATE.replace(/\[[A-Z][A-Z0-9_ /-]{2,}\]/g, 'Sam Rivera').replace('[x]', '')
  const s = summarize(filled, 'x.md')
  assert.equal(s.placeholders, 0)
  assert.deepEqual(s.toFill, [])
  assert.ok(!JSON.stringify(s).includes('Sam Rivera'), 'only headings and counts, never the text')
})

test('links, checkboxes and lowercase brackets are not placeholders', () => {
  const s = summarize('## A\n- [x] done\n- [ ] todo\n- see [the guide](https://x.y)\n- [cv] file\n', 'x.md')
  assert.equal(s.placeholders, 0)
})

test('cards: each card offers only the /setup sections agreed for its file', () => {
  const sections = Object.fromEntries(PROFILE_CARDS.map((c) => [c.id, c.sections]))
  assert.deepEqual(sections, {
    settings: ['identity', 'goals'],
    candidate: ['identity', 'education', 'experience', 'skills', 'publications', 'references'],
    behavioral: ['behavioral'],
    writing: [],
    evaluation: ['skills', 'goals'],
    templates: [],
    interview: [],
    search: ['search']
  })
  for (const c of PROFILE_CARDS) for (const s of c.sections) assert.ok((SETUP_SECTIONS as readonly string[]).includes(s), s)
  assert.ok(RUNNABLE_COMMANDS.includes('expand') && NO_INPUT_COMMANDS.includes('expand'))
})

test('only allowlisted files can be opened', () => {
  for (const c of PROFILE_CARDS) for (const f of c.files) assert.equal(isOpenablePath(f), true, f)
  assert.equal(isOpenablePath('reports/application-dashboard.html'), true)
  assert.equal(isOpenablePath('upskill/report-2026-11-03.md'), true)
  for (const bad of [
    'job_search_tracker.csv',
    '.claude/settings.json',
    '../CLAUDE.md',
    'upskill/../CLAUDE.md',
    'upskill/report-../../x.md',
    'upskill/report-a.md/../../evil.md',
    'C:\\Windows\\win.ini',
    '/etc/passwd',
    'claude.md',
    '.claude\\skills\\job-scraper\\search-queries.md',
    'reports/application-dashboard.html.exe',
    42
  ]) {
    assert.equal(isOpenablePath(bad), false, String(bad))
  }
})

test('reading a folder: real files summarised, missing ones marked, links leading outside refused', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'shortlist-profile-'))
  const outside = mkdtempSync(path.join(os.tmpdir(), 'shortlist-outside-'))
  try {
    writeFileSync(path.join(root, 'CLAUDE.md'), '# Me\n\n## Identity\n- Name: [YOUR_NAME]\n')
    const skill = path.join(root, '.claude', 'skills', 'job-application-assistant')
    mkdirSync(skill, { recursive: true })
    writeFileSync(path.join(skill, '01-candidate-profile.md'), '## Education\n- MSc\n')
    writeFileSync(path.join(outside, 'secret.md'), '## Secret\n')
    let linked = false
    try {
      symlinkSync(path.join(outside, 'secret.md'), path.join(skill, '02-behavioral-profile.md'))
      linked = true
    } catch {
      // Creating links needs extra rights on some Windows setups; that part is then skipped.
    }

    const cards = readProfile(root)
    const by = Object.fromEntries(cards.map((c) => [c.id, c]))
    assert.equal(by.settings!.files[0]!.placeholders, 1)
    assert.deepEqual(by.settings!.files[0]!.toFill, ['Identity'])
    assert.equal(by.candidate!.files[0]!.placeholders, 0)
    assert.equal(by.search!.files[0]!.found, false)
    assert.equal(by.templates!.files.length, 2)
    if (linked) {
      assert.equal(by.behavioral!.files[0]!.found, false, 'a link pointing outside the folder is not read')
      assert.equal(realInside(root, '.claude/skills/job-application-assistant/02-behavioral-profile.md'), null)
    }
    assert.equal(realInside(root, '.claude'), null, 'a folder is not a file')
    assert.notEqual(realInside(root, 'CLAUDE.md'), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})
