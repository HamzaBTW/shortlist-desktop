/**
 * Environment for the CLI: the person's own, minus markers that would confuse a nested run.
 * Background tasks are switched off: a run is one turn, and the app ends the process when the turn
 * ends. A command like /rank hands postings to scoring agents; left to run in the background, the
 * turn ended with "waiting for the agents" and the process exit killed them before any score was
 * written. In the foreground the turn waits for them.
 */
export function childEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...base }
  for (const key of ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL']) {
    delete env[key]
  }
  env['CLAUDE_CODE_DISABLE_BACKGROUND_TASKS'] = '1'
  return env
}
