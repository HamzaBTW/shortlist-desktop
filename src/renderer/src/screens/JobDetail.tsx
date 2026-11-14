import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PermissionCard, QuestionCard } from '../components/AskCards'
import { Documents } from '../components/Documents'
import { FitRing } from '../components/FitRing'
import { PostingLink } from '../components/PostingLink'
import { Markdown } from '../components/Markdown'
import { shortenFit } from '../../../shared/fit'
import { postingLink } from '../../../shared/links'
import type { FitView } from '../../../shared/ipc'
import type { TrackerRow } from '../../../shared/tracker'
import type { Job } from '../jobs'

interface JobDetailProps {
  job: Job
  /** The tracker row this job's run added or changed, when there is one. */
  row: TrackerRow | null
  busy: boolean
  /** Short or Detail view of the fit result, remembered in Settings. */
  fitView: FitView
  onFitView: (view: FitView) => void
  onReply: (job: Job, reply: string) => Promise<string | null>
  onNotNow: (job: Job) => void
  onRemove: (job: Job) => void
  onBack: () => void
}

/** "Engineering Graduate Trainee - Property Finder" -> role and company, when there is no tracker row. */
function fromTitle(title: string): { company: string; role: string } {
  const parts = title.split(/\s+[-\u2013\u2014|@]\s+/)
  return parts.length >= 2 ? { role: parts.slice(0, -1).join(' '), company: parts[parts.length - 1]! } : { role: '', company: '' }
}

export function JobDetail({ job, row, busy, fitView, onFitView, onReply, onNotNow, onRemove, onBack }: JobDetailProps) {
  const { t } = useTranslation()
  const [reply, setReply] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const running = job.phase === 'running'
  const isApply = (job.kind ?? 'apply') === 'apply'
  const link = isApply ? postingLink(row?.source, job.input) : null

  const send = async (text: string): Promise<void> => {
    setProblem(await onReply(job, text))
    setReply('')
  }

  return (
    <div className="screen">
      <button type="button" className="sl-link back" onClick={onBack}>
        ← {t('job.back')}
      </button>

      <header className="job-head">
        {job.score !== null && <FitRing score={job.score} />}
        <div className="sl-col">
          <h1 className="t-display-lg job-head__title">
            {link ? <PostingLink href={link}>{job.title}</PostingLink> : job.title}
          </h1>
          <span className={`sl-badge ${running ? 'sl-badge--info' : job.phase === 'failed' ? 'sl-badge--danger' : 'sl-badge--muted'}`}>
            {t(`job.phase.${job.kind === 'outcome' && job.phase === 'waiting' ? 'done' : job.phase}`)}
          </span>
          {row && (
            <span className="sl-t-sm">
              {t('job.inTracker', { status: t(`status.${row.status}`, { defaultValue: row.status }) })}
            </span>
          )}
        </div>
      </header>

      {job.asks.map((ask) => (
        <PermissionCard key={ask.requestId} ask={ask} />
      ))}
      {job.questions.map((ask) => (
        <QuestionCard key={ask.requestId} ask={ask} />
      ))}

      {running && (
        <section className="sl-job job-progress" aria-live="polite">
          <span className="sl-t-label">{t('job.working')}</span>
          <ul className="sl-steps">
            {job.steps.map((s, i) => {
              const current = i === job.steps.length - 1
              return (
                <li key={i} className={current ? 'is-active' : 'is-done'}>
                  <span className="g" aria-hidden="true">
                    {current ? '●' : '✓'}
                  </span>
                  {t(`step.${s}`)}
                </li>
              )
            })}
          </ul>
          <div className="screen__actions">
            <button type="button" className="sl-btn sl-btn--sm" onClick={() => void window.shortlist.cancelRun()}>
              {t('job.stop')}
            </button>
          </div>
          <p className="sl-t-sm">{t('job.stopNote')}</p>
        </section>
      )}

      {!running && isApply && (
        <Documents
          paths={job.documents}
          company={row?.company ?? fromTitle(job.title).company}
          role={row?.role ?? fromTitle(job.title).role}
          hints={row ? [row.cvFile, row.coverLetterFile] : []}
          refresh={job.phase}
        />
      )}

      {job.denied.length > 0 && (
        <section className="sl-tile panel">
          <h2 className="sl-t-title">{t('job.deniedTitle')}</h2>
          <ul className="plain">
            {job.denied.map((d, i) => (
              <li key={i} className="sl-t-sm">
                ✕ {t(`deny.${d.reason}`)} <code>{d.detail}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      {job.phase === 'failed' && job.error && (
        <section className="sl-check sl-check--failed fail" role="alert">
          <span className="sl-glyph sl-glyph--failed" aria-hidden="true">
            ✕
          </span>
          <span>{job.error}</span>
          <span />
        </section>
      )}

      {!running && (job.result || (job.phase === 'failed' && job.sessionId)) && (
        <section className="sl-tile fit-card" aria-labelledby="fit-title">
          <div className="sl-tile__head">
            <h2 id="fit-title" className="sl-t-title">
              {job.asksToProceed ? t('fit.title') : t('fit.update')}
            </h2>
            {job.verdict && <span className="sl-badge sl-badge--info">{t(`fit.verdict.${job.verdict}`)}</span>}
          </div>

          {job.phase === 'waiting' && job.asksToProceed && (
            <div className="screen__actions">
              <button
                type="button"
                className="sl-btn sl-btn--primary"
                disabled={busy}
                onClick={() => void send('Yes, proceed with drafting the CV and cover letter for this role.')}
              >
                {t('fit.prepare')}
              </button>
              <button type="button" className="sl-btn" onClick={() => onNotNow(job)}>
                {t('fit.notNow')}
              </button>
            </div>
          )}
          {job.phase === 'notNow' && <p className="sl-t-sm">{t('fit.notNowNote')}</p>}
          {problem && (
            <p role="alert" className="notice">
              {problem}
            </p>
          )}

          {job.result && (
            <div className="view-toggle" role="group" aria-label={t('fit.viewLabel')}>
              {(['short', 'detail'] as const).map((v) => (
                <button key={v} type="button" className="sl-btn sl-btn--sm" aria-pressed={fitView === v} onClick={() => onFitView(v)}>
                  {t(`fit.view.${v}`)}
                </button>
              ))}
            </div>
          )}
          {job.result && <Markdown text={fitView === 'short' ? shortenFit(job.result, job.asksToProceed) : job.result} />}

          {job.sessionId && job.phase !== 'running' && (
            <form
              className="reply"
              onSubmit={(e) => {
                e.preventDefault()
                if (reply.trim()) void send(reply)
              }}
            >
              <label htmlFor={`reply-${job.id}`} className="sl-t-label">
                {t('fit.replyLabel')}
              </label>
              <textarea
                id={`reply-${job.id}`}
                className="field field--area"
                rows={2}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends, like the Send button. Shift+Enter adds a line. Never mid-IME composition.
                  if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
                  e.preventDefault()
                  if (reply.trim() && !busy) void send(reply)
                }}
              />
              <div className="screen__actions">
                <button type="submit" className="sl-btn" disabled={!reply.trim() || busy}>
                  {t('fit.send')}
                </button>
              </div>
            </form>
          )}
        </section>
      )}
      {!running && (
        <section className="remove">
          <button type="button" className="sl-btn sl-btn--quiet sl-btn--sm" onClick={() => onRemove(job)}>
            {t('job.remove')}
          </button>
          <p className="sl-t-sm">{t('job.removeNote')}</p>
        </section>
      )}
    </div>
  )
}
