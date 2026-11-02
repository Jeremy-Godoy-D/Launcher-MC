import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { RendererClient } from '@launcher/renderer-client'
import { ThemeServiceKey } from '@xmcl/runtime-api/src/services/ThemeService'
import { App } from './App'
import { RuntimeProvider } from './runtime'
import { PreferencesProvider } from './preferences-context'
import { PreferencesStore } from './preferences'
import { I18nProvider, useI18n } from './i18n'
import { migrateSelectedInstance } from './features/settings/migrationSelection'
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
  const { t } = useI18n()
  const [ready, setReady] = useState(!client), [migrationError, setMigrationError] = useState(false)
  useEffect(() => {
    if (!client) return
    let active = true
    void Promise.resolve().then(() => {
      if (!window.windowController?.getMigrationContext) throw new Error('Native migration context unavailable')
      return window.windowController.getMigrationContext()
    }).then(context => {
      if (active) migrateSelectedInstance(localStorage, context)
    }).catch(() => { if (active) setMigrationError(true) }).finally(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [])
  const [onboarding, setOnboarding] = useState(() => new URLSearchParams(location.search).has('bootstrap'))
  if (!ready) return <p role="status">{t('react.migration.loading')}</p>
  if (migrationError) return <main className="auxiliary" role="alert"><p>{t('react.migration.selectionError')}</p><button className="button secondary" onClick={() => setMigrationError(false)}>{t('react.migration.continue')}</button></main>
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
