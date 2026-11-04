import type { StateData, StateStore } from '@launcher/renderer-client'
import type { ResourceState } from '@xmcl/runtime-api/src/entities/resource'

type Entry = { path: string; fileName: string; size: number; mtime: number; directory?: boolean }

// A filesystem review can finish before the resource parser publishes its batched state.
export function waitCatalogInventory(store: Pick<StateStore<ResourceState>, 'subscribe' | 'getSnapshot'>, entries: readonly Entry[], domain: 'mods' | 'resourcepacks' | 'shaderpacks', signal: AbortSignal): Promise<StateData<ResourceState>['files']> {
  const eligible = entries.filter(entry => !entry.directory && (domain === 'mods' ? /\.(jar|litemod|zip)(\.disabled)?$/i : /\.zip(\.disabled)?$/i).test(entry.fileName))
  return new Promise((resolve, reject) => {
    let stop = () => {}, settled = false
    const finish = (error?: unknown, files?: StateData<ResourceState>['files']) => {
      if (settled) return
      settled = true; stop(); signal.removeEventListener('abort', abort)
      if (error) reject(error); else resolve(files!)
    }
    const abort = () => finish(signal.reason || new DOMException('Aborted', 'AbortError'))
    const check = () => {
      if (signal.aborted) { abort(); return }
      const snapshot = store.getSnapshot()
      if (snapshot.status === 'error') { finish(snapshot.error || new Error('Inventory unavailable')); return }
      if (!snapshot.data) return
      if (snapshot.data.errors.some(error => eligible.some(entry => entry.path === error.path))) { finish(new Error('Resource metadata unavailable')); return }
      const current = snapshot.data.files.filter(file => eligible.some(entry => entry.path === file.path))
      if (eligible.every(entry => current.some(file => file.path === entry.path && file.size === entry.size && file.mtime === entry.mtime && /^[a-f0-9]{40}$/i.test(file.hash)))) finish(undefined, current)
    }
    stop = store.subscribe(check)
    signal.addEventListener('abort', abort, { once: true }); check()
    if (settled) stop()
  })
}
