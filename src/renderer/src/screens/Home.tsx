import { useTranslation } from 'react-i18next'
import type { WorkspaceStatus } from '../../../shared/ipc'
import { BOARD_COLUMNS, type TrackerData } from '../../../shared/tracker'
import { buildBoard, type Card } from '../board'
import { FitRing } from '../components/FitRing'
import type { Route } from '../components/Sidebar'
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
  onNavigate: (route: Route) => void
}

function BoardCard({ card, onOpen }: { card: Card; onOpen: () => void }) {
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
  } else {
    title = card.job.title
    subtitle = t(`job.phase.${card.job.phase}`)
    score = card.job.score
  }
  if (needsYou) badge = { tone: 'warning', text: `▲ ${t('job.needsYou')}` }
  else if (decide) badge = { tone: 'info', text: t('job.next.decide') }
  else if (running) badge = { tone: 'info', text: t('job.phase.running') }

  return (
    <button type="button" className="sl-jobcard job-card" onClick={onOpen}>
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
      {meta && <span className="sl-t-sm">{meta}</span>}
    </button>
  )
}

export function Home(props: HomeProps) {
  const { workspace, engineReady, canAdd, jobs, tracker, onAddJob, onOpenJob, onOpenRow, onNavigate } = props
  const { t } = useTranslation()
  const cards = buildBoard(tracker?.rows ?? [], jobs)

  return (
    <div className="screen">
      <header className="screen__head">
        <h1 className="t-display-lg">{t('home.title')}</h1>
        <div className="screen__actions">
          <button type="button" className="sl-btn" disabled={!canAdd} onClick={onAddJob}>
            {t('home.addJob')}
          </button>
          <button type="button" className="sl-btn sl-btn--primary" disabled>
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
