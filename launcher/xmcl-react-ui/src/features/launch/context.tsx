import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import type { LaunchStore } from './store'

const Context = createContext<LaunchStore | null>(null)
const empty = () => undefined
const subscribeEmpty = () => () => {}
export function LaunchProvider({ store, children }: { store: LaunchStore; children: ReactNode }) {
  return <Context.Provider value={store}>{children}</Context.Provider>
}
export function useLaunch() {
  const store = useContext(Context)
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? subscribeEmpty,
    store?.getSnapshot ?? empty,
    store?.getSnapshot ?? empty,
  )
  return store && snapshot ? { ...snapshot, store } : null
}
