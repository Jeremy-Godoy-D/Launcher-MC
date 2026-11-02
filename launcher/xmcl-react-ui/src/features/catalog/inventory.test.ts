import { describe, expect, it, vi } from 'vitest'
import type { StateData, StateSnapshot } from '@launcher/renderer-client'
import { ResourceState } from '@xmcl/runtime-api/src/entities/resource'
import { waitCatalogInventory } from './inventory'

const entry = { path: '/owned/resourcepacks/a.zip', fileName: 'a.zip', mtime: 12, size: 42 }
const file = (values: Partial<StateData<ResourceState>['files'][number]> = {}) => ({ ...entry, hash: 'a'.repeat(40), ...values }) as StateData<ResourceState>['files'][number]
function store(files: StateData<ResourceState>['files'] = []) {
  let snapshot: StateSnapshot<ResourceState> = { status: 'ready', data: { files, errors: [] }, error: undefined, validating: false, revision: 0 }
  const listeners = new Set<() => void>(), unsubscribe = vi.fn()
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); unsubscribe() } },
    getSnapshot: () => snapshot,
    publish(next: Partial<StateSnapshot<ResourceState>>) { snapshot = { ...snapshot, ...next }; for (const listener of listeners) listener() },
    listeners, unsubscribe,
  }
}

describe('catalog inventory before resolving installed identities', () => {
  it('waits for parser publication and rejects an earlier mtime, size or missing hash', async () => {
    const state = store(), done = vi.fn(), abort = new AbortController()
    const result = waitCatalogInventory(state, [entry], 'resourcepacks', abort.signal).then(files => { done(); return files })
    for (const invalid of [{ mtime: 11 }, { size: 41 }, { hash: '' }]) {
      state.publish({ data: { files: [file(invalid)], errors: [] } }); await Promise.resolve(); expect(done).not.toHaveBeenCalled()
    }
    state.publish({ data: { files: [file()], errors: [] } })
    expect(await result).toEqual([file()]); expect(done).toHaveBeenCalledTimes(1)
    expect(state.listeners.size).toBe(0); expect(state.unsubscribe).toHaveBeenCalledTimes(1)
  })
  it('uses the current snapshot immediately, excluding unrelated files', async () => {
    const state = store([file(), file({ path: '/other/a.zip' })])
    expect(await waitCatalogInventory(state, [entry], 'resourcepacks', new AbortController().signal)).toEqual([file()])
    expect(state.listeners.size).toBe(0)
  })
  it('ignores folders and nonarchive configuration files without skipping disabled mods', async () => {
    const state = store(), abort = new AbortController(), disabled = { ...entry, fileName: 'a.jar.disabled' }
    const result = waitCatalogInventory(state, [disabled, { ...entry, fileName: 'options.txt' }, { ...entry, directory: true }], 'mods', abort.signal)
    expect(state.listeners.size).toBe(1)
    state.publish({ data: { files: [file({ fileName: disabled.fileName })], errors: [] } })
    expect(await result).toHaveLength(1)
  })
  it('releases the subscription on cancellation and an already aborted signal', async () => {
    const state = store(), abort = new AbortController()
    const result = waitCatalogInventory(state, [entry], 'shaderpacks', abort.signal)
    abort.abort(); await expect(result).rejects.toHaveProperty('name', 'AbortError')
    expect(state.listeners.size).toBe(0)
    await expect(waitCatalogInventory(state, [entry], 'shaderpacks', abort.signal)).rejects.toHaveProperty('name', 'AbortError')
    expect(state.listeners.size).toBe(0)
  })
  it('stops when parsing a reviewed file fails and when transport fails', async () => {
    const state = store(), signal = new AbortController().signal
    const result = waitCatalogInventory(state, [entry], 'resourcepacks', signal)
    state.publish({ data: { files: [], errors: [{ path: entry.path, code: 'InvalidZipFileError' }] } })
    await expect(result).rejects.toThrow('Resource metadata unavailable'); expect(state.listeners.size).toBe(0)
    state.publish({ status: 'error', error: new Error('Disconnected') })
    await expect(waitCatalogInventory(state, [entry], 'resourcepacks', signal)).rejects.toThrow('Disconnected')
    expect(state.listeners.size).toBe(0)
  })
})
