import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkspaceStatus } from '../../../shared/ipc'
import { buildReportHtml } from '../../../shared/report-export'
import { computeStats, MIN_FINISHED, percent, type MonthStat, type OutcomeStages, type ReportStats, type SkillReport } from '../../../shared/reports'
import type { TrackerData } from '../../../shared/tracker'
import type { Route } from '../components/Sidebar'
import type { Job } from '../jobs'

// The Reports screen (design: "Publish plan · v0.1", Reports). Numbers come from the tracker
// with /html-report's rules (src/shared/reports.ts). Plain SVG, one colour, no chart library.
// Under 5 finished applications: counts only. "Export my report" builds Shortlist's own page
// from these numbers (no AI) and saves it as PDF or HTML where the person chooses.

interface ReportsProps {
  workspace: WorkspaceStatus | null
  tracker: TrackerData | null
  ready: boolean
  busy: boolean
  /** Re-read outcome files and the skills report when this changes (a run finished). */
  refreshKey: number
  /** The latest "Refresh skill gaps" run, if any. */
  skillsJob: Job | null
  onRefreshSkills: () => Promise<string | null>
  onOpenJob: (id: string) => void
  onFindJobs: () => void
  onNavigate: (route: Route) => void
}

function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y!, m! - 1, 1).toLocaleDateString(locale, { month: 'short' })
}

