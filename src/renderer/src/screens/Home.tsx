import { useTranslation } from 'react-i18next'
import type { WorkspaceStatus } from '../../../shared/ipc'
import type { Pick, RankedJob } from '../../../shared/search'
import { BOARD_COLUMNS, type TrackerData } from '../../../shared/tracker'
import { buildBoard, type Card } from '../board'
import { FitRing } from '../components/FitRing'
import type { Route } from '../components/Sidebar'
import type { StatusTarget } from '../components/StatusDialog'
import type { Job } from '../jobs'

// Each column's dot uses the design system's stage-* colour token.
const DOT: Record<string, string> = {
  shortlisted: 'var(--stage-shortlisted)',
  applied: 'var(--stage-applied)',
  interviewing: 'var(--stage-interviewing)',
  offer: 'var(--stage-offer)',
  closed: 'var(--stage-rejected)'
}

const FINAL = new Set(['hired', 'rejected', 'no_response', 'offer_declined', 'withdrawn', 'expired'])

interface HomeProps {
  workspace: WorkspaceStatus | null
  engineReady: boolean
  canAdd: boolean
  jobs: Job[]
  tracker: TrackerData | null
  onAddJob: () => void
  onOpenJob: (id: string) => void
  onOpenRow: (id: string) => void
  /** Status updates run a command, so they need the engine and no other run going. */
  canUpdate: boolean
  onUpdateStatus: (target: StatusTarget) => void
  ranked: RankedJob[]
  picks: Record<string, Pick>
  onFindJobs: () => void
  onCheckRanked: (r: RankedJob) => void
  onNavigate: (route: Route) => void
}

interface BoardCardProps {
  card: Card
  /** A status update running (or waiting on the person) for this card. */
  update: Job | null
  onOpen: () => void
  canUpdate: boolean
  onUpdate: (target: StatusTarget) => void
  onOpenUpdate: (id: string) => void
  onCheckRanked: (r: RankedJob) => void
}

function updateTarget(card: Card): StatusTarget | null {
  if (card.kind === 'ranked') return null
  if (card.kind === 'row') {
    if (card.column === 'closed' || card.row.status === 'hired') return null
    return { company: card.row.company, role: card.row.role, column: card.column, matchKey: card.row.matchKey }
  }
  return card.job.phase === 'running' ? null : { company: card.job.title, role: '', column: 'shortlisted' }
}

function BoardCard({ card, update, onOpen, canUpdate, onUpdate, onOpenUpdate, onCheckRanked }: BoardCardProps) {
  const { t } = useTranslation()
  const job = card.job
  const needsYou = job ? job.asks.length + job.questions.length > 0 : false
  const decide = job?.phase === 'waiting' && job.asksToProceed
  const running = job?.phase === 'running'

  let title: string
  let subtitle: string
  let score: number | null
  let badge: { tone: string; text: string } | null = null
  let meta = ''

  if (card.kind === 'row') {
    const r = card.row
    title = r.company || r.role
    subtitle = r.company ? r.role : ''
    score = r.fitRating ?? job?.score ?? null
    const label = t(`status.${r.status}`, { defaultValue: r.status || t('status.unknown') })
    badge = { tone: FINAL.has(r.status) ? 'muted' : card.column === 'shortlisted' ? 'muted' : 'info', text: label }
    if (r.deadline && !FINAL.has(r.status)) meta = t('card.deadline', { date: r.deadline })
    else if (r.date) meta = t(r.status === 'drafted' ? 'card.drafted' : 'card.dated', { date: r.date })
  } else if (card.kind === 'ranked') {
    title = card.ranked.company || card.ranked.title
    subtitle = card.ranked.company ? card.ranked.title : ''
    score = card.ranked.score
    badge = { tone: 'muted', text: t('status.ranked') }
    if (card.ranked.deadline) meta = t('card.deadline', { date: card.ranked.deadline })
  } else {
    title = card.job.title
    subtitle = t(`job.phase.${card.job.phase}`)
    score = card.job.score
  }
  const updateNeedsYou = update ? update.asks.length + update.questions.length > 0 : false
  if (updateNeedsYou) badge = { tone: 'warning', text: `▲ ${t('job.needsYou')}` }
  else if (update) badge = { tone: 'info', text: t('outcome.updating') }
  else if (needsYou) badge = { tone: 'warning', text: `▲ ${t('job.needsYou')}` }
  else if (decide) badge = { tone: 'info', text: t('job.next.decide') }
  else if (running) badge = { tone: 'info', text: t('job.phase.running') }

  const target = updateTarget(card)

  return (
    <div className="card-wrap">
      <button type="button" className="sl-jobcard job-card" onClick={update && updateNeedsYou ? () => onOpenUpdate(update.id) : onOpen}>
        <span className="sl-col job-card__text">
          <span className="sl-jobcard__co">{title}</span>
          {subtitle && <span className="sl-jobcard__role">{subtitle}</span>}
        </span>
        {(score !== null || badge) && (
          <span className="job-card__row">
            {score !== null && <FitRing score={score} size="sm" />}
            {badge && <span className={`sl-badge sl-badge--${badge.tone}`}>{badge.text}</span>}
          </span>
        )}
        {meta && <span className="sl-t-sm job-card__meta">{meta}</span>}
      </button>
      {card.kind === 'ranked' && (
        <button
          type="button"
          className="sl-btn sl-btn--sm card-action"
          disabled={!canUpdate}
          onClick={() => onCheckRanked(card.ranked)}
          aria-label={`${t('search.check')}: ${title}`}
        >
          {t('search.check')}
        </button>
      )}
      {target && !update && (
        <button
          type="button"
          className="sl-btn sl-btn--sm card-action"
          disabled={!canUpdate}
          onClick={() => onUpdate(target)}
          aria-label={`${t('outcome.button')}: ${title}`}
        >
          {t('outcome.button')}
        </button>
      )}
    </div>
  )
}

