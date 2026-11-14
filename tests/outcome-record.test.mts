import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { cleanRequest, recordOutcome } from '../src/main/outcome-record.ts'

const ok = { company: 'Acme', role: 'BI Analyst', status: 'interview', date: '2026-11-08', note: '' }

test('a valid request passes unchanged', () => {
  assert.deepEqual(cleanRequest(ok), ok)
})

test('anything odd is refused before it reaches Python', () => {
  assert.equal(cleanRequest({ ...ok, status: 'drafted' }), null)
  assert.equal(cleanRequest({ ...ok, status: 'x --root /' }), null)
  assert.equal(cleanRequest({ ...ok, date: 'yesterday' }), null)
  assert.equal(cleanRequest({ ...ok, company: '  ' }), null)
  assert.equal(cleanRequest({ ...ok, note: 'x'.repeat(1001) }), null)
  assert.equal(cleanRequest({ ...ok, role: 5 }), null)
  assert.equal(cleanRequest(null), null)
})

// Needs the framework's own tool, which lives outside this repo (never copied in). Skipped when it is not there.
const frameworkTool = path.resolve('..', 'uae-fork', 'tools', 'outcome_state.py')

test('records through the framework tool end to end, and falls back when it is missing', { skip: !existsSync(frameworkTool) }, async () => {
  const ws = mkdtempSync(path.join(tmpdir(), 'sl-outcome-'))
  const header = 'date,company,sector,role,role_type,channel,status,contact_person,fit_rating,notes,cv_file,cover_letter_file,source,deadline\n'
  writeFileSync(path.join(ws, 'job_search_tracker.csv'), header + '2026-10-01,Acme,Tech,BI Analyst,full,portal,applied,,70,sent,,,https://a.com/1,\n')
  assert.deepEqual(await recordOutcome(ws, ok), { ok: false, reason: 'unavailable' })
  mkdirSync(path.join(ws, 'tools'))
  copyFileSync(frameworkTool, path.join(ws, 'tools', 'outcome_state.py'))
  const r = await recordOutcome(ws, { ...ok, note: '-starts with a dash' })
  assert.equal(r.ok, true)
  assert.match(readFileSync(path.join(ws, 'job_search_tracker.csv'), 'utf-8'), /,interview,.*sent; interview 2026-11-08 - -starts with a dash/)
  assert.deepEqual(await recordOutcome(ws, { ...ok, company: 'Nobody' }), { ok: false, reason: 'refused' })
})
