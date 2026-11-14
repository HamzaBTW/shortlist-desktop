import assert from 'node:assert/strict'
import { test } from 'node:test'
import { firstWebLink, postingLink } from '../src/shared/links.ts'

test('finds the first web link and trims punctuation', () => {
  assert.equal(firstWebLink('See https://jobs.uber.com/en/, thanks'), 'https://jobs.uber.com/en/')
  assert.equal(firstWebLink('https://x.com/a (ranked by /rank; job key: k)'), 'https://x.com/a')
  assert.equal(firstWebLink('javascript:alert(1)'), null)
  assert.equal(firstWebLink('no link here'), null)
})

test('the tracker source wins, then the pasted input', () => {
  assert.equal(postingLink('https://a.com/1', 'https://b.com/2'), 'https://a.com/1')
  assert.equal(postingLink('', 'https://b.com/2'), 'https://b.com/2')
  assert.equal(postingLink(undefined, 'pasted job text'), null)
})