function MonthsChart({ months, locale }: { months: MonthStat[]; locale: string }) {
  const { t } = useTranslation()
  const shown = months.slice(-12)
  const max = Math.max(1, ...shown.map((m) => m.count))
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const W = 400
  const H = 190
  const base = 150
  const slot = (W - 40) / Math.max(shown.length, 1)
  const bw = Math.min(50, slot * 0.6)
  const label = shown.map((m) => `${monthLabel(m.month, locale)} ${m.count}`).join(', ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={t('reports.monthsAria', { list: label })} className="chart">
      <line x1="20" y1={base + 0.5} x2={W - 20} y2={base + 0.5} className="chart__axis" />
      {shown.map((m, i) => {
        const h = Math.round((m.count / max) * 120)
        const x = 20 + slot * i + (slot - bw) / 2
        const y = base - h
        const r = Math.min(4, h)
        const cx = x + bw / 2
        const current = m.month === thisMonth
        return (
          <g key={m.month}>
            <path
              className="chart__bar"
              d={`M${x} ${base} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + bw - r} Q${x + bw} ${y} ${x + bw} ${y + r} V${base} Z`}
            >
              <title>{`${monthLabel(m.month, locale)} ${m.month.slice(0, 4)}${current ? ` (${t('reports.soFar')})` : ''}: ${m.count}`}</title>
            </path>
            <text x={cx} y={y - 8} textAnchor="middle" className="chart__value">
              {m.count}
            </text>
            <text x={cx} y={base + 20} textAnchor="middle" className="chart__label">
              {monthLabel(m.month, locale)}
            </text>
            {current && (
              <text x={cx} y={base + 36} textAnchor="middle" className="chart__label">
                {t('reports.soFar')}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0
  return (
    <div className="hbar" title={`${label}: ${value}`}>
      <span>{label}</span>
      <div className="hbar__track">
        <div className="hbar__fill" style={{ width: `${width}%` }} />
      </div>
      <span className="hbar__n">{value}</span>
    </div>
  )
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="sl-tile report-tile">
      <span className="sl-t-label">{label}</span>
      <div className="sl-num-md report-tile__num">{value}</div>
      <p className="sl-t-sm report-tile__note">{note}</p>
    </div>
  )
}

function Skills({ skills, job, canRun, onRefresh, onOpenJob }: { skills: SkillReport | null; job: Job | null; canRun: boolean; onRefresh: () => void; onOpenJob: (id: string) => void }) {
  const { t } = useTranslation()
  const running = job?.phase === 'running'
  return (
    <section className="report-panel" aria-labelledby="skills-title">
      <div className="sl-tile__head">
        <h2 id="skills-title" className="sl-t-title report-panel__title">
          {t('reports.skills.title')}
        </h2>
        <button type="button" className="sl-btn sl-btn--sm" disabled={!canRun} onClick={onRefresh}>
          {t('reports.skills.refresh')}
        </button>
      </div>
      {running && (
        <p className="sl-t-sm" aria-live="polite">
          {job.asks.length + job.questions.length > 0 ? t('reports.skills.needsYou') : t('reports.skills.running')}{' '}
          <button type="button" className="sl-link" onClick={() => onOpenJob(job.id)}>
            {t('reports.openJob')}
          </button>
        </p>
      )}
      {job && job.phase === 'failed' && (
        <p className="sl-t-sm">
          {t('reports.skills.failed')}{' '}
          <button type="button" className="sl-link" onClick={() => onOpenJob(job.id)}>
            {t('reports.openJob')}
          </button>
        </p>
      )}
      {skills && skills.gaps.length > 0 ? (
        <>
          <p className="sl-t-sm">{t('reports.skills.from', { date: skills.date })}</p>
          <ul className="plain skill-list">
            {skills.gaps.slice(0, 6).map((g, i) => (
              <li key={i} className="skill-row">
                <span className="skill-row__name">{g.skill}</span>
                <span className="sl-badge sl-badge--muted">{g.priority}</span>
                {g.type && <span className="sl-t-sm">{g.type}</span>}
              </li>
            ))}
          </ul>
          <button type="button" className="sl-link report-panel__link" onClick={() => void window.shortlist.openFile(skills.file)}>
            {t('reports.skills.open')}
          </button>
        </>
      ) : (
        !running && <p className="sl-t-sm">{skills ? t('reports.skills.emptyReport') : t('reports.skills.none')}</p>
      )}
    </section>
  )
}

export function Reports({ workspace, tracker, ready, busy, refreshKey, skillsJob, onRefreshSkills, onOpenJob, onFindJobs, onNavigate }: ReportsProps) {
  const { t, i18n } = useTranslation()
  const ok = workspace?.ok === true
  const [extras, setExtras] = useState<{ outcomes: Record<string, OutcomeStages>; skills: SkillReport | null } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    if (!ok) {
      setExtras(null)
      return
    }
    void window.shortlist.readReportExtras().then(setExtras)
  }, [ok, refreshKey])

  const canRun = ready && !busy
  const refreshSkills = async (): Promise<void> => setProblem(await onRefreshSkills())

  /** Builds Shortlist's own report page (fonts and logo inline) and lets the person save it. */
  const exportReport = async (stats: ReportStats, data: TrackerData, skills: SkillReport | null): Promise<void> => {
    setSaving(true)
    setSaved(null)
    setSaveFailed(false)
    try {
      const [sans, mono, mark] = await Promise.all([
        import('../assets/fonts/manrope-latin-wght-normal.woff2?inline'),
        import('../assets/fonts/jetbrains-mono-latin-wght-normal.woff2?inline'),
        import('../assets/shortlist-mark.svg?raw')
      ])
      const html = buildReportHtml({
        stats,
        rows: data.rows,
        skills,
        t: (key, options) => t(key, options) as string,
        locale: i18n.language,
        generated: new Date().toISOString().slice(0, 10),
        fontSans: sans.default,
        fontMono: mono.default,
        markSvg: mark.default
      })
      const r = await window.shortlist.exportReport(html)
      if (r.ok) setSaved(r.path)
      else if (r.reason !== 'cancelled') setSaveFailed(true)
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  if (!ok) {
    return (
      <div className="screen">
        <header className="screen__head">
          <h1 className="t-display-lg">{t('reports.title')}</h1>
        </header>
        <p className="sl-t-sm">
          {t('reports.noFolder')}{' '}
          <button type="button" className="sl-link" onClick={() => onNavigate('settings')}>
            {t('home.openSettings')}
          </button>
        </p>
      </div>
    )
  }

  if (!tracker || !extras) {
    return (
      <div className="screen">
        <header className="screen__head">
          <h1 className="t-display-lg">{t('reports.title')}</h1>
        </header>
        <div className="skeleton skeleton--card" />
      </div>
    )
  }

  const s: ReportStats = computeStats(tracker.rows, extras.outcomes)
  const pct = (a: number, b: number): string => `${percent(a, b) ?? 0}%`

  const header = (
    <header className="screen__head">
      <div className="sl-col">
        <h1 className="t-display-lg">{t('reports.title')}</h1>
        {s.sent > 0 && (
          <p className="sl-t-sm report-source">
            {s.firstDate ? t('reports.source', { count: s.sent, date: new Date(s.firstDate).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' }) }) : t('reports.sourceNoDate', { count: s.sent })}{' '}
            {t('reports.draftsLeftOut')}
          </p>
        )}
      </div>
      <div className="sl-col report-export">
        <button type="button" className="sl-btn sl-btn--primary" disabled={saving || s.sent === 0} onClick={() => void exportReport(s, tracker, extras.skills)}>
          {t('reports.export')}
        </button>
        <span className="sl-t-sm report-export__note" aria-live="polite">
          {saving ? t('reports.saving') : saveFailed ? t('reports.saveFailed') : saved ? t('reports.saved', { path: saved }) : t('reports.exportNote')}
        </span>
        {saved && !saving && (
          <button type="button" className="sl-link" onClick={() => void window.shortlist.openSavedReport()}>
            {t('reports.openSaved')}
          </button>
        )}
      </div>
    </header>
  )

  const notices = (
    <>
      {problem && (
        <p role="alert" className="notice">
          {problem}
        </p>
      )}
      {tracker.error && <p className="notice">{t(`reports.trackerError.${tracker.error}`)}</p>}
    </>
  )

  if (s.sent === 0) {
    return (
      <div className="screen">
        {header}
        {notices}
        <section className="sl-tile panel report-empty rise" aria-labelledby="report-empty-title">
          <span className="sl-t-label">{t('reports.empty.label')}</span>
          <h2 id="report-empty-title" className="profile-empty__title">
            {t('reports.empty.title')}
          </h2>
          <p className="sl-t-sm">{t('reports.empty.lead')}</p>
          <div className="report-wells">
            {(['sent', 'heard', 'interviews', 'offers'] as const).map((k) => (
              <div key={k} className="report-well">
                <span className="sl-t-label">{t(`reports.well.${k}`)}</span>
                <div className="sl-num-md report-well__num">0</div>
              </div>
            ))}
          </div>
          {s.drafted > 0 && <p className="sl-t-sm">{t('reports.draftedOnly', { count: s.drafted })}</p>}
          <div className="screen__actions">
            <button type="button" className="sl-btn sl-btn--primary" disabled={!canRun} onClick={onFindJobs}>
              {t('home.findJobs')}
            </button>
          </div>
        </section>
      </div>
    )
  }

  const skills = <Skills skills={extras.skills} job={skillsJob} canRun={canRun} onRefresh={() => void refreshSkills()} onOpenJob={onOpenJob} />

  if (!s.showRates) {
    return (
      <div className="screen">
        {header}
        {notices}
        <div className="report-note">
          <span aria-hidden="true">●</span>
          <p>{t('reports.early', { min: MIN_FINISHED, count: s.finished })}</p>
        </div>
        <div className="report-grid">
          <section className="report-panel" aria-labelledby="where-title">
            <h2 id="where-title" className="sl-t-title report-panel__title">
              {t('reports.where')}
            </h2>
            <dl className="count-list">
              {(
                [
                  ['sent', s.sent],
                  ['waiting', s.open],
                  ['interviewing', s.interviewed],
                  ['finished', s.finished]
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="count-row">
                  <dt>{t(`reports.count.${k}`)}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="report-panel" aria-labelledby="channel-title">
            <h2 id="channel-title" className="sl-t-title report-panel__title">
              {t('reports.byChannel')}
            </h2>
            <dl className="count-list">
              {s.channels.map((c) => (
                <div key={c.channel} className="count-row">
                  <dt>{c.channel === '—' ? t('reports.noChannel') : c.channel}</dt>
                  <dd>{c.sent}</dd>
                </div>
              ))}
            </dl>
          </section>
          {skills}
        </div>
      </div>
    )
  }

  const funnelMax = s.sent
  return (
    <div className="screen">
      {header}
      {notices}
      <section aria-label={t('reports.summary')} className="report-tiles">
        <Tile label={t('reports.tile.sent')} value={String(s.sent)} note={t('reports.tile.sentNote', { count: s.sent })} />
        <Tile label={t('reports.tile.response')} value={pct(s.heardBack, s.sent)} note={t('reports.tile.responseNote', { heard: s.heardBack, sent: s.sent })} />
        <Tile label={t('reports.tile.interviews')} value={String(s.interviewed)} note={t('reports.tile.interviewsNote', { count: s.offers })} />
        <Tile
          label={t('reports.tile.finished')}
          value={String(s.finished)}
          note={t('reports.tile.finishedNote', { rejections: s.rejections, rate: pct(s.rejections, s.finished) })}
        />
      </section>

      <div className="report-grid">
        <section className="report-panel" aria-labelledby="funnel-title">
          <h2 id="funnel-title" className="sl-t-title report-panel__title">
            {t('reports.funnel')}
          </h2>
          <div className="hbars">
            <Bar label={t('reports.stage.applied')} value={s.sent} max={funnelMax} />
            <Bar label={t('reports.stage.heard')} value={s.heardBack} max={funnelMax} />
            <Bar label={t('reports.stage.interviewed')} value={s.interviewed} max={funnelMax} />
            <Bar label={t('reports.stage.offer')} value={s.offers} max={funnelMax} />
          </div>
        </section>

        <section className="report-panel" aria-labelledby="months-title">
          <h2 id="months-title" className="sl-t-title report-panel__title">
            {t('reports.perMonth')}
          </h2>
          {s.months.length > 0 ? <MonthsChart months={s.months} locale={i18n.language} /> : <p className="sl-t-sm">{t('reports.noMonths')}</p>}
          {s.undated > 0 && <p className="sl-t-sm">{t('reports.undated', { count: s.undated })}</p>}
        </section>

        <section className="report-panel" aria-labelledby="channels-title">
          <h2 id="channels-title" className="sl-t-title report-panel__title">
            {t('reports.byChannel')}
          </h2>
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">{t('reports.col.channel')}</th>
                <th scope="col" className="num">
                  {t('reports.col.sent')}
                </th>
                <th scope="col" className="num">
                  {t('reports.col.heard')}
                </th>
                <th scope="col" className="num">
                  {t('reports.col.rate')}
                </th>
              </tr>
            </thead>
            <tbody>
              {s.channels.map((c) => (
                <tr key={c.channel}>
                  <td>{c.channel === '—' ? t('reports.noChannel') : c.channel}</td>
                  <td className="num">{c.sent}</td>
                  <td className="num">{c.heardBack}</td>
                  <td className="num">{pct(c.heardBack, c.sent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="sl-t-sm">{t('reports.smallNumbers')}</p>
        </section>

        {skills}
      </div>
    </div>
  )
}
