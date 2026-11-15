import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { APP_NAME } from '../../../shared/app-info'
import type { EngineStatus } from '../../../shared/engine'
import type { NewFolderResult, Region } from '../../../shared/framework'
import { howToLink, type ToolCheck } from '../../../shared/health'
import type { AppInfo, WorkspaceStatus } from '../../../shared/ipc'
import mark from '../assets/shortlist-mark.svg'
import { PermissionCard, QuestionCard } from '../components/AskCards'
import { EnginePanel } from '../components/EnginePanel'
import { HealthPanel } from '../components/HealthPanel'
import { Markdown } from '../components/Markdown'
import { ReplyBox } from '../components/ReplyBox'
import type { Job } from '../jobs'

// The first-run wizard (design: "Publish plan · v0.1", Wizard 1-6). Shown once; again from
// Settings › Run setup again. It never resets anything: each step reads or runs what it says.

const STEPS = ['welcome', 'connect', 'check', 'folder', 'profile', 'done'] as const
type Step = (typeof STEPS)[number]

interface WizardProps {
  engine: EngineStatus | null
  onRecheckEngine: () => void
  health: ToolCheck[] | null
  checkingHealth: boolean
  onRecheckHealth: () => void
  workspace: WorkspaceStatus | null
  onWorkspace: (status: WorkspaceStatus | null) => void
  /** The /setup run started from step 5, if any. */
  setupJob: Job | null
  /** Another run is going (one run at a time). */
  busy: boolean
  onStartSetup: () => Promise<string | null>
  onReply: (job: Job, text: string) => Promise<string | null>
  /** Leaves the wizard. `then` opens what the person picked on the last step. */
  onFinish: (then?: 'find' | 'add' | 'settings') => void
}

type NewState =
  | { phase: 'idle' }
  | { phase: 'working' }
  | { phase: 'done' }
  | { phase: 'failed'; result: Extract<NewFolderResult, { ok: false }> }

function Progress({ step }: { step: number }) {
  const { t } = useTranslation()
  return (
    <ol className="wizard__progress" aria-label={t('wizard.progress', { step: step + 1, total: STEPS.length })}>
      <li className="sl-t-sm">{t('wizard.progress', { step: step + 1, total: STEPS.length })}</li>
      {STEPS.map((s, i) => (
        <li key={s} aria-hidden="true" className={`wizard__bar${i <= step ? ' is-on' : ''}`} />
      ))}
    </ol>
  )
}

