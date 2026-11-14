import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyEvent, asksToProceed, continued, newJob, parseScore, parseVerdict, titleFor } from '../src/renderer/src/jobs.ts'

test('titles: the site for a link, the first line for text', () => {
  assert.equal(titleFor('https://www.uber.com/global/en/careers/list/123/'), 'uber.com')
  assert.equal(titleFor('\n\nData Analyst - Acme\nDubai\n...'), 'Data Analyst - Acme')
  assert.equal(titleFor('x'.repeat(80)).length, 58)
  assert.equal(titleFor('javascript:alert(1)'), 'javascript:alert(1)')
})

test('fit score in its usual shapes', () => {
  assert.equal(parseScore('**Overall fit score: 57/100** - moderate fit'), 57)
  assert.equal(parseScore('Overall fit score 7.5/10 (strong fit)'), 75)
  assert.equal(parseScore('Salary 12/10 days... fit score: 82 / 100'), 82)
  assert.equal(parseScore('Skills 4/5. No score here'), null)
  assert.equal(parseScore('fit score 140/100'), null)
})

test('verdict and the proceed question', () => {
  assert.equal(parseVerdict('Recommendation: Moderate fit.'), 'moderate')
  assert.equal(parseVerdict('nothing'), null)
  assert.equal(asksToProceed('Should I proceed with drafting the CV and cover letter for this role?'), true)
  assert.equal(asksToProceed('Continue with this posting?'), false)
})

test('a fit check run, start to the proceed question', () => {
  let job = newJob('j1', 'https://jobs.example.com/1', 'r1')
  const ev = (e: object) => (job = applyEvent(job, { runId: 'r1', ...e } as never))
  ev({ type: 'session', sessionId: 's1' })
  ev({ type: 'tool', tool: 'Agent' })
  ev({ type: 'tool', tool: 'Read' })
  ev({ type: 'tool', tool: 'Read' })
  ev({ type: 'permission', ask: { requestId: 'p1', tool: 'Bash', detail: 'python x', kind: 'command' } })
  assert.equal(job.asks.length, 1)
  ev({ type: 'permissionClosed', requestId: 'p1' })
  assert.equal(job.asks.length, 0)
  ev({ type: 'text', text: '...' })
  assert.deepEqual(job.steps, ['start', 'posting', 'reading', 'thinking'])
  ev({ type: 'finished', sessionId: 's1', result: 'Overall fit score: 64/100, moderate fit. Should I proceed with drafting the CV and cover letter for this role?', isError: false })
  assert.equal(job.phase, 'waiting')
  assert.equal(job.score, 64)
  assert.equal(job.verdict, 'moderate')
  assert.equal(job.asksToProceed, true)
  assert.equal(job.runId, null)
  assert.equal(job.sessionId, 's1')
})

test('events from another run are ignored; later turns keep the score', () => {
  let job = newJob('j1', 'text', 'r1')
  job = applyEvent(job, { type: 'finished', runId: 'r1', sessionId: 's1', result: 'fit score 70/100', isError: false })
  job = continued(job, 'r2')
  job = applyEvent(job, { type: 'tool', runId: 'r1', tool: 'Write' })
  assert.deepEqual(job.steps, ['start'])
  job = applyEvent(job, { type: 'finished', runId: 'r2', sessionId: 's1', result: 'Drafts ready.', isError: false })
  assert.equal(job.score, 70)
  assert.equal(job.asksToProceed, false)
})

test('a failure is kept with its message', () => {
  let job = newJob('j1', 'text', 'r1')
  job = applyEvent(job, { type: 'failed', runId: 'r1', message: 'Claude Code stopped.' })
  assert.equal(job.phase, 'failed')
  assert.equal(job.error, 'Claude Code stopped.')
})

test('files a run wrote are kept on the job and add up across turns', () => {
  let job = newJob('j1', 'https://x.example/job', 'r1')
  job = applyEvent(job, { type: 'documents', runId: 'r1', files: ['cv/a.pdf'] })
  job = applyEvent(job, { type: 'documents', runId: 'r1', files: ['cv/a.pdf', 'cover_letters/b.pdf'] })
  assert.deepEqual(job.documents, ['cv/a.pdf', 'cover_letters/b.pdf'])
  // An event from another run is ignored.
  assert.deepEqual(applyEvent(job, { type: 'documents', runId: 'other', files: ['cv/z.pdf'] }).documents, job.documents)
})
