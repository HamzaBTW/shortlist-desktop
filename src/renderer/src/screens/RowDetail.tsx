import { useTranslation } from 'react-i18next'
import type { TrackerRow } from '../../../shared/tracker'
import { Documents } from '../components/Documents'
import { FitRing } from '../components/FitRing'
import { PostingLink } from '../components/PostingLink'
import { firstWebLink } from '../../../shared/links'

/** One tracker row, read-only. Changes go through the job-search commands. */
export function RowDetail({ row, onBack }: { row: TrackerRow; onBack: () => void }) {
  const { t } = useTranslation()
  const facts: [string, string][] = [
    [t(row.status === 'drafted' ? 'row.drafted' : 'row.date'), row.date],
    [t('row.deadline'), row.deadline],
    [t('row.sector'), row.sector],
    [t('row.roleType'), row.roleType],
    [t('row.channel'), row.channel],
    [t('row.contact'), row.contactPerson],
    [t('row.cv'), row.cvFile],
    [t('row.letter'), row.coverLetterFile],
    [t('row.source'), row.source],
    [t('row.notes'), row.notes]
  ]

  const link = firstWebLink(row.source)

  return (
    <div className="screen">
      <button type="button" className="sl-link back" onClick={onBack}>
        ← {t('job.back')}
      </button>
      <header className="job-head">
        {row.fitRating !== null && <FitRing score={row.fitRating} />}
        <div className="sl-col">
          <h1 className="t-display-lg job-head__title">
            {link ? <PostingLink href={link}>{row.company || row.role}</PostingLink> : row.company || row.role}
          </h1>
          {row.company && <span className="sl-t-sm">{row.role}</span>}
          <span className="sl-badge sl-badge--muted">
            {t(`status.${row.status}`, { defaultValue: row.status || t('status.unknown') })}
          </span>
        </div>
      </header>

      <Documents company={row.company} role={row.role} hints={[row.cvFile, row.coverLetterFile]} />

      <section className="sl-tile panel">
        <dl className="facts">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="facts__row">
                <dt className="sl-t-label">{k}</dt>
                <dd>{firstWebLink(v) && v === row.source ? <PostingLink href={firstWebLink(v)!}>{v}</PostingLink> : v}</dd>
              </div>
            ))}
        </dl>
        <p className="sl-t-sm">{t('row.readOnly')}</p>
      </section>
    </div>
  )
}
