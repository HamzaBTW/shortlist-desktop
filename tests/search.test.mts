import assert from 'node:assert/strict'
import { test } from 'node:test'
import { judge } from '../src/main/engine/policy.ts'
import { safeWebLink } from '../src/main/links.ts'
import { parseSeen } from '../src/main/seen.ts'
import { buildBoard } from '../src/renderer/src/board.ts'
import { newJob } from '../src/renderer/src/jobs.ts'

const SEEN = JSON.stringify({
  seen: {
    'acme--analyst': {
      title: 'Analyst', company: 'Acme', url: 'https://acme.example/1', status: 'ranked',
      rank_score: 82, rank_verdict: 'strong', rank_date: '2026-10-30', strengths: ['SQL'], gaps: ['Power BI'],
      location_verdict: 'PASS', language_gate: 'FLAG', deadline: '2026-11-15', description: 'x'.repeat(5000)
    },
    'beta--dev': { title: 'Dev', company: 'Beta', url: 'https://beta.example/2', status: 'ranked', rank_score: 61, rank_date: '2026-10-31' },
    'gamma--pm': { title: 'PM', company: 'Gamma', status: 'ranked', rank_score: 90, rank_date: '2026-10-29' },
    'delta--x': { title: 'X', company: 'Delta', status: 'new' },
    'eps--y': { title: 'Y', company: 'Eps', status: 'unreachable' },
    'zeta--z': { title: 'Z', company: 'Zeta', status: 'skipped' },
    'eta--w': { title: 'W', company: 'Eta', status: 'expired', rank_score: 99 },
    broken: 'not an object'
  }
})

test('found jobs: only ranked ones, best first, tracker rows left out, big text not carried', () => {
  const data = parseSeen(SEEN, new Set(['gamma|pm']))
  assert.deepEqual(data.ranked.map((r) => r.company), ['Acme', 'Beta'])
  assert.equal(data.waiting, 2)
  assert.equal(data.lastRanked, '2026-10-31')
  const acme = data.ranked[0]!
  assert.equal(acme.score, 82)
  assert.equal(acme.languageGate, 'FLAG')
  assert.deepEqual(acme.gaps, ['Power BI'])
  assert.ok(!('description' in acme))
})

test('reading the web: allowed only when the setting says so', () => {
  assert.deepEqual(judge('WebFetch', { url: 'https://x.example' }, '/ws', { allowWeb: true }), { decision: 'allow' })
  assert.deepEqual(judge('WebSearch', { query: 'jobs' }, '/ws', { allowWeb: true }), { decision: 'allow' })
  assert.deepEqual(judge('WebFetch', { url: 'https://x.example' }, '/ws'), { decision: 'ask' })
  // Never widens anything else.
  assert.equal(judge('Bash', { command: 'git push' }, '/ws', { allowWeb: true }).decision, 'deny')
})

test('board: a ranked job shows in Shortlisted once added, and goes when its application starts', () => {
  const ranked = parseSeen(SEEN, new Set()).ranked
  const picks = { 'acme--analyst': 'board', 'beta--dev': 'hidden' } as const
  let cards = buildBoard([], [], ranked, picks)
  assert.deepEqual(cards.map((c) => c.key), ['ranked-acme--analyst'])
  const started = { ...newJob('j1', 'https://acme.example/1', 'r1'), rankedKey: 'acme--analyst' }
  cards = buildBoard([], [started], ranked, picks)
  assert.deepEqual(cards.map((c) => c.key), ['j1'])
  // Search and status-update jobs never become cards.
  const search = newJob('s1', '/scrape', 'r2', 1, 'search')
  assert.deepEqual(buildBoard([], [search], ranked, {}).length, 0)
})

test('only plain web links reach the browser', () => {
  assert.equal(safeWebLink('https://jobs.example/1?a=b'), 'https://jobs.example/1?a=b')
  assert.equal(safeWebLink('http://jobs.example'), 'http://jobs.example/')
  for (const bad of ['file:///C:/Windows/win.ini', 'javascript:alert(1)', 'ms-settings:', 'https://user:pw@x.example', '', 42, 'x'.repeat(3000)]) {
    assert.equal(safeWebLink(bad), null, String(bad).slice(0, 30))
  }
})