export function Home(props: HomeProps) {
  const { workspace, engineReady, canAdd, jobs, tracker, onAddJob, onOpenJob, onOpenRow, canUpdate, onUpdateStatus, ranked, picks, onFindJobs, onCheckRanked, onNavigate } = props
  const { t } = useTranslation()
  const cards = buildBoard(tracker?.rows ?? [], jobs, ranked, picks)

  return (
    <div className="screen">
      <header className="screen__head">
        <h1 className="t-display-lg">{t('home.title')}</h1>
        <div className="screen__actions">
          <button type="button" className="sl-btn" disabled={!canAdd} onClick={onAddJob}>
            {t('home.addJob')}
          </button>
          <button type="button" className="sl-btn sl-btn--primary" disabled={!canAdd} onClick={onFindJobs}>
            {t('home.findJobs')}
          </button>
        </div>
      </header>
      {workspace?.ok && engineReady ? (
        <p className="sl-t-sm">{t('home.ready')}</p>
      ) : (
        <p className="sl-t-sm">
          {t(workspace?.ok ? 'home.needEngine' : 'home.needFolder')}{' '}
          <button type="button" className="sl-link" onClick={() => onNavigate('settings')}>
            {t('home.openSettings')}
          </button>
        </p>
      )}
      {tracker?.error && (
        <p role="alert" className="notice">
          ▲ {t(`tracker.error.${tracker.error}`)}
        </p>
      )}

      <div className="board">
        {BOARD_COLUMNS.map((col) => {
          const items = cards.filter((c) => c.column === col)
          return (
            <section key={col} className="board__col" aria-labelledby={`col-${col}`}>
              <div className="sl-col-head">
                <span className="sl-dot" style={{ background: DOT[col] }} aria-hidden="true" />
                <h2 id={`col-${col}`} className="sl-t-label board__title">
                  {t(`stage.${col}`)}
                </h2>
                <span className="sl-num-md board__count">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <p className="sl-t-sm">{t('home.emptyColumn')}</p>
              ) : (
                items.map((card) => (
                  <BoardCard
                    key={card.key}
                    card={card}
                    canUpdate={canUpdate}
                    onUpdate={onUpdateStatus}
                    onOpenUpdate={onOpenJob}
                    onCheckRanked={onCheckRanked}
                    update={
                      card.kind === 'row'
                        ? (jobs.find(
                            (j) =>
                              j.kind === 'outcome' &&
                              j.target === card.row.matchKey &&
                              (j.phase === 'running' || j.asks.length + j.questions.length > 0)
                          ) ?? null)
                        : null
                    }
                    onOpen={() => (card.job ? onOpenJob(card.job.id) : card.kind === 'row' ? onOpenRow(card.row.id) : undefined)}
                  />
                ))
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
