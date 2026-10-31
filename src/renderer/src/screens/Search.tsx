import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Pick, RankedJob, SearchData } from '../../../shared/search'
import { PermissionCard, QuestionCard } from '../components/AskCards'
import { FitRing } from '../components/FitRing'
import { Markdown } from '../components/Markdown'
import type { Job } from '../jobs'

interface SearchProps {
  /** Folder and engine ready, and no other job running. */
  canRun: boolean
  search: SearchData | null
  picks: Record<string, Pick>
  /** The latest Find new jobs run, if any. */
  job: Job | null
  /** Ranked jobs that already have an application started in the app. */
  started: Set<string>
  onFind: () => void
  onRankRest: () => void
  onCheck: (r: RankedJob) => void
  onPick: (key: string, pick: Pick | null) => void
}

function flagged(r: RankedJob): boolean {
  return r.guard.includes('⚠') || /no posting text/i.test(r.guard)
}

function ResultCard(props: {
  r: RankedJob
  pick: Pick | undefined
  started: boolean
  canRun: boolean
  onCheck: () => void
  onPick: (pick: Pick | null) => void
}) {
  const { r, pick, started, canRun, onCheck, onPick } = props
  const { t } = useTranslation()
  const meta = [r.location, r.deadline && t('card.deadline', { date: r.deadline }), r.portal].filter(Boolean).join(' · ')

  return (
    <article className="sl-tile result" aria-labelledby={`r-${r.key}`}>
      <div className="result__head">
        {r.score !== null && <FitRing score={r.score} />}
        <div className="sl-col result__title">
          <h3 id={`r-${r.key}`} className="sl-t-title">
            {r.title}
          </h3>
          <span className="sl-t-sm">{r.company}</span>
          {meta && <span className="sl-t-sm">{meta}</span>}
        </div>
      </div>

      <div className="result__badges">
        {r.verdict && (
          <span className="sl-badge sl-badge--info">
            {t(`fit.verdict.${r.verdict.toLowerCase()}`, { defaultValue: t('search.verdict', { verdict: r.verdict }) })}
          </span>
        )}
        {r.locationVerdict && r.locationVerdict !== 'PASS' && (
          <span className="sl-badge sl-badge--warning">▲ {t('search.checkLocation')}</span>
        )}
        {r.languageGate && r.languageGate !== 'PASS' && (
          <span className="sl-badge sl-badge--warning">▲ {t('search.checkLanguage')}</span>
        )}
        {flagged(r) && <span className="sl-badge sl-badge--warning">▲ {t('search.flagged')}</span>}
        {r.source === 'connector' && <span className="sl-badge sl-badge--muted">{t('search.storedText')}</span>}
      </div>

      {(r.strengths.length > 0 || r.gaps.length > 0) && (
        <ul className="plain result__points">
          {r.strengths.map((s, i) => (
            <li key={`s${i}`}>
              <span className="result__glyph result__glyph--good" aria-hidden="true">
                ✓
              </span>{' '}
              {s}
            </li>
          ))}
          {r.gaps.map((g, i) => (
            <li key={`g${i}`} className="sl-t-sm">
              <span className="result__glyph" aria-hidden="true">
                ○
              </span>{' '}
              {g}
            </li>
          ))}
        </ul>
      )}

      <div className="screen__actions result__actions">
        {started ? (
          <span className="sl-badge sl-badge--muted">{t('search.started')}</span>
        ) : (
          <button type="button" className="sl-btn sl-btn--primary sl-btn--sm" disabled={!canRun} onClick={onCheck}>
            {t('search.check')}
          </button>
        )}
        {pick === 'board' ? (
          <button type="button" className="sl-btn sl-btn--sm" onClick={() => onPick(null)}>
            ✓ {t('search.onBoard')}
          </button>
        ) : (
          !started && (
            <button type="button" className="sl-btn sl-btn--sm" onClick={() => onPick('board')}>
              {t('search.addToBoard')}
            </button>
          )
        )}
        {r.url && (
          <button type="button" className="sl-btn sl-btn--quiet sl-btn--sm" onClick={() => void window.shortlist.openLink(r.url)}>
            {t('search.open')}
          </button>
        )}
        <button type="button" className="sl-btn sl-btn--quiet sl-btn--sm" onClick={() => onPick(pick === 'hidden' ? null : 'hidden')}>
          {pick === 'hidden' ? t('search.unhide') : t('search.hide')}
        </button>
      </div>
    </article>
  )
}

