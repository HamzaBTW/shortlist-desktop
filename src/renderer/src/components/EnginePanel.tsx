import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ENGINE_ONE_ENABLED } from '../../../shared/api-key'
import type { EngineSet, EngineStatus } from '../../../shared/engine'
import { CLAUDE_CODE_SETUP } from '../../../shared/health'

interface EnginePanelProps {
  engines: EngineSet | null
  onRecheck: () => void
  /** "Use this engine". Only the person switches engines; the app never does it by itself. */
  onUse: (id: EngineSet['active']) => void
}

/** Where people create an API key (Anthropic's own console). */
const KEY_PAGE = 'https://console.anthropic.com/settings/keys'

const GLYPH: Record<string, string> = { ready: '✓', checking: '●', signedOut: '▲', noKey: '▲', outdated: '▲', notFound: '✕', error: '✕' }
const TONE: Record<string, string> = { ready: 'done', checking: 'active', signedOut: '', noKey: '', outdated: '', notFound: 'failed', error: 'failed' }

function StateLine({ status }: { status: EngineStatus | null }) {
  const { t } = useTranslation()
  const state = status?.state ?? 'checking'
  return (
    <div className="engine-state" role="status">
      <span className={`sl-glyph${TONE[state] ? ` sl-glyph--${TONE[state]}` : ''}`} aria-hidden="true">
        {GLYPH[state]}
      </span>
      <span>{t(`engine.state.${state}`, { version: status?.version, min: status?.minVersion })}</span>
    </div>
  )
}

/** The Claude Code program itself is missing or too old: both engines need it. */
function ProgramHelp({ status }: { status: EngineStatus | null }) {
  const { t } = useTranslation()
  const state = status?.state
  if (state !== 'notFound' && state !== 'outdated') return null
  return (
    <>
      <div className="screen__actions">
        <button type="button" className="sl-btn sl-btn--primary" onClick={() => void window.shortlist.openLink(CLAUDE_CODE_SETUP)}>
          {t('health.showMe')}
        </button>
      </div>
      <p className="sl-t-sm">{t(`engine.help.${state}`)}</p>
    </>
  )
}

function KeyCard({ status, active, onRecheck, onUse }: { status: EngineStatus | null; active: boolean; onRecheck: () => void; onUse: () => void }) {
  const { t, i18n } = useTranslation()
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const key = status?.key
  const state = status?.state ?? 'checking'
  const money = (usd: number): string => new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(usd)

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!draft.trim() || saving) return
    setSaving(true)
    setProblem(null)
    const r = await window.shortlist.saveApiKey(draft.trim())
    setSaving(false)
    if (r.ok) {
      setDraft('')
      onRecheck()
    } else setProblem(r.reason)
  }

  const remove = async (): Promise<void> => {
    await window.shortlist.removeApiKey()
    onRecheck()
  }

  return (
    <article className={`sl-engine${active ? ' sl-engine--selected' : ''}`} aria-labelledby="engine-key">
      <div className="sl-tile__head">
        <h3 id="engine-key" className="sl-engine__name">
          {t('engine.key.name')}
        </h3>
        {active && <span className="sl-badge sl-badge--info">{t('engine.inUse')}</span>}
      </div>
      <p className="sl-t-sm">{t('engine.key.privacy')}</p>

      {key?.saved ? (
        <>
          <div className="engine-state" role="status">
            <span className={`sl-glyph${state === 'ready' ? ' sl-glyph--done' : TONE[state] ? ` sl-glyph--${TONE[state]}` : ''}`} aria-hidden="true">
              {state === 'ready' ? '✓' : GLYPH[state]}
            </span>
            <span>{state === 'ready' || state === 'noKey' ? t('engine.key.saved', { last4: key.last4 }) : t(`engine.state.${state}`, { version: status?.version, min: status?.minVersion })}</span>
          </div>
          <p className="sl-t-sm">{t('engine.key.spent', { amount: money(key.spentUsd), date: key.addedAt })}</p>
          <div className="screen__actions">
            {!active && state === 'ready' && (
              <button type="button" className="sl-btn sl-btn--primary" onClick={onUse}>
                {t('engine.use')}
              </button>
            )}
            <button type="button" className="sl-btn" onClick={() => void remove()}>
              {t('engine.key.remove')}
            </button>
          </div>
          <ProgramHelp status={status} />
        </>
      ) : key?.storage === 'weak' ? (
        <p className="sl-t-sm" role="note">
          {t('engine.key.weakStorage')}
        </p>
      ) : (
        <form className="key-form" onSubmit={(e) => void submit(e)}>
          <label className="sl-col">
            <span className="sl-t-label">{t('engine.key.label')}</span>
            <input
              type="password"
              className="field"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-invalid={problem !== null}
            />
          </label>
          {problem && (
            <p className="sl-t-sm" role="alert">
              {t(`engine.key.problem.${problem}`)}
            </p>
          )}
          <div className="screen__actions">
            <button type="submit" className="sl-btn sl-btn--primary" disabled={!draft.trim() || saving}>
              {saving ? t('engine.key.checking') : t('engine.key.save')}
            </button>
            <button type="button" className="sl-btn" onClick={() => void window.shortlist.openLink(KEY_PAGE)}>
              {t('engine.key.getOne')}
            </button>
          </div>
          <p className="sl-t-sm">{t('engine.key.how')}</p>
        </form>
      )}
      <p className="sl-t-sm">{t('engine.key.billing')}</p>
    </article>
  )
}

export function EnginePanel({ engines, onRecheck, onUse }: EnginePanelProps) {
  const { t } = useTranslation()
  const cc = engines?.claudeCode ?? null
  const ccState = cc?.state ?? 'checking'
  const active = engines?.active ?? 'claude-code'
  const checking = ccState === 'checking'

  return (
    <section className="sl-tile panel" aria-labelledby="engine-title">
      <div className="sl-tile__head">
        <h2 id="engine-title" className="sl-t-title">
          {t('engine.title')}
        </h2>
        <button type="button" className="sl-btn" onClick={onRecheck} disabled={checking}>
          {t('engine.checkAgain')}
        </button>
      </div>

      <div className="engines">
        {ENGINE_ONE_ENABLED && (
          <article className={`sl-engine${active === 'claude-code' ? ' sl-engine--selected' : ''}`} aria-labelledby="engine-cc">
            <div className="sl-tile__head">
              <h3 id="engine-cc" className="sl-engine__name">
                {t('engine.cc.name')}
              </h3>
              <span className="sl-badge sl-badge--info">{active === 'claude-code' ? t('engine.inUse') : t('engine.recommended')}</span>
            </div>
            <p className="sl-t-sm">{t('engine.cc.privacy')}</p>
            <StateLine status={cc} />
            <div className="screen__actions">
              {ccState === 'signedOut' && (
                <button type="button" className="sl-btn sl-btn--primary" onClick={() => void window.shortlist.signInEngine()}>
                  {t('engine.signIn')}
                </button>
              )}
              {active !== 'claude-code' && ccState === 'ready' && (
                <button type="button" className="sl-btn sl-btn--primary" onClick={() => onUse('claude-code')}>
                  {t('engine.use')}
                </button>
              )}
            </div>
            {ccState === 'signedOut' && <p className="sl-t-sm">{t('engine.help.signedOut')}</p>}
            <ProgramHelp status={cc} />
          </article>
        )}

        <KeyCard status={engines?.apiKey ?? null} active={active === 'api-key'} onRecheck={onRecheck} onUse={() => onUse('api-key')} />

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
