import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ONLY_NO_INPUT, RUNNABLE_COMMANDS } from '../src/shared/engine.ts'
import { computeStats, latestReport, matchName, MIN_FINISHED, parseGaps, parseOutcome, percent } from '../src/shared/reports.ts'
import { matchKey, type TrackerRow } from '../src/shared/tracker.ts'

let n = 0
function row(status: string, date: string, channel = 'LinkedIn', company = `Co${++n}`, role = 'Designer'): TrackerRow {
  return {
    id: String(n),
    matchKey: matchKey(company, role),
    date,
    company,
    sector: '',
    role,
    roleType: '',
    channel,
    status,
    contactPerson: '',
    fitRating: null,
    notes: '',
    cvFile: '',
    coverLetterFile: '',
    source: '',
    deadline: ''
  }
}

/** The mockup's story: 14 sent since August, 7 heard back, 3 interviewed, 1 offer, 8 finished. */
function mockupRows(): TrackerRow[] {
  return [
    row('applied', '2026-08-04', 'LinkedIn'),
    row('rejected', '2026-08-20', 'Company website'),
    row('applied', '2026-09-02', 'LinkedIn'),
    row('rejected', '2026-09-08', 'Company website'),
    row('no_response', '2026-09-15', 'Indeed'),
    row('interview', '2026-09-28', 'Company website'),
    row('applied', '2026-10-01', 'LinkedIn'),
    row('rejected', '2026-10-06', 'LinkedIn'),
    row('rejected', '2026-10-12', 'Indeed'),
    row('interview', '2026-10-18', 'LinkedIn'),
    row('withdrawn', '2026-10-25', 'Referral'),
    row('hired', '2026-10-29', 'Company website'),
    row('applied', '2026-11-03', 'LinkedIn'),
    row('no_response', '2026-11-09', 'Indeed'),
    row('drafted', '2026-11-12', 'LinkedIn')
  ]
}

test('the mockup story: drafts left out, heard back, interviews, offers, finished, rejections', () => {
  const s = computeStats(mockupRows())
  assert.equal(s.sent, 14)
  assert.equal(s.drafted, 1)
  assert.equal(s.heardBack, 7) // 4 rejected + 2 interview + 1 hired
  assert.equal(s.interviewed, 3)
  assert.equal(s.offers, 1)
  assert.equal(s.hired, 1)
  assert.equal(s.finished, 8) // 4 rejected, 2 no reply, 1 withdrawn, 1 hired
  assert.equal(s.rejections, 6) // rejected + no reply; withdrawn is not a rejection
  assert.equal(s.open, 6)
  assert.equal(percent(s.heardBack, s.sent), 50)
  assert.equal(percent(s.rejections, s.finished), 75)
  assert.equal(s.showRates, true)
  assert.equal(s.firstDate, '2026-08-04')
  assert.deepEqual(s.months, [
    { month: '2026-08', count: 2 },
    { month: '2026-09', count: 4 },
    { month: '2026-10', count: 6 },
    { month: '2026-11', count: 2 }
  ])
})

test('channels: sent and heard back per channel, busiest first', () => {
  const s = computeStats(mockupRows())
  assert.deepEqual(
    s.channels.map((c) => [c.channel, c.sent, c.heardBack]),
    [
      ['LinkedIn', 6, 2],
      ['Company website', 4, 4],
      ['Indeed', 3, 1],
      ['Referral', 1, 0]
    ]
  )
})

test('a stage ticked in outcome.md counts even when the status says rejected', () => {
  const rows = [row('rejected', '2026-10-01', 'LinkedIn', 'Atlas Freight', 'Design Lead')]
  const plain = computeStats(rows)
  assert.equal(plain.interviewed, 0)
  const withOutcome = computeStats(rows, { [matchName('Atlas Freight', 'Design Lead')]: { interview: true, offer: false } })
  assert.equal(withOutcome.interviewed, 1)
  assert.equal(withOutcome.heardBack, 1)
})

