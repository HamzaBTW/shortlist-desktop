import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { changedDocs, DOC_DIRS, isDocPath, kindOf, matchDocuments, namedDocuments, withoutCompiledDrafts, type DocFile } from '../shared/documents.ts'

// Reads the drafted PDFs in cv/ and cover_letters/ (one folder level below is allowed, for
// cv/<company>_<role>/). Read only: the app never writes, moves or deletes these files.

/** Every PDF and .tex draft in the two folders: path (forward slashes) and last-modified time. */
export function scanDocs(workspace: string): DocFile[] {
  const out: DocFile[] = []
  for (const top of DOC_DIRS) {
    const walk = (rel: string, depth: number): void => {
      let entries
      try {
        entries = readdirSync(path.join(workspace, rel), { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        const child = `${rel}/${e.name}`
        // Symbolic links are skipped: they could point outside the folder.
        if (e.isFile() && /\.(pdf|tex)$/i.test(e.name)) {
          try {
            out.push({
              path: child,
              name: e.name,
              kind: kindOf(child),
              modified: statSync(path.join(workspace, child)).mtimeMs,
              draft: /\.tex$/i.test(e.name)
            })
          } catch {
            // The file went away while reading; skip it.
          }
        } else if (e.isDirectory() && depth < 1) {
          walk(child, depth + 1)
        }
      }
    }
    walk(top, 0)
  }
  return out
}

export function snapshotDocs(workspace: string): Map<string, number> {
  return new Map(scanDocs(workspace).map((f) => [f.path, f.modified]))
}

/** PDFs and drafts added or changed since `before` was taken. */
export function newDocs(workspace: string, before: Map<string, number>): string[] {
  return changedDocs(before, snapshotDocs(workspace))
}

export interface DocumentsRequest {
  paths: unknown
  company: unknown
  role: unknown
  /** File names from the tracker row (CV, cover letter). */
  hints?: unknown
}

export interface DocumentsResult {
  files: DocFile[]
  /** True when the files were found by name (jobs drafted before files were recorded). */
  byName: boolean
}

/** The files a job drafted: recorded ones, else those its tracker row names, else a best-effort name match. */
export function documentsFor(workspace: string, req: DocumentsRequest): DocumentsResult {
  const all = scanDocs(workspace)
  const paths = Array.isArray(req.paths) ? req.paths.filter(isDocPath) : []
  const stems = paths.map((p) => p.replace(/\.(pdf|tex)$/i, '').toLowerCase())
  const recorded = all.filter((f) => stems.includes(f.path.replace(/\.(pdf|tex)$/i, '').toLowerCase()))
  if (recorded.length > 0) return { files: withoutCompiledDrafts(recorded), byName: false }
  const hints = Array.isArray(req.hints) ? req.hints.filter((h): h is string => typeof h === 'string' && h.length < 300) : []
  const named = namedDocuments(all, hints)
  if (named.length > 0) return { files: withoutCompiledDrafts(named), byName: false }
  const company = typeof req.company === 'string' ? req.company : ''
  const role = typeof req.role === 'string' ? req.role : ''
  return { files: withoutCompiledDrafts(matchDocuments(all, company, role)), byName: true }
}
