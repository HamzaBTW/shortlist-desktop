import { useTranslation } from 'react-i18next'
import type { WorkspaceStatus } from '../../../shared/ipc'
import { FitRing } from '../components/FitRing'
import type { Route } from '../components/Sidebar'
import type { Job } from '../jobs'

// Board columns and the stage token that colours each column's dot.
// Which tracker statuses land in which column: see the design system's Decisions page.
const COLUMNS = [
  { id: 'shortlisted', dot: 'var(--stage-shortlisted)' },
  { id: 'applied', dot: 'var(--stage-applied)' },
  { id: 'interviewing', dot: 'var(--stage-interviewing)' },
  { id: 'offer', dot: 'var(--stage-offer)' },
  { id: 'closed', dot: 'var(--stage-rejected)' }
] as const

interface HomeProps {
  workspace: WorkspaceStatus | null
  engineReady: boolean
  canAdd: boolean
  jobs: Job[]
  onAddJob: () => void
  onOpenJob: (id: string) => void
  onNavigate: (route: Route) => void
}

function JobCard({ job, onOpen }: { job: Job; onOpen: () => void }) {
  const { t } = useTranslation()
  const needsYou = job.asks.length + job.questions.length > 0
  return (
    <button type="button" className="sl-jobcard job-card" onClick={onOpen}>
      <span className="sl-jobcard__co">{job.title}</span>
      <span className="job-card__row">
        {job.score !== null && <FitRing score={job.score} size="sm" />}
        <span className="sl-col">
          {needsYou ? (
            <span className="sl-badge sl-badge--warning">▲ {t('job.needsYou')}</span>
          ) : job.phase === 'waiting' && job.asksToProceed ? (
            <span className="sl-badge sl-badge--info">{t('job.next.decide')}</span>
          ) : (
            <span className="sl-jobcard__role">{t(`job.phase.${job.phase}`)}</span>
          )}
        </span>
      </span>
    </button>
  )
}

export function Home({ workspace, engineReady, canAdd, jobs, onAddJob, onOpenJob, onNavigate }: HomeProps) {
  const { t } = useTranslation()

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

      <div className="board">
        {COLUMNS.map((col) => {
          // Jobs added in the app sit in Shortlisted until the tracker is read (a later step).
          const items = col.id === 'shortlisted' ? jobs : []
          return (
            <section key={col.id} className="board__col" aria-labelledby={`col-${col.id}`}>
              <div className="sl-col-head">
                <span className="sl-dot" style={{ background: col.dot }} aria-hidden="true" />
                <h2 id={`col-${col.id}`} className="sl-t-label board__title">
                  {t(`stage.${col.id}`)}
                </h2>
                <span className="sl-num-md board__count">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <p className="sl-t-sm">{t('home.emptyColumn')}</p>
              ) : (
                items.map((job) => <JobCard key={job.id} job={job} onOpen={() => onOpenJob(job.id)} />)
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
