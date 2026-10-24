import type { SharedState } from '@xmcl/runtime-api'

export interface StateEmitter {
  on(event: string, listener: (...args: any[]) => void): unknown
  removeListener(event: string, listener: (...args: any[]) => void): unknown
  emit(event: string, ...args: any[]): unknown
  listenerCount(event: string): number
  eventNames(): (string | symbol)[]
}
type Mutation = { type: string; payload: unknown; revision?: number }
type Entry = {
  state?: WeakRef<SharedState<any>>
  emitter: StateEmitter
  pending: Mutation[]
  revision?: number
  initialized: boolean
  generation: number
  draining: boolean
  validating?: number
}
type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>

/** The preload owns delivery/lifetime, while each framework applies its domain mutations. */
export class SharedStateRegistry {
  private entries = new Map<string, Entry>()
  private generation = 0
  private pendingCalls = 0
  private gc: FinalizationRegistry<{ id: string; identity: string; epoch?: string; generation: number }>

  constructor(private invoke: Invoke, private makeEmitter: () => StateEmitter) {
    this.gc = new FinalizationRegistry(({ id, identity, epoch, generation }) => {
      const entry = this.entries.get(identity)
      if (entry?.generation !== generation || entry.state?.deref()) return
      this.entries.delete(identity)
      // The renderer is gone; native client destruction also releases its watchers.
      void this.invoke('unref', id, epoch).catch(() => undefined)
    })
  }

  private entry(identity: string) {
    let entry = this.entries.get(identity)
    if (!entry) {
      entry = { emitter: this.makeEmitter(), pending: [], initialized: false, generation: ++this.generation, draining: false }
      this.entries.set(identity, entry)
    }
    return entry
  }

  private subscribed(entry: Entry) {
    return entry.emitter.eventNames().some(name => name !== 'state-validating' && entry.emitter.listenerCount(String(name)) > 0)
  }

  private drain(entry: Entry) {
    if (entry.draining || !entry.initialized || !this.subscribed(entry)) return
    entry.draining = true
    try {
      while (entry.pending.length > 0 && this.subscribed(entry)) {
        const mutation = entry.pending[0]
        if (mutation.revision !== undefined && entry.revision !== undefined) {
          if (mutation.revision <= entry.revision) { entry.pending.shift(); continue }
          if (mutation.revision !== entry.revision + 1) break
        }
        entry.pending.shift()
        if (mutation.revision !== undefined) entry.revision = mutation.revision
        entry.emitter.emit(mutation.type, mutation.payload)
        entry.emitter.emit('*', mutation.type, mutation.payload)
      }
    } finally { entry.draining = false }
  }

  mutation(id: string, type: string, payload: unknown, revision?: number, epoch?: string) {
    if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 0)) throw new TypeError('Invalid state revision')
    const identity = `${id}\0${epoch ?? ''}`
    if (!this.entries.has(identity) && this.pendingCalls === 0) return
    const entry = this.entry(identity)
    if (revision !== undefined && entry.revision !== undefined && revision <= entry.revision) return
    entry.pending.push({ type, payload, revision })
    entry.pending.sort((a, b) => (a.revision ?? 0) - (b.revision ?? 0))
    this.drain(entry)
  }

  validating(id: string, value: number, epoch?: string) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Invalid state validation counter')
    const identity = `${id}\0${epoch ?? ''}`
    if (!this.entries.has(identity) && this.pendingCalls === 0) return
    const entry = this.entry(identity)
    entry.validating = value
    entry.emitter.emit('state-validating', value)
  }

  async request(channel: string, ...args: unknown[]): Promise<any> {
    this.pendingCalls++
    try { return await this.receive(await this.invoke(channel, ...args)) }
    finally {
      this.pendingCalls--
      if (this.pendingCalls === 0) {
        for (const [id, entry] of this.entries) if (!entry.initialized) this.entries.delete(id)
      }
    }
  }

  async receive(response: any): Promise<any> {
    if (response === null || typeof response !== 'object') return response
    const { result, error } = response
    if (error) throw error
    if (!result || typeof result !== 'object' || !('__state__' in result)) return result
    const id = result.id
    if (typeof id !== 'string' || !id) throw new TypeError('Invalid shared state identity')
    const revision = result.__stateRevision__
    if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 0)) throw new TypeError('Invalid snapshot revision')
    delete result.__state__
    delete result.__stateRevision__
    const epoch = result.__stateEpoch__
    if (epoch !== undefined && (typeof epoch !== 'string' || !epoch || epoch.length > 128)) throw new TypeError('Invalid state epoch')
    if (Object.keys(result).some(key => ['__proto__', 'constructor', 'prototype', 'subscribe', 'unsubscribe', 'subscribeAll', 'unsubscribeAll', 'commit', 'revalidate', 'unref'].includes(key))) throw new TypeError('Invalid state property')
    const identity = `${id}\0${epoch ?? ''}`
    const entry = this.entry(identity)
    if (!entry.initialized || !this.subscribed(entry)) {
      entry.revision = revision
      entry.initialized = true
      if (revision !== undefined) entry.pending = entry.pending.filter(mutation => mutation.revision === undefined || mutation.revision > revision)
    }
    const existing = entry.state?.deref()
    if (existing) { Object.assign(existing, result); return existing }
    let released = false
    const value = Object.assign(result, {
      subscribe: (key: string, listener: (...args: any[]) => void) => {
        entry.emitter.on(key, listener)
        if (key === 'state-validating' && entry.validating !== undefined) listener(entry.validating)
        this.drain(entry)
        return value
      },
      unsubscribe: (key: string, listener: (...args: any[]) => void) => { entry.emitter.removeListener(key, listener); return value },
      subscribeAll: (listener: (...args: any[]) => void) => { entry.emitter.on('*', listener); this.drain(entry); return value },
      unsubscribeAll: (listener: (...args: any[]) => void) => { entry.emitter.removeListener('*', listener); return value },
      commit: (method: string, payload: unknown) => this.invoke('commit', id, method, payload, epoch),
      revalidate: () => this.invoke('revalidate', id, epoch),
      unref: () => {
        if (released) return Promise.resolve()
        released = true
        this.gc.unregister(value)
        if (this.entries.get(identity) !== entry) return Promise.resolve()
        this.entries.delete(identity)
        entry.pending = []
        return this.invoke('unref', id, epoch)
      },
    })
    entry.state = new WeakRef(value)
    this.gc.register(value, { id, identity, epoch, generation: entry.generation }, value)
    return value
  }
}
