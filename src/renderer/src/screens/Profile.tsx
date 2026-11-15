import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SetupSection } from '../../../shared/engine'
import type { WorkspaceStatus } from '../../../shared/ipc'
import { PROFILE_CARDS, type CardDef, type CardSummary } from '../../../shared/profile'
import type { Route } from '../components/Sidebar'
import type { Job } from '../jobs'

// The Profile screen (design: "Publish plan · v0.1", Profile). Read-only: what the AI knows,
// straight from the folder. Changes go through "Open file" or the framework's own commands.

interface ProfileProps {
  workspace: WorkspaceStatus | null
  /** Folder and AI engine ready. */
  ready: boolean
  /** Another run is going (one at a time). */
  busy: boolean
  /** Profile conversations (/setup, /expand), newest first. */
  conversations: Job[]
  /** Re-read the files when this changes (a run finished). */
  refreshKey: number
  onRun: (command: 'setup' | 'expand', input: string, title: string) => Promise<string | null>
  onOpenJob: (id: string) => void
  onNavigate: (route: Route) => void
}

function SectionMenu({ card, disabled, onPick }: { card: CardDef; disabled: boolean; onPick: (s: SetupSection) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    first.current?.focus()
    const away = (e: MouseEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  return (
    <div
      className="section-menu"
      ref={box}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false)
      }}
    >
      <button
        type="button"
        className="sl-btn sl-btn--sm sl-btn--primary"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {t('profile.update')} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="section-menu__list fade-in" role="menu" aria-label={t('profile.whichPart')}>
          <span className="sl-t-label section-menu__head">{t('profile.whichPart')}</span>
          {card.sections.map((s, i) => (
            <button
              key={s}
              ref={i === 0 ? first : undefined}
              type="button"
              role="menuitem"
              className="section-menu__item"
              onClick={() => {
                setOpen(false)
                onPick(s)
              }}
            >
              {t(`profile.section.${s}`)}
            </button>
          ))}
          <span className="sl-t-sm section-menu__note">{t('profile.menuNote')}</span>
        </div>
      )}
    </div>
  )
}

