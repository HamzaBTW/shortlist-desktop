import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { resolveInside } from '../src/main/safe-path.ts'

const root = path.resolve('/app/renderer')

test('serves files inside the folder', () => {
  assert.equal(resolveInside(root, '/index.html'), path.join(root, 'index.html'))
  assert.equal(resolveInside(root, '/assets/app.js'), path.join(root, 'assets', 'app.js'))
  assert.equal(resolveInside(root, '/assets/my%20font.woff2'), path.join(root, 'assets', 'my font.woff2'))
})

test('allows names that merely start with two dots', () => {
  assert.equal(resolveInside(root, '/..hidden.js'), path.join(root, '..hidden.js'))
})

test('refuses to climb out of the folder', () => {
  for (const p of ['/../secret.txt', '/assets/../../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/..%5csecret.txt']) {
    assert.equal(resolveInside(root, p), null, p)
  }
})

test('refuses absolute paths and other drives', () => {
  assert.equal(resolveInside(root, '//etc/passwd'), path.join(root, 'etc', 'passwd'))
  if (process.platform === 'win32') {
    assert.equal(resolveInside(root, '/C:/Windows/win.ini'), null)
    assert.equal(resolveInside(root, '/D:%5Cdata.txt'), null)
  }
})

test('refuses the folder itself, bad encoding and null bytes', () => {
  assert.equal(resolveInside(root, '/'), null)
  assert.equal(resolveInside(root, '/%E0%A4%A'), null)
  assert.equal(resolveInside(root, '/index.html%00.png'), null)
})
