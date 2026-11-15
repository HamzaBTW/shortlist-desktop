import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EngineStatus } from '../../shared/engine'
import { needsAttention, type ToolCheck } from '../../shared/health'
import { DEFAULT_SETTINGS, type RunStartResult, type Settings as SettingsData, type WorkspaceStatus } from '../../shared/ipc'
import type { IncompleteJob, Pick, RankedJob, SearchData } from '../../shared/search'
import { columnFor, type TrackerData, type TrackerRow } from '../../shared/tracker'
import { AddJobDialog } from './components/AddJobDialog'
import { Launch } from './components/Launch'
import { StatusDialog, type StatusTarget } from './components/StatusDialog'
import { outcomeRequest, type OutcomeChoice } from './outcome'
import { Sidebar, type Route } from './components/Sidebar'
import { applyEvent, changedRow, continued, newJob, restore, type Job } from './jobs'
import { Home } from './screens/Home'
import { JobDetail } from './screens/JobDetail'
import { Placeholder } from './screens/Placeholder'
import { RowDetail } from './screens/RowDetail'
import { Search } from './screens/Search'
import { Settings } from './screens/Settings'
import { Wizard } from './screens/Wizard'
import { slotsArg, topUpSlots, type Freed, type Source, type SourceLabel } from '../../shared/slots'
import { useTheme } from './useTheme'

export type View = Route | { job: string } | { row: string }

