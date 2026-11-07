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

const MIX = JSON.stringify({
  seen: {
    a: { title: 'A', company: 'A', portal: 'linkedin', status: 'ranked', rank_score: 70, first_seen: '2026-11-06' },
    b: { title: 'B', company: 'B', portal: 'LinkedIn', status: 'new', first_seen: '2026-11-06' },
    c: { title: 'C', company: 'C', portal: 'freehire-search', status: 'new', first_seen: '2026-11-06' },
    d: { title: 'D', company: 'D', portal: 'whatjobs', status: 'ranked', rank_score: 50, first_seen: '2026-11-06' },
    e: { title: 'E', company: 'E', portal: 'indeed', status: 'skipped', dropped: true, first_seen: '2026-11-06' },
    f: { title: 'F', company: 'F', portal: 'careers: f.example', status: 'new', first_seen: '2026-11-01' },
    g: { title: 'G', company: 'G', status: 'new', first_seen: '2026-11-06' }
  }
})

test('source mix: counts the latest search per source; closed ones and older searches are left out', () => {
  const data = parseSeen(MIX, new Set())
  assert.equal(data.searchedOn, '2026-11-06')
  assert.deepEqual(data.perSource, { linkedin: 2, freehire: 1, indeed: 0, careers: 0, other: 2 })
})

test('source mix: each ranked job carries its source; unknown tags stay as their own text', () => {
  const data = parseSeen(MIX, new Set())
  const by = Object.fromEntries(data.ranked.map((r) => [r.company, r]))
  assert.equal(by['A']!.sourceLabel, 'linkedin')
  assert.equal(by['D']!.sourceLabel, 'other')
  assert.equal(by['D']!.portal, 'whatjobs')
})

test('source mix: no search yet means no counts', () => {
  const data = parseSeen(JSON.stringify({ seen: {} }), new Set())
  assert.equal(data.searchedOn, null)
  assert.deepEqual(data.perSource, { linkedin: 0, freehire: 0, indeed: 0, careers: 0, other: 0 })
})

import { topUpSlots } from '../src/shared/slots.ts'

const GAPS = JSON.stringify({
  seen: {
    one: { title: 'Planner', company: 'Lambda', portal: 'freehire', status: 'new', missing_details: ['location'] },
    three: { title: 'Junior', company: '', portal: 'linkedin', status: 'new', missing_details: ['company', 'location', 'description'] },
    two: { title: 'Clerk', company: 'Mu', portal: 'careers: mu.example', status: 'new', missing_details: ['description', 'location'] },
    twoIndeed: { title: 'Analyst', company: 'Kappa', portal: 'indeed', status: 'new', missing_details: ['apply_link', 'description'] },
    closed: { title: 'Old', company: 'Z', portal: 'linkedin', status: 'skipped', dropped: true, missing_details: ['company'] },
    ranked: { title: 'R', company: 'R', portal: 'linkedin', status: 'ranked', rank_score: 60, missing_details: ['location'] },
    clean: { title: 'Fine', company: 'F', portal: 'linkedin', status: 'new' },
    junk: { title: 'J', company: 'J', portal: 'linkedin', status: 'new', missing_details: ['colour', 7] }
  }
})

test('missing details: least complete first, only open new postings, unknown values ignored', () => {
  const data = parseSeen(GAPS, new Set())
  assert.deepEqual(data.incomplete.map((i) => i.key), ['three', 'twoIndeed', 'two', 'one'])
  assert.deepEqual(data.incomplete[0]!.missing, ['company', 'location', 'description'])
  assert.equal(data.incomplete[0]!.sourceLabel, 'linkedin')
  assert.equal(data.incomplete[1]!.sourceLabel, 'indeed')
})

test('a closed posting (skipped by /scrape drop) is gone from the list', () => {
  const after = JSON.parse(GAPS) as { seen: Record<string, Record<string, unknown>> }
  Object.assign(after.seen['three']!, { status: 'skipped', dropped: true })
  assert.ok(!parseSeen(JSON.stringify(after), new Set()).incomplete.some((i) => i.key === 'three'))
})

const S = { linkedin: 5, freehire: 5, indeed: 5, careers: 5 }

