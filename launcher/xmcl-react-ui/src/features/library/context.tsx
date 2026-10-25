import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { InstanceServiceKey, InstanceState } from '@xmcl/runtime-api/src/services/InstanceService'
import { useSharedStateStore, type StateDescriptor } from '../../runtime'
import { StoredSelection } from '../accounts/selection'
import { javaInstances, selectedInstance } from './model'

const descriptor: StateDescriptor<InstanceState> = {
  key: 'instances', Type: InstanceState,
  load: client => client.service(InstanceServiceKey).getSharedInstancesState(),
}
const selection = new StoredSelection('selectedInstancePath', () => window.localStorage, window)
const Context = createContext<ReturnType<typeof useLibraryState> | null>(null)

function useLibraryState() {
  const store = useSharedStateStore(descriptor)
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const path = useSyncExternalStore(selection.subscribe, selection.getSnapshot, selection.getSnapshot)
  const instances = useMemo(() => javaInstances(snapshot.data?.instances ?? []), [snapshot.data])
  const current = selectedInstance(instances, path)
  useEffect(() => {
    if (snapshot.status === 'ready' && !path && current) selection.set(current.path)
  }, [snapshot.status, path, current?.path])
  const select = (nextPath: string) => {
    const latest = store.getSnapshot()
    if (latest.status !== 'ready' || !latest.data?.instances.some(instance => instance.path === nextPath && instance.edition !== 'bedrock')) return false
    selection.set(nextPath)
    return true
  }
  return { ...snapshot, instances, current, path, select, retry: store.revalidate, storageError: selection.failed() }
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  return <Context.Provider value={useLibraryState()}>{children}</Context.Provider>
}
export const useLibrary = () => useContext(Context)
