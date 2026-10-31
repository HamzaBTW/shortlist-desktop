import assert from 'node:assert/strict'
import { test } from 'node:test'
import { choicesFrom, outcomeRequest } from '../src/renderer/src/outcome.ts'

test('choices only move a card forward', () => {
  assert.deepEqual(choicesFrom('shortlisted'), ['applied', 'interview', 'offer', 'hired', 'rejected', 'no_response', 'withdrawn', 'offer_declined'])
  assert.deepEqual(choicesFrom('applied'), ['interview', 'offer', 'hired', 'rejected', 'no_response', 'withdrawn', 'offer_declined'])
  assert.deepEqual(choicesFrom('interviewing'), ['offer', 'hired', 'rejected', 'no_response', 'withdrawn', 'offer_declined'])
  assert.deepEqual(choicesFrom('offer'), ['hired', 'rejected', 'no_response', 'withdrawn', 'offer_declined'])
  assert.deepEqual(choicesFrom('closed'), [])
})

test('the /outcome request: company and role first, then what happened', () => {
  const r = outcomeRequest('Acme Analytics', 'BI Analyst', 'applied', '2026-10-31', '')
  assert.equal(r, 'Acme Analytics BI Analyst - status update: I submitted this application on 2026-10-31. Record it now; ask me only if something essential is missing.')
})

test('notes and names are kept on one line; a bad date is left out', () => {
  const r = outcomeRequest('Beta\nCo', 'Dev', 'rejected', 'yesterday', 'they wanted\r\nmore SQL')
  assert.ok(!/[\r\n]/.test(r))
  assert.ok(r.startsWith('Beta Co Dev - status update: I was not selected (rejected).'))
  assert.ok(r.includes('Note from me: they wanted more SQL.'))
  assert.ok(!r.includes('yesterday'))
})
