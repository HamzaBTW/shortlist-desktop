import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { howToLink, MIN_GIT, MIN_PYTHON, TOOLS, type ToolCheck } from '../../../shared/health'
import type { AppInfo } from '../../../shared/ipc'

interface HealthPanelProps {
  checks: ToolCheck[] | null
  checking: boolean
  onRecheck: () => void
}

const short = (v: string): string => v.replace(/\.0$/, '')

/** "This computer": one row per tool. Problems are warnings (▲, amber), never red, never a block. */
export function HealthPanel({ checks, checking, onRecheck }: HealthPanelProps) {
  const { t } = useTranslation()
  const [platform, setPlatform] = useState<AppInfo['platform']>('other')
  useEffect(() => {
    void window.shortlist.appInfo().then((info) => setPlatform(info.platform))
  }, [])

  const toFix = checks?.filter((c) => c.state !== 'ok').length ?? 0

  return (
    <section className="sl-tile panel" aria-labelledby="health-title" aria-busy={checking}>
      <div className="sl-tile__head">
        <h2 id="health-title" className="sl-t-title">
          {t('health.title')}
        </h2>
        {checks && !checking && (
          <span className={`sl-badge ${toFix ? 'sl-badge--warning' : 'sl-badge--success'}`}>
            <span aria-hidden="true">{toFix ? '▲' : '✓'}</span>
            {toFix ? t('health.toFix', { count: toFix }) : t('health.allReady')}
          </span>
        )}
      </div>
      <p className="sl-t-sm">{t('health.intro')}</p>

      <ul className="health-list">
        {TOOLS.map((tool) => {
          const c = checks?.find((x) => x.tool === tool)
          const pending = checking || !c
          const ok = c?.state === 'ok'
          const detail = pending
            ? t('health.checking')
            : ok
              ? [c.version ? t('health.version', { version: short(c.version) }) : null, t(`health.use.${tool}`)].filter(Boolean).join(' · ')
              : t(`health.problem.${c.state === 'limited' ? c.reason ?? 'noBbox' : c.state}`, {
                  version: c.version ? short(c.version) : '',
                  min: short(tool === 'git' ? MIN_GIT : MIN_PYTHON)
                })
          return (
            <li key={tool} className={`sl-check health-row fade-in${!pending && !ok ? ' sl-check--warn' : ''}`}>
              <span className={`sl-glyph ${pending ? 'sl-glyph--active' : ok ? 'sl-glyph--done' : 'sl-glyph--warn'}`} aria-hidden="true">
                {pending ? '●' : ok ? '✓' : '▲'}
              </span>
              <div className="sl-col health-row__text">
                <p className="sl-check__title">{t(`health.name.${tool}`)}</p>
                <span className="sl-t-sm">{detail}</span>
              </div>
              {!pending && !ok && (
                <button type="button" className="sl-btn sl-btn--sm" onClick={() => void window.shortlist.openLink(howToLink(tool, platform))}>
                  {t('health.showMe')}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <div className="screen__actions health-actions">
        <button type="button" className="sl-btn" onClick={onRecheck} disabled={checking}>
          {t('health.checkAgain')}
        </button>
        <span className="sl-t-sm">{t('health.never')}</span>
      </div>
    </section>
  )
}