export function App() {
  const { t } = useTranslation()
  const [view, setView] = useState<View>('home')
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS)
  const [workspace, setWorkspace] = useState<WorkspaceStatus | null>(null)
  /** getWorkspace() answered (null then means "no folder saved yet", not "still loading"). */
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  /** The first-run wizard is open. null until settings and folder are known. */
  const [wizard, setWizard] = useState<boolean | null>(null)
  const [setupJobId, setSetupJobId] = useState<string | null>(null)
  const [engine, setEngine] = useState<EngineStatus | null>(null)
  const [health, setHealth] = useState<ToolCheck[] | null>(null)
  const [checkingHealth, setCheckingHealth] = useState(false)
  const [jobs, setJobs] = useState<Job[]>([])
  const [tracker, setTracker] = useState<TrackerData | null>(null)
  const [adding, setAdding] = useState(false)
  const [updating, setUpdating] = useState<StatusTarget | null>(null)
  const [search, setSearch] = useState<SearchData | null>(null)
  const [picks, setPicks] = useState<Record<string, Pick>>({})
  // Find new jobs: /scrape runs first; when it finishes, /rank starts for the same job.
  const scrapeRuns = useRef(new Map<string, string>())
  // Closing postings: which keys each /scrape drop run was asked to close, and what that frees.
  const closeRuns = useRef(new Map<string, { keys: string[]; sources: Map<string, SourceLabel> }>())
  const [closing, setClosing] = useState<string[]>([])
  const [freed, setFreed] = useState<Freed>({})

  // Tracker rows as they were when each run started, and which job each run belongs to.
  const before = useRef(new Map<string, { jobId: string; rows: TrackerRow[]; linkJobId?: string }>())
  // Last saved version of each job, so only changed jobs are written.
  const saved = useRef(new Map<string, Job>())
  const trackerRef = useRef<TrackerData | null>(null)
  trackerRef.current = tracker

  const recheckEngine = useCallback(() => {
    setEngine((e) => (e ? { ...e, state: 'checking' } : e))
    void window.shortlist.detectEngine().then(setEngine)
  }, [])

  /** "This computer": at startup and on Check again (not on every focus: it starts several programs). */
  const recheckComputer = useCallback(() => {
    setCheckingHealth(true)
    void window.shortlist
      .checkComputer()
      .then(setHealth)
      .finally(() => setCheckingHealth(false))
  }, [])

  const reloadTracker = useCallback(async (): Promise<TrackerData> => {
    const data = await window.shortlist.readTracker()
    setTracker(data)
    return data
  }, [])

  const reloadSearch = useCallback(async (): Promise<SearchData> => {
    const data = await window.shortlist.readSearch()
    setSearch(data)
    return data
  }, [])

  // Settings, engine and run events: once.
  useEffect(() => {
    void window.shortlist.getSettings().then((s) => {
      setSettings(s)
      setSettingsLoaded(true)
    })
    void window.shortlist.getWorkspace().then((w) => {
      setWorkspace(w)
      setWorkspaceLoaded(true)
    })
    recheckEngine()
    recheckComputer()
    const onFocus = (): void => {
      recheckEngine()
      void reloadTracker()
      void reloadSearch()
    }
    window.addEventListener('focus', onFocus)
    const off = window.shortlist.onRunEvent((event) => {
      setJobs((all) => all.map((j) => applyEvent(j, event)))
      if (event.type !== 'finished' && event.type !== 'failed') return
      const closed = closeRuns.current.get(event.runId)
      closeRuns.current.delete(event.runId)
      void reloadSearch().then((data) => {
        if (!closed) return
        setClosing((c) => c.filter((k) => !closed.keys.includes(k)))
        // Only postings that really left the list free a slot.
        const gone = closed.keys.filter((k) => !data.incomplete.some((i) => i.key === k))
        setFreed((f) => {
          const next = { ...f }
          for (const k of gone) {
            const source = closed.sources.get(k)
            if (source && source !== 'other') next[source as Source] = (next[source as Source] ?? 0) + 1
          }
          return next
        })
      })
      const searchJob = scrapeRuns.current.get(event.runId)
      scrapeRuns.current.delete(event.runId)
      if (searchJob && event.type === 'finished' && !event.isError) {
        // The search found what it could; rank it now.
        void window.shortlist.startRun({ command: 'rank', input: '' }).then((r) => {
          if (r.ok) setJobs((all) => all.map((j) => (j.id === searchJob ? { ...continued(j, r.runId), stage: 'rank' } : j)))
        })
      }
      const start = before.current.get(event.runId)
      before.current.delete(event.runId)
      void reloadTracker().then((data) => {
        if (!start) return
        const key = changedRow(start.rows, data.rows)
        const linkId = start.linkJobId
        if (key)
          setJobs((all) =>
            all.map((j) =>
              (j.id === start.jobId && j.kind !== 'outcome') || (linkId && j.id === linkId) ? { ...j, trackerKey: key } : j
            )
          )
      })
    })
    return () => {
      window.removeEventListener('focus', onFocus)
      off()
    }
  }, [recheckEngine, reloadTracker, reloadSearch])

  // Saved jobs and the tracker: whenever the folder changes.
  const wsPath = workspace?.ok ? workspace.path : null
  useEffect(() => {
    saved.current.clear()
    if (!wsPath) {
      setJobs([])
      setTracker(null)
      setSearch(null)
      setPicks({})
      return
    }
    void window.shortlist.listPicks().then(setPicks)
    void reloadSearch()
    void window.shortlist.listJobs().then((raw) => {
      const restored = raw.map((r) => restore(r, t('job.stoppedOnClose'))).filter((j): j is Job => j !== null)
      setJobs(restored)
    })
    void reloadTracker()
  }, [wsPath, reloadTracker, reloadSearch, t])

  // Save jobs that changed.
  useEffect(() => {
    if (!wsPath) return
    for (const job of jobs) {
      if (saved.current.get(job.id) === job) continue
      saved.current.set(job.id, job)
      void window.shortlist.saveJob(job)
    }
  }, [jobs, wsPath])

  useTheme(settings.theme)

  const update = useCallback((patch: Partial<SettingsData>) => {
    setSettings((current) => ({ ...current, ...patch }))
    void window.shortlist.setSettings(patch).then(setSettings)
  }, [])

  // First run: open the wizard once settings and the saved folder are known. An install that
  // already has a working folder counts as set up, so the wizard doesn't appear by itself there.
  useEffect(() => {
    if (!settingsLoaded || !workspaceLoaded || wizard !== null) return
    if (!settings.setupDone && workspace?.ok) {
      update({ setupDone: true })
      setWizard(false)
      return
    }
    setWizard(!settings.setupDone)
  }, [settingsLoaded, workspaceLoaded, wizard, settings.setupDone, workspace, update])

  const onWizardWorkspace = useCallback((status: WorkspaceStatus | null) => setWorkspace(status), [])

  const runProblem = (r: RunStartResult): string | null => (r.ok ? null : t(`run.refused.${r.reason}`))
  const running = jobs.some((j) => j.phase === 'running')
  const ready = Boolean(workspace?.ok) && engine?.state === 'ready'

  const addJob = async (input: string): Promise<string | null> => {
    const rows = (await reloadTracker()).rows
    const r = await window.shortlist.startRun({ command: 'apply', input })
    if (!r.ok) return runProblem(r)
    const id = crypto.randomUUID()
    before.current.set(r.runId, { jobId: id, rows })
    setJobs((all) => [newJob(id, input, r.runId), ...all])
    setAdding(false)
    setView({ job: id })
    return null
  }

  const reply = async (job: Job, text: string): Promise<string | null> => {
    if (!job.sessionId) return t('run.refused.badInput')
    const rows = (await reloadTracker()).rows
    const r = await window.shortlist.continueRun({ sessionId: job.sessionId, reply: text })
    if (!r.ok) return runProblem(r)
    before.current.set(r.runId, { jobId: job.id, rows })
    setJobs((all) => all.map((j) => (j.id === job.id ? continued(j, r.runId) : j)))
    return null
  }

  /** Wizard step 5: the framework's own /setup, as a job the wizard follows. */
  const startSetup = async (): Promise<string | null> => {
    const r = await window.shortlist.startRun({ command: 'setup', input: '' })
    if (!r.ok) return runProblem(r)
    const id = crypto.randomUUID()
    const job = newJob(id, '/setup', r.runId, Date.now(), 'setup')
    job.title = t('wizard.profile.jobTitle')
    setJobs((all) => [job, ...all])
    setSetupJobId(id)
    return null
  }

  const recordStatus = async (target: StatusTarget, choice: OutcomeChoice, date: string, note: string): Promise<string | null> => {
    // A job card with no linked tracker row: find its row by company name, so the update changes
    // that row instead of /outcome adding a second one named after the job title.
    if (target.jobId) {
      const title = target.company.toLowerCase()
      const hits = (await reloadTracker()).rows.filter(
        (r) => r.company.trim().length > 1 && title.includes(r.company.trim().toLowerCase()) && columnFor(r.status) !== 'closed'
      )
      if (hits.length === 1) {
        const row = hits[0]!
        const linkId = target.jobId
        setJobs((all) => all.map((j) => (j.id === linkId ? { ...j, trackerKey: row.matchKey } : j)))
        target = { ...target, company: row.company, role: row.role, matchKey: row.matchKey }
      }
    }
    // The quick way first: the framework's own tool records it (no AI, a moment's work).
    const direct = await window.shortlist.recordOutcome({ company: target.company, role: target.role, status: choice, date, note })
    if (direct.ok) {
      await reloadTracker()
      setUpdating(null)
      return null
    }
    // Otherwise (tool or Python missing, no matching row, several rows) /outcome sorts it out.
    const rows = (await reloadTracker()).rows
    const input = outcomeRequest(target.company, target.role, choice, date, note)
    const r = await window.shortlist.startRun({ command: 'outcome', input })
    if (!r.ok) return runProblem(r)
    const id = crypto.randomUUID()
    before.current.set(r.runId, { jobId: id, rows, linkJobId: target.jobId })
    const job = newJob(id, input, r.runId, Date.now(), 'outcome')
    job.title = t('outcome.jobTitle', { company: target.company, status: t(`outcome.choice.${choice}`) })
    job.target = target.matchKey
    setJobs((all) => [job, ...all])
    setUpdating(null)
    return null
  }

  const findJobs = async (input = slotsArg(settings.slots)): Promise<void> => {
    setView('search')
    setFreed({})
    const r = await window.shortlist.startRun({ command: 'scrape', input })
    if (!r.ok) return
    const id = crypto.randomUUID()
    scrapeRuns.current.set(r.runId, id)
    const job = { ...newJob(id, '/scrape', r.runId, Date.now(), 'search'), stage: 'scrape' as const }
    job.title = t('search.jobTitle')
    setJobs((all) => [job, ...all])
  }

  /** The X on a posting with missing details: /scrape drop <key>, run through the engine. */
  const closePosting = async (item: IncompleteJob): Promise<void> => {
    const r = await window.shortlist.startRun({ command: 'scrape', input: `drop ${item.key}` })
    if (!r.ok) return
    closeRuns.current.set(r.runId, { keys: [item.key], sources: new Map([[item.key, item.sourceLabel]]) })
    setClosing((c) => [...c, item.key])
    const job = { ...newJob(crypto.randomUUID(), `/scrape drop ${item.key}`, r.runId, Date.now(), 'search'), stage: 'close' as const }
    job.title = t('search.missing.jobTitle')
    setJobs((all) => [job, ...all])
  }

  /** After closing: search again with the freed slots, either given to other sources or kept on the same ones. */
  const refill = (mode: 'share' | 'keep'): void => {
    const slots = topUpSlots(freed, settings.slots, mode)
    if (slots) void findJobs(slotsArg(slots))
  }

  const rankRest = async (): Promise<void> => {
    const r = await window.shortlist.startRun({ command: 'rank', input: '' })
    if (!r.ok) return
    const id = crypto.randomUUID()
    const job = { ...newJob(id, '/rank', r.runId, Date.now(), 'search'), stage: 'rank' as const }
    job.title = t('search.jobTitle')
    setJobs((all) => [job, ...all])
  }

  /** "Check my fit" on a ranked job: /apply with its link (and key, for stored Indeed text). */
  const checkRanked = async (r: RankedJob): Promise<void> => {
    const input = r.url
      ? `${r.url} (ranked by /rank; job key: ${r.key})`
      : `${r.title} at ${r.company} (ranked by /rank; job key: ${r.key})`
    const rows = (await reloadTracker()).rows
    const res = await window.shortlist.startRun({ command: 'apply', input })
    if (!res.ok) return
    const id = crypto.randomUUID()
    before.current.set(res.runId, { jobId: id, rows })
    const job = { ...newJob(id, input, res.runId), rankedKey: r.key }
    job.title = r.company ? `${r.title} - ${r.company}` : r.title
    setJobs((all) => [job, ...all])
    setView({ job: id })
  }

  const pick = (key: string, value: Pick | null): void => {
    setPicks((all) => {
      const next = { ...all }
      if (value) next[key] = value
      else delete next[key]
      return next
    })
    void window.shortlist.setPick(key, value)
  }

  const openJob = (id: string): void => {
    const job = jobs.find((j) => j.id === id)
    setView(job?.kind === 'search' ? 'search' : { job: id })
  }

  const notNow = (job: Job): void =>
    setJobs((all) => all.map((j) => (j.id === job.id ? { ...j, phase: 'notNow' } : j)))

  const remove = (job: Job): void => {
    void window.shortlist.deleteJob(job.id)
    saved.current.delete(job.id)
    setJobs((all) => all.filter((j) => j.id !== job.id))
    setView('home')
  }

  let screen: ReactElement
  const route: Route = typeof view === 'string' ? view : 'home'
  if (typeof view !== 'string' && 'job' in view) {
    const job = jobs.find((j) => j.id === view.job)
    const row = job?.trackerKey ? (tracker?.rows ?? []).filter((r) => r.matchKey === job.trackerKey).at(-1) : undefined
    screen = job ? (
      <JobDetail
        job={job}
        row={row ?? null}
        busy={running}
        fitView={settings.fitView}
        onFitView={(fitView) => update({ fitView })}
        onReply={reply}
        onNotNow={notNow}
        onRemove={remove}
        onBack={() => setView('home')}
      />
    ) : (
      <Placeholder titleKey="nav.home" />
    )
  } else if (typeof view !== 'string') {
    const row = tracker?.rows.find((r) => r.id === view.row)
    screen = row ? <RowDetail row={row} onBack={() => setView('home')} /> : <Placeholder titleKey="nav.home" />
  } else if (view === 'home') {
    screen = (
      <Home
        workspace={workspace}
        engineReady={engine?.state === 'ready'}
        canAdd={ready && !running}
        jobs={jobs}
        tracker={tracker}
        onAddJob={() => setAdding(true)}
        onOpenJob={(id) => setView({ job: id })}
        onOpenRow={(id) => setView({ row: id })}
        ranked={search?.ranked ?? []}
        picks={picks}
        onFindJobs={() => void findJobs()}
        onCheckRanked={(r) => void checkRanked(r)}
        canUpdate={ready && !running}
        onUpdateStatus={setUpdating}
        onNavigate={setView}
      />
    )
  } else if (view === 'search') {
    screen = (
      <Search
        canRun={ready && !running}
        search={search}
        slots={settings.slots}
        closing={closing}
        freed={freed}
        onClose={(i) => void closePosting(i)}
        onRefill={refill}
        onDismissFreed={() => setFreed({})}
        picks={picks}
        job={jobs.filter((j) => j.kind === 'search').sort((a, b) => b.createdAt - a.createdAt)[0] ?? null}
        started={new Set(jobs.map((j) => j.rankedKey).filter((k): k is string => Boolean(k)))}
        onFind={() => void findJobs()}
        onRankRest={() => void rankRest()}
        onCheck={(r) => void checkRanked(r)}
        onPick={pick}
        onClear={(keys) => keys.forEach((k) => pick(k, 'cleared'))}
      />
    )
  } else if (view === 'settings') {
    screen = (
      <Settings
        settings={settings}
        onChange={update}
        workspace={workspace}
        onWorkspace={setWorkspace}
        engine={engine}
        onRecheckEngine={recheckEngine}
        health={health}
        checkingHealth={checkingHealth}
        onRecheckHealth={recheckComputer}
        onRunSetup={() => setWizard(true)}
      />
    )
  } else {
    screen = <Placeholder titleKey={`nav.${view}`} />
  }

  const finishWizard = (then?: 'find' | 'add' | 'settings'): void => {
    update({ setupDone: true })
    setWizard(false)
    if (then === 'find') void findJobs()
    else if (then === 'add') {
      setView('home')
      setAdding(true)
    } else setView(then === 'settings' ? 'settings' : 'home')
  }

  if (wizard) {
    return (
      <div className="app app--wizard">
        <Wizard
          engine={engine}
          onRecheckEngine={recheckEngine}
          health={health}
          checkingHealth={checkingHealth}
          onRecheckHealth={recheckComputer}
          workspace={workspace}
          onWorkspace={onWizardWorkspace}
          setupJob={jobs.find((j) => j.id === setupJobId) ?? null}
          busy={running}
          onStartSetup={startSetup}
          onReply={reply}
          onFinish={finishWizard}
        />
        <Launch ready={workspaceLoaded} />
      </div>
    )
  }

  return (
    <div className="app">
      <Sidebar
        route={route}
        onNavigate={setView}
        guide={settings.guide}
        onGuideChange={(guide) => update({ guide })}
        activeJob={jobs.find((j) => j.phase === 'running') ?? null}
        onOpenJob={openJob}
        settingsAttention={
          needsAttention(health) ||
          (workspace !== null && !workspace.ok) ||
          (engine !== null && engine.state !== 'ready' && engine.state !== 'checking')
        }
      />
      <main className="app-main">
        <div key={typeof view === 'string' ? view : 'job' in view ? `job:${view.job}` : `row:${view.row}`} className="screen-fade">
          {screen}
        </div>
      </main>
      <Launch ready={workspaceLoaded} />
      <AddJobDialog open={adding} onClose={() => setAdding(false)} onSubmit={addJob} />
      <StatusDialog target={updating} onClose={() => setUpdating(null)} onSubmit={recordStatus} />
    </div>
  )
}
