// The files a command drafts (CV, cover letter): the compiled PDFs and the .tex drafts /apply
// stops at for review. Which folders they live in, which are new after a run, and which belong
// to a company. Pure functions; the app only ever reads.

export const DOC_DIRS = ['cv', 'cover_letters'] as const

export type DocKind = 'cv' | 'coverLetter'

export interface DocFile {
  /** Relative to the folder, with forward slashes, e.g. cv/main_acme_designer.pdf. */
  path: string
  name: string
  kind: DocKind
  modified: number
  /** A .tex draft that has not been compiled to PDF. */
  draft: boolean
}

export function kindOf(relPath: string): DocKind {
  const name = relPath.split('/').pop() ?? relPath
  return /cover/i.test(name) ? 'coverLetter' : 'cv'
}

/** A PDF or .tex draft directly in cv/ or cover_letters/ (or one folder below), never a path that climbs out. */
export function isDocPath(rel: unknown): rel is string {
  if (typeof rel !== 'string' || rel.length === 0 || rel.length > 260) return false
  if (rel.includes('\\') || rel.includes('\0') || rel.startsWith('/') || /^[a-z]:/i.test(rel)) return false
  const parts = rel.split('/')
  if (parts.length < 2 || parts.length > 3) return false
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return false
  if (!(DOC_DIRS as readonly string[]).includes(parts[0]!)) return false
  return /\.(pdf|tex)$/i.test(parts[parts.length - 1]!)
}

/** Hides a .tex draft once its PDF exists (same folder, same name): the PDF is the finished one. */
export function withoutCompiledDrafts(files: DocFile[]): DocFile[] {
  const pdfs = new Set(files.filter((f) => !f.draft).map((f) => f.path.replace(/\.pdf$/i, '').toLowerCase()))
  return files.filter((f) => !f.draft || !pdfs.has(f.path.replace(/\.tex$/i, '').toLowerCase()))
}

/** Files that are new, or newer than before, after a run. */
export function changedDocs(before: Map<string, number>, after: Map<string, number>): string[] {
  const out: string[] = []
  for (const [path, modified] of after) {
    const was = before.get(path)
    if (was === undefined || modified > was) out.push(path)
  }
  return out.sort()
}

const stemOf = (name: string): string =>
  (name.replace(/\\/g, '/').split('/').pop() ?? '').replace(/\.(pdf|tex|docx?|aux|log)$/i, '').trim().toLowerCase()

/**
 * The files a tracker row names (its CV and cover letter columns), in any spelling: with or
 * without a folder, as .tex or .pdf. Matches on the file name without its extension.
 */
export function namedDocuments(all: DocFile[], names: string[]): DocFile[] {
  const stems = new Set(names.map(stemOf).filter(Boolean))
  if (stems.size === 0) return []
  return all.filter((f) => stems.has(stemOf(f.name))).sort((a, b) => (a.kind === b.kind ? b.modified - a.modified : a.kind === 'cv' ? -1 : 1))
}

const SUFFIXES = new Set(['inc', 'ltd', 'llc', 'limited', 'corp', 'co', 'plc', 'gmbh'])
const STOP = new Set(['and', 'of', 'the', 'for', 'at', 'in', 'a', 'an'])

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)

/**
 * Best-effort: the files whose names carry the company (as whole words, in order) and at
 * least half of the role's words. Used only for jobs drafted before files were recorded.
 */
export function matchDocuments(all: DocFile[], company: string, role: string): DocFile[] {
  const co = words(company).filter((w) => !SUFFIXES.has(w))
  if (co.length === 0) return []
  const roleWords = words(role).filter((w) => w.length > 1 && !STOP.has(w))
  const need = Math.ceil(roleWords.length / 2)
  const phrase = ` ${co.join(' ')} `
  return all
    .filter((f) => {
      const stem = words(f.name.replace(/\.(pdf|tex)$/i, ''))
      if (!` ${stem.join(' ')} `.includes(phrase)) return false
      return roleWords.length === 0 || roleWords.filter((w) => stem.includes(w)).length >= need
    })
    .sort((a, b) => (a.kind === b.kind ? b.modified - a.modified : a.kind === 'cv' ? -1 : 1))
}

/**
 * The folder /apply makes for one application (cv/<company>_<role>/), worked out from a drafted
 * file: cv/main_acme_designer.pdf and cover_letters/cover_acme_designer.tex both point to
 * cv/acme_designer. A file already inside such a folder points to that folder. Null when the
 * name has no main_ / cover_ prefix.
 */
export function applicationFolderFor(rel: string): string | null {
  const parts = rel.split('/')
  if (parts.length === 3 && parts[0] === 'cv') return `${parts[0]}/${parts[1]}`
  if (parts.length !== 2) return null
  const m = /^(?:main|cover)_(.+)\.(?:pdf|tex)$/i.exec(parts[1]!)
  return m ? `cv/${m[1]}` : null
}
