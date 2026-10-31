import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkspaceProblem, WorkspaceStatus } from '../../../shared/ipc'

interface WorkspacePanelProps {
  workspace: WorkspaceStatus | null
  onChosen: (status: WorkspaceStatus) => void
}

type Row = { state: 'done' | 'waiting' | 'failed'; text: string }

const GLYPH = { done: '✓', waiting: '○', failed: '✕' } as const

function rowsFor(status: WorkspaceStatus, t: (key: string) => string): Row[] {
  if (!status.ok) {
    return status.problems.map((p: WorkspaceProblem) => ({ state: 'failed', text: t(`workspace.problem.${p}`) }))
  }
  return [
    { state: 'done', text: t('workspace.ok.commands') },
    status.profileFilled
      ? { state: 'done', text: t('workspace.ok.profile') }
      : { state: 'waiting', text: t('workspace.ok.noProfile') },
    status.hasTracker
      ? { state: 'done', text: t('workspace.ok.tracker') }
      : { state: 'waiting', text: t('workspace.ok.noTracker') }
  ]
}

export function WorkspacePanel({ workspace, onChosen }: WorkspacePanelProps) {
  const { t } = useTranslation()
  // A folder that failed the check is shown but never saved.
  const [rejected, setRejected] = useState<WorkspaceStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const shown = rejected ?? workspace

  const choose = async (): Promise<void> => {
    setBusy(true)
    try {
      const status = await window.shortlist.chooseWorkspace()
      if (!status) return
      if (status.ok) {
        setRejected(null)
        onChosen(status)
      } else {
        setRejected(status)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="sl-tile panel" aria-labelledby="workspace-title">
      <h2 id="workspace-title" className="sl-t-title">
        {t('workspace.title')}
      </h2>
      <p className="sl-t-sm">{t('workspace.intro')}</p>

      {shown && (
        <>
          <p className="path" title={shown.path}>
            {shown.path}
          </p>
          {rejected && (
            <p role="alert" className="notice">
              {t('workspace.rejected')}
            </p>
          )}
          <ul className="checks">
            {rowsFor(shown, t).map((row) => (
              <li key={row.text} className={`sl-check${row.state === 'failed' ? ' sl-check--failed' : ''}`}>
                <span className={`sl-glyph${row.state === 'waiting' ? '' : ` sl-glyph--${row.state}`}`} aria-hidden="true">
                  {GLYPH[row.state]}
                </span>
                <span>{row.text}</span>
                <span />
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="screen__actions">
        {workspace?.ok && !rejected ? (
          <>
            <button type="button" className="sl-btn" onClick={() => void window.shortlist.openWorkspace()}>
              {t('workspace.open')}
            </button>
            <button type="button" className="sl-btn sl-btn--quiet" onClick={() => void choose()} disabled={busy}>
              {t('workspace.chooseAnother')}
            </button>
          </>
        ) : (
          <button type="button" className="sl-btn sl-btn--primary" onClick={() => void choose()} disabled={busy}>
            {shown ? t('workspace.chooseAnother') : t('workspace.choose')}
          </button>
        )}
      </div>
    </section>
  )
}
