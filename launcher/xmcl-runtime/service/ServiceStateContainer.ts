import EventEmitter from 'events'
import { randomUUID } from 'node:crypto'
import { AnyError } from '@xmcl/utils'
import { ServiceStateContext } from './ServiceStateManager'
import { Client } from '~/app'
import { SharedState, createPromiseSignal } from '@xmcl/runtime-api'
import { MutableStateImpl, kStateKey } from './stateUtils'

export type ServiceStateFactory<T> = (context: ServiceStateContext) => Promise<[T, () => void] | [T, () => void, () => Promise<void>]>
const kStateContainer = Symbol('StateContainer')
const trackedClients = new WeakMap<Client, { containers: Set<ServiceStateContainer>; onDestroyed: () => void }>()

function trackClient(client: Client, container: ServiceStateContainer) {
  let tracked = trackedClients.get(client)
  if (!tracked) {
    const containers = new Set<ServiceStateContainer>()
    const onDestroyed = () => {
      for (const trackedContainer of containers) trackedContainer.untrack(client)
    }
    tracked = { containers, onDestroyed }
    trackedClients.set(client, tracked)
    client.on('destroyed', onDestroyed)
    client.on('renderer-disconnected', onDestroyed)
  }
  tracked.containers.add(container)
}

function untrackClient(client: Client, container: ServiceStateContainer) {
  const tracked = trackedClients.get(client)
  if (!tracked) return
  tracked.containers.delete(container)
  if (tracked.containers.size === 0) {
    client.removeListener('destroyed', tracked.onDestroyed)
    client.removeListener('renderer-disconnected', tracked.onDestroyed)
    trackedClients.delete(client)
  }
}

/**
 * The util class to hold each service state snapshot
 */
export class ServiceStateContainer<T = any> implements ServiceStateContext {
  static unwrap(v: object) {
    return (v as any)[kStateContainer] as ServiceStateContainer | undefined
  }

  #revalidating: Promise<void> | undefined
  private semaphore = 0
  #clients: [Client, Function][] = []
  #state: SharedState<T> | undefined
  #signal = createPromiseSignal<SharedState<T>>()
  #disposer: () => void = () => { }
  #revalidator?: () => Promise<void>
  #emitter = new EventEmitter()
  #static = false
  #destroyed = false
  #revision = 0
  readonly epoch = randomUUID()
  #mutations = new Set<string>()

  constructor(
    readonly id: string,
    readonly unregister: (id: string) => void,
    factoryOrInstance: { factory: ServiceStateFactory<T> } | { instance: T },
  ) {
    const decorate = (state: any) => {
      const emitter = this.#emitter

      Object.assign(state, {
        id,
      })

      let prototype = Object.getPrototypeOf(state)
      while (prototype && prototype !== Object.prototype) {
        for (const [key, prop] of Object.entries(Object.getOwnPropertyDescriptors(prototype))) {
          if (key !== 'constructor' && prop.value instanceof Function && !this.#mutations.has(key)) {
            this.#mutations.add(key)
            // decorate original mutation
            const func = prop.value.bind(state)
            Reflect.set(state as any, key, (value: any) => {
              func(value)
              const revision = ++this.#revision
              emitter.emit(key, value)
              emitter.emit('*', key, value, revision)
            })
          }
        }
        prototype = Object.getPrototypeOf(prototype)
      }

      Object.defineProperties(state, {
        [kStateKey]: { value: Object.getPrototypeOf(state).constructor.name, enumerable: true, configurable: true },
        [kStateContainer]: { value: this, enumerable: false, configurable: true },
      })
      const parent = new MutableStateImpl(emitter, this.revalidate.bind(this))
      for (const method of ['subscribe', 'unsubscribe', 'subscribeAll', 'unsubscribeAll'] as const) {
        Object.defineProperty(state, method, {
          configurable: true,
          value: (...args: any[]) => { (parent[method] as Function).apply(parent, args); return state },
        })
      }
      Object.defineProperty(state, 'revalidate', { configurable: true, value: parent.revalidate })
    }

    if ('factory' in factoryOrInstance) {
      factoryOrInstance.factory(this).then(([state, disposer, revalidator]) => {
        this.#disposer = disposer
        this.#revalidator = revalidator
        decorate(state)
        this.#state = state as any
        this.#signal.resolve(state as any)
      }, (e) => {
        this.#signal.reject(e)
      })
    } else {
      decorate(factoryOrInstance.instance)
      this.#state = factoryOrInstance.instance as any
      this.#signal.resolve(factoryOrInstance.instance as any)
      this.#static = true
    }
  }

  get state() {
    return this.#state
  }

  snapshot() {
    return { ...JSON.parse(JSON.stringify(this.#state)), __stateRevision__: this.#revision, __stateEpoch__: this.epoch }
  }

  get promise() {
    return this.#signal.promise
  }

  doAsyncOperation = async <T>(action: Promise<T>): Promise<T> => {
    try {
      this.semaphore += 1
      for (const [c] of this.#clients) {
        if (c.isDestroyed()) {
          this.untrack(c)
          continue
        }
        c.send('state-validating', { id: this.id, semaphore: this.semaphore, epoch: this.epoch })
      }
      return await action
    } finally {
      this.semaphore -= 1
      if (this.semaphore === 0) {
        for (const [c] of this.#clients) {
          if (c.isDestroyed()) {
            this.untrack(c)
            continue
          }
          c.send('state-validating', { id: this.id, semaphore: this.semaphore, epoch: this.epoch })
        }
      }
    }
  }

  defineAsyncOperation = <T extends (...args: any[]) => Promise<any>>(action: T): T => {
    return (async (...args: any[]) => {
      return await this.doAsyncOperation(action(...args))
    }) as any
  }

  async revalidate() {
    if (this.#revalidating) return this.#revalidating
    if (this.#revalidator) {
      this.#revalidating = this.#revalidator()
      try {
        await this.#revalidating
      } finally {
        this.#revalidating = undefined
      }
    }
  }

  track(client: Client) {
    if (this.#clients.some(([tracked]) => tracked === client)) return
    const handler = (type: any, payload: any, revision: number) => {
      client.send('commit', this.id, type, payload, revision, this.epoch)
    }
    this.#clients.push([client, handler])
    this.#emitter.on('*', handler)
    trackClient(client, this)
  }

  untrack(client: Client) {
    const index = this.#clients.findIndex(c => c[0] === client)
    if (index === -1) return false
    const deleted = this.#clients.splice(index, 1)
    if (deleted[0]) {
      const [_, handler] = deleted[0]
      this.#emitter.off('*', handler as any)
      untrackClient(client, this)
      if (this.#clients.length === 0 && !this.#static) {
        this.destroy()
        return true
      }
    }
    return false
  }

  isTracked(client: Client) {
    return this.#clients.some(([tracked]) => tracked === client)
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    for (const [client, handler] of this.#clients) {
      this.#emitter.off('*', handler as any)
      untrackClient(client, this)
    }
    this.#clients = []
    this.#emitter.removeAllListeners()
    const disposer = this.#disposer
    this.#disposer = () => { }
    this.#state = undefined
    this.#revalidator = undefined
    try {
      disposer()
    } finally {
      this.unregister(this.id)
    }
  }

  async commit(type: string, payload: any) {
    const state = await this.#signal.promise
    if (!this.#mutations.has(type)) {
      throw new AnyError('StateError', `Cannot find mutation named ${type} in service ${this.id}`)
    } else {
      (state as any)[type](payload)
    }
  }
}
