import { useTranslation } from 'react-i18next'
import { APP_NAME } from '../../../shared/app-info'
import mark from '../assets/shortlist-mark.svg'
import type { Job } from '../jobs'

export const ROUTES = ['home', 'search', 'profile', 'reports', 'settings'] as const
export type Route = (typeof ROUTES)[number]

interface SidebarProps {
  route: Route
  onNavigate: (route: Route) => void
  guide: boolean
  onGuideChange: (on: boolean) => void
  activeJob: Job | null
  onOpenJob: (id: string) => void
}

export function Sidebar({ route, onNavigate, guide, onGuideChange, activeJob, onOpenJob }: SidebarProps) {
  const { t } = useTranslation()

  return (
    <aside className="sl-side app-side">
      <div className="sl-brand app-brand">
        <img src={mark} alt="" className="app-brand__mark" />
        {APP_NAME}
      </div>

      <nav aria-label={t('nav.label')} className="sl-col">
        {ROUTES.map((r) => {
          const active = r === route
          return (
            <button
              key={r}
              type="button"
              className={`sl-nav app-nav${active ? ' sl-nav--active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(r)}
            >
              <span aria-hidden="true">{active ? '●' : '○'}</span>
              {t(`nav.${r}`)}
            </button>
          )
        })}
      </nav>

      <section className="sl-well app-tray" aria-label={t('tray.label')}>
        <span className="sl-t-label">{t('tray.label')}</span>
        {activeJob ? (
          <button type="button" className="tray-job" onClick={() => onOpenJob(activeJob.id)}>
            <span className="tray-job__title">{activeJob.title}</span>
            <span className="sl-t-sm">
              {activeJob.asks.length + activeJob.questions.length > 0
                ? `▲ ${t('job.needsYou')}`
                : t(`step.${activeJob.steps[activeJob.steps.length - 1] ?? 'start'}`)}
            </span>
          </button>
        ) : (
          <span className="sl-t-sm">{t('tray.empty')}</span>
        )}
      </section>

      <div className="app-guide">
        <div className="sl-col app-guide__text">
          <span id="guide-label" className="app-guide__title">
            {t('guide.label')}
          </span>
          {guide && <span className="sl-t-sm">{t('guide.hint')}</span>}
        </div>
        <button
          type="button"
          role="switch"
          className="sl-switch"
          aria-checked={guide}
          aria-labelledby="guide-label"
          onClick={() => onGuideChange(!guide)}
        />
      </div>
    </aside>
  )
}
