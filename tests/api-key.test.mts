import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addSpend, isKeyFormat, NO_KEY } from '../src/shared/api-key.ts'
import { activeEngine, type EngineSet } from '../src/shared/engine.ts'

test('only text shaped like an Anthropic key is accepted, before any request is made', () => {
  assert.equal(isKeyFormat(`sk-ant-api03-${'a'.repeat(40)}`), true)
  assert.equal(isKeyFormat('sk-ant-short'), false)
  assert.equal(isKeyFormat(`sk-openai-${'a'.repeat(40)}`), false)
  assert.equal(isKeyFormat(`sk-ant-api03-${'a'.repeat(40)}\nrm -rf`), false)
  assert.equal(isKeyFormat(`sk-ant-api03-${'a'.repeat(40)} `), false)
  assert.equal(isKeyFormat(42), false)
})

test('spending adds each run\'s reported cost and ignores anything that is not a sane number', () => {
  assert.equal(addSpend(0, 0.42), 0.42)
  assert.equal(addSpend(0.1, 0.2), 0.3)
  assert.equal(addSpend(1, -5), 1)
  assert.equal(addSpend(1, Number.NaN), 1)
  assert.equal(addSpend(1, '3'), 1)
  assert.equal(addSpend(1, undefined), 1)
  assert.equal(addSpend(1, 5000), 1)
})

test('the screens see whether a key is saved, never the key', () => {
  assert.deepEqual(Object.keys(NO_KEY).sort(), ['addedAt', 'last4', 'saved', 'spentUsd', 'storage'])
})

test('the active engine follows the setting', () => {
  const set: EngineSet = {
    active: 'api-key',
    claudeCode: { engine: 'claude-code', state: 'signedOut' },
    apiKey: { engine: 'api-key', state: 'ready', key: { ...NO_KEY, saved: true, last4: 'abcd' } }
  }
  assert.equal(activeEngine(set).engine, 'api-key')
  assert.equal(activeEngine({ ...set, active: 'claude-code' }).state, 'signedOut')
})
