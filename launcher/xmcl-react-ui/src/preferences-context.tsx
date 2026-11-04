import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import { PreferencesStore } from './preferences'

const Context = createContext<PreferencesStore | null>(null)

export function PreferencesProvider({ store, children }: { store: PreferencesStore; children: ReactNode }) {
  return <Context.Provider value={store}>{children}</Context.Provider>
}

export function usePreferences() {
  const store = useContext(Context)
  if (!store) throw new Error('Preferences provider unavailable')
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return { ...snapshot, set: store.set }
}
