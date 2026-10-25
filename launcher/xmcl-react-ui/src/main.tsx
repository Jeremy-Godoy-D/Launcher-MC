import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router'
import { RendererClient } from '@launcher/renderer-client'
import { ThemeServiceKey } from '@xmcl/runtime-api/src/services/ThemeService'
import { App } from './App'
import { RuntimeProvider } from './runtime'
import { PreferencesProvider } from './preferences-context'
import { PreferencesStore } from './preferences'
import { I18nProvider } from './i18n'
import { AccountsProvider } from './features/accounts/context'
import { Onboarding } from './features/onboarding/Onboarding'
import { LibraryProvider } from './features/library/context'
import { LaunchStore } from './features/launch/store'
import { LaunchProvider } from './features/launch/context'
import './styles.css'

const router = createHashRouter([{ path: '*', element: <App /> }])
const client = window.serviceChannels ? new RendererClient(window.serviceChannels, window.taskMonitor) : null
const launches = client ? new LaunchStore(client) : null
const preferences = new PreferencesStore(() => window.localStorage, window, async () =>
  (await client?.service(ThemeServiceKey).getCurrentTheme())?.settings?.dark,
)
window.addEventListener('pagehide', () => { launches?.dispose(); client?.dispose() }, { once: true })
function Entry() {
  const [onboarding, setOnboarding] = useState(() => new URLSearchParams(location.search).has('bootstrap'))
  if (onboarding && client) return <Onboarding onFinished={choice => {
    const url = new URL(location.href)
    url.searchParams.delete('bootstrap')
    history.replaceState(history.state, '', url)
    void router.navigate(choice === 'library' ? '/me' : `/me?add=${choice}`)
    setOnboarding(false)
  }} />
  return client && launches ? <LibraryProvider><LaunchProvider store={launches}><RouterProvider router={router} /></LaunchProvider></LibraryProvider> : <RouterProvider router={router} />
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RuntimeProvider client={client}>
      <PreferencesProvider store={preferences}>
        <I18nProvider client={client}>
          {client ? <AccountsProvider><Entry /></AccountsProvider> : <Entry />}
        </I18nProvider>
      </PreferencesProvider>
    </RuntimeProvider>
  </StrictMode>,
)
