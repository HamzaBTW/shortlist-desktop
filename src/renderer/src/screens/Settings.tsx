import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppInfo, Settings as SettingsData, ThemeChoice } from '../../../shared/ipc'

const THEMES: { id: ThemeChoice; key: string }[] = [
  { id: 'midnight', key: 'settings.themeMidnight' },
  { id: 'light-relax', key: 'settings.themeLight' },
  { id: 'system', key: 'settings.themeSystem' }
]

interface SettingsProps {
  settings: SettingsData
  onChange: (patch: Partial<SettingsData>) => void
}

export function Settings({ settings, onChange }: SettingsProps) {
  const { t } = useTranslation()
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void window.shortlist.appInfo().then(setInfo)
  }, [])

  return (
    <div className="screen">
      <header className="screen__head">
        <h1 className="t-display-lg">{t('settings.title')}</h1>
      </header>

      <section className="sl-tile panel">
        <h2 className="sl-t-title">{t('settings.appearance')}</h2>
        <fieldset className="choices">
          <legend className="sl-t-label">{t('settings.theme')}</legend>
          {THEMES.map((theme) => (
            <label key={theme.id} className="choice">
              <input
                type="radio"
                name="theme"
                value={theme.id}
                checked={settings.theme === theme.id}
                onChange={() => onChange({ theme: theme.id })}
              />
              {t(theme.key)}
            </label>
          ))}
        </fieldset>
      </section>

      <section className="sl-tile panel">
        <h2 className="sl-t-title">{t('settings.workspace')}</h2>
        <p className="sl-t-sm">{t('settings.comingNext')}</p>
      </section>

      <section className="sl-tile panel">
        <h2 className="sl-t-title">{t('settings.engine')}</h2>
        <p className="sl-t-sm">{t('settings.comingNext')}</p>
      </section>

      <section className="sl-tile panel">
        <h2 className="sl-t-title">{t('settings.about')}</h2>
        {info && <p className="sl-t-sm">{t('settings.version', { name: info.name, version: info.version })}</p>}
      </section>
    </div>
  )
}
