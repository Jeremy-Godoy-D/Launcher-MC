import type { GenericEventEmitter, ServiceChannels, ServiceKey, SharedState, TaskMonitor } from '@xmcl/runtime-api'
import { StateStore, type StateType } from './state'
import { TaskStore } from './tasks'

export { StateStore } from './state'
export type { StateData, StateSnapshot, StateType } from './state'
export { TaskStore } from './tasks'
export type { TaskSnapshot } from './tasks'
type Events<T> = T extends GenericEventEmitter<infer E> ? E : never

export class RendererClient {
  private services = new Map<string, object>()
  private states = new Map<string, StateStore<any>>()
  private leases = new Map<string, { raw: SharedState<any>; count: number }>()
  private owners = new Map<string, StateStore<any>>()
  private pendingReads = 0
  private disposed = false
  private cleanups = new Set<() => void>()
  private taskStore?: TaskStore

  constructor(private channels: ServiceChannels, private taskMonitor?: TaskMonitor) {}

  tasks() {
    if (this.disposed) throw new Error('Renderer client disposed')
    if (!this.taskMonitor) throw new Error('Task monitor unavailable')
    return this.taskStore ??= new TaskStore(this.taskMonitor)
  }

  service<T extends object>(key: ServiceKey<T>): T {
    if (this.disposed) throw new Error('Renderer client disposed')
    const id = String(key)
    let service = this.services.get(id)
    if (!service) {
      const channel = this.channels.open(key)
      const methods = new Map<PropertyKey, Function>()
      service = new Proxy(Object.create(null), {
        get: (_, method) => {
          if (typeof method !== 'string' || ['then', 'constructor', 'prototype', '__proto__'].includes(method)) return undefined
          if (!methods.has(method)) {
            const call = ['on', 'once', 'removeListener'].includes(method)
              ? (...args: any[]) => {
                if (this.disposed && method !== 'removeListener') throw new Error('Renderer client disposed')
                ;(channel[method as 'on'] as Function).apply(channel, args)
                return service
              }
              : (...args: any[]) => this.disposed
                ? Promise.reject(new Error('Renderer client disposed'))
                : channel.call(method as keyof T, ...args as any)
            methods.set(method, call)
          }
          return methods.get(method)
        },
      })
      this.services.set(id, service!)
    }
    return service as T
  }

  listen<T extends object, E extends keyof Events<T>>(key: ServiceKey<T>, event: E, listener: (event: Events<T>[E]) => void) {
    const service = this.service(key) as unknown as GenericEventEmitter<Events<T>>
    service.on(event, listener)
    let subscribed = true
    const cleanup = () => {
      if (!subscribed) return
      subscribed = false
      service.removeListener(event, listener)
      this.cleanups.delete(cleanup)
    }
    this.cleanups.add(cleanup)
    return cleanup
  }

  state<T extends object>(key: string, Type: StateType<T>, fetch: () => Promise<SharedState<T>>): StateStore<T> {
    if (this.disposed) throw new Error('Renderer client disposed')
    let store = this.states.get(key)
    if (store && store.Type !== Type) throw new Error(`State key reused with a different type: ${key}`)
    if (!store) {
      const created: StateStore<T> = new StateStore(Type, () => this.acquire(created, fetch))
      store = created
      this.states.set(key, store)
    }
    return store
  }

  private async acquire<T extends object>(store: StateStore<T>, fetch: () => Promise<SharedState<T>>): Promise<SharedState<T> | StateStore<T>> {
    if (this.disposed) throw new Error('Renderer client disposed')
    this.pendingReads++
    try {
      const raw = await fetch()
      if (typeof raw.id !== 'string' || !raw.id) throw new Error('Invalid shared state identity')
      const identity = `${raw.id}\0${raw.__stateEpoch__ ?? ''}`
      const owner = this.owners.get(identity)
      if (owner && owner !== store) {
        if (owner.Type !== store.Type) throw new Error(`Shared state type mismatch: ${raw.id}`)
        return owner
      }
      this.owners.set(identity, store)
      let lease = this.leases.get(identity)
      if (!lease) { lease = { raw, count: 0 }; this.leases.set(identity, lease) }
      lease.count++
      let released = false
      return Object.assign({}, raw, {
        unref: () => {
          if (released) return
          released = true
          if (this.owners.get(identity) === store) this.owners.delete(identity)
          lease.count--
          return this.releaseUnused()
        },
      })
    } finally {
      this.pendingReads--
      // Deferred releases may finish after the window closes; native client destruction also frees them.
      void this.releaseUnused().catch(() => undefined)
    }
  }

  private releaseUnused(): Promise<void> {
    // Main tracks a window once per state ID; do not unref while another read may acquire that ID.
    if (this.pendingReads > 0) return Promise.resolve()
    const releases: Promise<void>[] = []
    for (const [id, lease] of this.leases) {
      if (lease.count === 0) {
        this.leases.delete(id)
        try { releases.push(Promise.resolve(lease.raw.unref())) }
        catch (error) { releases.push(Promise.reject(error)) }
      }
    }
    return Promise.all(releases).then(() => undefined)
  }

  dispose() {
    this.disposed = true
    this.taskStore?.dispose()
    for (const cleanup of this.cleanups) cleanup()
    for (const store of this.states.values()) store.dispose()
    this.states.clear()
    this.services.clear()
  }
}
