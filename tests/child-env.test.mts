import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apiKeyEnv, childEnv } from '../src/main/engine/env.ts'

test('the CLI runs with background tasks off, so a turn waits for its scoring agents', () => {
  const env = childEnv({ PATH: 'x', CLAUDECODE: '1', ELECTRON_RUN_AS_NODE: '1' })
  assert.equal(env['CLAUDE_CODE_DISABLE_BACKGROUND_TASKS'], '1')
  assert.equal(env['PATH'], 'x')
  assert.equal(env['CLAUDECODE'], undefined)
  assert.equal(env['ELECTRON_RUN_AS_NODE'], undefined)
})

test('commands the AI runs never see credentials (Claude Code scrubs them from its subprocesses)', () => {
  assert.equal(childEnv({})['CLAUDE_CODE_SUBPROCESS_ENV_SCRUB'], '1')
  assert.equal(apiKeyEnv('sk-ant-x', {})['CLAUDE_CODE_SUBPROCESS_ENV_SCRUB'], '1')
})

test('the API-key engine runs on the key only: other sign-ins and redirects are removed', () => {
  const env = apiKeyEnv('sk-ant-api03-key', {
    PATH: 'x',
    CLAUDE_CODE_OAUTH_TOKEN: 'oauth',
    ANTHROPIC_AUTH_TOKEN: 'token',
    ANTHROPIC_BASE_URL: 'https://elsewhere.example',
    CLAUDE_CODE_USE_BEDROCK: '1',
    ANTHROPIC_API_KEY: 'someone-elses'
  })
  assert.equal(env['ANTHROPIC_API_KEY'], 'sk-ant-api03-key')
  for (const k of ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK']) assert.equal(env[k], undefined, k)
  assert.equal(env['PATH'], 'x')
  assert.equal(env['CLAUDE_CODE_DISABLE_BACKGROUND_TASKS'], '1')
})

test('"Your Claude Code" is left to the person\'s own sign-in', () => {
  assert.equal(childEnv({ CLAUDE_CODE_OAUTH_TOKEN: 'oauth' })['CLAUDE_CODE_OAUTH_TOKEN'], 'oauth')
})
