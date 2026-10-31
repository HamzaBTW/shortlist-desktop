import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EngineStatus } from '../../shared/engine'
import { DEFAULT_SETTINGS, type RunStartResult, type Settings as SettingsData, type WorkspaceStatus } from '../../shared/ipc'
import { AddJobDialog } from './components/AddJobDialog'
import { Sidebar, type Route } from './components/Sidebar'
import { applyEvent, continued, newJob, type Job } from './jobs'
import { Home } from './screens/Home'
import { JobDetail } from './screens/JobDetail'
import { Placeholder } from './screens/Placeholder'
import { Settings } from './screens/Settings'
import { useTheme } from './useTheme'

export type View = Route | { job: string }

export function App() {
  const { t } = useTranslation()
  const [view, setView] = useState<View>('home')
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS)
  const [workspace, setWorkspace] = useState<WorkspaceStatus | null>(null)
  const [engine, setEngine] = useState<EngineStatus | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [adding, setAdding] = useState(false)
  const jobCount = useRef(0)

  const recheckEngine = useCallback(() => {
    setEngine((e) => (e ? { ...e, state: 'checking' } : e))
    void window.shortlist.detectEngine().then(setEngine)
  }, [])

  useEffect(() => {
    void window.shortlist.getSettings().then(setSettings)
    void window.shortlist.getWorkspace().then(setWorkspace)
    recheckEngine()
    // Coming back from the sign-in terminal: check again.
    window.addEventListener('focus', recheckEngine)
    const off = window.shortlist.onRunEvent((event) => setJobs((all) => all.map((j) => applyEvent(j, event))))
    return () => {
      window.removeEventListener('focus', recheckEngine)
      off()
    }
  }, [recheckEngine])

  useTheme(settings.theme)

  const update = useCallback((patch: Partial<SettingsData>) => {
    setSettings((current) => ({ ...current, ...patch }))
    void window.shortlist.setSettings(patch).then(setSettings)
  }, [])

  const runProblem = (r: RunStartResult): string | null => (r.ok ? null : t(`run.refused.${r.reason}`))
  const running = jobs.some((j) => j.phase === 'running')
  const ready = Boolean(workspace?.ok) && engine?.state === 'ready'

  const addJob = async (input: string): Promise<string | null> => {
    const r = await window.shortlist.startRun({ command: 'apply', input })
    if (!r.ok) return runProblem(r)
    const id = `job-${++jobCount.current}`
    setJobs((all) => [newJob(id, input, r.runId), ...all])
    setAdding(false)
    setView({ job: id })
    return null
  }

  const reply = async (job: Job, text: string): Promise<string | null> => {
    if (!job.sessionId) return t('run.refused.badInput')
    const r = await window.shortlist.continueRun({ sessionId: job.sessionId, reply: text })
    if (!r.ok) return runProblem(r)
    setJobs((all) => all.map((j) => (j.id === job.id ? continued(j, r.runId) : j)))
    return null
  }

  const notNow = (job: Job): void =>
    setJobs((all) => all.map((j) => (j.id === job.id ? { ...j, phase: 'notNow' } : j)))

  let screen: ReactElement
  const route: Route = typeof view === 'string' ? view : 'home'
  if (typeof view !== 'string') {
    const job = jobs.find((j) => j.id === view.job)
    screen = job ? (
      <JobDetail job={job} busy={running} onReply={reply} onNotNow={notNow} onBack={() => setView('home')} />
    ) : (
      <Placeholder titleKey="nav.home" />
    )
  } else if (view === 'home') {
    screen = (
      <Home
        workspace={workspace}
        engineReady={engine?.state === 'ready'}
        canAdd={ready && !running}
        jobs={jobs}
        onAddJob={() => setAdding(true)}
        onOpenJob={(id) => setView({ job: id })}
        onNavigate={setView}
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
      />
    )
  } else {
    screen = <Placeholder titleKey={`nav.${view}`} />
  }

  return (
    <div className="app">
      <Sidebar
        route={route}
        onNavigate={setView}
        guide={settings.guide}
        onGuideChange={(guide) => update({ guide })}
        activeJob={jobs.find((j) => j.phase === 'running') ?? null}
        onOpenJob={(id) => setView({ job: id })}
      />
      <main className="app-main">{screen}</main>
      <AddJobDialog open={adding} onClose={() => setAdding(false)} onSubmit={addJob} />
    </div>
  )
}
