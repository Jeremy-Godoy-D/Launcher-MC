import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { UserServiceKey, UserState } from '@xmcl/runtime-api/src/services/UserService'
import { AUTHORITY_DEV } from '@xmcl/runtime-api/src/util/authority'
import type { UserProfile } from '@xmcl/runtime-api/src/entities/user.schema'
import { useService, useSharedState, type StateDescriptor } from '../../runtime'
import { profileEntries, selectedAccount, validLocalName, type ProfileEntry } from './model'
import { StoredSelection } from './selection'

const descriptor: StateDescriptor<UserState> = {
  key: 'users',
  Type: UserState,
  load: (client) => client.service(UserServiceKey).getUserState(),
}
const selection = new StoredSelection('selectedUserId', () => window.localStorage, window)
const Context = createContext<ReturnType<typeof useAccountState> | null>(null)

function useAccountState() {
  const snapshot = useSharedState(descriptor)
  const service = useService(UserServiceKey)
  const selectedId = useSyncExternalStore(
    selection.subscribe,
    selection.getSnapshot,
    selection.getSnapshot,
  )
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(false)
  const operation = useRef(false)
  const users = Object.values(snapshot.data?.users ?? {})
  const selected = selectedAccount(users, selectedId)
  const profile = selected?.profiles[selected.selectedProfile]
  const entries = profileEntries(users)
  useEffect(() => {
    if (!selectedId && selected) selection.set(selected.id)
  }, [selectedId, selected?.id])

  async function run<T>(action: () => Promise<T>) {
    if (operation.current) throw new Error('Account operation already in progress')
    operation.current = true
    setBusy(true)
    setActionError(false)
    try {
      return await action()
    } catch (error) {
      setActionError(true)
      throw error
    } finally {
      operation.current = false
      setBusy(false)
    }
  }
  const add = (name: string) =>
    run(async () => {
      if (!validLocalName(name)) throw new Error('Invalid local profile name')
      if (
        entries.some(
          (entry) =>
            entry.user.authority === AUTHORITY_DEV &&
            entry.name.toLowerCase() === name.toLowerCase(),
        )
      )
        throw new Error('Local profile already exists')
      const result = await service.login({ username: name, authority: AUTHORITY_DEV })
      selection.set(result.id)
      return result
    })
  const select = (entry: ProfileEntry) =>
    run(async () => {
      // The service re-reads the current account; this snapshot is not a replacement for its stored data.
      await service.selectUserGameProfile(structuredClone(entry.user) as UserProfile, entry.id)
      selection.set(entry.user.id)
    })
  const remove = (entry: ProfileEntry) =>
    run(async () => {
      if (entry.user.authority !== AUTHORITY_DEV)
        throw new Error('Only local profiles can be removed here')
      await service.removeUserGameProfile(structuredClone(entry.user) as UserProfile, entry.id)
    })
  return {
    ...snapshot,
    users,
    selected,
    profile,
    selectedId,
    entries,
    busy,
    actionError,
    storageError: selection.failed(),
    add,
    select,
    remove,
  }
}

export function AccountsProvider({ children }: { children: ReactNode }) {
  return <Context.Provider value={useAccountState()}>{children}</Context.Provider>
}
export const useAccounts = () => useContext(Context)
