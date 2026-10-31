import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanSettings, DEFAULT_SETTINGS } from '../src/shared/ipc.ts'

test('keeps valid values', () => {
  assert.deepEqual(cleanSettings({ theme: 'midnight', guide: false, askEveryChange: true }), {
    theme: 'midnight',
    guide: false,
    askEveryChange: true
  })
})

test('by default, file changes inside the folder do not ask', () => {
  assert.equal(DEFAULT_SETTINGS.askEveryChange, false)
})

test('drops unknown keys and bad values', () => {
  assert.deepEqual(cleanSettings({ theme: 'neon', guide: 'yes', askEveryChange: 'no', extra: 1 }), DEFAULT_SETTINGS)
  assert.deepEqual(cleanSettings(null), DEFAULT_SETTINGS)
  assert.deepEqual(cleanSettings('midnight'), DEFAULT_SETTINGS)
})

test('a patch only changes what it names', () => {
  const base = { theme: 'light-relax' as const, guide: false, askEveryChange: true }
  assert.deepEqual(cleanSettings({ guide: true }, base), { theme: 'light-relax', guide: true, askEveryChange: true })
})
