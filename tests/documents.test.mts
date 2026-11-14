import assert from 'node:assert/strict'
import { test } from 'node:test'
import { changedDocs, isDocPath, kindOf, matchDocuments, namedDocuments, withoutCompiledDrafts, type DocFile } from '../src/shared/documents.ts'
import { shortenFit } from '../src/shared/fit.ts'

const file = (path: string, modified = 1): DocFile => ({ path, name: path.split('/').pop()!, kind: kindOf(path), modified, draft: /\.tex$/i.test(path) })

test('only PDFs and .tex drafts in cv/ and cover_letters/ can be opened', () => {
  for (const ok of ['cv/main_acme.pdf', 'cover_letters/cover_acme.PDF', 'cv/acme_designer/Sam_CV.pdf', 'cv/main_acme.tex', 'cover_letters/cover_acme.tex']) assert.equal(isDocPath(ok), true, ok)
  for (const bad of ['../cv/a.pdf', 'cv/../secret.pdf', 'cv/a.docx', 'cv/cover.cls', 'cv/a.aux', 'notes/a.pdf', '/etc/a.pdf', 'C:/a.pdf', 'cv\\a.pdf', 'cv/a/b/c.pdf', 'cv/', '', 5, null]) {
    assert.equal(isDocPath(bad), false, String(bad))
  }
})

test('kind comes from the file name', () => {
  assert.equal(kindOf('cv/main_acme.pdf'), 'cv')
  assert.equal(kindOf('cover_letters/cover_acme.pdf'), 'coverLetter')
  assert.equal(kindOf('cv/acme_designer/Sam_Cover_Letter.pdf'), 'coverLetter')
})

test('a run reports files that are new or newer', () => {
  const before = new Map([['cv/a.pdf', 10], ['cv/b.pdf', 10]])
  const after = new Map([['cv/a.pdf', 10], ['cv/b.pdf', 20], ['cover_letters/c.pdf', 5]])
  assert.deepEqual(changedDocs(before, after), ['cover_letters/c.pdf', 'cv/b.pdf'])
  assert.deepEqual(changedDocs(after, after), [])
})

test('older jobs match files by company and role words', () => {
  const all = [
    file('cv/main_uber_data_analytics_intern.pdf'),
    file('cover_letters/cover_uber_data_analytics_intern.pdf'),
    file('cv/main_siemens_energy_software_engineering_intern.pdf'),
    file('cv/main_example.pdf'),
    file('cv/main_uber_eats_designer.pdf')
  ]
  const got = matchDocuments(all, 'Uber', 'Data Analytics Intern').map((f) => f.path)
  assert.deepEqual(got, ['cv/main_uber_data_analytics_intern.pdf', 'cover_letters/cover_uber_data_analytics_intern.pdf'])
  assert.deepEqual(matchDocuments(all, 'Siemens Energy Inc.', 'Software Engineering Intern').map((f) => f.path), ['cv/main_siemens_energy_software_engineering_intern.pdf'])
  assert.deepEqual(matchDocuments(all, '', 'Anything'), [])
  assert.deepEqual(matchDocuments(all, 'Uber', 'Chef'), [])
  // "uber" must be a whole word: it does not match "Suberic".
  assert.deepEqual(matchDocuments([file('cv/main_suberic_designer.pdf')], 'Uber', 'Designer'), [])
})

const answer = `Intro line.

## Why it fits
- one
- two
- three
- four
  - nested under four

More text about fit.

## Gaps
Short gap paragraph.

Second paragraph.

| a | b |
| - | - |
| 1 | 2 |

Should I proceed with drafting the CV?`

test('short view keeps each heading and its first block', () => {
  const short = shortenFit(answer)
  assert.match(short, /Intro line\./)
  assert.match(short, /## Why it fits\n\n- one\n- two\n- three$/m)
  assert.doesNotMatch(short, /four/)
  assert.doesNotMatch(short, /More text/)
  assert.match(short, /## Gaps\n\nShort gap paragraph\./)
  assert.doesNotMatch(short, /Second paragraph/)
  assert.doesNotMatch(short, /proceed/)
})

test('the short view never hides the closing question', () => {
  assert.match(shortenFit(answer, true), /Should I proceed with drafting the CV\?$/)
})

test('short view of a table keeps its top rows', () => {
  const t = '## Scores\n| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n| 7 | 8 |\n| 9 | 0 |'
  assert.equal(shortenFit(t).split('\n').length, 1 + 1 + 6)
})

test('a tracker row names its files in any spelling', () => {
  const all = [
    file('cv/main_uber_data_analytics_intern.pdf'),
    file('cover_letters/cover_uber_data_analytics_intern.pdf'),
    file('cv/uber_data_analytics_intern/Sam_CV.pdf'),
    file('cv/main_other.pdf')
  ]
  const got = (names: string[]): string[] => namedDocuments(all, names).map((f) => f.path)
  assert.deepEqual(got(['main_uber_data_analytics_intern.tex', 'cover_uber_data_analytics_intern.tex']), ['cv/main_uber_data_analytics_intern.pdf', 'cover_letters/cover_uber_data_analytics_intern.pdf'])
  assert.deepEqual(got(['cv/main_uber_data_analytics_intern.pdf']), ['cv/main_uber_data_analytics_intern.pdf'])
  assert.deepEqual(got(['cv\\Sam_CV.pdf']), ['cv/uber_data_analytics_intern/Sam_CV.pdf'])
  assert.deepEqual(got(['MAIN_OTHER']), ['cv/main_other.pdf'])
  assert.deepEqual(got(['', '  ']), [])
  assert.deepEqual(got(['missing.pdf']), [])
})

test('a draft is hidden once its PDF exists, and shown while it does not', () => {
  const both = [file('cv/main_acme.tex'), file('cv/main_acme.pdf'), file('cover_letters/cover_acme.tex')]
  assert.deepEqual(withoutCompiledDrafts(both).map((f) => f.path), ['cv/main_acme.pdf', 'cover_letters/cover_acme.tex'])
})

test('drafts match a job by company and role too', () => {
  const all = [file('cv/main_property_finder_engineering_graduate_trainee.tex'), file('cover_letters/cover_property_finder_engineering_graduate_trainee.tex')]
  assert.equal(matchDocuments(all, 'Property Finder', 'Engineering Graduate Trainee').length, 2)
})
