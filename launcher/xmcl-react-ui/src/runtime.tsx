import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react'
import type { GenericEventEmitter, ServiceChannels, ServiceKey, SharedState, TaskMonitor } from '@xmcl/runtime-api'
import { RendererClient, type StateType } from '@launcher/renderer-client'

declare global { interface Window { serviceChannels?: ServiceChannels; taskMonitor?: TaskMonitor } }
const Context = createContext<RendererClient | null>(null)

export function RuntimeProvider({ client, children }: { client: RendererClient | null; children: ReactNode }) {
  return <Context.Provider value={client}>{children}</Context.Provider>
}

function useClient() {
  const client = useContext(Context)
  if (!client) throw new Error('Runtime unavailable in this window')
  return client
}

export function useService<T extends object>(key: ServiceKey<T>): T {
  const client = useClient()
  return client.service(key)
}

export type StateDescriptor<T extends object> = {
  key: string
  Type: StateType<T>
  load: (client: RendererClient) => Promise<SharedState<T>>
}

export function useSharedStateStore<T extends object>({ key, Type, load }: StateDescriptor<T>) {
  const client = useClient()
  // A descriptor key includes all resource parameters; changing the key selects another store.
  return useMemo(() => client.state(key, Type, () => load(client)), [client, key, Type])
}

export function useSharedState<T extends object>(descriptor: StateDescriptor<T>) {
  const store = useSharedStateStore(descriptor)
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

export function useTasks() {
  const store = useClient().tasks()
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return { ...snapshot, cancel: store.cancel, clear: store.clear, refresh: store.refresh }
}

type Events<T> = T extends GenericEventEmitter<infer E> ? E : never
export function useServiceEvent<T extends object, E extends keyof Events<T>>(key: ServiceKey<T>, event: E, handler: (event: Events<T>[E]) => void) {
  const client = useClient()
  const current = useRef(handler)
  useEffect(() => { current.current = handler }, [handler])
  useEffect(() => client.listen(key, event, value => current.current(value)), [client, key, event])
}
