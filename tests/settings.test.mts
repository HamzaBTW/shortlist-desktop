import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanSettings, DEFAULT_SETTINGS } from '../src/shared/ipc.ts'

test('keeps valid values', () => {
  assert.deepEqual(cleanSettings({ theme: 'midnight', guide: false, askEveryChange: true, askWeb: true }), {
    theme: 'midnight',
    guide: false,
    askEveryChange: true,
    askWeb: true,
    autoApprove: false,
    fitView: 'short',
    slots: DEFAULT_SETTINGS.slots,
    setupDone: false,
    updateCheck: true,
    engine: 'claude-code'
  })
})

test('by default, file changes inside the folder and reading the web do not ask', () => {
  assert.equal(DEFAULT_SETTINGS.askEveryChange, false)
  assert.equal(DEFAULT_SETTINGS.askWeb, false)
})

test('auto-approve is off and the fit view is short by default; bad values are dropped', () => {
  assert.equal(DEFAULT_SETTINGS.autoApprove, false)
  assert.equal(DEFAULT_SETTINGS.fitView, 'short')
  assert.equal(cleanSettings({ autoApprove: true, fitView: 'detail' }).autoApprove, true)
  assert.equal(cleanSettings({ autoApprove: true, fitView: 'detail' }).fitView, 'detail')
  assert.equal(cleanSettings({ autoApprove: 'yes', fitView: 'huge' }).autoApprove, false)
  assert.equal(cleanSettings({ autoApprove: 'yes', fitView: 'huge' }).fitView, 'short')
})

test('drops unknown keys and bad values', () => {
  assert.deepEqual(cleanSettings({ theme: 'neon', guide: 'yes', askEveryChange: 'no', extra: 1 }), DEFAULT_SETTINGS)
  assert.deepEqual(cleanSettings(null), DEFAULT_SETTINGS)
  assert.deepEqual(cleanSettings('midnight'), DEFAULT_SETTINGS)
})

test('a patch only changes what it names', () => {
  const base = { theme: 'light-relax' as const, guide: false, askEveryChange: true, askWeb: false, autoApprove: false, fitView: 'short' as const, slots: DEFAULT_SETTINGS.slots, setupDone: false, updateCheck: true, engine: 'claude-code' as const }
  assert.deepEqual(cleanSettings({ guide: true }, base), { theme: 'light-relax', guide: true, askEveryChange: true, askWeb: false, autoApprove: false, fitView: 'short', slots: DEFAULT_SETTINGS.slots, setupDone: false, updateCheck: true, engine: 'claude-code' })
})

test('the engine is one of the two run engines; anything else keeps the current one', () => {
  assert.equal(DEFAULT_SETTINGS.engine, 'claude-code')
  assert.equal(cleanSettings({ engine: 'api-key' }).engine, 'api-key')
  assert.equal(cleanSettings({ engine: 'codex' }).engine, 'claude-code')
  assert.equal(cleanSettings({ engine: 'bypass' }, { ...DEFAULT_SETTINGS, engine: 'api-key' }).engine, 'api-key')
})

test('setupDone is kept only as a boolean', () => {
  assert.equal(cleanSettings({ setupDone: true }).setupDone, true)
  assert.equal(cleanSettings({ setupDone: 'yes' }).setupDone, false)
})

import { cleanSlots, DEFAULT_SLOTS, isScrapeInput, slotsArg, sourceOf } from '../src/shared/slots.ts'

test('source slots default to 5 each and are passed as --slots', () => {
  assert.deepEqual(DEFAULT_SETTINGS.slots, { linkedin: 5, freehire: 5, indeed: 5, careers: 5 })
  assert.equal(slotsArg(DEFAULT_SLOTS), '--slots linkedin=5,freehire=5,indeed=5,careers=5')
  assert.equal(slotsArg({ linkedin: 0, freehire: 8, indeed: 2, careers: 10 }), '--slots linkedin=0,freehire=8,indeed=2,careers=10')
})

test('slots: whole numbers 0 or more, anything else keeps the previous value', () => {
  assert.deepEqual(cleanSlots({ linkedin: 0, indeed: 12 }), { linkedin: 0, freehire: 5, indeed: 12, careers: 5 })
  assert.deepEqual(cleanSlots({ linkedin: -1, freehire: 2.5, indeed: '3', careers: NaN }), DEFAULT_SLOTS)
  assert.deepEqual(cleanSlots({ linkedin: 1e9, bogus: 4 }), DEFAULT_SLOTS)
  assert.deepEqual(cleanSettings({ slots: { indeed: 7 } }).slots, { linkedin: 5, freehire: 5, indeed: 7, careers: 5 })
  assert.deepEqual(cleanSettings({ guide: false }, { ...DEFAULT_SETTINGS, slots: { ...DEFAULT_SLOTS, indeed: 9 } }).slots.indeed, 9)
  assert.equal(DEFAULT_SETTINGS.slots.indeed, 5, 'defaults are never mutated')
})

test('source label follows the framework mapping; unknown tags are "other"', () => {
  assert.equal(sourceOf('LinkedIn'), 'linkedin')
  assert.equal(sourceOf('freehire-search'), 'freehire')
  assert.equal(sourceOf('Indeed connector'), 'indeed')
  assert.equal(sourceOf('careers: acme.example'), 'careers')
  assert.equal(sourceOf('whatjobs'), 'other')
  assert.equal(sourceOf(''), 'other')
})

test('/scrape accepts only nothing, a slots override or a drop list', () => {
  assert.ok(isScrapeInput(''))
  assert.ok(isScrapeInput('--slots linkedin=5,freehire=5,indeed=5,careers=5'))
  assert.ok(isScrapeInput('--slots indeed=3'))
  assert.ok(isScrapeInput('drop acme_analyst-3f2a1b'))
  assert.ok(isScrapeInput('drop a_b,c_d'))
  assert.ok(!isScrapeInput('--slots linkedin=5; rm -rf /'))
  assert.ok(!isScrapeInput('--slots bogus=5'))
  assert.ok(!isScrapeInput('drop a b'))
  assert.ok(!isScrapeInput('drop a;b'))
  assert.ok(!isScrapeInput('drop '))
  assert.ok(!isScrapeInput('hello'))
})