export function Wizard(props: WizardProps) {
  const { engine, onRecheckEngine, health, checkingHealth, onRecheckHealth, workspace, onWorkspace, setupJob, busy, onStartSetup, onReply, onFinish } = props
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const step: Step = STEPS[index]!
  const next = (): void => setIndex((i) => Math.min(i + 1, STEPS.length - 1))
  const back = (): void => setIndex((i) => Math.max(i - 1, 0))
  const headRef = useRef<HTMLHeadingElement>(null)

  // Each step moves focus to its heading, so keyboard and screen-reader users start at the top.
  useEffect(() => headRef.current?.focus(), [index])

  const [dataOpen, setDataOpen] = useState(false)
  const [platform, setPlatform] = useState<AppInfo['platform']>('other')
  useEffect(() => {
    void window.shortlist.appInfo().then((i) => setPlatform(i.platform))
  }, [])

  // Folder step.
  const [mode, setMode] = useState<'existing' | 'new' | null>(workspace?.ok ? 'existing' : null)
  const [picked, setPicked] = useState<WorkspaceStatus | null>(null)
  const [region, setRegion] = useState<Region | null>(null)
  const [empty, setEmpty] = useState<{ path: string; empty: boolean } | null>(null)
  const [newState, setNewState] = useState<NewState>({ phase: 'idle' })
  const git = health?.find((c) => c.tool === 'git')
  const gitProblem = git !== undefined && git.state !== 'ok'

  const chooseExisting = async (): Promise<void> => {
    setMode('existing')
    const status = await window.shortlist.chooseWorkspace()
    if (!status) return
    setPicked(status)
    if (status.ok) onWorkspace(status)
  }

  const chooseEmpty = async (): Promise<void> => {
    const r = await window.shortlist.chooseEmptyFolder()
    if (r) {
      setEmpty(r)
      setNewState({ phase: 'idle' })
    }
  }

  const setUp = async (): Promise<void> => {
    if (!region) return
    setNewState({ phase: 'working' })
    const r = await window.shortlist.setupNewFolder(region)
    if (!r.ok) {
      setNewState({ phase: 'failed', result: r })
      return
    }
    setNewState({ phase: 'done' })
    onWorkspace(await window.shortlist.getWorkspace())
  }

  // Profile step: when a /setup turn ends, look at the folder again (is the profile filled in now?).
  const setupPhase = setupJob?.phase
  useEffect(() => {
    if (setupPhase && setupPhase !== 'running') void window.shortlist.getWorkspace().then(onWorkspace)
  }, [setupPhase, onWorkspace])
  const [startProblem, setStartProblem] = useState<string | null>(null)

  const engineReady = engine?.state === 'ready'
  const toFix = health?.filter((c) => c.state !== 'ok').length ?? 0

  let body: ReactElement
  if (step === 'welcome') {
    body = (
      <>
        <div className="wizard__intro wizard__intro--hero">
          <h1 ref={headRef} tabIndex={-1} className="t-display-xl">
            {t('wizard.welcome.title')}
          </h1>
          <p className="wizard__lead">{t('wizard.welcome.lead', { name: APP_NAME })}</p>
          <p className="sl-t-sm">{t('wizard.welcome.steps')}</p>
        </div>
        <div className="screen__actions wizard__row">
          <button type="button" className="sl-btn sl-btn--primary wizard__big" onClick={next}>
            {t('wizard.welcome.start')}
          </button>
          <button type="button" className="sl-link" aria-expanded={dataOpen} onClick={() => setDataOpen((o) => !o)}>
            {t('wizard.welcome.data')}
          </button>
        </div>
        {dataOpen && (
          <section className="sl-tile panel rise" aria-label={t('wizard.welcome.data')}>
            <h2 className="sl-t-title">{t('wizard.welcome.data')}</h2>
            <ul className="wizard__list">
              {(['noAccount', 'engine', 'files', 'updates'] as const).map((k) => (
                <li key={k} className="sl-t-sm">
                  {t(`wizard.welcome.dataItems.${k}`, { name: APP_NAME })}
                </li>
              ))}
            </ul>
          </section>
        )}
      </>
    )
  } else if (step === 'connect') {
    body = (
      <>
        <div className="wizard__intro">
          <h1 ref={headRef} tabIndex={-1} className="t-display-lg">
            {t('wizard.connect.title')}
          </h1>
          <p className="wizard__lead">{t('wizard.connect.lead', { name: APP_NAME })}</p>
        </div>
        <EnginePanel status={engine} onRecheck={onRecheckEngine} />
      </>
    )
  } else if (step === 'check') {
    body = (
      <>
        <div className="wizard__intro">
          <h1 ref={headRef} tabIndex={-1} className="t-display-lg">
            {t('wizard.check.title')}
          </h1>
          <p className="wizard__lead">{t('wizard.check.lead')}</p>
        </div>
        <HealthPanel checks={health} checking={checkingHealth} onRecheck={onRecheckHealth} />
      </>
    )
  } else if (step === 'folder') {
    const failed = newState.phase === 'failed' ? newState.result : null
    body = (
      <>
        <div className="wizard__intro">
          <h1 ref={headRef} tabIndex={-1} className="t-display-lg">
            {t('wizard.folder.title')}
          </h1>
          <p className="wizard__lead">{t('wizard.folder.lead')}</p>
        </div>

        <div className="wizard__cards">
          <section className={`sl-engine wizard__card${mode === 'existing' ? ' sl-engine--selected' : ''}`} aria-labelledby="wf-existing">
            <h2 id="wf-existing" className="sl-engine__name">
              {t('wizard.folder.existing')}
            </h2>
            <p className="sl-t-sm">{t('wizard.folder.existingNote')}</p>
            <button type="button" className="sl-btn wizard__card-btn" onClick={() => void chooseExisting()} disabled={newState.phase === 'working'}>
              {t('wizard.folder.chooseFolder')}
            </button>
          </section>
          <section className={`sl-engine wizard__card${mode === 'new' ? ' sl-engine--selected' : ''}`} aria-labelledby="wf-new">
            <h2 id="wf-new" className="sl-engine__name">
              {t('wizard.folder.new')}
            </h2>
            <p className="sl-t-sm">{t('wizard.folder.newNote')}</p>
            {gitProblem ? (
              <>
                <p className="sl-t-sm wizard__warn">
                  <span aria-hidden="true">▲</span> {t(git?.state === 'old' ? 'wizard.folder.gitOld' : 'wizard.folder.gitMissing')}
                </p>
                <div className="screen__actions">
                  <button type="button" className="sl-btn sl-btn--sm" onClick={() => void window.shortlist.openLink(howToLink('git', platform))}>
                    {t('health.showMe')}
                  </button>
                  <button type="button" className="sl-btn sl-btn--sm" onClick={onRecheckHealth} disabled={checkingHealth}>
                    {t('health.checkAgain')}
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="sl-btn wizard__card-btn" onClick={() => setMode('new')} disabled={newState.phase === 'working'}>
                {t('wizard.folder.new')}
              </button>
            )}
          </section>
        </div>

        {mode === 'existing' && (picked ?? workspace) && (
          <section className="sl-tile panel rise" aria-label={t('wizard.folder.existing')}>
            <code className="wizard__path">{(picked ?? workspace)!.path}</code>
            {(picked ?? workspace)!.ok ? (
              <p className="sl-t-sm wizard__ok">
                <span aria-hidden="true">✓</span> {t('wizard.folder.looksRight')}
              </p>
            ) : (
              <p className="sl-t-sm wizard__warn">
                <span aria-hidden="true">▲</span> {t('wizard.folder.notRight')}
              </p>
            )}
            <p className="sl-t-sm">{t('wizard.folder.readOnly', { name: APP_NAME })}</p>
          </section>
        )}

        {mode === 'new' && !gitProblem && (
          <section className="sl-tile panel rise" aria-label={t('wizard.folder.new')}>
            <fieldset className="wizard__regions" disabled={newState.phase === 'working' || newState.phase === 'done'}>
              <legend className="sl-t-title">{t('wizard.folder.where')}</legend>
              {(['uae', 'elsewhere'] as const).map((r) => (
                <label key={r} className={`wizard__region${region === r ? ' is-on' : ''}`}>
                  <input type="radio" name="region" value={r} checked={region === r} onChange={() => setRegion(r)} />
                  <span className="sl-col">
                    <span className="wizard__region-name">{t(`wizard.folder.region.${r}`)}</span>
                    <span className="sl-t-sm">{t(`wizard.folder.region.${r}Note`)}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="sl-col">
              <span className="sl-t-title">{t('wizard.folder.folderLabel')}</span>
              {empty && <code className="wizard__path">{empty.path}</code>}
              <button
                type="button"
                className="sl-btn sl-btn--sm wizard__self-start"
                onClick={() => void chooseEmpty()}
                disabled={newState.phase === 'working' || newState.phase === 'done'}
              >
                {t('wizard.folder.chooseEmpty')}
              </button>
              {empty && !empty.empty && (
                <p className="sl-t-sm wizard__warn">
                  <span aria-hidden="true">▲</span> {t('wizard.folder.notEmpty')}
                </p>
              )}
            </div>

            {newState.phase === 'idle' && (
              region && empty?.empty ? (
                <button type="button" className="sl-btn sl-btn--primary wizard__self-start" onClick={() => void setUp()} disabled={busy}>
                  {t('wizard.folder.setUp')}
                </button>
              ) : (
                <p className="sl-t-sm">{t('wizard.folder.needBoth')}</p>
              )
            )}

            {newState.phase === 'working' && (
              <div aria-live="polite">
                <ul className="sl-steps">
                  <li className="is-done">
                    <span className="g" aria-hidden="true">✓</span>
                    {t('wizard.folder.step.empty')}
                  </li>
                  <li className="is-active">
                    <span className="g" aria-hidden="true">●</span>
                    {t('wizard.folder.step.copy', { name: APP_NAME })}
                  </li>
                  <li>
                    <span className="g" aria-hidden="true">○</span>
                    {t('wizard.folder.step.push')}
                  </li>
                </ul>
              </div>
            )}

            {newState.phase === 'done' && (
              <p className="sl-t-sm wizard__ok" role="status">
                <span aria-hidden="true">✓</span> {t('wizard.folder.ready')}
              </p>
            )}

            {failed && (
              <div className="wizard__problem" role="alert">
                <p className="sl-t-sm">
                  <span aria-hidden="true">▲</span> {t(`wizard.folder.problem.${failed.problem}`)}
                </p>
                {failed.partial && <p className="sl-t-sm">{t('wizard.folder.partial')}</p>}
                <div className="screen__actions">
                  <button type="button" className="sl-btn sl-btn--sm" onClick={() => void chooseEmpty()}>
                    {t('wizard.folder.chooseOther')}
                  </button>
                  {!failed.partial && (
                    <button type="button" className="sl-btn sl-btn--sm" onClick={() => setNewState({ phase: 'idle' })}>
                      {t('wizard.folder.tryAgain')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </>
    )
  } else if (step === 'profile') {
    const filled = workspace?.profileFilled === true
    const job = setupJob
    body = (
      <>
        <div className="wizard__intro">
          <h1 ref={headRef} tabIndex={-1} className="t-display-lg">
            {t('wizard.profile.title')}
          </h1>
          <p className="wizard__lead">{t('wizard.profile.lead')}</p>
        </div>

        {filled && !job && (
          <section className="sl-tile panel wizard__done-note">
            <span className="sl-glyph sl-glyph--done" aria-hidden="true">
              ✓
            </span>
            <div className="sl-col">
              <span className="sl-t-title">{t('wizard.profile.already')}</span>
              <span className="sl-t-sm">{t('wizard.profile.alreadyNote')}</span>
            </div>
          </section>
        )}

        {!filled && !job && (
          <section className="sl-tile panel">
            <h2 className="sl-t-title">{t('wizard.profile.howTitle')}</h2>
            <ul className="wizard__list">
              {(['import', 'paste', 'interview'] as const).map((k) => (
                <li key={k} className="sl-t-sm">
                  <b>{t(`wizard.profile.how.${k}`)}</b> {t(`wizard.profile.how.${k}Note`)}
                </li>
              ))}
            </ul>
            <div className="screen__actions">
              <button
                type="button"
                className="sl-btn sl-btn--primary"
                disabled={busy || !engineReady || !workspace?.ok}
                onClick={() => void onStartSetup().then(setStartProblem)}
              >
                {t('wizard.profile.start')}
              </button>
            </div>
            {!engineReady && <p className="sl-t-sm">{t('wizard.profile.needEngine')}</p>}
            {startProblem && (
              <p role="alert" className="notice">
                {startProblem}
              </p>
            )}
          </section>
        )}

        {job && (
          <section className="sl-tile panel" aria-label={t('wizard.profile.running')}>
            <div className="sl-tile__head">
              <span className="sl-t-label">{t('wizard.profile.running')}</span>
              {job.phase === 'running' ? (
                <span className="sl-badge sl-badge--info">
                  <span aria-hidden="true">●</span>
                  {t('job.phase.running')}
                </span>
              ) : job.phase === 'failed' ? (
                <span className="sl-badge sl-badge--muted">{t('job.phase.failed')}</span>
              ) : (
                <span className="sl-badge sl-badge--warning">
                  <span aria-hidden="true">▲</span>
                  {t('wizard.profile.waiting')}
                </span>
              )}
            </div>

            {job.asks.map((ask) => (
              <PermissionCard key={ask.requestId} ask={ask} />
            ))}
            {job.questions.map((ask) => (
              <QuestionCard key={ask.requestId} ask={ask} />
            ))}

            {job.phase === 'running' && (
              <ul className="sl-steps" aria-live="polite">
                {job.steps.map((s, i) => {
                  const current = i === job.steps.length - 1
                  return (
                    <li key={i} className={current ? 'is-active' : 'is-done'}>
                      <span className="g" aria-hidden="true">
                        {current ? '●' : '✓'}
                      </span>
                      {t(`step.${s}`)}
                    </li>
                  )
                })}
              </ul>
            )}

            {job.phase === 'failed' && job.error && <p className="sl-t-sm">{job.error}</p>}

            {job.phase !== 'running' && job.result && (
              <div className="ask-text rise">
                <span className="sl-t-label">{t('reply.asks')}</span>
                <Markdown text={job.result} />
              </div>
            )}
            {job.phase !== 'running' && job.sessionId && (
              <ReplyBox busy={busy} truthHint onSend={(text) => onReply(job, text)} />
            )}
            <p className="sl-t-sm">{t('wizard.profile.leaveNote')}</p>
          </section>
        )}
      </>
    )
  } else {
    body = (
      <>
        <div className="wizard__intro wizard__intro--hero">
          <h1 ref={headRef} tabIndex={-1} className="t-display-xl">
            {t('wizard.done.title')}
          </h1>
          <p className="wizard__lead">{t('wizard.done.lead')}</p>
        </div>
        <section className="sl-tile panel wizard__summary" aria-label={t('wizard.done.summary')}>
          <div className="wizard__sum">
            <span className={`sl-glyph ${engineReady ? 'sl-glyph--done' : 'sl-glyph--warn'}`} aria-hidden="true">
              {engineReady ? '✓' : '▲'}
            </span>
            <span>{engineReady ? t('wizard.done.engineReady') : t('wizard.done.engineNot')}</span>
          </div>
          <div className="wizard__sum">
            <span className={`sl-glyph ${toFix ? 'sl-glyph--warn' : 'sl-glyph--done'}`} aria-hidden="true">
              {toFix ? '▲' : '✓'}
            </span>
            <span>{toFix ? t('wizard.done.computerFix', { count: toFix }) : t('wizard.done.computerOk')}</span>
            {toFix > 0 && (
              <button type="button" className="sl-link" onClick={() => onFinish('settings')}>
                {t('wizard.done.openSettings')}
              </button>
            )}
          </div>
          <div className="wizard__sum">
            <span className={`sl-glyph ${workspace?.ok ? 'sl-glyph--done' : 'sl-glyph--warn'}`} aria-hidden="true">
              {workspace?.ok ? '✓' : '▲'}
            </span>
            <span className="wizard__sum-text">{workspace?.ok ? t('wizard.done.folder', { path: workspace.path }) : t('wizard.done.noFolder')}</span>
          </div>
          <div className="wizard__sum">
            <span className={`sl-glyph ${workspace?.profileFilled ? 'sl-glyph--done' : 'sl-glyph--warn'}`} aria-hidden="true">
              {workspace?.profileFilled ? '✓' : '▲'}
            </span>
            <span>{workspace?.profileFilled ? t('wizard.done.profileOk') : t('wizard.done.profileNot')}</span>
          </div>
        </section>
        <div className="screen__actions wizard__row">
          <button type="button" className="sl-btn sl-btn--primary wizard__big" onClick={() => onFinish('find')} disabled={!workspace?.ok || !engineReady}>
            {t('wizard.done.find')}
          </button>
          <button type="button" className="sl-btn wizard__big" onClick={() => onFinish('add')} disabled={!workspace?.ok || !engineReady}>
            {t('wizard.done.add')}
          </button>
          <button type="button" className="sl-btn sl-btn--quiet" onClick={() => onFinish()}>
            {t('wizard.done.home')}
          </button>
        </div>
        <p className="sl-t-sm">{t('wizard.done.again')}</p>
      </>
    )
  }

  const canContinue = step === 'connect' ? engineReady : step === 'folder' ? workspace?.ok === true && newState.phase !== 'working' : true

  return (
    <div className="wizard">
      <div className="wizard__col">
        <header className="wizard__head">
          <div className="sl-brand wizard__brand">
            <img src={mark} alt="" className="app-brand__mark" />
            {APP_NAME}
          </div>
          <Progress step={index} />
        </header>

        <div key={step} className="screen-fade wizard__body">
          {body}
        </div>

        {step !== 'welcome' && step !== 'done' && (
          <footer className="wizard__foot">
            <button type="button" className="sl-btn sl-btn--quiet" onClick={back}>
              {t('wizard.back')}
            </button>
            <div className="screen__actions wizard__row">
              {step === 'profile' && !workspace?.profileFilled && (
                <button type="button" className="sl-btn sl-btn--quiet" onClick={next}>
                  {t('wizard.later')}
                </button>
              )}
              {step === 'check' && toFix > 0 && <span className="sl-t-sm">{t('wizard.check.fixLater', { count: toFix })}</span>}
              {canContinue ? (
                <button type="button" className="sl-btn sl-btn--primary" onClick={next}>
                  {t('wizard.continue')}
                </button>
              ) : (
                <span className="sl-t-sm">{t(step === 'connect' ? 'wizard.connect.need' : 'wizard.folder.need')}</span>
              )}
            </div>
          </footer>
        )}

        {step !== 'done' && (
          <button type="button" className="sl-link wizard__skip" onClick={() => onFinish()}>
            {t('wizard.skip')}
          </button>
        )}
      </div>
    </div>
  )
}
