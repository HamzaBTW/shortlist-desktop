import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type Settings as SettingsData } from '../../shared/ipc'
import { Sidebar, type Route } from './components/Sidebar'
import { Home } from './screens/Home'
import { Placeholder } from './screens/Placeholder'
import { Settings } from './screens/Settings'
import { useTheme } from './useTheme'

export function App() {
  const [route, setRoute] = useState<Route>('home')
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS)

  useEffect(() => {
    void window.shortlist.getSettings().then(setSettings)
  }, [])

  useTheme(settings.theme)

  const update = useCallback((patch: Partial<SettingsData>) => {
    setSettings((current) => ({ ...current, ...patch }))
    void window.shortlist.setSettings(patch).then(setSettings)
  }, [])

  let screen: ReactElement
  switch (route) {
    case 'home':
      screen = <Home />
      break
    case 'settings':
      screen = <Settings settings={settings} onChange={update} />
      break
    default:
      screen = <Placeholder titleKey={`nav.${route}`} />
  }

  return (
    <div className="app">
      <Sidebar
        route={route}
        onNavigate={setRoute}
        guide={settings.guide}
        onGuideChange={(guide) => update({ guide })}
      />
      <main className="app-main">{screen}</main>
    </div>
  )
}
