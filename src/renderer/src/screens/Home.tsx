import { useTranslation } from 'react-i18next'

// Board columns and the stage token that colours each column's dot.
// Which tracker statuses land in which column: see the design system's Decisions page.
const COLUMNS = [
  { id: 'shortlisted', dot: 'var(--stage-shortlisted)' },
  { id: 'applied', dot: 'var(--stage-applied)' },
  { id: 'interviewing', dot: 'var(--stage-interviewing)' },
  { id: 'offer', dot: 'var(--stage-offer)' },
  { id: 'closed', dot: 'var(--stage-rejected)' }
] as const

export function Home() {
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
      <p className="sl-t-sm">{t('home.notReady')}</p>

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
