import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type Settings as SettingsData, type WorkspaceStatus } from '../../shared/ipc'
import { Sidebar, type Route } from './components/Sidebar'
import { Home } from './screens/Home'
import { Placeholder } from './screens/Placeholder'
import { Settings } from './screens/Settings'
import { useTheme } from './useTheme'

export function App() {
  const [route, setRoute] = useState<Route>('home')
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS)

  const [workspace, setWorkspace] = useState<WorkspaceStatus | null>(null)

  useEffect(() => {
    void window.shortlist.getSettings().then(setSettings)
    void window.shortlist.getWorkspace().then(setWorkspace)
  }, [])

  useTheme(settings.theme)

  const update = useCallback((patch: Partial<SettingsData>) => {
    setSettings((current) => ({ ...current, ...patch }))
    void window.shortlist.setSettings(patch).then(setSettings)
  }, [])

  let screen: ReactElement
  switch (route) {
    case 'home':
      screen = <Home workspace={workspace} onNavigate={setRoute} />
      break
    case 'settings':
      screen = (
        <Settings settings={settings} onChange={update} workspace={workspace} onWorkspace={setWorkspace} />
      )
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
