import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanSettings, DEFAULT_SETTINGS } from '../src/shared/ipc.ts'

test('keeps valid values', () => {
  assert.deepEqual(cleanSettings({ theme: 'midnight', guide: false }), { theme: 'midnight', guide: false })
})

test('drops unknown keys and bad values', () => {
  assert.deepEqual(cleanSettings({ theme: 'neon', guide: 'yes', extra: 1 }), DEFAULT_SETTINGS)
  assert.deepEqual(cleanSettings(null), DEFAULT_SETTINGS)
  assert.deepEqual(cleanSettings('midnight'), DEFAULT_SETTINGS)
})

test('a patch only changes what it names', () => {
  const base = { theme: 'light-relax' as const, guide: false }
  assert.deepEqual(cleanSettings({ guide: true }, base), { theme: 'light-relax', guide: true })
})
