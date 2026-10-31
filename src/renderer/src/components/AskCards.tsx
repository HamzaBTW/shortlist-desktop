import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PermissionAsk, QuestionAsk } from '../../../shared/engine'

/** "It wants to …" with Allow once / Deny. Styled as the design's ReviewCard. */
export function PermissionCard({ ask }: { ask: PermissionAsk }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const reply = (allow: boolean): void => {
    setBusy(true)
    void window.shortlist.answerPermission(ask.requestId, allow)
  }

  return (
    <section className="sl-review ask" role="alertdialog" aria-labelledby={`ask-${ask.requestId}`}>
      <div className="sl-tile__head">
        <h3 id={`ask-${ask.requestId}`} className="sl-t-title">
          {t(`ask.title.${ask.kind}`)}
        </h3>
        <span className="sl-badge sl-badge--warning">▲ {t('ask.badge')}</span>
      </div>
      <p className="ask__detail">{ask.detail || ask.tool}</p>
      <p className="sl-t-sm">{t('ask.hint')}</p>
      <div className="screen__actions">
        <button type="button" className="sl-btn sl-btn--primary" disabled={busy} onClick={() => reply(true)}>
          {t('ask.allow')}
        </button>
        <button type="button" className="sl-btn" disabled={busy} onClick={() => reply(false)}>
          {t('ask.deny')}
        </button>
      </div>
    </section>
  )
}

/** A question the command asks mid-run, as a small form. */
export function QuestionCard({ ask }: { ask: QuestionAsk }) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [other, setOther] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const answerFor = (q: string): string => {
    const own = other[q]?.trim()
    return own ? own : (picked[q] ?? []).join(', ')
  }
  const complete = ask.questions.every((q) => answerFor(q.question))

  const submit = (): void => {
    const answers: Record<string, string> = {}
    for (const q of ask.questions) answers[q.question] = answerFor(q.question)
    setBusy(true)
    void window.shortlist.answerQuestion(ask.requestId, answers)
  }

  return (
    <section className="sl-review ask" aria-label={t('ask.questionTitle')}>
      <div className="sl-tile__head">
        <h3 className="sl-t-title">{t('ask.questionTitle')}</h3>
        <span className="sl-badge sl-badge--warning">▲ {t('ask.badge')}</span>
      </div>
      {ask.questions.map((q, qi) => (
        <fieldset key={qi} className="choices">
          <legend className="ask__question">{q.question}</legend>
          {q.options.map((o) => {
            const chosen = (picked[q.question] ?? []).includes(o.label)
            return (
              <label key={o.label} className="choice choice--card">
                <input
                  type={q.multiSelect ? 'checkbox' : 'radio'}
                  name={`q-${ask.requestId}-${qi}`}
                  checked={chosen}
                  onChange={() =>
                    setPicked((p) => {
                      const cur = p[q.question] ?? []
                      const next = q.multiSelect
                        ? chosen
                          ? cur.filter((l) => l !== o.label)
                          : [...cur, o.label]
                        : [o.label]
                      return { ...p, [q.question]: next }
                    })
                  }
                />
                <span>
                  <strong>{o.label}</strong>
                  {o.description && <span className="sl-t-sm choice__desc">{o.description}</span>}
                </span>
              </label>
            )
          })}
          <input
            type="text"
            className="field"
            placeholder={t('ask.other')}
            aria-label={t('ask.other')}
            value={other[q.question] ?? ''}
            onChange={(e) => setOther((o) => ({ ...o, [q.question]: e.target.value }))}
          />
        </fieldset>
      ))}
      <div className="screen__actions">
        <button type="button" className="sl-btn sl-btn--primary" disabled={!complete || busy} onClick={submit}>
          {t('ask.send')}
        </button>
      </div>
    </section>
  )
}
