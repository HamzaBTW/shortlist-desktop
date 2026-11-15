import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildReportHtml, escapeHtml, type ExportInput } from '../src/shared/report-export.ts'
import { computeStats } from '../src/shared/reports.ts'
import { matchKey, type TrackerRow } from '../src/shared/tracker.ts'

let n = 0
function row(status: string, date: string, company = `Co${++n}`, channel = 'LinkedIn'): TrackerRow {
  return { id: String(n), matchKey: matchKey(company, 'Designer'), date, company, sector: '', role: 'Designer', roleType: '', channel, status, contactPerson: '', fitRating: null, notes: '', cvFile: '', coverLetterFile: '', source: '', deadline: '' }
}

/** A stand-in for i18next: returns the key plus its options, so tests can see what was asked for. */
const t = (key: string, options?: Record<string, unknown>): string => (options ? `${key}${JSON.stringify(options)}` : key)

const MARK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>Shortlist</title><rect width="10" height="2" fill="#ff8a7a"/></svg>'

function input(rows: TrackerRow[], extra: Partial<ExportInput> = {}): ExportInput {
  return { stats: computeStats(rows), rows, skills: null, t, locale: 'en', generated: '2026-11-15', fontSans: 'data:font/woff2;base64,AAAA', fontMono: '', markSvg: MARK, ...extra }
}

const many = (): TrackerRow[] => [
  ...['rejected', 'rejected', 'no_response', 'withdrawn', 'hired'].map((s, i) => row(s, `2026-10-0${i + 1}`)),
  row('applied', '2026-11-02'),
  row('drafted', '2026-11-03', 'Draft Only Co')
]

test('tracker text is escaped, so a company name cannot add markup or scripts', () => {
  const evil = row('applied', '2026-11-01', '<img src=x onerror=alert(1)><script>alert(2)</script>"&\'')
  const html = buildReportHtml(input([evil, ...many()]))
  assert.ok(!html.includes('<script'), 'no script tag')
  assert.ok(!html.includes('<img src=x'), 'no injected tag')
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;&lt;script&gt;'))
  assert.equal(escapeHtml(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;')
})

test('the page locks itself down: no scripts, no network, only inline styles and data: fonts', () => {
  const html = buildReportHtml(input(many()))
  assert.ok(html.startsWith('<!doctype html>'))
  assert.match(html, /Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"/)
  assert.ok(!/https?:\/\/(?!www\.w3\.org\/2000\/svg)/.test(html), 'no web address except the SVG namespace')
  assert.ok(html.includes("@font-face{font-family:'Manrope'"))
})

test('a font that is not an embedded woff2, or a logo with a script, is left out', () => {
  const html = buildReportHtml(input(many(), { fontSans: 'https://fonts.example/manrope.woff2', markSvg: '<svg onload="alert(1)"></svg>' }))
  assert.ok(!html.includes('fonts.example'))
  assert.ok(!html.includes('onload'))
  assert.ok(!html.includes("font-family:'Manrope';"), 'no @font-face for a bad source')
})

test('5 or more finished: rates and the month chart; drafts are not listed', () => {
  const html = buildReportHtml(input(many()))
  assert.ok(html.includes('export.tile.response'))
  assert.ok(html.includes('export.perMonth'))
  assert.ok(html.includes('<svg viewBox="0 0 520 190"'))
  assert.ok(!html.includes('Draft Only Co'), 'a draft never sent is not in the list')
  assert.ok(html.includes('status.hired'), 'statuses use the calm dictionary names')
})

test('under 5 finished: counts only, no rates, no month chart', () => {
  const html = buildReportHtml(input([row('applied', '2026-11-01'), row('rejected', '2026-11-02')]))
  assert.ok(html.includes('export.early'))
  assert.ok(!html.includes('export.tile.response'))
  assert.ok(!html.includes('export.perMonth'))
})

test('nothing sent: a short note instead of numbers', () => {
  const html = buildReportHtml(input([row('drafted', '2026-11-01')]))
  assert.ok(html.includes('export.none'))
  assert.ok(html.includes('export.emptyLead'))
  assert.ok(!html.includes('export.funnel'))
})

test('skill gaps from the latest skills report are included and escaped', () => {
  const html = buildReportHtml(input(many(), { skills: { date: '2026-11-03', file: 'upskill/report-2026-11-03.md', gaps: [{ priority: 'High', skill: 'Design <tokens>', type: 'Tooling' }] } }))
  assert.ok(html.includes('Design &lt;tokens&gt;'))
  assert.ok(html.includes('export.skillsFrom'))
})
