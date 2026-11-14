import assert from 'node:assert/strict'
import { test } from 'node:test'
import { childEnv } from '../src/main/engine/env.ts'

test('the CLI runs with background tasks off, so a turn waits for its scoring agents', () => {
  const env = childEnv({ PATH: 'x', CLAUDECODE: '1', ELECTRON_RUN_AS_NODE: '1' })
  assert.equal(env['CLAUDE_CODE_DISABLE_BACKGROUND_TASKS'], '1')
  assert.equal(env['PATH'], 'x')
  assert.equal(env['CLAUDECODE'], undefined)
  assert.equal(env['ELECTRON_RUN_AS_NODE'], undefined)
})
