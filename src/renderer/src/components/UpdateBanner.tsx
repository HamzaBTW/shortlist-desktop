import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { UpdateInfo } from '../../../shared/updates'

interface UpdateBannerProps {
  update: UpdateInfo
  onDismiss: (version: string) => void
}

/** A quiet notice above Home: a newer version is out. Nothing downloads by itself. */
export function UpdateBanner({ update, onDismiss }: UpdateBannerProps) {
  const { t } = useTranslation()
  const [current, setCurrent] = useState('')
  useEffect(() => {
    void window.shortlist.appInfo().then((i) => setCurrent(i.version))
  }, [])

  return (
    <div className="update-banner fade-in" role="status">
      <span className="update-banner__dot" aria-hidden="true">
        ●
      </span>
      <p className="update-banner__text">
        <b>{t('updates.banner', { version: update.version })}</b> {current && t('updates.youHave', { version: current })} {t('updates.how')}
      </p>
      <button type="button" className="sl-btn sl-btn--sm" onClick={() => void window.shortlist.openLink(update.url)}>
        {t('updates.whatsNew')}
      </button>
      <button type="button" className="update-banner__close" aria-label={t('updates.hide')} title={t('updates.hide')} onClick={() => onDismiss(update.version)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}
