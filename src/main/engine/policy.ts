import path from 'node:path'

// Rules the app applies on top of the workspace's own .claude/settings.json.
// The CLI only asks us about actions those settings don't already allow.
// Some actions are refused outright; everything else goes to the person.

export type Verdict = { decision: 'deny'; reason: string } | { decision: 'ask' }

export type DenyReason = 'outsideFolder' | 'gitPush' | 'deleteFolder' | 'admin'

const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
const FILE_TOOLS: Record<string, string> = {
  Write: 'file_path',
  Edit: 'file_path',
  MultiEdit: 'file_path',
  NotebookEdit: 'notebook_path'
}

const SHELL_RULES: { reason: DenyReason; pattern: RegExp }[] = [
  { reason: 'gitPush', pattern: /\bgit\b[^\n;&|]*\bpush\b/i },
  // rm -r / -rf / -fr / --recursive, rmdir /s, rd /s, del /s, Remove-Item -Recurse
  { reason: 'deleteFolder', pattern: /\brm\s+(-[a-z]*r[a-z]*|--recursive)\b/i },
  { reason: 'deleteFolder', pattern: /\b(rmdir|rd|del|erase)\b[^\n;&|]*\s\/s\b/i },
  { reason: 'deleteFolder', pattern: /\bremove-item\b[^\n;&|]*-r(ecurse)?\b/i },
  { reason: 'deleteFolder', pattern: /\b(ri|rm|rmdir|del)\b[^\n;&|]*-recurse\b/i },
  { reason: 'admin', pattern: /\b(sudo|doas|runas|su)\b/i },
  { reason: 'admin', pattern: /-verb\s+runas\b/i }
]

function isInside(folder: string, target: string): boolean {
  const base = path.resolve(folder)
  const full = path.resolve(base, target)
  const a = process.platform === 'win32' ? base.toLowerCase() : base
  const b = process.platform === 'win32' ? full.toLowerCase() : full
  const rel = path.relative(a, b)
  return rel === '' || !(rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
}

export function judge(tool: string, input: Record<string, unknown>, workspace: string): Verdict {
  const fileKey = FILE_TOOLS[tool]
  if (fileKey) {
    const target = input[fileKey]
    if (typeof target !== 'string' || !isInside(workspace, target)) {
      return { decision: 'deny', reason: 'outsideFolder' }
    }
    return { decision: 'ask' }
  }

  if (SHELL_TOOLS.has(tool)) {
    const command = typeof input['command'] === 'string' ? input['command'] : ''
    for (const rule of SHELL_RULES) {
      if (rule.pattern.test(command)) return { decision: 'deny', reason: rule.reason }
    }
  }
  return { decision: 'ask' }
}