export function Profile({ workspace, ready, busy, conversations, refreshKey, onRun, onOpenJob, onNavigate }: ProfileProps) {
  const { t } = useTranslation()
  const [cards, setCards] = useState<CardSummary[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const ok = workspace?.ok === true

  useEffect(() => {
    if (!ok) {
      setCards(null)
      return
    }
    void window.shortlist.readProfile().then(setCards)
  }, [ok, refreshKey])

  const run = async (command: 'setup' | 'expand', input: string, title: string): Promise<void> => {
    setProblem(await onRun(command, input, title))
  }
  const section = (s: SetupSection): void => void run('setup', `--section ${s}`, t('profile.job.section', { section: t(`profile.section.${s}`) }))
  const canRun = ready && !busy

  if (!ok) {
    return (
      <div className="screen">
        <header className="screen__head">
          <h1 className="t-display-lg">{t('profile.title')}</h1>
        </header>
        <p className="sl-t-sm">
          {t('profile.noFolder')}{' '}
          <button type="button" className="sl-link" onClick={() => onNavigate('settings')}>
            {t('home.openSettings')}
          </button>
        </p>
      </div>
    )
  }

  const filled = workspace.profileFilled

  return (
    <div className="screen">
      <header className="screen__head">
        <div className="sl-col">
          <h1 className="t-display-lg">{t('profile.title')}</h1>
          <p className="sl-t-sm profile__lead">{t('profile.lead')}</p>
        </div>
        <div className="screen__actions">
          <button type="button" className="sl-btn" onClick={() => void window.shortlist.openWorkspace()}>
            {t('profile.openFolder')}
          </button>
          {filled && (
            <button type="button" className="sl-btn sl-btn--primary" disabled={!canRun} onClick={() => void run('expand', '', t('profile.job.expand'))}>
              {t('profile.expand')}
            </button>
          )}
        </div>
      </header>

      {!ready && <p className="sl-t-sm">{t('profile.needEngine')}</p>}
      {problem && (
        <p role="alert" className="notice">
          {problem}
        </p>
      )}

      {!filled && (
        <section className="sl-tile panel profile-empty rise" aria-labelledby="profile-empty-title">
          <span className="sl-t-label">{t('profile.empty.label')}</span>
          <h2 id="profile-empty-title" className="profile-empty__title">
            {t('profile.empty.title')}
          </h2>
          <p className="sl-t-sm">{t('profile.empty.lead')}</p>
          <div className="screen__actions">
            <button type="button" className="sl-btn sl-btn--primary" disabled={!canRun} onClick={() => void run('setup', '', t('profile.job.setup'))}>
              {t('profile.empty.build')}
            </button>
          </div>
          <div className="profile-empty__next">
            <span className="sl-glyph" aria-hidden="true">
              2
            </span>
            <div className="sl-col">
              <span className="sl-t-title profile-empty__next-title">{t('profile.empty.nextTitle')}</span>
              <span className="sl-t-sm">{t('profile.empty.nextNote')}</span>
            </div>
          </div>
        </section>
      )}

      {conversations.length > 0 && (
        <section className="sl-tile panel" aria-labelledby="profile-convos">
          <h2 id="profile-convos" className="sl-t-title">
            {t('profile.conversations')}
          </h2>
          <ul className="plain profile-convos">
            {conversations.slice(0, 3).map((j) => (
              <li key={j.id} className="profile-convo">
                <span className="profile-convo__title">{j.title}</span>
                <span className={`sl-badge ${j.phase === 'running' ? 'sl-badge--info' : 'sl-badge--muted'}`}>
                  {t(`job.phase.${j.phase}`)}
                </span>
                <button type="button" className="sl-btn sl-btn--sm" onClick={() => onOpenJob(j.id)}>
                  {t('profile.openConversation')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label={t('profile.files')} className="profile-grid">
        {PROFILE_CARDS.map((def) => {
          const summary = cards?.find((c) => c.id === def.id)
          const files = summary?.files ?? []
          const missing = summary !== undefined && files.every((f) => !f.found)
          const toFill = files.reduce((n, f) => n + f.placeholders, 0)
          const parts = [...new Set(files.flatMap((f) => f.parts))]
          const fillNames = [...new Set(files.flatMap((f) => f.toFill))]
          return (
            <article key={def.id} className="sl-tile profile-card fade-in" aria-labelledby={`card-${def.id}`}>
              <div className="sl-tile__head profile-card__head">
                <div className="sl-col profile-card__name">
                  <h2 id={`card-${def.id}`} className="sl-t-title profile-card__title">
                    {t(`profile.card.${def.id}`)}
                  </h2>
                  <span className="profile-card__file">{def.files.map((f) => f.split('/').pop()).join(' · ')}</span>
                </div>
                {summary && !missing && !def.noBadge && (
                  toFill === 0 ? (
                    <span className="sl-badge sl-badge--success">
                      <span aria-hidden="true">✓</span>
                      {t('profile.filled')}
                    </span>
                  ) : (
                    <span className="sl-badge sl-badge--warning">
                      <span aria-hidden="true">▲</span>
                      {t('profile.toFill', { count: toFill })}
                    </span>
                  )
                )}
              </div>

              {!summary ? (
                <div className="skeleton skeleton--head" />
              ) : missing ? (
                <p className="sl-t-sm">{t('profile.missing')}</p>
              ) : (
                <div className="sl-col profile-card__body">
                  {def.noBadge && <span className="sl-t-sm">{t('profile.writingNote')}</span>}
                  {parts.length > 0 && (
                    <span className="sl-t-sm">
                      {t('profile.parts', { list: parts.slice(0, 5).join(' · ') })}
                      {parts.length > 5 ? ` ${t('profile.more', { count: parts.length - 5 })}` : ''}
                    </span>
                  )}
                  {fillNames.length > 0 && (
                    <span className="sl-t-sm profile-card__fill">{t('profile.stillToFill', { list: fillNames.slice(0, 4).join(', ') })}</span>
                  )}
                </div>
              )}

              <div className="sl-tile__foot profile-card__foot">
                {def.files.map((f, i) => (
                  <button key={f} type="button" className="sl-btn sl-btn--sm" disabled={missing} onClick={() => void window.shortlist.openFile(f)}>
                    {def.files.length > 1 ? t(i === 0 ? 'profile.openCv' : 'profile.openLetter') : t('profile.openFile')}
                  </button>
                ))}
                {def.sections.length === 1 && (
                  <button type="button" className="sl-btn sl-btn--sm sl-btn--primary" disabled={!canRun} onClick={() => section(def.sections[0]!)}>
                    {t('profile.update')}
                  </button>
                )}
                {def.sections.length > 1 && <SectionMenu card={def} disabled={!canRun} onPick={section} />}
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}