test('top-up: freed slots go to the sources that lost none, evenly', () => {
  assert.deepEqual(topUpSlots({ linkedin: 3 }, S, 'share'), { linkedin: 0, freehire: 1, indeed: 1, careers: 1 })
  assert.deepEqual(topUpSlots({ indeed: 1 }, S, 'share'), { linkedin: 1, freehire: 0, indeed: 0, careers: 0 })
  assert.deepEqual(topUpSlots({ linkedin: 2 }, { ...S, careers: 0 }, 'share'), { linkedin: 0, freehire: 1, indeed: 1, careers: 0 })
})

test('top-up: nobody to give to, or nothing freed, means no search', () => {
  assert.equal(topUpSlots({ linkedin: 1 }, { linkedin: 5, freehire: 0, indeed: 0, careers: 0 }, 'share'), null)
  assert.equal(topUpSlots({}, S, 'share'), null)
  assert.equal(topUpSlots({}, S, 'keep'), null)
})

test('top-up: keep fills the same source again, as many as were closed', () => {
  assert.deepEqual(topUpSlots({ indeed: 2, careers: 1 }, S, 'keep'), { linkedin: 0, freehire: 0, indeed: 2, careers: 1 })
})

import { indeedTool } from '../src/main/engine/policy.ts'

const IND = (n: string): string => `mcp__claude_ai_Indeed__${n}`

test('Indeed: searching and reading a posting run without asking', () => {
  for (const command of ['scrape', 'apply', 'rank', undefined]) {
    assert.deepEqual(judge(IND('search_jobs'), { query: 'analyst' }, '/ws', { command }), { decision: 'allow' })
    assert.deepEqual(judge(IND('get_job_details'), { job_id: 'x' }, '/ws', { command }), { decision: 'allow' })
  }
})

test('Indeed: the resume is always refused, in every command', () => {
  for (const command of ['scrape', 'apply', 'rank', 'outcome', undefined]) {
    assert.deepEqual(judge(IND('get_resume'), {}, '/ws', { command, allowWeb: true }), { decision: 'deny', reason: 'indeedResume' })
  }
})

test('Indeed: company details are refused unless the command is /apply, where they ask', () => {
  assert.deepEqual(judge(IND('get_company_data'), { company: 'Acme' }, '/ws', { command: 'apply' }), { decision: 'ask' })
  for (const command of ['scrape', 'rank', 'outcome', undefined]) {
    assert.deepEqual(judge(IND('get_company_data'), { company: 'Acme' }, '/ws', { command }), { decision: 'deny', reason: 'indeedCompany' })
  }
})

test('Indeed: other tools of the connector still ask; look-alike names are not treated as Indeed', () => {
  assert.deepEqual(judge(IND('something_new'), {}, '/ws', { command: 'scrape' }), { decision: 'ask' })
  assert.equal(indeedTool('mcp__claude_ai_Indeed__get_resume'), 'get_resume')
  assert.equal(indeedTool('mcp__indeed__search_jobs'), 'search_jobs')
  assert.equal(indeedTool('mcp__other__search_jobs'), null)
  assert.equal(indeedTool('Bash'), null)
  assert.equal(indeedTool('mcp__other__indeed__x'), null)
  assert.deepEqual(judge('mcp__other__get_resume', {}, '/ws', { command: 'scrape' }), { decision: 'ask' })
})

import { SessionCommands } from '../src/main/session-commands.ts'

test('a resumed turn keeps its command, so /apply can still be asked about Indeed company data', () => {
  const s = new SessionCommands()
  s.remember('sess-apply', 'apply')
  s.remember('sess-scrape', 'scrape')
  const resumed = s.commandFor('sess-apply')
  assert.equal(resumed, 'apply')
  assert.deepEqual(judge('mcp__claude_ai_Indeed__get_company_data', {}, '/ws', { command: resumed }), { decision: 'ask' })
  assert.deepEqual(judge('mcp__claude_ai_Indeed__get_company_data', {}, '/ws', { command: s.commandFor('sess-scrape') }), { decision: 'deny', reason: 'indeedCompany' })
  assert.equal(s.commandFor('unknown'), undefined)
})

test('session commands: oldest forgotten past the cap', () => {
  const s = new SessionCommands()
  for (let i = 0; i < 205; i++) s.remember(`s${i}`, 'apply')
  assert.equal(s.commandFor('s0'), undefined)
  assert.equal(s.commandFor('s204'), 'apply')
})