export function Search({ canRun, search, picks, job, started, onFind, onRankRest, onCheck, onPick }: SearchProps) {
  const { t } = useTranslation()
  const [showHidden, setShowHidden] = useState(false)
  const running = job?.phase === 'running'
  const ranked = search?.ranked ?? []
  const hidden = ranked.filter((r) => picks[r.key] === 'hidden')
  const shown = ranked.filter((r) => showHidden || picks[r.key] !== 'hidden')

  return (
    <div className="screen">
      <header className="screen__head">
        <h1 className="t-display-lg">{t('nav.search')}</h1>
        <div className="screen__actions">
          {!running && (search?.waiting ?? 0) > 0 && (
            <button type="button" className="sl-btn" disabled={!canRun} onClick={onRankRest}>
              {t('search.rankRest', { count: search?.waiting ?? 0 })}
            </button>
          )}
          <button type="button" className="sl-btn sl-btn--primary" disabled={!canRun} onClick={onFind}>
            {t('home.findJobs')}
          </button>
        </div>
      </header>

      <p className="sl-t-sm">
        {!search?.found
          ? t('search.never')
          : t('search.summary', { ranked: ranked.length, waiting: search.waiting }) +
            (search.lastRanked ? ` ${t('search.lastRanked', { date: search.lastRanked })}` : '')}
      </p>
      {search?.error && (
        <p role="alert" className="notice">
          ▲ {t(`search.error.${search.error}`)}
        </p>
      )}

      {job?.asks.map((ask) => <PermissionCard key={ask.requestId} ask={ask} />)}
      {job?.questions.map((ask) => <QuestionCard key={ask.requestId} ask={ask} />)}

      {running && job && (
        <section className="sl-job job-progress" aria-live="polite">
          <span className="sl-t-label">{t(`search.stage.${job.stage ?? 'scrape'}`)}</span>
          <ul className="sl-steps">
            <li className={job.stage === 'rank' ? 'is-done' : 'is-active'}>
              <span className="g" aria-hidden="true">
                {job.stage === 'rank' ? '✓' : '●'}
              </span>
              {t('search.step.scrape')}
            </li>
            <li className={job.stage === 'rank' ? 'is-active' : ''}>
              <span className="g" aria-hidden="true">
                {job.stage === 'rank' ? '●' : '○'}
              </span>
              {t('search.step.rank')}
            </li>
          </ul>
          <span className="sl-t-sm">{t(`step.${job.steps[job.steps.length - 1] ?? 'start'}`)}</span>
          <div className="screen__actions">
            <button type="button" className="sl-btn sl-btn--sm" onClick={() => void window.shortlist.cancelRun()}>
              {t('job.stop')}
            </button>
          </div>
        </section>
      )}

      {job?.phase === 'failed' && job.error && (
        <section className="sl-check sl-check--failed fail" role="alert">
          <span className="sl-glyph sl-glyph--failed" aria-hidden="true">
            ✕
          </span>
          <span>{job.error}</span>
          <span />
        </section>
      )}

      {!running && job?.result && (
        <details className="sl-tile report">
          <summary className="sl-t-title">{t('search.report')}</summary>
          <Markdown text={job.result} />
        </details>
      )}

      <div className="results">
        {shown.map((r) => (
          <ResultCard
            key={r.key}
            r={r}
            pick={picks[r.key]}
            started={started.has(r.key)}
            canRun={canRun}
            onCheck={() => onCheck(r)}
            onPick={(p) => onPick(r.key, p)}
          />
        ))}
      </div>

      {hidden.length > 0 && (
        <button type="button" className="sl-link" onClick={() => setShowHidden((s) => !s)}>
          {showHidden ? t('search.hideHidden') : t('search.showHidden', { count: hidden.length })}
        </button>
      )}
    </div>
  )
}
