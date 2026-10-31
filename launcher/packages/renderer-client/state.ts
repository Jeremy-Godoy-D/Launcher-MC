import type { SharedState } from '@xmcl/runtime-api'

type Method<T> = { [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never }[keyof T]
type DeepReadonly<T> = T extends Function ? T : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T
export type StateData<T> = { readonly [K in keyof T as T[K] extends Function ? never : K]: DeepReadonly<T[K]> }
export type StateType<T> = { new(): T }
export type StateSnapshot<T> = Readonly<{
  status: 'loading' | 'ready' | 'error'
  data: StateData<T> | undefined
  error: Error | undefined
  validating: boolean
  revision: number
}>

type Transport<T> = SharedState<T> & { commit(method: string, ...args: unknown[]): Promise<unknown> }

function dataFields(value: object) {
  if (Object.keys(value).some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) throw new Error('Invalid state property')
  return structuredClone(Object.fromEntries(Object.entries(value).filter(([key, value]) => key !== '__stateEpoch__' && typeof value !== 'function')))
}

export function freezeData<T>(value: T, visited = new WeakSet<object>()): T {
  if (value && typeof value === 'object' && !visited.has(value)) {
    visited.add(value)
    for (const child of Object.values(value)) freezeData(child, visited)
    // IPC state data is records/arrays; typed views must remain cloneable and cannot be frozen by JS.
    if (!ArrayBuffer.isView(value)) Object.freeze(value)
  }
  return value
}

function asError(error: unknown) {
  if (error instanceof Error) return error
  const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message : 'No se pudo sincronizar el estado'
  return new Error(message, { cause: error })
}

export class StateStore<T extends object> {
  private listeners = new Set<() => void>()
  private transport?: Transport<T>
  private mutable?: T
  private loading?: Promise<void>
  private revalidating?: Promise<void>
  private remoteValidating = false
  private disposed = false
  private delegate?: StateStore<T>
  private stopDelegate?: () => void
  private snapshot: StateSnapshot<T> = Object.freeze({ status: 'loading', data: undefined, error: undefined, validating: false, revision: 0 })

  constructor(readonly Type: StateType<T>, private fetch: () => Promise<SharedState<T> | StateStore<T>>) {}

  getSnapshot = (): StateSnapshot<T> => this.delegate?.getSnapshot() ?? this.snapshot

  subscribe = (listener: () => void) => {
    if (this.disposed) throw new Error('State store disposed')
    this.listeners.add(listener)
    if (this.transport && !this.mutable) {
      try { this.hydrate(this.transport) } catch (error) { this.publish(asError(error)) }
    } else if (!this.transport && !this.delegate && !this.loading) void this.load()
    let subscribed = true
    return () => {
      if (!subscribed) return
      subscribed = false
      this.listeners.delete(listener)
      // React Strict Mode remounts immediately; keep its pending read and release only if still unused.
      queueMicrotask(() => { if (this.listeners.size === 0 && !this.loading && !this.revalidating) this.release() })
    }
  }

  private publish(error?: Error) {
    this.snapshot = Object.freeze({
      status: error ? 'error' : this.mutable ? 'ready' : 'loading',
      data: this.mutable ? freezeData(dataFields(this.mutable)) as StateData<T> : undefined,
      error, validating: this.remoteValidating || !!this.revalidating || !!this.loading && !this.mutable,
      revision: this.snapshot.revision + 1,
    })
    for (const listener of this.listeners) listener()
  }

  private mutation = (method: string, payload: unknown) => {
    if (this.disposed) return
    try {
      let prototype = this.Type.prototype
      let handler: Function | undefined
      while (prototype && prototype !== Object.prototype) {
        const property = Object.getOwnPropertyDescriptor(prototype, method)
        if (property && method !== 'constructor' && typeof property.value === 'function') { handler = property.value; break }
        prototype = Object.getPrototypeOf(prototype)
      }
      if (!handler || !this.mutable) throw new Error(`Unknown state mutation: ${method}`)
      const next = Object.assign(new this.Type(), dataFields(this.mutable))
      handler.call(next, structuredClone(payload))
      this.mutable = next
      this.publish()
    } catch (error) { this.publish(asError(error)) }
  }

  private validating = (value: boolean | number) => {
    if (this.disposed) return
    const next = typeof value === 'number' ? value > 0 : value
    if (next === this.remoteValidating) return
    this.remoteValidating = next
    this.publish(this.snapshot.error)
  }

  private load() {
    if (this.loading) return this.loading
    this.loading = Promise.resolve().then(this.fetch).then(raw => {
      if (raw instanceof StateStore) {
        if (this.disposed || this.listeners.size === 0) return
        this.delegate = raw
        this.stopDelegate = raw.subscribe(() => { for (const listener of this.listeners) listener() })
        for (const listener of this.listeners) listener()
        return
      }
      this.transport = raw as Transport<T>
      if (this.disposed || this.listeners.size === 0) return
      this.hydrate(raw)
    }).catch(error => {
      if (!this.disposed && this.listeners.size > 0) this.publish(asError(error))
    }).finally(() => {
      this.loading = undefined
      if (this.disposed || this.listeners.size === 0) this.release()
      else if (this.snapshot.validating !== this.remoteValidating) this.publish(this.snapshot.error)
    })
    this.publish()
    return this.loading
  }

  private hydrate(raw: SharedState<T>) {
    this.mutable = Object.assign(new this.Type(), dataFields(raw))
    raw.subscribe('state-validating', this.validating)
    raw.subscribeAll(this.mutation as any)
    this.publish(this.snapshot.error)
  }

  commit<M extends Method<T>>(method: M, ...args: T[M] extends (...args: infer A) => any ? A : never): Promise<unknown> {
    if (this.delegate) return this.delegate.commit(method, ...args)
    if (this.disposed || !this.transport || !this.mutable) return Promise.reject(new Error('State not ready'))
    return this.transport.commit(String(method), ...args)
  }

  revalidate = (): Promise<void> => {
    if (this.disposed) return Promise.reject(new Error('State store disposed'))
    if (this.delegate) return this.delegate.revalidate()
    if (!this.transport) return this.load()
    if (this.revalidating) return this.revalidating
    this.revalidating = Promise.resolve().then(() => this.transport?.revalidate()).catch(error => {
      this.publish(asError(error))
    }).finally(() => {
      this.revalidating = undefined
      if (this.disposed || this.listeners.size === 0) this.release()
      else this.publish(this.snapshot.error)
    })
    this.publish()
    return this.revalidating
  }

  private release() {
    this.stopDelegate?.()
    this.stopDelegate = undefined
    this.delegate = undefined
    if (this.transport) {
      this.transport.unsubscribeAll(this.mutation as any)
      this.transport.unsubscribe('state-validating', this.validating)
      void Promise.resolve(this.transport.unref()).catch(error => {
        if (!this.disposed && !this.transport && !this.loading) this.publish(asError(error))
      })
    }
    this.transport = undefined
    this.mutable = undefined
    this.remoteValidating = false
    this.snapshot = Object.freeze({ status: 'loading', data: undefined, error: undefined, validating: false, revision: this.snapshot.revision + 1 })
  }

  dispose() {
    this.disposed = true
    this.listeners.clear()
    if (!this.loading && !this.revalidating) this.release()
  }
}
