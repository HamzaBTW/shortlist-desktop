import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface AddJobDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (input: string) => Promise<string | null>
}

/** "Add a job": paste a link or the posting text, then "Check my fit". */
export function AddJobDialog({ open, onClose, onSubmit }: AddJobDialogProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setError(null)
      d.showModal()
    } else if (!open && d.open) d.close()
  }, [open])

  const submit = async (): Promise<void> => {
    setBusy(true)
    const problem = await onSubmit(text)
    setBusy(false)
    if (problem) setError(problem)
    else setText('')
  }

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="add-job-title" onClose={onClose}>
      <form
        method="dialog"
        className="dialog__body"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h2 id="add-job-title" className="sl-t-title">
          {t('addJob.title')}
        </h2>
        <label htmlFor="add-job-input" className="sl-t-sm">
          {t('addJob.label')}
        </label>
        <textarea
          id="add-job-input"
          className="field field--area"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('addJob.placeholder')}
          autoFocus
        />
        <p className="sl-t-sm">{t('addJob.note')}</p>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <div className="screen__actions dialog__actions">
          <button type="button" className="sl-btn" onClick={onClose}>
            {t('addJob.cancel')}
          </button>
          <button type="submit" className="sl-btn sl-btn--primary" disabled={!text.trim() || busy}>
            {t('addJob.submit')}
          </button>
        </div>
      </form>
    </dialog>
  )
}
