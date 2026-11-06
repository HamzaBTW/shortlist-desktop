import path from 'node:path'

// Rules the app applies on top of the workspace's own .claude/settings.json.
// The CLI only asks us about actions those settings don't already allow.
// Some actions are refused outright; everything else goes to the person.

export type Verdict = { decision: 'deny'; reason: string } | { decision: 'ask' } | { decision: 'allow' }

export interface PolicyOptions {
  /** Let WebFetch / WebSearch go ahead without a card. */
  allowWeb?: boolean
  /** The slash command this run belongs to (apply, scrape, ...), as the app started it. */
  command?: string
}

const WEB_TOOLS = new Set(['WebFetch', 'WebSearch'])

export type DenyReason = 'outsideFolder' | 'gitPush' | 'deleteFolder' | 'admin' | 'indeedResume' | 'indeedCompany'

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

/**
 * The Indeed connector's tools, whatever the connector is called on this machine
 * (e.g. mcp__claude_ai_Indeed__search_jobs). Returns the tool's own name, or null.
 */
export function indeedTool(tool: string): string | null {
  // mcp__<server>__<tool>: exactly three parts, and the server's name says Indeed.
  const [prefix, server, name, ...rest] = tool.split('__')
  if (prefix !== 'mcp' || !server || !name || rest.length > 0) return null
  return /^[A-Za-z0-9_-]*indeed[A-Za-z0-9_-]*$/i.test(server) && /^[A-Za-z0-9_]+$/.test(name) ? name : null
}

function judgeIndeed(name: string, command: string | undefined): Verdict {
  switch (name) {
    // Searching and reading a posting is what the connector is for: no card.
    case 'search_jobs':
    case 'get_job_details':
      return { decision: 'allow' }
    // The person's own Indeed résumé: never read by any command.
    case 'get_resume':
      return { decision: 'deny', reason: 'indeedResume' }
    // Company details only help when drafting an application.
    case 'get_company_data':
      return command === 'apply' ? { decision: 'ask' } : { decision: 'deny', reason: 'indeedCompany' }
    default:
      return { decision: 'ask' }
  }
}

export function judge(tool: string, input: Record<string, unknown>, workspace: string, opts: PolicyOptions = {}): Verdict {
  const indeed = indeedTool(tool)
  if (indeed) return judgeIndeed(indeed, opts.command)

  if (WEB_TOOLS.has(tool)) return opts.allowWeb ? { decision: 'allow' } : { decision: 'ask' }

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
