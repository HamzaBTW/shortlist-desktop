import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface ReplyBoxProps {
  /** Sends the reply; resolves to a problem to show, or null when it went through. */
  onSend: (text: string) => Promise<string | null>
  /** Another run is going, so a reply can't start a turn now. */
  busy: boolean
  /** Shows "Only true details…" (profile and application questions). */
  truthHint?: boolean
  placeholder?: string
}

/**
 * A typed answer to a paused run: questions that need the person's own words
 * (set choices still come as a form). Enter sends, Shift+Enter adds a line.
 */
export function ReplyBox({ onSend, busy, truthHint, placeholder }: ReplyBoxProps) {
  const { t } = useTranslation()
  const id = useId()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const send = async (): Promise<void> => {
    const reply = text.trim()
    if (!reply || busy || sending) return
    setSending(true)
    const p = await onSend(reply)
    setSending(false)
    setProblem(p)
    if (!p) setText('')
  }

  return (
    <form
      className="reply rise"
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      <label htmlFor={id} className="sl-t-label">
        {t('reply.label')}
      </label>
      <textarea
        id={id}
        className="field field--area"
        rows={3}
        value={text}
        placeholder={placeholder ?? t('reply.placeholder')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Never mid-IME composition.
          if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
          e.preventDefault()
          void send()
        }}
      />
      <div className="reply__foot">
        {truthHint && <span className="sl-t-sm">{t('reply.truth')}</span>}
        <button type="submit" className="sl-btn sl-btn--primary sl-btn--sm" disabled={!text.trim() || busy || sending}>
          {t('reply.send')}
        </button>
      </div>
      {busy && <p className="sl-t-sm">{t('reply.busy')}</p>}
      {problem && (
        <p role="alert" className="notice">
          {problem}
        </p>
      )}
    </form>
  )
}
