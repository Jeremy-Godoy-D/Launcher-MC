import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import type { LaunchStore } from './store'
import type { GameLogsSnapshot } from './gameLogs'

const Context = createContext<LaunchStore | null>(null)
const empty = () => undefined
const subscribeEmpty = () => () => {}
const emptyLogs: GameLogsSnapshot = Object.freeze({ entries: Object.freeze([]), limited: false })
const getEmptyLogs = () => emptyLogs
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
export function useGameLogs() {
  const store = useContext(Context)
  return useSyncExternalStore(store?.subscribeLogs ?? subscribeEmpty, store?.getLogsSnapshot ?? getEmptyLogs, store?.getLogsSnapshot ?? getEmptyLogs)
}
