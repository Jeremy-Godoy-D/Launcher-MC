import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import type { RendererClient } from '@launcher/renderer-client'
import { BaseServiceKey } from '@xmcl/runtime-api/src/services/BaseService'
import { Settings } from '@xmcl/runtime-api/src/entities/setting'
import english from '../../../xmcl-keystone-ui/locales/en.yaml'
import additionsEn from './en.yaml'
import additionsEs from './es-ES.yaml'
import { useSharedState, type StateDescriptor } from '../runtime'
import { LocaleStore, type Messages } from './store'

const files = import.meta.glob<{ default: Messages }>(['../../../xmcl-keystone-ui/locales/*.yaml', '!../../../xmcl-keystone-ui/locales/en.yaml'])
const loaders = Object.fromEntries(Object.entries(files).map(([file, load]) => {
  const locale = file.split('/').pop()!.replace('.yaml', '')
  return [locale, async () => ({ ...(await load()).default, ...(locale === 'es-ES' ? additionsEs : {}) })]
}))
export const localeStore = new LocaleStore({ ...english, ...additionsEn }, loaders)
let initialLocale = navigator.language
try { initialLocale = localStorage.getItem('locale') ?? initialLocale } catch { /* Storage denial does not prevent translations. */ }
void localeStore.setLocale(initialLocale)
const Context = createContext(localeStore)
const settingsDescriptor: StateDescriptor<Settings> = { key: 'settings', Type: Settings, load: client => client.service(BaseServiceKey).getSettings() }

function RuntimeLocaleSync() {
  const settings = useSharedState(settingsDescriptor)
  useEffect(() => { if (settings.data?.locale) void localeStore.setLocale(settings.data.locale) }, [settings.data?.locale])
  return null
}

export function I18nProvider({ client, children }: { client: RendererClient | null; children: ReactNode }) {
  const snapshot = useSyncExternalStore(localeStore.subscribe, localeStore.getSnapshot, localeStore.getSnapshot)
  useEffect(() => {
    document.documentElement.lang = snapshot.locale
    document.documentElement.dir = snapshot.locale === 'ar' || snapshot.locale === 'ar-EG' ? 'rtl' : 'ltr'
    if (snapshot.loading || snapshot.error) return
    try { localStorage.setItem('locale', snapshot.locale) } catch { /* Locale is also persisted by the runtime settings. */ }
  }, [snapshot])
  return <Context.Provider value={localeStore}>{client && <RuntimeLocaleSync />}{children}</Context.Provider>
}

export function useI18n() {
  const store = useContext(Context)
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return { ...snapshot, t: store.t, n: store.n, d: store.d, list: store.list }
}