test('offer declined reached the offer and is final, not a rejection', () => {
  const s = computeStats([row('offer_declined', '2026-10-01')])
  assert.equal(s.offers, 1)
  assert.equal(s.interviewed, 1)
  assert.equal(s.finished, 1)
  assert.equal(s.rejections, 0)
})

test('under 5 finished: counts only; unknown statuses count as finished and are named', () => {
  const s = computeStats([row('applied', '2026-11-01'), row('rejected', '2026-11-02'), row('ghosted', '2026-11-03')])
  assert.equal(s.finished, 2)
  assert.equal(s.showRates, false)
  assert.deepEqual(s.unknownStatuses, ['ghosted'])
  assert.equal(MIN_FINISHED, 5)
})

test('dates without a month are counted as undated; empty channels show as one group', () => {
  const s = computeStats([row('applied', '2025', ''), row('applied', '', ''), row('applied', '2026-11-01', '')])
  assert.equal(s.undated, 2)
  assert.deepEqual(s.months, [{ month: '2026-11', count: 1 }])
  assert.deepEqual(s.channels.map((c) => [c.channel, c.sent]), [['—', 3]])
})

test('an empty tracker: nothing sent, no rates, no division by zero', () => {
  const s = computeStats([row('drafted', '2026-11-01')])
  assert.equal(s.sent, 0)
  assert.equal(s.drafted, 1)
  assert.equal(percent(0, 0), null)
})

test('outcome.md: heading matched by name, interview and offer ticks read', () => {
  const md = `# Outcome: Atlas Freight — Design Lead

**Status:** rejected

## Interview stages reached
- [x] Phone screen (2026-10-02)
- [X] Technical interview (2026-10-09)
- [ ] Final round
- [ ] Offer received

## Notes
- [x] Offer received is mentioned here but this is the notes section
`
  const o = parseOutcome(md)
  assert.deepEqual(o, { key: matchName('Atlas Freight', 'Design Lead'), stages: { interview: true, offer: false } })
  assert.equal(matchName('Atlas Freight!', 'design-lead'), matchName('atlas freight', 'Design Lead'))
  assert.equal(parseOutcome('# Something else\n'), null)
  const offered = parseOutcome('# Outcome: A - B\n\n## Interview stages reached\n- [x] Offer received (2026-11-01)\n')
  assert.deepEqual(offered?.stages, { interview: false, offer: true })
})

test('skills report: the newest aggregate report and its gap table', () => {
  assert.equal(latestReport(['report-2026-10-01.md', 'report-acme-designer-2026-11-01.md', 'report-2026-11-03.md', 'notes.md']), 'report-2026-11-03.md')
  assert.equal(latestReport(['notes.md']), null)
  const md = `# Upskill report

## Gap Heatmap

| Priority | Skill / Area | Type | Gap Source |
|----------|-------------|------|------------|
| Critical | **Kubernetes** | Hard | 6 jobs (4 recorded gaps, 2 inferred), score 3.4 |
| High | Security domain knowledge | Domain | LLM synthesis |
| Low | ... | ... | ... |

## Learning Plan
| not | a | gap |
`
  assert.deepEqual(parseGaps(md), [
    { priority: 'Critical', skill: 'Kubernetes', type: 'Hard' },
    { priority: 'High', skill: 'Security domain knowledge', type: 'Domain' }
  ])
  assert.deepEqual(parseGaps('# nothing here'), [])
})

test('/upskill and /expand run only in their fixed form; /html-report is not started by the app', () => {
  assert.ok(!(RUNNABLE_COMMANDS as readonly string[]).includes('html-report'))
  for (const c of ['upskill', 'expand'] as const) {
    assert.ok(RUNNABLE_COMMANDS.includes(c))
    assert.ok(ONLY_NO_INPUT.includes(c))
  }
})
