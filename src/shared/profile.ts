import type { SetupSection } from './engine.ts'

// The Profile screen: one read-only card per real profile file. The app never edits them;
// "Open file" opens the Markdown in the person's own editor and "Update with AI" runs
// `/setup --section <name>` with only the sections that write that file (decided 2026-11-14).

const SKILL = '.claude/skills/job-application-assistant'

export type CardId = 'settings' | 'candidate' | 'behavioral' | 'writing' | 'evaluation' | 'templates' | 'interview' | 'search'

export interface CardDef {
  id: CardId
  /** Relative to the job-search folder, forward slashes. */
  files: string[]
  /** /setup sections that write this card's file(s). Empty: "Open file" only. */
  sections: SetupSection[]
  /** The template has no placeholders, so "filled in" can't be told; no badge. */
  noBadge?: boolean
}

export const PROFILE_CARDS: CardDef[] = [
  { id: 'settings', files: ['CLAUDE.md'], sections: ['identity', 'goals'] },
  { id: 'candidate', files: [`${SKILL}/01-candidate-profile.md`], sections: ['identity', 'education', 'experience', 'skills', 'publications', 'references'] },
  { id: 'behavioral', files: [`${SKILL}/02-behavioral-profile.md`], sections: ['behavioral'] },
  { id: 'writing', files: [`${SKILL}/03-writing-style.md`], sections: [], noBadge: true },
  { id: 'evaluation', files: [`${SKILL}/04-job-evaluation.md`], sections: ['skills', 'goals'] },
  { id: 'templates', files: [`${SKILL}/05-cv-templates.md`, `${SKILL}/06-cover-letter-templates.md`], sections: [] },
  { id: 'interview', files: [`${SKILL}/07-interview-prep.md`], sections: [] },
  { id: 'search', files: ['.claude/skills/job-scraper/search-queries.md'], sections: ['search'] }
]

/** The template's placeholders: [YOUR_NAME], [WHAT YOU DID], [ROLE_TYPE_1]. Not links or [x]. */
const PLACEHOLDER = /\[[A-Z][A-Z0-9_ /-]{2,}\]/g

export interface FileSummary {
  file: string
  found: boolean
  /** Placeholders still in the file. */
  placeholders: number
  /** The file's section headings (## and ###), placeholders shown as "…". */
  parts: string[]
  /** Headings of the sections that still hold placeholders. */
  toFill: string[]
}

export interface CardSummary {
  id: CardId
  files: FileSummary[]
}

function cleanHeading(raw: string): string {
  return raw
    .replace(/^#+\s*/, '')
    .replace(PLACEHOLDER, '…')
    .replace(/[*_`]/g, '')
    .replace(/\s*\(.*?\)\s*$/, '')
    .replace(/\s+[—–]\s+.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

/** What a card shows about one file. Never shows the file's own text, only headings and counts. */
export function summarize(markdown: string, file: string): FileSummary {
  const lines = markdown.split(/\r?\n/)
  const parts: string[] = []
  const toFill: string[] = []
  let current: string | null = null
  let currentHas = false
  let total = 0
  let inFence = false
  const close = (): void => {
    if (current && currentHas && !toFill.includes(current)) toFill.push(current)
  }
  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence
    const count = (line.match(PLACEHOLDER) ?? []).length
    total += count
    // Sections are the ## headings; ### subsections roll up into theirs. Before the first ##,
    // a ### heading stands in as the section.
    const h = inFence ? null : /^(#{2,3})\s+\S/.exec(line)
    if (h && (h[1] === '##' || current === null)) {
      close()
      const title = cleanHeading(line)
      current = title && title !== '…' ? title : null
      currentHas = false
      if (current && h[1] === '##' && !parts.includes(current)) parts.push(current)
    }
    if (h) {
      // A heading that is itself a placeholder counts towards its section.
      if (count > 0) currentHas = true
      continue
    }
    if (count > 0) currentHas = true
  }
  close()
  return { file, found: true, placeholders: total, parts: parts.slice(0, 12), toFill: toFill.slice(0, 12) }
}

export function missingFile(file: string): FileSummary {
  return { file, found: false, placeholders: 0, parts: [], toFill: [] }
}

const OPENABLE = new Set(PROFILE_CARDS.flatMap((c) => c.files))

/**
 * Files the app may open in the person's own apps (a separate channel from the PDF rule):
 * the profile files and skills reports. Exact relative paths only.
 */
export function isOpenablePath(rel: unknown): rel is string {
  if (typeof rel !== 'string' || rel.length > 200) return false
  if (OPENABLE.has(rel)) return true
  return /^upskill\/report-[A-Za-z0-9_.-]{1,80}\.md$/.test(rel) && !rel.includes('..')
}
