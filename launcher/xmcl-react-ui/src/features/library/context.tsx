import { PresentationServiceKey } from '@xmcl/runtime-api/src/services/PresentationService'
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { InstanceServiceKey, InstanceState } from '@xmcl/runtime-api/src/services/InstanceService'
import { useService, useSharedStateStore, type StateDescriptor } from '../../runtime'
import { StoredSelection } from '../accounts/selection'
import { javaInstances, selectedInstance } from './model'
import { manualOrder, assignGroup, moveInGroups } from './operations'
import { createOperationId } from '@xmcl/runtime-api/src/util/launch'

const descriptor: StateDescriptor<InstanceState> = {
  key: 'instances', Type: InstanceState,
  load: client => client.service(InstanceServiceKey).getSharedInstancesState(),
}
const selection = new StoredSelection('selectedInstancePath', () => window.localStorage, window)
const sortSelection = new StoredSelection('launcher.react.library.sort', () => window.localStorage, window)
const Context = createContext<ReturnType<typeof useLibraryState> | null>(null)

function useLibraryState() {
  const store = useSharedStateStore(descriptor)
  const service = useService(InstanceServiceKey)
  const media = useService(PresentationServiceKey)
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const path = useSyncExternalStore(selection.subscribe, selection.getSnapshot, selection.getSnapshot)
  const instances = useMemo(() => javaInstances(snapshot.data?.instances ?? []), [snapshot.data])
  const current = selectedInstance(instances, path)
  const sortValue = useSyncExternalStore(sortSelection.subscribe, sortSelection.getSnapshot, sortSelection.getSnapshot)
  const sort = ['name', 'recent'].includes(sortValue) ? sortValue : 'manual'
  const ordered = manualOrder(instances, snapshot.data?.groups || [])
  if (sort === 'name') ordered.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  if (sort === 'recent') ordered.sort((a, b) => b.lastAccessDate - a.lastAccessDate)
  async function arrange(target: string, action: (groups: InstanceState['groups']) => InstanceState['groups']) {
    const latest = store.getSnapshot()
    if (latest.status !== 'ready' || !latest.data?.instances.some(instance => instance.path === target && instance.edition !== 'bedrock')) throw new Error('missing')
    const previous = structuredClone(latest.data.groups) as InstanceState['groups']
    await service.updateInstanceGroups(previous, action(previous))
  }
  useEffect(() => {
    if (snapshot.status === 'ready' && !path && current) selection.set(current.path)
  }, [snapshot.status, path, current?.path])
  const select = (nextPath: string) => {
    const latest = store.getSnapshot()
    if (latest.status !== 'ready' || !latest.data?.instances.some(instance => instance.path === nextPath && instance.edition !== 'bedrock')) return false
    selection.set(nextPath)
    return true
  }
  return { ...snapshot, media, instances, ordered, current, path, select, retry: store.revalidate, storageError: selection.failed() || sortSelection.failed(), sort,
    setSort: (value: string) => { if (['manual', 'name', 'recent'].includes(value)) sortSelection.set(value) },
    assignGroup: (path: string, group: string, name: string) => arrange(path, groups => assignGroup(groups, path, group, name, createOperationId())),
    move: (path: string, direction: -1 | 1) => arrange(path, groups => moveInGroups(groups, instances, path, direction)),
  }
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  return <Context.Provider value={useLibraryState()}>{children}</Context.Provider>
}
export const useLibrary = () => useContext(Context)
