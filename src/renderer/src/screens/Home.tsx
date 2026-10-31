import { useTranslation } from 'react-i18next'
import type { WorkspaceStatus } from '../../../shared/ipc'
import type { Route } from '../components/Sidebar'

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
  onNavigate: (route: Route) => void
}

export function Home({ workspace, engineReady, onNavigate }: HomeProps) {
  const { t } = useTranslation()

  return (
    <div className="screen">
      <header className="screen__head">
        <h1 className="t-display-lg">{t('home.title')}</h1>
        <div className="screen__actions">
          <button type="button" className="sl-btn" disabled>
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
        {COLUMNS.map((col) => (
          <section key={col.id} className="board__col" aria-labelledby={`col-${col.id}`}>
            <div className="sl-col-head">
              <span className="sl-dot" style={{ background: col.dot }} aria-hidden="true" />
              <h2 id={`col-${col.id}`} className="sl-t-label board__title">
                {t(`stage.${col.id}`)}
              </h2>
              <span className="sl-num-md board__count">0</span>
            </div>
            <p className="sl-t-sm">{t('home.emptyColumn')}</p>
          </section>
        ))}
      </div>
    </div>
  )
}
