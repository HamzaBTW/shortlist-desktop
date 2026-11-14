import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DocFile } from '../../../shared/documents'

interface DocumentsProps {
  /** PDFs this job's runs wrote (relative paths), when known. */
  paths?: string[]
  company: string
  role: string
  /** File names the tracker row records (CV, cover letter), in any spelling. */
  hints?: string[]
  /** Anything that should make the list be read again, e.g. a run finishing. */
  refresh?: string
}

/** The drafted CV and cover letter for a job, with Open and Show in folder. Read only. */
export function Documents({ paths = [], company, role, hints = [], refresh = '' }: DocumentsProps) {
  const { t } = useTranslation()
  const [docs, setDocs] = useState<{ files: DocFile[]; byName: boolean }>({ files: [], byName: false })
  const pathKey = paths.join('|')
  const hintKey = hints.join('|')

  useEffect(() => {
    let live = true
    void window.shortlist
      .documentsFor({ paths: pathKey ? pathKey.split('|') : [], company, role, hints: hintKey ? hintKey.split('|') : [] })
      .then((r) => {
        if (live) setDocs(r)
      })
    return () => {
      live = false
    }
  }, [pathKey, hintKey, company, role, refresh])

  if (docs.files.length === 0) return null

  return (
    <section className="sl-tile panel" aria-labelledby="docs-title">
      <h2 id="docs-title" className="sl-t-title">
        {t('docs.title')}
      </h2>
      {docs.byName && <p className="sl-t-sm">{t('docs.byName')}</p>}
      {docs.files.some((f) => f.draft) && <p className="sl-t-sm">{t('docs.draftHelp')}</p>}
      <ul className="plain doc-list">
        {docs.files.map((f) => (
          <li key={f.path} className="doc-row">
            <span className="sl-col">
              <span className="doc-row__name">{f.name}</span>
              <span className="sl-t-sm">
                {t(`docs.kind.${f.kind}`)}
                {f.draft ? ` · ${t('docs.draft')}` : ''} · {new Date(f.modified).toLocaleDateString()}
              </span>
            </span>
            <span className="screen__actions">
              <button type="button" className="sl-btn sl-btn--sm sl-btn--primary" onClick={() => void window.shortlist.openDocument(f.path, false)}>
                {t('docs.open')}
              </button>
              <button type="button" className="sl-btn sl-btn--sm" onClick={() => void window.shortlist.openDocument(f.path, true)}>
                {t('docs.reveal')}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
