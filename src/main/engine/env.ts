/**
 * Environment for the CLI: the person's own, minus markers that would confuse a nested run.
 * Background tasks are switched off: a run is one turn, and the app ends the process when the turn
 * ends. A command like /rank hands postings to scoring agents; left to run in the background, the
 * turn ended with "waiting for the agents" and the process exit killed them before any score was
 * written. In the foreground the turn waits for them.
 *
 * Credentials are scrubbed from every command the AI runs (CLAUDE_CODE_SUBPROCESS_ENV_SCRUB):
 * Claude Code itself keeps them, but a Bash or PowerShell step does not see ANTHROPIC_API_KEY,
 * sign-in tokens and the like. Checked 2026-11-16 with Claude Code 2.1.325: with the switch on, a
 * variable on its list was empty inside a Bash step while an ordinary variable came through.
 */
export function childEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...base }
  for (const key of ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL']) {
    delete env[key]
  }
  env['CLAUDE_CODE_DISABLE_BACKGROUND_TASKS'] = '1'
  env['CLAUDE_CODE_SUBPROCESS_ENV_SCRUB'] = '1'
  return env
}

/**
 * The "Anthropic API key" engine: the same environment with the person's key, and every other
 * way of signing in removed, so the run is billed to that key and nothing else.
 */
export function apiKeyEnv(key: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = childEnv(base)
  for (const k of ['CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_REFRESH_TOKEN', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_PROFILE', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']) {
    delete env[k]
  }
  env['ANTHROPIC_API_KEY'] = key
  return env
}
