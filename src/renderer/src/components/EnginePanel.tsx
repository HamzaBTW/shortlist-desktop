import { useTranslation } from 'react-i18next'
import type { EngineStatus } from '../../../shared/engine'
import { CLAUDE_CODE_SETUP } from '../../../shared/health'

interface EnginePanelProps {
  status: EngineStatus | null
  onRecheck: () => void
}

const GLYPH: Record<string, string> = { ready: '✓', checking: '●', signedOut: '▲', outdated: '▲', notFound: '✕', error: '✕' }
const TONE: Record<string, string> = { ready: 'done', checking: 'active', signedOut: '', outdated: '', notFound: 'failed', error: 'failed' }

export function EnginePanel({ status, onRecheck }: EnginePanelProps) {
  const { t } = useTranslation()
  const state = status?.state ?? 'checking'

  return (
    <section className="sl-tile panel" aria-labelledby="engine-title">
      <h2 id="engine-title" className="sl-t-title">
        {t('engine.title')}
      </h2>

      <div className="engines">
        <article className="sl-engine sl-engine--selected" aria-labelledby="engine-cc">
          <div className="sl-tile__head">
            <h3 id="engine-cc" className="sl-engine__name">
              {t('engine.cc.name')}
            </h3>
            <span className="sl-badge sl-badge--info">{t('engine.recommended')}</span>
          </div>
          <p className="sl-t-sm">{t('engine.cc.privacy')}</p>

          <div className="engine-state" role="status">
            <span className={`sl-glyph${TONE[state] ? ` sl-glyph--${TONE[state]}` : ''}`} aria-hidden="true">
              {GLYPH[state]}
            </span>
            <span>{t(`engine.state.${state}`, { version: status?.version, min: status?.minVersion })}</span>
          </div>

          <div className="screen__actions">
            {state === 'signedOut' && (
              <button type="button" className="sl-btn sl-btn--primary" onClick={() => void window.shortlist.signInEngine()}>
                {t('engine.signIn')}
              </button>
            )}
            {(state === 'notFound' || state === 'outdated') && (
              <button type="button" className="sl-btn sl-btn--primary" onClick={() => void window.shortlist.openLink(CLAUDE_CODE_SETUP)}>
                {t('health.showMe')}
              </button>
            )}
            <button type="button" className="sl-btn" onClick={onRecheck} disabled={state === 'checking'}>
              {t('engine.checkAgain')}
            </button>
          </div>
          {(state === 'notFound' || state === 'outdated') && <p className="sl-t-sm">{t(`engine.help.${state}`)}</p>}
          {state === 'signedOut' && <p className="sl-t-sm">{t('engine.help.signedOut')}</p>}
        </article>

        <article className="sl-engine sl-engine--disabled" aria-labelledby="engine-key" aria-disabled="true">
          <div className="sl-tile__head">
            <h3 id="engine-key" className="sl-engine__name">
              {t('engine.key.name')}
            </h3>
            <span className="sl-badge sl-badge--muted">{t('engine.comingNext')}</span>
          </div>
          <p className="sl-t-sm">{t('engine.key.privacy')}</p>
        </article>

        <article className="sl-engine sl-engine--disabled" aria-labelledby="engine-codex" aria-disabled="true">
          <div className="sl-tile__head">
            <h3 id="engine-codex" className="sl-engine__name">
              {t('engine.codex.name')}
            </h3>
            <span className="sl-badge sl-badge--muted">{t('engine.comingSoon')}</span>
          </div>
          <p className="sl-t-sm">{t('engine.codex.privacy')}</p>
        </article>
      </div>
    </section>
  )
}
