import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BoardColumn } from '../../../shared/tracker'
import { CLOSED_CHOICES, choicesFrom, type OutcomeChoice } from '../outcome'

export interface StatusTarget {
  company: string
  role: string
  column: BoardColumn
  /** The tracker row's company|role, when the card is a row. */
  matchKey?: string
  /** The saved job, when the card is a job with no tracker row linked yet. */
  jobId?: string
}

interface StatusDialogProps {
  target: StatusTarget | null
  onClose: () => void
  onSubmit: (target: StatusTarget, choice: OutcomeChoice, date: string, note: string) => Promise<string | null>
}

const today = (): string => {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "Update status": Applied, Interviewing, or Offer / Closed, recorded by /outcome. */
export function StatusDialog({ target, onClose, onSubmit }: StatusDialogProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  const [choice, setChoice] = useState<OutcomeChoice | null>(null)
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (target && !d.open) {
      setChoice(null)
      setDate(today())
      setNote('')
      setError(null)
      d.showModal()
    } else if (!target && d.open) d.close()
  }, [target])

  if (!target) return <dialog ref={ref} className="dialog" />

  const choices = choicesFrom(target.column)
  const open = choices.filter((c) => !CLOSED_CHOICES.includes(c))
  const closed = choices.filter((c) => CLOSED_CHOICES.includes(c))

  const submit = async (): Promise<void> => {
    if (!choice) return
    setBusy(true)
    const problem = await onSubmit(target, choice, date, note)
    setBusy(false)
    if (problem) setError(problem)
  }

  const option = (c: OutcomeChoice) => (
    <label key={c} className="choice">
      <input type="radio" name="outcome" value={c} checked={choice === c} onChange={() => setChoice(c)} />
      {t(`outcome.choice.${c}`)}
    </label>
  )

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="status-title" onClose={onClose}>
      <form
        method="dialog"
        className="dialog__body"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h2 id="status-title" className="sl-t-title">
          {t('outcome.title')}
        </h2>
        <p className="sl-t-sm">
          {target.company} · {target.role}
        </p>

        <fieldset className="choices">
          <legend className="sl-t-label">{t('outcome.whatHappened')}</legend>
          {open.map(option)}
          {closed.length > 0 && (
            <>
              <span className="sl-t-label outcome-group">{t('outcome.closedGroup')}</span>
              {closed.map(option)}
            </>
          )}
        </fieldset>

        <label className="sl-col">
          <span className="sl-t-label">{t('outcome.date')}</span>
          <input type="date" className="field outcome-date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="sl-col">
          <span className="sl-t-label">{t('outcome.note')}</span>
          <textarea
            className="field field--area"
            rows={2}
            value={note}
            placeholder={t('outcome.notePlaceholder')}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <p className="sl-t-sm">{t('outcome.how')}</p>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <div className="screen__actions dialog__actions">
          <button type="button" className="sl-btn" onClick={onClose}>
            {t('addJob.cancel')}
          </button>
          <button type="submit" className="sl-btn sl-btn--primary" disabled={!choice || busy}>
            {t('outcome.submit')}
          </button>
        </div>
      </form>
    </dialog>
  )
}
