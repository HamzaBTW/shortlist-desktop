import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppInfo, Settings as SettingsData, ThemeChoice, WorkspaceStatus } from '../../../shared/ipc'
import type { EngineStatus } from '../../../shared/engine'
import { EnginePanel } from '../components/EnginePanel'
import { WorkspacePanel } from '../components/WorkspacePanel'

const THEMES: { id: ThemeChoice; key: string }[] = [
  { id: 'midnight', key: 'settings.themeMidnight' },
  { id: 'light-relax', key: 'settings.themeLight' },
  { id: 'system', key: 'settings.themeSystem' }
]

interface SettingsProps {
  settings: SettingsData
  onChange: (patch: Partial<SettingsData>) => void
  workspace: WorkspaceStatus | null
  onWorkspace: (status: WorkspaceStatus) => void
  engine: EngineStatus | null
  onRecheckEngine: () => void
}

export function Settings({ settings, onChange, workspace, onWorkspace, engine, onRecheckEngine }: SettingsProps) {
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

      <WorkspacePanel workspace={workspace} onChosen={onWorkspace} />

      <EnginePanel status={engine} onRecheck={onRecheckEngine} />

      <section className="sl-tile panel" aria-labelledby="perm-title">
        <h2 id="perm-title" className="sl-t-title">
          {t('settings.permissions')}
        </h2>
        <div className="setting-row">
          <span className="sl-col">
            <span id="ask-every-label" className="setting-row__label">
              {t('settings.askEveryChange')}
            </span>
            <span className="sl-t-sm">{t(settings.askEveryChange ? 'settings.askEveryOn' : 'settings.askEveryOff')}</span>
          </span>
          <button
            type="button"
            role="switch"
            className="sl-switch"
            aria-checked={settings.askEveryChange}
            aria-labelledby="ask-every-label"
            onClick={() => onChange({ askEveryChange: !settings.askEveryChange })}
          />
        </div>
        <div className="setting-row">
          <span className="sl-col">
            <span id="ask-web-label" className="setting-row__label">
              {t('settings.askWeb')}
            </span>
            <span className="sl-t-sm">{t(settings.askWeb ? 'settings.askWebOn' : 'settings.askWebOff')}</span>
          </span>
          <button
            type="button"
            role="switch"
            className="sl-switch"
            aria-checked={settings.askWeb}
            aria-labelledby="ask-web-label"
            onClick={() => onChange({ askWeb: !settings.askWeb })}
          />
        </div>
        <p className="sl-t-sm">{t('settings.alwaysRefused')}</p>
      </section>

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
        <h2 className="sl-t-title">{t('settings.about')}</h2>
        {info && <p className="sl-t-sm">{t('settings.version', { name: info.name, version: info.version })}</p>}
      </section>
    </div>
  )
}
