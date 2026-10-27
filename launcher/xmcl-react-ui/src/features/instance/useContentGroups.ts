import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { InstanceGroupStateKey, InstanceModsGroupServiceKey, InstanceModsGroupState, type ModGroupData } from '@xmcl/runtime-api/src/services/InstanceModsGroupService'
import { migrateLegacyModGroups } from '@xmcl/runtime-api/src/util/migrateLegacyModGroups'
import { useService, useSharedStateStore } from '../../runtime'
import type { ContentGroups } from './contentGroups'

export function useContentGroups(path: string) {
  const service = useService(InstanceModsGroupServiceKey)
  const store = useSharedStateStore({ key: InstanceGroupStateKey(path), Type: InstanceModsGroupState, load: client => client.service(InstanceModsGroupServiceKey).getGroupState(path) })
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [migrating, setMigrating] = useState(true), [migrationError, setMigrationError] = useState(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  async function migrate() {
    setMigrating(true); setMigrationError(false)
    try { await migrateLegacyModGroups(localStorage, path, (target, mapping) => service.migrateLegacyModsGroups(target, mapping)) }
    catch { if (active.current) setMigrationError(true) }
    finally { if (active.current) setMigrating(false) }
  }
  useEffect(() => { void migrate() }, [path, service])
  return { ...snapshot, store, migrating, migrationError, migrate, refresh: store.revalidate,
    save: (groups: Record<string, ModGroupData>, previous: ContentGroups) => service.updateModsGroups(path, groups, 'mods', structuredClone(previous) as Record<string, ModGroupData>),
  }
}
