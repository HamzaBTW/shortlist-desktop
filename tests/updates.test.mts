import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkDue, compareVersions, DAY_MS, parseSemver, pickUpdate, RELEASES_API, RELEASES_PAGE } from '../src/shared/updates.ts'

const rel = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  html_url: `https://github.com/HamzaBTW/shortlist-desktop/releases/tag/${tag}`,
  draft: false,
  prerelease: tag.includes('-'),
  ...extra
})

test('versions compare like semantic versions, pre-releases before their release', () => {
  assert.ok(compareVersions('0.2.0', '0.1.0') > 0)
  assert.ok(compareVersions('0.1.10', '0.1.9') > 0)
  assert.ok(compareVersions('v1.0.0', '0.9.9') > 0)
  assert.ok(compareVersions('0.2.0-beta.1', '0.1.0') > 0)
  assert.ok(compareVersions('0.2.0-beta.1', '0.2.0') < 0)
  assert.ok(compareVersions('0.2.0-beta.2', '0.2.0-beta.10') < 0)
  assert.ok(compareVersions('0.2.0-alpha', '0.2.0-beta') < 0)
  assert.ok(compareVersions('0.2.0-1', '0.2.0-alpha') < 0)
  assert.equal(compareVersions('0.1.0', 'v0.1.0'), 0)
  assert.equal(parseSemver('latest'), null)
  assert.equal(parseSemver('0.1'), null)
  assert.equal(parseSemver('0.1.0; rm -rf'), null)
})

test('the newest newer release wins; older, equal and draft releases are ignored', () => {
  const list = [rel('v0.1.0'), rel('v0.3.0', { draft: true }), rel('v0.2.0'), rel('v0.2.1-beta.1')]
  assert.deepEqual(pickUpdate(list, '0.1.0'), { version: '0.2.1-beta.1', url: list[3]!.html_url })
  assert.equal(pickUpdate([rel('v0.1.0')], '0.1.0'), null)
  assert.equal(pickUpdate([rel('v0.0.9')], '0.1.0'), null)
})

test('only this repo\'s release pages are accepted as links', () => {
  const bad = [
    rel('v9.0.0', { html_url: 'https://evil.example/HamzaBTW/shortlist-desktop/releases/tag/v9.0.0' }),
    rel('v9.0.0', { html_url: 'https://github.com/someone/shortlist-desktop/releases/tag/v9.0.0' }),
    rel('v9.0.0', { html_url: 'http://github.com/HamzaBTW/shortlist-desktop/releases/tag/v9.0.0' }),
    rel('v9.0.0', { html_url: 'https://github.com/HamzaBTW/shortlist-desktop/releases/download/v9.0.0/x.exe' }),
    rel('v9.0.0', { html_url: 'https://github.com/HamzaBTW/shortlist-desktop/releases/tag/v9.0.0?x=javascript:1' })
  ]
  for (const r of bad) assert.equal(pickUpdate([r], '0.1.0'), null, r.html_url as string)
})

test('anything that is not a release list gives no update', () => {
  for (const junk of [null, {}, 'text', 42, [null, 1, 'x', { tag_name: 5 }], { message: 'Not Found' }]) {
    assert.equal(pickUpdate(junk, '0.1.0'), null)
  }
})

test('the check is due at most once a day (or when the clock went back)', () => {
  const now = Date.UTC(2026, 10, 15, 12)
  assert.equal(checkDue(null, now), true)
  assert.equal(checkDue(now - DAY_MS + 60_000, now), false)
  assert.equal(checkDue(now - DAY_MS, now), true)
  assert.equal(checkDue(now + 3_600_000, now), true)
})

test('the check asks for the full release list of this repo only', () => {
  assert.equal(RELEASES_API, 'https://api.github.com/repos/HamzaBTW/shortlist-desktop/releases?per_page=30')
  assert.equal(RELEASES_PAGE, 'https://github.com/HamzaBTW/shortlist-desktop/releases')
})
