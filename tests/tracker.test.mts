import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { parseCsv } from '../src/main/csv.ts'
import { Store } from '../src/main/store.ts'
import { parseTracker, readTracker } from '../src/main/tracker.ts'
import { columnFor, normalizeStatus } from '../src/shared/tracker.ts'
import { buildBoard } from '../src/renderer/src/board.ts'
import { changedRow, newJob, restore } from '../src/renderer/src/jobs.ts'

const HEADER = 'date,company,sector,role,role_type,channel,status,contact_person,fit_rating,notes,cv_file,cover_letter_file,source,deadline'
const dir = mkdtempSync(path.join(tmpdir(), 'shortlist-tracker-'))
after(() => rmSync(dir, { recursive: true, force: true }))

test('CSV: quotes, doubled quotes, commas and line breaks inside quotes, CRLF, BOM', () => {
  const text = '﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n2,"line\nbreak",\r\n\r\n'
  assert.deepEqual(parseCsv(text), [
    ['a', 'b', 'c'],
    ['1', 'x, y', 'say "hi"'],
    ['2', 'line\nbreak', '']
  ])
  assert.deepEqual(parseCsv(''), [])
  assert.deepEqual(parseCsv('a,b'), [['a', 'b']])
})

test('statuses map to the agreed board columns', () => {
  assert.equal(columnFor('drafted'), 'shortlisted')
  assert.equal(columnFor('ranked'), 'shortlisted')
  assert.equal(columnFor('applied'), 'applied')
  assert.equal(columnFor('interview'), 'interviewing')
  assert.equal(columnFor('offer'), 'offer')
  assert.equal(columnFor('hired'), 'offer')
  for (const s of ['rejected', 'no_response', 'no response', 'offer_declined', 'Offer Declined', 'withdrawn', 'expired']) {
    assert.equal(columnFor(s), 'closed', s)
  }
  assert.equal(columnFor('something new'), 'shortlisted')
  assert.equal(normalizeStatus(' No Response '), 'no_response')
})

test('tracker rows: by column name, fit rating as a number, legacy trackers without deadline', () => {
  const data = parseTracker(
    [
      HEADER,
      '2026-10-20,Acme,Tech,Data Analyst,full-time,online,applied,,72,applied 2026-10-21,cv/main_acme.tex,cover_letters/cover_acme.tex,https://acme.example/jobs/1,2026-11-15',
      '2026-10-25,"Beta, Inc.",,Engineer,,,drafted,,not a number,,,,,',
      ',,,,,,,,,,,,,'
    ].join('\n')
  )
  assert.equal(data.found, true)
  assert.equal(data.rows.length, 2)
  const [a, b] = data.rows
  assert.equal(a!.company, 'Acme')
  assert.equal(a!.fitRating, 72)
  assert.equal(a!.deadline, '2026-11-15')
  assert.equal(a!.matchKey, 'acme|data analyst')
  assert.equal(b!.company, 'Beta, Inc.')
  assert.equal(b!.fitRating, null)

  const legacy = parseTracker('date,company,role,status\n2026-01-01,Old Co,Role,no response\n')
  assert.equal(legacy.rows[0]!.status, 'no_response')
  assert.equal(legacy.rows[0]!.deadline, '')
  assert.equal(parseTracker('x,y\n1,2').error, 'noHeader')
})

test('reading: no tracker yet is normal, not an error', () => {
  assert.deepEqual(readTracker(dir), { found: false, rows: [] })
  writeFileSync(path.join(dir, 'job_search_tracker.csv'), `${HEADER}\n2026-10-20,Acme,,Analyst,,,interview,,80,,,,,\n`)
  const data = readTracker(dir)
  assert.equal(data.rows.length, 1)
  assert.equal(data.rows[0]!.status, 'interview')
})

test('store: saves per folder, replaces, deletes, refuses bad ids', () => {
  const store = new Store(path.join(dir, 'test.db'))
  try {
    assert.equal(store.saveJob('/ws/a', { id: 'j1', input: 'one' }), true)
    assert.equal(store.saveJob('/ws/a', { id: 'j1', input: 'one, updated' }), true)
    assert.equal(store.saveJob('/ws/b', { id: 'j2', input: 'two' }), true)
    assert.deepEqual(store.listJobs('/ws/a'), [{ id: 'j1', input: 'one, updated' }])
    assert.deepEqual(store.listJobs('/ws/b'), [{ id: 'j2', input: 'two' }])
    // Another folder can't overwrite or delete it.
    store.saveJob('/ws/b', { id: 'j1', input: 'hijack' })
    assert.deepEqual(store.listJobs('/ws/a'), [{ id: 'j1', input: 'one, updated' }])
    assert.equal(store.deleteJob('/ws/b', 'j1'), false)
    assert.equal(store.saveJob('/ws/a', { id: '../x', input: '' }), false)
    assert.equal(store.saveJob('/ws/a', 'nope'), false)
    assert.equal(store.deleteJob('/ws/a', 'j1'), true)
    assert.deepEqual(store.listJobs('/ws/a'), [])
  } finally {
    store.close()
  }
})

test('a job cut off by closing the app comes back stopped, with its session', () => {
  const job = { ...newJob('j1', 'https://x.example/1', 'r1', 5), sessionId: 's1' }
  const back = restore(job, 'stopped')!
  assert.equal(back.phase, 'failed')
  assert.equal(back.error, 'stopped')
  assert.equal(back.sessionId, 's1')
  assert.equal(back.runId, null)
  assert.equal(restore({ id: 1 }, 'x'), null)
  const waiting = restore({ ...job, phase: 'waiting', result: 'fit score 60/100' }, 'x')!
  assert.equal(waiting.phase, 'waiting')
})

test('linking: the row a run added or changed', () => {
  const rows = parseTracker(`${HEADER}\n2026-10-20,Acme,,Analyst,,,applied,,70,,,,,\n`).rows
  const added = parseTracker(`${HEADER}\n2026-10-20,Acme,,Analyst,,,applied,,70,,,,,\n2026-10-31,Beta,,Engineer,,,drafted,,64,,,,,\n`).rows
  assert.equal(changedRow(rows, added), 'beta|engineer')
  const redrafted = parseTracker(`${HEADER}\n2026-10-20,Acme,,Analyst,,,applied,,75,redrafted,,,,\n`).rows
  assert.equal(changedRow(rows, redrafted), 'acme|analyst')
  assert.equal(changedRow(rows, rows), null)
})

test('board: rows in their columns, a linked job shows once, unlinked jobs in Shortlisted', () => {
  const rows = parseTracker(
    `${HEADER}\n2026-10-20,Acme,,Analyst,,,applied,,70,,,,,\n2026-10-25,Beta,,Engineer,,,drafted,,64,,,,,\n2026-09-01,Gamma,,Dev,,,rejected,,50,,,,,\n`
  ).rows
  const linked = { ...newJob('j1', 'beta posting', '', 10), trackerKey: 'beta|engineer' }
  const fresh = newJob('j2', 'new posting', 'r2', 20)
  const cards = buildBoard(rows, [linked, fresh])
  const where = (k: string) => cards.filter((c) => c.column === k).map((c) => (c.kind === 'row' ? c.row.company : `job:${c.job.id}`))
  assert.deepEqual(where('applied'), ['Acme'])
  assert.deepEqual(where('closed'), ['Gamma'])
  assert.deepEqual(where('shortlisted').sort(), ['Beta', 'job:j2'])
  const beta = cards.find((c) => c.kind === 'row' && c.row.company === 'Beta')!
  assert.equal(beta.job?.id, 'j1')
})
