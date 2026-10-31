import { useTranslation } from 'react-i18next'

export function Placeholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation()
  return (
    <div className="screen">
      <header className="screen__head">
        <h1 className="t-display-lg">{t(titleKey)}</h1>
      </header>
      <p className="sl-t-sm">{t('placeholder.body')}</p>
    </div>
  )
}
