import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { documentsFor, newDocs, scanDocs, snapshotDocs } from '../src/main/doc-files.ts'

function folder(): string {
  const ws = mkdtempSync(path.join(os.tmpdir(), 'shortlist-docs-'))
  for (const d of ['cv', 'cover_letters', 'cv/acme_designer', 'documents']) mkdirSync(path.join(ws, d), { recursive: true })
  return ws
}
const put = (ws: string, rel: string, mtime?: number): void => {
  writeFileSync(path.join(ws, rel), '%PDF-1.4')
  if (mtime) utimesSync(path.join(ws, rel), mtime, mtime)
}

test('scanDocs lists PDFs and .tex drafts in cv/, cover_letters/ and one folder below, nothing else', () => {
  const ws = folder()
  try {
    put(ws, 'cv/main_acme_designer.pdf')
    put(ws, 'cv/main_acme_designer.tex')
    put(ws, 'cv/acme_designer/Sam_CV.pdf')
    put(ws, 'cover_letters/cover_acme_designer.pdf')
    put(ws, 'documents/diploma.pdf')
    mkdirSync(path.join(ws, 'cv/acme_designer/deeper'))
    put(ws, 'cv/acme_designer/deeper/too_deep.pdf')
    assert.deepEqual(scanDocs(ws).map((f) => f.path).sort(), [
      'cover_letters/cover_acme_designer.pdf',
      'cv/acme_designer/Sam_CV.pdf',
      'cv/main_acme_designer.pdf',
      'cv/main_acme_designer.tex'
    ])
  } finally {
    rmSync(ws, { recursive: true, force: true })
  }
})

test('a run reports the PDFs it wrote or rewrote', () => {
  const ws = folder()
  try {
    put(ws, 'cv/old.pdf', 1000)
    put(ws, 'cv/redo.pdf', 1000)
    const before = snapshotDocs(ws)
    put(ws, 'cv/redo.pdf', 2000)
    put(ws, 'cover_letters/new.pdf', 2000)
    assert.deepEqual(newDocs(ws, before), ['cover_letters/new.pdf', 'cv/redo.pdf'])
  } finally {
    rmSync(ws, { recursive: true, force: true })
  }
})

test('documentsFor prefers recorded files, then falls back to names, and ignores bad paths', () => {
  const ws = folder()
  try {
    put(ws, 'cv/main_acme_designer.pdf')
    put(ws, 'cover_letters/cover_acme_designer.pdf')
    put(ws, 'cv/main_other_chef.pdf')
    const recorded = documentsFor(ws, { paths: ['cv/main_other_chef.pdf', '../x.pdf', 7], company: 'Acme', role: 'Designer' })
    assert.deepEqual(recorded.files.map((f) => f.path), ['cv/main_other_chef.pdf'])
    assert.equal(recorded.byName, false)
    const byName = documentsFor(ws, { paths: [], company: 'Acme', role: 'Designer' })
    assert.deepEqual(byName.files.map((f) => f.path), ['cv/main_acme_designer.pdf', 'cover_letters/cover_acme_designer.pdf'])
    assert.equal(byName.byName, true)
    assert.deepEqual(documentsFor(ws, { paths: [], company: '', role: '' }).files, [])
  } finally {
    rmSync(ws, { recursive: true, force: true })
  }
})

test('documentsFor uses the file names a tracker row records before guessing', () => {
  const ws = folder()
  try {
    put(ws, 'cv/main_acme_designer.pdf')
    put(ws, 'cover_letters/cover_acme_designer.pdf')
    put(ws, 'cv/main_acme_researcher.pdf')
    // The tracker says .tex and uses another role wording: the names still find the PDFs.
    const r = documentsFor(ws, { paths: [], company: 'Acme', role: 'Lead', hints: ['main_acme_designer.tex', 'cover_acme_designer.tex'] })
    assert.deepEqual(r.files.map((f) => f.path), ['cv/main_acme_designer.pdf', 'cover_letters/cover_acme_designer.pdf'])
    assert.equal(r.byName, false)
  } finally {
    rmSync(ws, { recursive: true, force: true })
  }
})

test('a symbolic link in cv/ is not listed', (t) => {
  const ws = folder()
  try {
    const outside = mkdtempSync(path.join(os.tmpdir(), 'shortlist-outside-'))
    put(outside, 'secret.pdf')
    try {
      symlinkSync(path.join(outside, 'secret.pdf'), path.join(ws, 'cv/link.pdf'))
    } catch {
      t.skip('symlinks are not allowed here')
      return
    } finally {
      // The outside folder is removed below either way.
    }
    assert.deepEqual(scanDocs(ws), [])
    rmSync(outside, { recursive: true, force: true })
  } finally {
    rmSync(ws, { recursive: true, force: true })
  }
})
