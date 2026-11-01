import { StrictMode, useEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { Maximize2, Minus, X } from 'lucide-react'
import { RendererClient } from '@launcher/renderer-client'
import type { LoggerContext } from '@xmcl/runtime-api/src/controller'
import { InstanceServiceKey, InstanceState } from '@xmcl/runtime-api/src/services/InstanceService'
import { RuntimeProvider, useSharedStateStore, type StateDescriptor } from './runtime'
import { PreferencesProvider, usePreferences } from './preferences-context'
import { PreferencesStore } from './preferences'
import { I18nProvider, useI18n } from './i18n'
import { LaunchProvider } from './features/launch/context'
import { LaunchStore } from './features/launch/store'
import { InstanceConsole } from './features/instance/InstanceConsole'
import { loaderName } from './features/library/model'
import brandIcon from '../../branding/copper/app-64.png'
import './styles.css'
import './features/instance/instance.css'
import './windows/logger.css'

const migration = location.pathname.endsWith('/migration.html')
const client = !migration && window.serviceChannels ? new RendererClient(window.serviceChannels, window.taskMonitor) : null
const launches = client ? new LaunchStore(client) : null
const preferences = new PreferencesStore(() => window.localStorage, window)
window.addEventListener('pagehide', () => { launches?.dispose(); client?.dispose() }, { once: true })
const descriptor: StateDescriptor<InstanceState> = {
  key: 'instances', Type: InstanceState, load: client => client.service(InstanceServiceKey).getSharedInstancesState(),
}

function LoggerInstance({ context }: { context: LoggerContext }) {
  const store = useSharedStateStore(descriptor)
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const { t } = useI18n()
  const instance = snapshot.data?.instances.find(instance => instance.path === context.instancePath && instance.edition === 'java')
  if (snapshot.status === 'error') return <div role="alert"><p>{t('react.logger.loadError')}</p><button className="button secondary" onClick={() => void store.revalidate()}>{t('react.logger.retry')}</button></div>
  if (!snapshot.data) return <p role="status">{t('react.logger.loading')}</p>
  if (!instance) return <p role="status">{t('react.logger.missing')}</p>
  return <>
    <div className="logger-identity"><h1 data-testid="logger-instance-name">{instance.name}</h1><p>Minecraft {instance.runtime.minecraft || instance.version} · {loaderName(instance)}</p><p>{t('react.logger.liveSinceOpen')}</p></div>
    <InstanceConsole key={context.instancePath} instance={instance} initialSource={context.source} detached />
  </>
}

function Logger() {
  const { t } = useI18n(), { preferences } = usePreferences()
  const [context, setContext] = useState<LoggerContext>()
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = preferences.appearance === 'system' ? media.matches ? 'dark' : 'light' : preferences.appearance
      document.documentElement.dataset.performance = String(preferences.performanceMode)
    }
    apply(); media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [preferences.appearance, preferences.performanceMode])
  useEffect(() => {
    let active = true
    setState('loading')
    const load = async () => {
      if (!window.windowController?.getLoggerContext) throw new Error('Native logger unavailable')
      return window.windowController.getLoggerContext()
    }
    void load().then(value => { if (active) { setContext(value); setState('ready') } }, () => { if (active) setState('error') })
    return () => { active = false }
  }, [attempt])
  return <div className="logger-window" data-testid="react-logger-window" data-performance={preferences.performanceMode}>
    <header className="titlebar">
      <div className="titlebar-left"><img className="titlebar-logo" src={brandIcon} alt="" /><span>Grimo Launcher · {t('react.instanceConsole.title')}</span></div>
      <div className="window-controls">
        <button aria-label={t('react.logger.minimize')} onClick={() => window.windowController?.minimize()}><Minus size={15} aria-hidden="true" /></button>
        <button aria-label={t('react.logger.maximize')} onClick={() => window.windowController?.maximize()}><Maximize2 size={13} aria-hidden="true" /></button>
        <button aria-label={t('react.logger.close')} onClick={() => window.windowController?.close()}><X size={17} aria-hidden="true" /></button>
      </div>
    </header>
    <main className="logger-content">
      {state === 'loading' ? <p role="status">{t('react.logger.loading')}</p>
        : state === 'error' ? <div role="alert"><h1>{t('react.instanceConsole.title')}</h1><p>{t('react.logger.loadError')}</p><button className="button secondary" onClick={() => setAttempt(value => value + 1)}>{t('react.logger.retry')}</button></div>
          : context && client && launches ? <LaunchProvider store={launches}><LoggerInstance context={context} /></LaunchProvider>
            : <><h1>{t('react.instanceConsole.title')}</h1><p role="status">{t('react.logger.noContext')}</p></>}
    </main>
  </div>
}

createRoot(document.getElementById('root')!).render(migration
  ? <main className="auxiliary" data-testid="react-migration-window"><img src={brandIcon} width="48" height="48" alt="" /><h1>Migración de datos</h1><p>Vista previa de Grimo Launcher</p><p>Este entorno de prueba no mueve ni modifica tus datos.</p></main>
  : <StrictMode><RuntimeProvider client={client}><PreferencesProvider store={preferences}><I18nProvider client={client}><Logger /></I18nProvider></PreferencesProvider></RuntimeProvider></StrictMode>,
)
